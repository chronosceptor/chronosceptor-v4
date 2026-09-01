import type { Grid } from '../grid';
import { DYN } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/** Cuerpo solido, en celdas: la arena se apoya en ella en vez de atravesarla. */
const BODY_R = 3;
/** Radio de agarre. Mas grande que el cuerpo para poder tocarla con el dedo. */
const GRAB_R = 9;

/**
 * Bomba de mecha.
 *
 * No tiene mecha propia: lleva la misma `Wick` que puede acabar llevando
 * cualquier otra pieza, solo que nace encendida. Esa es toda la diferencia
 * entre una bomba y una cruz a la que le ha estallado algo al lado.
 *
 * Al soltarla arranca la mecha con un anillo que se vacia; tocarla antes la
 * detona en el acto. Cuando estalla convierte en arena balistica todo lo que
 * tiene alrededor y se consume.
 *
 * Se lleva por delante tanto la arena como las paredes dibujadas — abre un
 * boquete en el trazo y lo que aguantaba encima se desploma por el.
 *
 * Al principio respetaba el dibujo, por no destruir el trabajo de quien esta
 * jugando. Resulto ser la decision equivocada: una bomba que no rompe nada de
 * lo que has construido no es una bomba, y el aro punteado del alcance ya avisa
 * de lo que se va a llevar antes de que estalle.
 *
 * Lo unico intocable es el suelo del mundo (LEDGE, que ademas lleva el
 * sumidero) y los cuerpos de otras piezas, que se reescriben solos cada paso —
 * aunque a las piezas en si se las lleva igual, encendiendolas.
 */
export class Bomb implements Gadget {
  readonly kind = 'bomb';
  readonly radius = GRAB_R;
  dead = false;

  private readonly wick = new Wick();
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.wick.light();
  }

  clear(g: Grid): void {
    if (!this.box) return;
    const [x0, y0, x1, y1] = this.box;
    g.clearStructure(x0, y0, x1, y1, DYN);
    g.wakeRect(x0, y0, x1, y1);
    this.box = null;
  }

  /** Toque: detona ya. */
  tap(): void {
    this.wick.tap();
  }

  ignite(b: Blast): void {
    this.wick.ignite(b, this.cx, this.cy, BODY_R);
  }

  tick(c: TickCtx, dt: number): void {
    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      this.dead = true;
      return;
    }
    // Ya reventada: el cuerpo no se vuelve a estampar, asi que el crater se
    // derrumba mientras se apaga el anillo.
    if (paso === 'humo') return;

    const g = c.grid;
    g.stampDisc(this.cx, this.cy, BODY_R, DYN);
    this.box = [
      this.cx - BODY_R - 1,
      this.cy - BODY_R - 1,
      this.cx + BODY_R + 1,
      this.cy + BODY_R + 1,
    ];
    g.wakeRect(this.box[0], this.box[1], this.box[2], this.box[3]);
  }

  draw(d: DrawCtx): void {
    const { ctx, s } = d;

    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.structureLine;
    ctx.beginPath();
    ctx.arc((this.cx + 0.5) * s, (this.cy + 0.5) * s, (BODY_R + 0.5) * s, 0, TAU);
    ctx.stroke();
    ctx.restore();

    this.wick.drawFuse(d, this.cx, this.cy, GRAB_R - 2);
  }
}
