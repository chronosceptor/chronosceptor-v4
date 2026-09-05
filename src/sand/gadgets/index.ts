import type { Grid } from '../grid';
import type { Palette } from '../palette';
import type { DrawCtx } from '../render';
import type { Ejecta } from '../ejecta';
import { Bomb } from './bomb';
import { Emitter } from './emitter';
import { Ball, resolveBallCollisions } from './ball';

/**
 * Las tres clases de pieza. En el dock son cuatro fichas, porque la fuente sale
 * en dos sabores —arena y agua— que son la misma clase con distinto material.
 *
 * Hubo dos mas —una cruz giratoria que aventaba la arena y una bandeja que la
 * paseaba por un trayecto— y se quitaron enteras. No fallaban: hacian lo que
 * prometian, y la bandeja llego a subir su carga por una rampa inclinada. Lo
 * que pasa es que las tres que quedan se explican solas y se combinan entre
 * ellas —la bola limpia, la bomba abre hueco, la fuente rellena—, y las otras
 * dos pedian entenderlas antes de que hicieran gracia. Estan enteras en el
 * commit b52c517 si alguna vez merece la pena recuperarlas.
 */
export type GadgetKind = 'bomb' | 'emitter' | 'ball';

/**
 * Crea una pieza suelta.
 *
 * Tambien la usa el fantasma del arrastre: se instancia una pieza de verdad y
 * se pinta sin llegar a meterla en la capa, asi que la vista previa no puede
 * desviarse de lo que se va a colocar porque es literalmente lo mismo.
 *
 * `gridW` es el ancho del lienzo en celdas, y le importa a la bola, cuyo tamano
 * es una fraccion de la escena y no un numero de celdas: en celdas fijas
 * ocupaba en un movil cuatro veces la porcion de pantalla que ocupa en un
 * escritorio.
 *
 * `k` es la finura del grano (`Profile.k`), y le importa a la fuente por la
 * razon contraria: lo suyo si esta escrito en celdas.
 *
 * `material` es lo que va a sembrar una fuente, y se elige aqui porque se
 * elige al colocarla: hay una ficha de arena y una de agua, y lo que sale de
 * cada chorro es suyo para siempre. Hubo un interruptor de escena que las
 * cambiaba todas a la vez y pisaba esto en cada paso; con dos fichas, decidirlo
 * dos veces solo daba para contradecirse.
 */
export function createGadget(
  kind: GadgetKind,
  cx: number,
  cy: number,
  env?: { gridW?: number; k?: number; material?: number },
): Gadget {
  switch (kind) {
    case 'bomb':
      return new Bomb(cx, cy);
    case 'emitter':
      return new Emitter(cx, cy, undefined, env?.k, env?.material);
    case 'ball':
    default:
      return new Ball(cx, cy, env?.gridW);
  }
}

/** Donde ha estallado algo, para las piezas a las que eso les importe. */
export interface Blast {
  x: number;
  y: number;
  /** Radio de la explosion, en celdas. */
  r: number;
  /**
   * No es una onda: es una celda ardiendo tocando la pieza.
   *
   * Cambia una sola cosa, pero importante. Una onda que pilla algo ya encendido
   * lo precipita —la cascada de bombas—, y el fuego toca a la misma pieza en
   * cada fotograma mientras la llama siga ahi: sin distinguirlos, rozar una
   * bola con la antorcha la reventaba en 0,15 s en vez de dejarla arder los dos
   * segundos, que es justo lo que hay que ver.
   */
  fire?: boolean;
}

/** Lo que una pieza recibe en cada paso de simulacion. */
export interface TickCtx {
  grid: Grid;
  /** Arena balistica: la bomba lanza aqui, y aqui van los granos que no caben. */
  ejecta: Ejecta;
  palette: Palette;
  rand: () => number;
  /** Granos que aun caben antes del tope de arena viva. Lo reparte el emisor. */
  budget: number;
  /**
   * Explosiones de este paso. Quien estalla las apunta aqui y la capa las
   * reparte al terminar la ronda.
   */
  blasts: Blast[];
}

/**
 * Lo que la capa recibe de fuera.
 *
 * `blasts` no viene del mundo: lo pone la capa en cada paso porque es su
 * cuaderno para pasarse avisos entre piezas, y nadie de fuera tiene nada que
 * apuntar en el.
 */
export type WorldCtx = Omit<TickCtx, 'blasts'>;

/**
 * Una pieza colocada en el lienzo.
 *
 * El cuerpo de una pieza no es un adorno pintado encima: se estampa en el grid
 * como material solido y la arena choca con el de verdad. Como se mueve, hay
 * que borrarlo y reescribirlo en cada paso.
 */
export interface Gadget {
  readonly kind: GadgetKind;
  /** Centro, en celdas. */
  cx: number;
  cy: number;
  /** Radio de agarre, en celdas. Manda en el hit-test y en el fantasma. */
  readonly radius: number;
  /**
   * Caja de agarre, en celdas relativas al centro. Si la hay, manda sobre
   * `radius` en el hit-test.
   *
   * La necesita la fuente y solo la fuente: es la unica pieza que no se dibuja
   * alrededor de su centro sino casi entera por encima de el —su centro es la
   * boca por la que cae la arena—, asi que un circulo centrado ahi deja fuera
   * toda la tolva. Las demas son redondas y centradas, y para esas el radio es
   * mas simple y da lo mismo.
   */
  readonly grabBox?: { half: number; up: number; down: number };
  /**
   * Sitio que ocupa de verdad, en celdas. Por defecto, el radio de agarre.
   *
   * Son dos cosas distintas y conviene no confundirlas. La bola infla su radio
   * de agarre a proposito para que se pueda coger en marcha, y esa holgura se
   * colaba en las reglas de colocacion: exigia 36 celdas entre dos bolas y no
   * dejaba soltar la quinta, justo cuando echar varias es como se usa.
   */
  readonly footprint?: number;
  /** La bomba se marca al explotar; la capa la retira al final del paso. */
  dead: boolean;
  /**
   * Pieza de serie de la escena: la fuente principal.
   *
   * Se arrastra, se pinta, estorba a las demas, se puede tirar a la papelera y
   * se la lleva una bomba igual que a cualquier otra — de eso se trataba, de
   * homologarla. Lo unico que le queda de excepcion es que no ocupa hueco del
   * tope y que `clear()` la repone, porque es la que venia puesta.
   *
   * Llego a ser indestructible, con el argumento de que sin ella el lienzo se
   * queda sin arena. Era el argumento equivocado: quien la vuela sabe lo que
   * hace, del dock salen fuentes nuevas y vaciar el lienzo la devuelve. Ser la
   * unica pieza a la que una bomba no le hacia nada se notaba, y mal.
   */
  readonly permanent?: boolean;
  /**
   * La esta arrastrando el usuario ahora mismo.
   *
   * Solo le importa a las piezas que se mueven solas: la bola tiene que
   * quedarse quieta mientras la llevas, o se escapa del dedo entre un evento de
   * puntero y el siguiente.
   */
  held?: boolean;
  /** Borra el cuerpo del grid y despierta lo que tenia alrededor. */
  clear(g: Grid): void;
  /** Avanza el estado y vuelve a estampar el cuerpo. */
  tick(c: TickCtx, dt: number): void;
  /** Trazo vectorial, encima del bitmap de arena. */
  draw(d: DrawCtx): void;
  /** Toque sin arrastre. La bomba detona; la bola, solo si esta encendida. */
  tap?(): void;
  /**
   * Enciende la mecha sin que nada haya estallado al lado, y sin reiniciar la
   * de la que ya ardia. Lo unico que lo llama es el boton de reventar bolas.
   */
  arm?(): void;
  /**
   * Ha estallado algo cerca.
   *
   * Cada pieza decide si le afecta y en que radio: la bola se enciende y se
   * vuelve una bomba, y a las demas les da igual. La comprobacion de distancia
   * es suya y no de la capa porque el alcance se mide contra su cuerpo, que
   * cada una sabe como de grande es.
   */
  ignite?(b: Blast): void;
  /**
   * El arrastre acaba de recolocar la pieza.
   *
   * Lo necesitan las piezas con un estado ligado a su sitio: la plataforma
   * recentra ahi su patrulla, porque si no seguiria yendo y viniendo alrededor
   * del punto donde se solto la primera vez.
   */
  onMoved?(): void;
  /**
   * La pieza acaba de quedarse donde esta: se ha soltado tras un arrastre o ha
   * aterrizado de un toque en la ficha del dock.
   *
   * Lo necesita la fuente y solo la fuente, porque es la unica que no se ve:
   * colocarla de un toque dejaba la escena exactamente igual que antes —su
   * chorro cae dentro del que ya bajaba— y el gesto parecia no haber hecho
   * nada. Las demas piezas se anuncian solas, apareciendo.
   */
  onPlaced?(): void;
}

/** Cuantas piezas caben en el lienzo a la vez. */
export const MAX_GADGETS = 10;
/**
 * Y una bomba mas, por encima del tope, siempre.
 *
 * Con el lienzo lleno, la unica forma de quitar algo era arrastrarlo hasta la
 * papelera de una en una. Guardando este hueco siempre hay sitio para una
 * bomba, y una bomba se lleva por delante todo lo que le pille dentro: es la
 * forma rapida de despejar, y la divertida. Va por encima del tope y no
 * quitandole un sitio a las demas — reservar uno de los diez saldria igual de
 * caro que no poder poner la bomba.
 *
 * Se devuelve solo: la bomba se consume al estallar, asi que el hueco vuelve a
 * estar libre a los dos segundos sin que nadie tenga que acordarse de nada.
 */
const BOMB_SLOT = 1;

export class GadgetLayer {
  private items: Gadget[] = [];

  /** Piezas que ha puesto el usuario. La fija de la escena no cuenta. */
  get count(): number {
    let n = 0;
    for (const g of this.items) if (!g.permanent) n++;
    return n;
  }

  /** No cabe absolutamente nada, ni una bomba. */
  get full(): boolean {
    return !this.roomFor('bomb');
  }

  /** Solo cabe ya una bomba: el resto de fichas del dock se apagan. */
  get onlyBomb(): boolean {
    return !this.full && !this.roomFor('ball');
  }

  /** ¿Cabe una pieza de este tipo? La bomba tiene su propio hueco. */
  roomFor(kind: GadgetKind): boolean {
    return this.count < MAX_GADGETS + (kind === 'bomb' ? BOMB_SLOT : 0);
  }

  /** Cuantas bolas hay puestas. Lo mira el dock para su boton de reventarlas. */
  get balls(): number {
    let n = 0;
    for (const g of this.items) if (g instanceof Ball) n++;
    return n;
  }

  /**
   * Enciende la mecha de todas las bolas a la vez.
   *
   * No las detona: las **arma**. Una bola encendida sigue rebotando los dos
   * segundos que arde, asi que la cadena no se resuelve donde estaba sino que
   * se va corriendo por el lienzo — y cada una que revienta prende a las que
   * le pillen dentro, que es lo que convierte esto en una cascada en vez de en
   * un fogonazo. Detonarlas en el sitio seria tirar justo lo que lo hace.
   */
  armBalls(): number {
    let n = 0;
    for (const g of this.items) {
      if (!(g instanceof Ball)) continue;
      g.arm?.();
      n++;
    }
    return n;
  }

  /**
   * Que hay colocado y donde, en celdas.
   *
   * `dump()` no sirve para todo desde que hay piezas que se mueven solas: la
   * bola y la fuente no escriben nada en el grid, asi que en un volcado de
   * materiales son invisibles.
   */
  positions(): Array<{ kind: GadgetKind; x: number; y: number; r: number }> {
    // `r` es el tamano: desde que la cruz y la bandeja lo eligen al colocarse,
    // es lo unico que dice de que tamano salio cada una, y no hay forma de
    // verlo en un volcado de materiales.
    return this.items.map((g) => ({ kind: g.kind, x: g.cx, y: g.cy, r: g.radius }));
  }

  add(g: Gadget): boolean {
    if (!this.roomFor(g.kind)) return false;
    this.items.push(g);
    return true;
  }

  remove(g: Gadget, grid: Grid): void {
    const i = this.items.indexOf(g);
    if (i < 0) return;
    g.clear(grid);
    this.items.splice(i, 1);
  }

  /**
   * Un paso de todas las piezas.
   *
   * Las dos pasadas separadas no son estilo, son correccion: si cada pieza
   * borrase y estampase en el mismo recorrido, una borraria el cuerpo recien
   * escrito de la que va detras en la lista, y dos piezas que se tocan
   * parpadearian y dejarian pasar la arena por la junta.
   */
  tick(w: WorldCtx, dt: number): void {
    const c: TickCtx = { ...w, blasts: [] };

    for (const g of this.items) g.clear(c.grid);
    for (const g of this.items) g.tick(c, dt);

    // Contagio: lo que ha estallado prende a quien le haya pillado dentro. Va
    // aqui y no dentro de la bomba por lo mismo que el choque entre bolas: no
    // es comportamiento de la que estalla, es de la pareja. Y al repartirlo
    // despues de la ronda, una cadena tarda un paso por eslabon en vez de
    // resolverse entera en un solo fotograma, que es lo que la hace verse.
    for (const b of c.blasts) for (const g of this.items) g.ignite?.(b);

    // Los choques entre bolas se resuelven despues de que todas se hayan
    // movido, y aqui y no dentro de la bola: un choque es de la pareja, no de
    // ninguna de las dos. Resolviendolo cada una por su cuenta, el par se
    // trataria dos veces y el intercambio de velocidades se anularia solo.
    const balls = this.items.filter((g): g is Ball => g instanceof Ball);
    if (balls.length > 1) resolveBallCollisions(balls);

    if (this.items.some((g) => g.dead)) this.items = this.items.filter((g) => !g.dead);
  }

  /**
   * Una celda acaba de prenderse: lo que la toque se enciende.
   *
   * Reutiliza tal cual la mecha de las explosiones, con radio cero. `Wick`
   * mide contra el CUERPO de la pieza y no contra su centro, asi que un radio
   * de cero significa exactamente lo que hace falta aqui: que la llama la este
   * tocando. Y no pasa por `blasts` a proposito — ese es el cuaderno de las
   * explosiones del paso, y una celda de pared ardiendo no lo es.
   */
  spark(x: number, y: number): void {
    for (const g of this.items) g.ignite?.({ x, y, r: 0, fire: true });
  }

  draw(d: DrawCtx): void {
    for (const g of this.items) g.draw(d);
  }

  /** La pieza bajo una celda. La ultima colocada gana, que es la que esta "encima". */
  hit(x: number, y: number): Gadget | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const g = this.items[i]!;
      const dx = x - g.cx;
      const dy = y - g.cy;
      const caja = g.grabBox;
      if (caja) {
        if (Math.abs(dx) <= caja.half && dy <= caja.down && -dy <= caja.up) return g;
        continue;
      }
      if (dx * dx + dy * dy <= g.radius * g.radius) return g;
    }
    return null;
  }

  /** ¿Cabe una pieza de este tamano aqui sin solapar otra? */
  fits(x: number, y: number, footprint: number, ignore?: Gadget | null): boolean {
    for (const g of this.items) {
      if (g === ignore) continue;
      const dx = x - g.cx;
      const dy = y - g.cy;
      const r = (g.footprint ?? g.radius) + footprint;
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  }

  clearAll(grid: Grid): void {
    for (const g of this.items) g.clear(grid);
    // La fija se queda: vaciar el lienzo es quitar lo que has puesto tu, no
    // dejarlo sin fuente y por tanto sin nada que mirar.
    this.items = this.items.filter((g) => g.permanent);
  }

  /**
   * Instala la pieza fija de la escena, en lugar de la que hubiera.
   *
   * Va la primera de la lista y no la ultima porque `hit()` recorre del final
   * al principio: asi cualquier pieza que el usuario deje encima le gana el
   * gesto, que es lo que se espera de la que acabas de soltar.
   */
  setPermanent(g: Gadget): void {
    this.items = this.items.filter((it) => !it.permanent);
    this.items.unshift(g);
  }

  /**
   * Reescala tras un redimensionado del grid.
   *
   * Las piezas guardan celdas, no pixeles, asi que un grid nuevo las dejaria
   * descolocadas. Se mantiene su posicion relativa en la escena.
   */
  rescale(fx: number, fy: number, grid: Grid): void {
    for (const g of this.items) {
      g.cx = Math.max(0, Math.min(grid.w - 1, Math.round(g.cx * fx)));
      g.cy = Math.max(0, Math.min(grid.h - 1, Math.round(g.cy * fy)));
      // Como en un arrastre: hay piezas que atan estado a su sitio —la fuente
      // guarda su boquilla aparte— y sin avisarlas se quedarian pintandose
      // donde toca y actuando donde estaban.
      g.onMoved?.();
    }
  }
}
