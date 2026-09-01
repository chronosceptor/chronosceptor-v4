import type { Grid } from '../grid';
import { DYN } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
const BLADES = 4;
/**
 * Radio de las aspas, en celdas.
 *
 * Grande a proposito: una cruz pequena solo desvia el hilo que le cae justo
 * encima y apenas se nota. A este tamano barre una porcion de escena de verdad.
 */
export const SPINNER_R = 20;
/** Radio del cubo. Sin el, la arena se cuela hasta el eje y se atasca ahi. */
const HUB_R = 2;
/**
 * Velocidad angular, en rad/s.
 *
 * La punta recorre OMEGA * R = 24 celdas/s, o 0,4 celdas por frame: menos de
 * una celda, asi que ningun aspa se teletransporta al otro lado de un grano.
 * Subirla por encima de ~5 rad/s empieza a atravesar arena sin tocarla.
 */
const OMEGA = 2.2;

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
  readonly radius = SPINNER_R;
  dead = false;
  private angle = 0;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva. */
  private readonly wick = new Wick();
  /** Caja del cuerpo escrito en el ultimo paso: es exactamente lo que hay que borrar. */
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
    private readonly dir: 1 | -1 = 1,
  ) {}

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
    this.wick.ignite(b, this.cx, this.cy, SPINNER_R);
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

    this.angle = (this.angle + this.dir * OMEGA * dt) % TAU;
    const g = c.grid;
    g.stampDisc(this.cx, this.cy, HUB_R, DYN);

    for (let k = 0; k < BLADES; k++) {
      const a = this.angle + (k * TAU) / BLADES;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // A medio paso: con paso entero un aspa casi horizontal deja huecos por
      // los que se cuela la arena en vez de recibir el golpe.
      for (let t = HUB_R; t <= SPINNER_R; t += 0.5) {
        const y = Math.round(this.cy + sa * t);
        g.stamp(Math.round(this.cx + ca * t), y, DYN, this.push(y));
      }
    }

    this.box = [
      this.cx - SPINNER_R - 1,
      this.cy - SPINNER_R - 1,
      this.cx + SPINNER_R + 1,
      this.cy + SPINNER_R + 1,
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
    const r = (SPINNER_R + 0.5) * s;
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

    this.wick.drawFuse(d, this.cx, this.cy, SPINNER_R);
  }
}
