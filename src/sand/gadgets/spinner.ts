import type { Grid } from '../grid';
import { DYN } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
const BLADES = 4;
/**
 * Radio de las aspas, en celdas: el de partida y los topes entre los que lo
 * mueve el segundo punto del gesto de colocacion.
 *
 * El de partida es grande a proposito: una cruz pequena solo desvia el hilo que
 * le cae justo encima y apenas se nota. El minimo existe por lo mismo — una
 * cruz de dos celdas no para nada—, y el maximo, porque el radio es tambien el
 * sitio que la pieza reserva y una cruz enorme no dejaria colocar nada cerca.
 *
 * Los dos van en fraccion del ancho del lienzo, como el tamano de la bola y el
 * de la bandeja: en celdas fijas, las 20 de partida son el 10% del ancho en
 * escritorio y el 41% en un movil, que tiene 97 celdas contra 400. Las celdas
 * de escritorio se conservan tal cual — es donde estan calibradas.
 */
const R_FRAC = 0.05;
export const SPINNER_R = 20;
const MIN_R = 6;
/**
 * Y el maximo, tambien en fraccion del ancho: en un lienzo de movil, una cruz
 * de 40 celdas de radio no cabria de lado a lado.
 */
const MAX_FRAC = 0.1;
const MAX_R = 40;
const MAX_MIN = 14;

/** Radio de partida y tope, en celdas, para un lienzo de este ancho. */
function radios(gridW: number): { r0: number; max: number } {
  return {
    r0: Math.max(MIN_R + 2, Math.min(SPINNER_R, Math.round(gridW * R_FRAC))),
    max: Math.max(MAX_MIN, Math.min(MAX_R, Math.round(gridW * MAX_FRAC))),
  };
}
/** Radio del cubo. Sin el, la arena se cuela hasta el eje y se atasca ahi. */
const HUB_R = 2;
/**
 * Rapidez de la punta del aspa, en celdas/s.
 *
 * Lo que se fija es esto y no la velocidad angular, porque el tamano ahora lo
 * elige quien coloca la pieza. La punta recorre 44/60 = 0,73 celdas por frame:
 * menos de una, asi que ningun aspa se teletransporta al otro lado de un grano.
 * Con una omega fija de 2,2 rad/s, una cruz de 40 celdas llevaria la punta a 88
 * celdas/s —1,5 celdas por frame— y empezaria a atravesar arena sin tocarla.
 * A cambio, la cruz grande gira mas despacio, que es justo lo que uno espera de
 * algo mas grande.
 */
const TIP_SPEED = 44;
/** Tope de velocidad angular: la cruz pequena no tiene por que ser un ventilador. */
const MAX_OMEGA = 2.6;

/**
 * Cruz giratoria.
 *
 * Es la rueda de paletas de la fabrica original (commit 253dbfc) con motor
 * propio: alli el par lo daba la arena que le caia encima y aqui gira sola, que
 * es lo que la vuelve una herramienta y no un adorno.
 *
 * No empuja la arena con ninguna regla especial: el cuerpo se estampa como
 * material solido y `Grid.stamp()` aparta el grano que quede debajo. Toda la
 * sensacion de aventar sale de ahi.
 */
export class Spinner implements Gadget {
  readonly kind = 'spinner';
  /**
   * Radio de las aspas, y a la vez el sitio que reserva y el agarre. Lo fija el
   * segundo punto del gesto al colocarla, asi que no es `readonly`.
   */
  radius: number;
  /** Tope al que puede llegar el segundo punto del gesto. Sale del lienzo. */
  private readonly maxR: number;
  dead = false;
  private angle = 0;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva. */
  private readonly wick = new Wick();
  /** Caja del cuerpo escrito en el ultimo paso: es exactamente lo que hay que borrar. */
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
    /** Ancho del lienzo en celdas: de ahi sale el tamano. Ver `R_FRAC`. */
    gridW = 400,
    private readonly dir: 1 | -1 = 1,
  ) {
    const { r0, max } = radios(gridW);
    this.radius = r0;
    this.maxR = max;
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

  /**
   * Segundo punto del gesto de colocacion: el radio es la distancia al centro.
   *
   * Se recorta a los topes y despues se va bajando hasta que quepa. Parar de
   * crecer al tocar a la vecina es mejor que rechazar el gesto entero: se ve
   * donde esta el limite en vez de descubrir que el clic no ha hecho nada.
   */
  resize(x: number, y: number, fits: (cx: number, cy: number, r: number) => boolean): void {
    const want = Math.min(this.maxR, Math.max(MIN_R, Math.round(Math.hypot(x - this.cx, y - this.cy))));
    for (let r = want; r > MIN_R; r--) {
      if (fits(this.cx, this.cy, r)) {
        this.radius = r;
        return;
      }
    }
    this.radius = MIN_R;
  }

  tick(c: TickCtx, dt: number): void {
    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      this.dead = true;
      return;
    }
    // Mientras se apaga el anillo no se estampa el cuerpo: el crater tiene que
    // quedar abierto, y unas aspas intactas en medio de la explosion que se las
    // acaba de llevar serian justo lo contrario de lo que ha pasado.
    if (paso === 'humo') return;

    const omega = Math.min(MAX_OMEGA, TIP_SPEED / this.radius);
    this.angle = (this.angle + this.dir * omega * dt) % TAU;
    const g = c.grid;
    g.stampDisc(this.cx, this.cy, HUB_R, DYN);

    for (let k = 0; k < BLADES; k++) {
      const a = this.angle + (k * TAU) / BLADES;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // A medio paso: con paso entero un aspa casi horizontal deja huecos por
      // los que se cuela la arena en vez de recibir el golpe.
      for (let t = HUB_R; t <= this.radius; t += 0.5) {
        const y = Math.round(this.cy + sa * t);
        g.stamp(Math.round(this.cx + ca * t), y, DYN, this.push(y));
      }
    }

    this.box = [
      this.cx - this.radius - 1,
      this.cy - this.radius - 1,
      this.cx + this.radius + 1,
      this.cy + this.radius + 1,
    ];
    g.wakeRect(this.box[0], this.box[1], this.box[2], this.box[3]);
  }

  /**
   * Hacia donde avienta la celda del aspa que esta a la altura `y`.
   *
   * La rueda original llamaba a `g.line(..., DYN)` sin `pushDir`, asi que el
   * grano barrido salia hacia donde dictase la paridad de su celda: la rueda
   * escupia siempre al mismo lado independientemente de hacia donde girase.
   *
   * El sentido correcto es el de la velocidad tangencial. Para un punto a
   * distancia (dx, dy) del eje girando a ω: v = (-ω·dy, ω·dx), luego el signo
   * horizontal es -dir·signo(dy) — arriba del eje se barre hacia un lado y
   * abajo hacia el contrario, que es como se mueve una rueda de verdad.
   */
  private push(y: number): number {
    const dy = y - this.cy;
    if (dy === 0) return 0;
    return this.dir * dy > 0 ? -1 : 1;
  }

  draw(d: DrawCtx): void {
    const { ctx, s } = d;

    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }

    const cx = (this.cx + 0.5) * s;
    const cy = (this.cy + 0.5) * s;
    const r = (this.radius + 0.5) * s;
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;

    // Sin aro exterior. Lo llevaba la rueda original, pero aqui mentia: el aro
    // sugiere una llanta solida y lo unico solido son las aspas, asi que se veia
    // la arena atravesar limpiamente una circunferencia dibujada. Lo que se
    // pinta tiene que ser lo que para la arena.
    //
    // Las aspas se trazan aqui porque el cuerpo DYN no se pinta en el bitmap.
    ctx.beginPath();
    for (let k = 0; k < BLADES; k++) {
      const a = this.angle + (k * TAU) / BLADES;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, HUB_R * s * 0.6), 0, TAU);
    ctx.stroke();

    this.wick.drawFuse(d, this.cx, this.cy, this.radius);
  }
}
