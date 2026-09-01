import type { Grid } from '../grid';
import type { Palette } from '../palette';
import type { DrawCtx } from '../render';
import type { Ejecta } from '../ejecta';
import { Spinner } from './spinner';
import { Platform } from './platform';
import { Bomb } from './bomb';
import { Emitter } from './emitter';
import { Ball, resolveBallCollisions } from './ball';

export type GadgetKind = 'spinner' | 'platform' | 'bomb' | 'emitter' | 'ball';

/**
 * Crea una pieza suelta.
 *
 * Tambien la usa el fantasma del arrastre: se instancia una pieza de verdad y
 * se pinta sin llegar a meterla en la capa, asi que la vista previa no puede
 * desviarse de lo que se va a colocar porque es literalmente lo mismo.
 */
export function createGadget(kind: GadgetKind, cx: number, cy: number): Gadget {
  switch (kind) {
    case 'platform':
      return new Platform(cx, cy);
    case 'bomb':
      return new Bomb(cx, cy);
    case 'emitter':
      return new Emitter(cx, cy);
    case 'ball':
      return new Ball(cx, cy);
    case 'spinner':
    default:
      return new Spinner(cx, cy);
  }
}

/** Donde ha estallado algo, para las piezas a las que eso les importe. */
export interface Blast {
  x: number;
  y: number;
  /** Radio de la explosion, en celdas. */
  r: number;
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
   * Pieza fija de la escena: la fuente principal.
   *
   * Se arrastra, se pinta y estorba a las demas igual que cualquier otra —de
   * eso se trataba, de homologarla—, pero no ocupa hueco del tope, no se puede
   * tirar a la papelera y no se la lleva una bomba. Un lienzo sin ella no
   * tendria de donde salir la arena, y entonces ya no es la pieza.
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
    return !this.full && !this.roomFor('spinner');
  }

  /** ¿Cabe una pieza de este tipo? La bomba tiene su propio hueco. */
  roomFor(kind: GadgetKind): boolean {
    return this.count < MAX_GADGETS + (kind === 'bomb' ? BOMB_SLOT : 0);
  }

  /**
   * Que hay colocado y donde, en celdas.
   *
   * `dump()` no sirve para todo desde que hay piezas que se mueven solas: la
   * bola y la fuente no escriben nada en el grid, asi que en un volcado de
   * materiales son invisibles.
   */
  positions(): Array<{ kind: GadgetKind; x: number; y: number }> {
    return this.items.map((g) => ({ kind: g.kind, x: g.cx, y: g.cy }));
  }

  add(g: Gadget): boolean {
    if (!this.roomFor(g.kind)) return false;
    this.items.push(g);
    return true;
  }

  remove(g: Gadget, grid: Grid): void {
    if (g.permanent) return;
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

  draw(d: DrawCtx): void {
    for (const g of this.items) g.draw(d);
  }

  /** La pieza bajo una celda. La ultima colocada gana, que es la que esta "encima". */
  hit(x: number, y: number): Gadget | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const g = this.items[i]!;
      const dx = x - g.cx;
      const dy = y - g.cy;
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
