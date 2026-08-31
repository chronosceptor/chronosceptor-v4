import type { Grid } from '../grid';
import { DYN, SAND } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import type { Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/** Cuerpo solido, en celdas: la arena se apoya en ella en vez de atravesarla. */
const BODY_R = 3;
/** Radio de agarre. Mas grande que el cuerpo para poder tocarla con el dedo. */
const GRAB_R = 9;
/** Segundos de mecha. */
const FUSE = 2;
/** Radio de la explosion, en celdas. */
const BLAST_R = 42;
/** Rapidez en el centro de la explosion, en celdas/s. */
const POWER = 520;
/**
 * Impulso hacia arriba anadido a todo lo que sale despedido.
 *
 * Sin el, la mitad inferior de la esfera sale disparada contra el suelo, se
 * deposita a dos celdas y no se ve nada: la explosion parece un chasquido. Con
 * el, el material sube y vuelve a caer, que es lo que se lee como explosion.
 */
const LIFT = 120;
/** Duracion del anillo de choque, en segundos. */
const FLASH = 0.35;

/**
 * Bomba de mecha.
 *
 * Al soltarla arranca una mecha de dos segundos con un anillo que se vacia;
 * tocarla antes la detona en el acto. Cuando estalla convierte en arena
 * balistica todo lo que tiene alrededor y se consume.
 *
 * No destruye las paredes del usuario: el dibujo es el trabajo de quien esta
 * jugando y una pieza que lo borrase de golpe seria un castigo, no un juguete.
 */
export class Bomb implements Gadget {
  readonly kind = 'bomb';
  readonly radius = GRAB_R;
  dead = false;

  private fuse = FUSE;
  private flash = 0;
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
  ) {}

  clear(g: Grid): void {
    if (!this.box) return;
    const [x0, y0, x1, y1] = this.box;
    g.clearStructure(x0, y0, x1, y1, DYN);
    g.wakeRect(x0, y0, x1, y1);
    this.box = null;
  }

  /** Toque: detona ya. */
  tap(): void {
    if (this.flash <= 0) this.fuse = 0;
  }

  tick(c: TickCtx, dt: number): void {
    // Ya reventada: solo queda que se apague el anillo de choque. El cuerpo no
    // se vuelve a estampar, asi que el crater se derrumba mientras tanto.
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.dead = true;
      return;
    }

    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.detonate(c);
      return;
    }

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

  private detonate({ grid: g, ejecta, rand }: TickCtx): void {
    const r2 = BLAST_R * BLAST_R;
    const y0 = Math.max(0, this.cy - BLAST_R);
    const y1 = Math.min(g.h - 1, this.cy + BLAST_R);
    const x0 = Math.max(0, this.cx - BLAST_R);
    const x1 = Math.min(g.w - 1, this.cx + BLAST_R);

    /**
     * Primero se vacia la esfera entera, y solo despues sale todo despedido.
     *
     * Haciendolo en un solo recorrido —sacar un grano y lanzarlo acto seguido—
     * los primeros salen mientras el resto de la esfera sigue compacta: vuelan
     * una celda, chocan contra arena que aun no se ha retirado y no encuentran
     * hueco donde aterrizar. Medido asi, la explosion perdia 236 granos. Vaciar
     * antes deja el crater abierto y todos vuelan por aire libre.
     */
    const salen: Array<{ x: number; y: number; d: number; dx: number; dy: number; col: number }> = [];

    for (let y = y0; y <= y1; y++) {
      const dy = y - this.cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - this.cx;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const i = g.idx(x, y);
        if (g.mat[i] !== SAND) continue;
        // Si no cabe una particula mas, el grano se queda donde esta. Sacarlo
        // del grid sin poder lanzarlo seria destruirlo, y una explosion mueve
        // material, no lo hace desaparecer.
        if (salen.length >= ejecta.room) continue;

        salen.push({ x, y, d: Math.sqrt(d2), dx, dy, col: g.col[i]! });
        g.removeAt(i);
      }
    }

    for (const p of salen) {
      // En el centro exacto no hay direccion radial que valga: se sortea.
      const a = p.d < 1 ? rand() * TAU : 0;
      const ux = p.d < 1 ? Math.cos(a) : p.dx / p.d;
      const uy = p.d < 1 ? Math.sin(a) : p.dy / p.d;
      const f = (1 - p.d / BLAST_R) * POWER * (0.7 + rand() * 0.6);
      ejecta.launch(p.x, p.y, ux * f, uy * f - LIFT, p.col);
    }

    g.wakeRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    this.flash = FLASH;
  }

  draw({ ctx, s }: DrawCtx): void {
    const cx = (this.cx + 0.5) * s;
    const cy = (this.cy + 0.5) * s;
    ctx.save();
    ctx.lineWidth = 1;

    if (this.flash > 0) {
      // Anillo de choque: se abre hasta el radio real de la explosion y se
      // apaga. Es lo que explica de un vistazo hasta donde ha llegado.
      const t = 1 - this.flash / FLASH;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = THEME.inkBright;
      ctx.beginPath();
      ctx.arc(cx, cy, BLAST_R * s * t, 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Alcance, tenue y discontinuo. Con un radio de 42 celdas, colocarla a
    // ciegas es descubrir despues que se ha llevado medio dibujo por delante.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = THEME.structureSoft;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, BLAST_R * s, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = THEME.structureLine;
    ctx.beginPath();
    ctx.arc(cx, cy, (BODY_R + 0.5) * s, 0, TAU);
    ctx.stroke();

    // Mecha: un arco que se vacia en sentido horario desde arriba. Dice cuanto
    // queda sin numeros ni barra de progreso.
    const left = Math.max(0, this.fuse / FUSE);
    ctx.strokeStyle = THEME.inkBright;
    ctx.beginPath();
    ctx.arc(cx, cy, (GRAB_R - 1) * s, -Math.PI / 2, -Math.PI / 2 + left * TAU);
    ctx.stroke();
    ctx.restore();
  }
}
