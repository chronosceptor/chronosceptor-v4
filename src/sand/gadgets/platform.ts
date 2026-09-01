import type { Grid } from '../grid';
import { DYN, EMPTY, SAND } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import type { Point } from '../draw';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/**
 * Semilargo de la bandeja como fraccion del ancho del lienzo, y sus topes en
 * celdas. El largo es 2*half + 1.
 *
 * Va atado al ancho por lo mismo que el de la bola: en celdas fijas, la misma
 * bandeja ocupa el 10% del lienzo de escritorio y el 40% del de un movil, que
 * tiene 97 celdas de ancho contra 400. La pieza tiene que ocupar la misma
 * porcion de escena en los dos sitios, no el mismo numero de celdas.
 */
const HALF_FRAC = 0.0475;
const HALF_MIN = 8;
const HALF_MAX = 19;
/**
 * Medio trayecto por defecto, en celdas: lo que recorre a cada lado del punto
 * donde se solto mientras no se le diga otra cosa.
 */
const RANGE = 40;
/** Velocidad, en celdas/s, a lo largo del trayecto. */
const SPEED = 14;
/**
 * Alto de los costados, como fraccion del semilargo. Es la cabida de la bandeja.
 *
 * Sin costados no transporta practicamente nada: un monton tiene su angulo de
 * reposo, asi que en cuanto es mas alto que media barra su falda sobresale por
 * los dos extremos y se descuelga por ellos. Lo que le cae encima se cae al
 * lado de donde cayo, y entonces la plataforma no aleja el material de su
 * origen, que es justamente para lo que uno la pone.
 *
 * Ocho celdas fijas eran muy pocas. La cabida sale de multiplicar el alto por
 * el largo —en escritorio, 37 x 16 = 592 granos, tres veces la de antes— y con
 * costados de ocho la bandeja aguantaba 124: debajo del chorro, que suelta 700
 * granos/s, eso es llenarse en menos de un segundo. Lo que se veia era una
 * trampilla abriendose sin parar, no un carro que carga, lleva y descarga.
 *
 * Va en fraccion del largo y no en celdas para que la bandeja guarde su forma
 * al cambiar de tamano: en un movil, unos costados de 16 celdas sobre un largo
 * de 17 serian una caja cuadrada.
 */
const LIP_FRAC = 0.84;

/**
 * Bandeja que va y viene por un trayecto llevandose la carga, y la suelta de
 * golpe cuando se llena.
 *
 * Suelo y dos costados, y lo que va dentro viaja con ella: cada vez que avanza
 * una celda, traslada una celda lo que lleva encima. Eso es lo que la hace
 * transportar de verdad, y cuesta creer lo que costo llegar hasta aqui.
 *
 * Primero fue una barra solida, y se escurria por debajo del monton: el suelo
 * se retira de la celda que abandona y lo que habia encima se cuela por el
 * hueco. Despues fue material de cinta (BELT_L / BELT_R), aprovechando el
 * arrastre por rozamiento que `physics.ts` llevaba escrito y sin usar desde la
 * fabrica original. Parecia la respuesta y no lo era: **la cinta no puede mover
 * una carga compacta**. El arrastre es un paso lateral y `slideLateral` exige
 * que la celda de destino este vacia, asi que en una bandeja llena el unico
 * grano que puede moverse es el de delante de cada capa — y ese esta contra el
 * costado. Medido: la bandeja salia de debajo del chorro con 124 granos y
 * llegaba al otro extremo con 22. Los otros 102 no es que se cayeran por
 * ningun sitio: es que nunca se movieron, y la bandeja se fue de debajo.
 *
 * Trasladar la carga a mano no es hacer trampa: es lo mismo que ya hace
 * `Grid.stamp()` cuando aparta el grano que le estorba a una pieza, solo que en
 * bloque. Y sale mas barato que el arrastre — 208 celdas repasadas cada vez que
 * avanza una celda, catorce veces por segundo.
 *
 * **El trayecto lo dibuja quien la coloca**, con el segundo punto del gesto: el
 * primero es donde arranca y el segundo, hasta donde llega. Y no tiene por que
 * ser horizontal — si el segundo punto va mas alto, la bandeja sube por una
 * rampa cargada y baja vacia. La bandeja **siempre esta horizontal**: lo que se
 * inclina es el camino, no ella. Un carro volcado no retiene nada, y un suelo
 * en diagonal habria que estamparlo en escalera, que es una linea de celdas por
 * las que la arena se cuela.
 *
 * Un trayecto de longitud cero es una bandeja quieta: una repisa. Sale de
 * dejar el segundo punto encima del primero, y no hay que anadirle nada.
 *
 * **No descarga sola, y no es un descuido.** Llego a tener trampilla: al pasar
 * del 62% de su cabida soltaba el suelo, vaciaba de golpe y volvia a cerrar.
 * Funcionaba —dos o tres descargas por vuelta debajo del chorro— y aun asi se
 * quito. Con la trampilla, la pieza se administra sola y lo unico que queda por
 * hacer es mirarla; sin ella, la unica forma de vaciarla es cogerla y volcarla
 * donde quieras, y entonces pasearla cargada es el juego. Lo que se gana no es
 * codigo mas simple, aunque tambien: es que la decision de donde cae la arena
 * vuelve a ser de quien juega.
 *
 * Que rebose por los costados cuando se pasa de carga es parte de eso: la
 * bandeja llena va dejando un reguero, y eso ya dice que toca ir a vaciarla.
 */
export class Platform implements Gadget {
  readonly kind = 'platform';
  /**
   * Semilargo de la bandeja, que hace tambien de radio de agarre y de sitio
   * reservado. El agarre fino va por `contains()`.
   */
  readonly radius: number;
  /** Alto de los costados, en celdas. Proporcional al largo. */
  private readonly lip: number;
  dead = false;

  /**
   * Extremos del trayecto, en celdas. La bandeja va de A a B y vuelve.
   *
   * Es el estado que antes eran `homeX` y un rango fijo. Guardar los dos
   * extremos en vez de centro-y-radio es lo que permite que el camino este
   * inclinado, y de paso deja el caso quieto (A = B) sin ninguna rama especial.
   */
  private ax: number;
  private ay: number;
  private bx: number;
  private by: number;
  /**
   * Donde se solto, que no es donde esta: en cuanto empieza a andar, `cx` ya no
   * sirve de referencia.
   *
   * Es el ancla del trayecto que dibuja el segundo punto del gesto, y guardarla
   * aparte no es un lujo. Tomando `cx` en el momento del segundo punto, el
   * camino arrancaba donde hubiera llegado la bandeja patrullando entre un
   * evento de puntero y el siguiente, que son unas cuantas celdas; y tomando
   * `ax`, arrancaba 40 celdas a la izquierda, que es donde empieza el trayecto
   * de serie. Medido: se pedia un camino de (160,220) a (260,120) y salia uno
   * de (120,220) a (260,120).
   */
  private hx: number;
  private hy: number;
  /**
   * Donde va del trayecto: 0 en A, 1 en B. En coma flotante, que a 14 celdas/s
   * un paso son 0,23 celdas y en enteros no se moveria.
   */
  private t: number;
  private dir: 1 | -1 = 1;
  /**
   * El trayecto lo ha puesto el usuario.
   *
   * Sin esto, recolocarla convertiria el trayecto de serie —simetrico alrededor
   * de donde se solto— en uno que arranca ahi y se va entero hacia la derecha.
   */
  private custom = false;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva, con carga y todo. */
  private readonly wick = new Wick();
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
    /** Ancho del lienzo en celdas: de ahi sale el tamano. Ver `HALF_FRAC`. */
    gridW = 400,
  ) {
    this.radius = Math.max(HALF_MIN, Math.min(HALF_MAX, Math.round(gridW * HALF_FRAC)));
    this.lip = Math.max(4, Math.round(this.radius * LIP_FRAC));
    this.hx = cx;
    this.hy = cy;
    this.ax = cx - RANGE;
    this.ay = cy;
    this.bx = cx + RANGE;
    this.by = cy;
    this.t = 0.5;
  }

  /**
   * La han recolocado: el trayecto se va con ella.
   *
   * El de serie se recentra en el sitio nuevo —la bandeja se queda donde la
   * sueltas y patrulla a los dos lados—, y el que ha dibujado el usuario
   * conserva su forma y arranca donde se solto, que es lo que significaba su
   * primer punto.
   */
  onMoved(): void {
    this.hx = this.cx;
    this.hy = this.cy;
    if (this.custom) {
      const vx = this.bx - this.ax;
      const vy = this.by - this.ay;
      this.ax = this.hx;
      this.ay = this.hy;
      this.bx = this.hx + vx;
      this.by = this.hy + vy;
      this.t = 0;
    } else {
      this.ax = this.hx - RANGE;
      this.ay = this.hy;
      this.bx = this.hx + RANGE;
      this.by = this.hy;
      this.t = 0.5;
    }
    this.dir = 1;
  }

  /**
   * Segundo punto del gesto de colocacion: el otro extremo del trayecto.
   *
   * Si el punto no vale —se sale del mundo, pisa a otra pieza— se prueba mas
   * cerca del ancla en vez de rechazarlo: el camino se queda corto donde
   * tropieza, que se ve, y no desaparece el gesto, que no se ve.
   */
  resize(x: number, y: number, fits: (cx: number, cy: number, r: number) => boolean): void {
    this.custom = true;
    // El camino arranca donde se solto la bandeja, pase lo que pase: es lo que
    // significaba el primer punto del gesto.
    this.ax = this.hx;
    this.ay = this.hy;
    for (let k = 1; k > 0.02; k -= 0.04) {
      const bx = Math.round(this.ax + (x - this.ax) * k);
      const by = Math.round(this.ay + (y - this.ay) * k);
      if (fits(bx, by, this.radius)) {
        this.bx = bx;
        this.by = by;
        this.t = 0;
        this.dir = 1;
        return;
      }
    }
    // Ni un paso: se queda quieta donde esta, que es una repisa perfectamente util.
    this.bx = this.ax;
    this.by = this.ay;
    this.t = 0;
  }

  /** Caja de agarre: la bandeja y un margen, no un disco. */
  contains(x: number, y: number): boolean {
    return (
      x >= this.cx - this.radius - 2 &&
      x <= this.cx + this.radius + 2 &&
      y >= this.cy - this.lip - 2 &&
      y <= this.cy + 3
    );
  }

  /** La × de quitar, en la esquina de arriba a la derecha de la bandeja. */
  badgeAt(): Point {
    return { x: this.cx + this.radius + 3, y: this.cy - this.lip - 3 };
  }

  clear(g: Grid): void {
    if (!this.box) return;
    const [x0, y0, x1, y1] = this.box;
    g.clearStructure(x0, y0, x1, y1, DYN);
    g.wakeRect(x0, y0, x1, y1);
    this.box = null;
  }

  /** Toque: si esta encendida, revienta ya. Apagada no hace nada. */
  tap(): void {
    this.wick.tap();
  }

  ignite(b: Blast): void {
    this.wick.ignite(b, this.cx, this.cy, this.radius);
  }

  tick(c: TickCtx, dt: number): void {
    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      this.dead = true;
      return;
    }
    // Reventada, no vuelve a estampar el cuerpo: la carga que llevaba se queda
    // en el aire y cae, que es exactamente lo que tiene que pasarle a un carro
    // al que le acaban de volar el suelo.
    if (paso === 'humo') return;

    const g = c.grid;
    this.advance(g, dt);

    const x0 = this.cx - this.radius;
    const x1 = this.cx + this.radius;
    // `pushDir` en el sentido de la marcha: el borde de ataque aparta hacia
    // delante la arena que se encuentra, en vez de hacia un lado al azar.
    // Con el suelo suelto no se estampa la fila de abajo y la carga se cae por
    // el hueco. Los costados se quedan: lo que se abre es la trampilla, no la
    // bandeja entera, y son ellos los que hacen que salga en columna.
    const empuje = this.bx >= this.ax ? this.dir : -this.dir;
    for (let px = x0; px <= x1; px++) g.stamp(px, this.cy, DYN, empuje);
    for (let py = this.cy - this.lip; py < this.cy; py++) {
      g.stamp(x0, py, DYN, empuje);
      g.stamp(x1, py, DYN, empuje);
    }

    // La caja cubre todo el recorrido posible de un paso, no solo la bandeja:
    // si se limpiara justo su ancho, la celda que acaba de abandonar se quedaria
    // escrita y la plataforma iria dejando un rastro solido. Con trayectos
    // inclinados el margen tiene que ser tambien vertical.
    this.box = [x0 - 2, this.cy - this.lip - 2, x1 + 2, this.cy + 2];
    g.wakeRect(x0 - 2, this.cy - this.lip - 3, x1 + 2, this.cy + 2);
  }

  /**
   * Avanza por el trayecto y se lleva la carga consigo.
   *
   * La carga se mueve antes de reescribir el cuerpo, y con el cuerpo viejo ya
   * borrado: la capa borra todas las piezas antes de que ninguna estampe, asi
   * que ahora mismo lo que hay dentro de la bandeja es arena en el aire y las
   * celdas a las que va no las ocupa ningun costado.
   */
  private advance(g: Grid, dt: number): void {
    const largo = Math.hypot(this.bx - this.ax, this.by - this.ay);
    // Trayecto de cero: una repisa. Ni se mueve ni hay nada que trasladar.
    if (largo < 0.5) return;

    this.t += (this.dir * SPEED * dt) / largo;
    if (this.t >= 1) {
      this.t = 1;
      this.dir = -1;
    } else if (this.t <= 0) {
      this.t = 0;
      this.dir = 1;
    }

    const antesX = this.cx;
    const antesY = this.cy;
    // Recortado al mundo: el trayecto se valida al dibujarlo, pero el grid
    // puede haber encogido despues con un redimensionado de la ventana.
    this.cx = Math.max(
      this.radius,
      Math.min(g.w - 1 - this.radius, Math.round(this.ax + (this.bx - this.ax) * this.t)),
    );
    this.cy = Math.max(this.lip + 1, Math.min(g.h - 2, Math.round(this.ay + (this.by - this.ay) * this.t)));

    const dx = this.cx - antesX;
    const dy = this.cy - antesY;
    if (dx !== 0 || dy !== 0) this.carry(g, antesX, antesY, dx, dy);
  }

  /**
   * Traslada un paso la arena que va dentro, en las dos direcciones.
   *
   * Se recorre empezando por delante —por la celda que va en cabeza en cada
   * eje—: al reves, cada grano se estamparia encima del siguiente y la carga se
   * compactaria en una sola columna en vez de moverse. El grano que no
   * encuentra su celda libre —la bandeja esta entrando en un monton— se queda
   * donde esta y lo aparta luego el cuerpo al estamparse, que es lo mismo que le
   * pasa a cualquier pieza que embiste material.
   *
   * El eje vertical hace falta desde que el trayecto puede estar inclinado, y es
   * el que de verdad importa al subir: sin el, el suelo se estampa dentro de la
   * carga en vez de por debajo, y en vez de subir el monton lo aparta de una
   * patada hacia los lados.
   */
  private carry(g: Grid, cx0: number, cy0: number, dx: number, dy: number): void {
    const { w, mat, col, vel } = g;
    const xa = dx > 0 ? cx0 + this.radius : cx0 - this.radius;
    const xb = dx > 0 ? cx0 - this.radius : cx0 + this.radius;
    const px = dx > 0 ? -1 : 1;
    const ya = dy > 0 ? cy0 - 1 : cy0 - this.lip;
    const yb = dy > 0 ? cy0 - this.lip : cy0 - 1;
    const py = dy > 0 ? -1 : 1;

    for (let y = ya; ; y += py) {
      for (let x = xa; ; x += px) {
        const nx = x + dx;
        const ny = y + dy;
        if (g.inBounds(x, y) && g.inBounds(nx, ny)) {
          const i = y * w + x;
          const k = ny * w + nx;
          if (mat[i] === SAND && mat[k] === EMPTY) {
            mat[k] = SAND;
            col[k] = col[i]!;
            vel[k] = 0;
            mat[i] = EMPTY;
            col[i] = 0;
            // sandCount no cambia: el grano se ha movido, no se ha creado.
            g.wake(x, y);
            g.wake(nx, ny);
          }
        }
        if (x === xb) break;
      }
      if (y === yb) break;
    }
  }

  draw(d: DrawCtx): void {
    const { ctx, s } = d;

    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }

    const y = Math.round(this.cy * s) + 0.5;
    const xa = (this.cx - this.radius) * s;
    const xb = (this.cx + this.radius + 1) * s;

    // Marcas tenues del trayecto: dicen por donde va a ir antes de que vaya, y
    // con caminos inclinados son ademas lo unico que explica la rampa. Van
    // primero para que la bandeja se pinte encima.
    ctx.save();
    ctx.strokeStyle = THEME.structureSoft;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo((this.ax + 0.5) * s, (this.ay + 0.5) * s);
    ctx.lineTo((this.bx + 0.5) * s, (this.by + 0.5) * s);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    // Los costados. Se pintan porque paran la arena de verdad: lo que se dibuja
    // tiene que ser lo que la para, igual que la cruz perdio su aro por sugerir
    // una llanta que no existia.
    ctx.moveTo(xa + 0.5, y);
    ctx.lineTo(xa + 0.5, y - this.lip * s);
    ctx.moveTo(xb - 0.5, y);
    ctx.lineTo(xb - 0.5, y - this.lip * s);
    ctx.stroke();

    // Ruedas girando. Antes eran poleas, de cuando el suelo era una cinta; ya no
    // lo es, y una polea diria que la carga se desliza por encima cuando lo que
    // hace es ir montada. Una rueda dice lo que pasa: el carro entero se mueve.
    const r = Math.max(3, s * 1.6);
    const phase = this.t * Math.hypot(this.bx - this.ax, this.by - this.ay) * 0.6;
    for (const px of [xa + r, xb - r]) {
      ctx.beginPath();
      ctx.arc(px, y + r, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, y + r);
      ctx.lineTo(px + Math.cos(phase) * r, y + r + Math.sin(phase) * r);
      ctx.stroke();
    }

    this.wick.drawFuse(d, this.cx, this.cy, this.radius);
  }
}
