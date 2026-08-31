import type { Grid } from '../grid';
import { BELT_L, BELT_R } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import type { Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/** Largo de la barra, en celdas. */
const LEN = 26;
/** Recorrido a cada lado del punto donde se solto, en celdas. */
const RANGE = 40;
/** Velocidad de patrulla, en celdas/s. */
const SPEED = 14;
/** Radio de agarre. Generoso a proposito: con el dedo hay que poder cogerla. */
const GRAB_R = 13;

/**
 * Plataforma que patrulla de izquierda a derecha.
 *
 * El cuerpo no es una pared cualquiera: se estampa como material de cinta
 * (BELT_L / BELT_R) con su `beltSpeed`, asi que la arena que lleva encima
 * **viaja con ella**. Es la parte que no se ve venir — una barra solida que se
 * desplaza se escurriria por debajo del monton y lo dejaria caer en el sitio.
 *
 * Toda esa fisica ya estaba escrita en `physics.ts` desde la fabrica original y
 * no la usaba nadie: el arrastre por rozamiento alcanza BELT_REACH capas hacia
 * arriba y pierde fuerza con la profundidad, que es justo lo que hace que la
 * plataforma se lleve el monton entero y no solo la capa que la toca.
 */
export class Platform implements Gadget {
  readonly kind = 'platform';
  readonly radius = GRAB_R;
  dead = false;

  /** Centro de la patrulla. La barra va y viene alrededor de el. */
  private homeX: number;
  /** Desplazamiento respecto al centro, en celdas. En coma flotante: a 14
   *  celdas/s la barra avanza 0,23 celdas por paso y en enteros no se moveria. */
  private offset = 0;
  private dir: 1 | -1 = 1;
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.homeX = cx;
  }

  /** El arrastre la ha recolocado: la patrulla se recentra donde se solto. */
  onMoved(): void {
    this.homeX = this.cx;
    this.offset = 0;
  }

  clear(g: Grid): void {
    if (!this.box) return;
    const [x0, y0, x1, y1] = this.box;
    // Los dos materiales: la barra alterna el sentido al llegar a un extremo, y
    // limpiar solo el actual dejaria el de la ida escrito por todo el recorrido.
    g.clearStructure(x0, y0, x1, y1, BELT_L);
    g.clearStructure(x0, y0, x1, y1, BELT_R);
    g.wakeRect(x0, y0, x1, y1);
    this.box = null;
  }

  tick(c: TickCtx, dt: number): void {
    const g = c.grid;
    const half = LEN >> 1;
    // Ambos extremos se recortan al mundo y `hi` nunca baja de `lo`: en un grid
    // estrecho, o con un centro de patrulla fuera de rango, un intervalo
    // invertido manda la barra a rebotar entre dos puntos imposibles.
    const lo = Math.max(half, Math.min(g.w - 1 - half, this.homeX - RANGE));
    const hi = Math.max(lo, Math.min(g.w - 1 - half, this.homeX + RANGE));

    this.offset += this.dir * SPEED * dt;
    let x = this.homeX + this.offset;
    if (x >= hi) {
      x = hi;
      this.offset = hi - this.homeX;
      this.dir = -1;
    } else if (x <= lo) {
      x = lo;
      this.offset = lo - this.homeX;
      this.dir = 1;
    }
    this.cx = Math.round(x);

    const mat = this.dir === 1 ? BELT_R : BELT_L;
    /**
     * `beltSpeed` es una probabilidad por paso de simulacion, no una velocidad
     * absoluta, asi que se deriva de `dt`: si el equipo baja la simulacion a
     * 30 Hz, cada paso vale el doble de tiempo y el agarre tiene que doblarse o
     * la arena se quedaria atras respecto a la barra que la lleva.
     */
    const grip = Math.max(1, Math.min(255, Math.round(SPEED * dt * 255)));

    const x0 = this.cx - half;
    const x1 = this.cx + half;
    for (let px = x0; px <= x1; px++) {
      // `pushDir` en el sentido de la marcha: el borde de ataque aparta hacia
      // delante la arena que se encuentra, en vez de hacia un lado al azar.
      g.stamp(px, this.cy, mat, this.dir);
      if (g.inBounds(px, this.cy)) g.beltSpeed[g.idx(px, this.cy)] = grip;
    }

    // La caja cubre todo el recorrido posible de un paso, no solo la barra: si
    // se limpiara justo el ancho de la barra, la celda que acaba de abandonar
    // se quedaria escrita y la plataforma iria dejando un rastro solido.
    this.box = [x0 - 2, this.cy - 1, x1 + 2, this.cy + 1];
    g.wakeRect(x0 - 2, this.cy - 6, x1 + 2, this.cy + 1);
  }

  draw({ ctx, s }: DrawCtx): void {
    const half = LEN >> 1;
    const y = Math.round(this.cy * s) + 0.5;
    const xa = (this.cx - half) * s;
    const xb = (this.cx + half + 1) * s;

    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    ctx.stroke();

    // Poleas girando: sin ellas la barra es una raya quieta y no se lee que
    // ademas de moverse esta arrastrando.
    const r = Math.max(3, s * 1.6);
    const phase = this.offset * 0.6;
    for (const px of [xa, xb]) {
      ctx.beginPath();
      ctx.arc(px, y + r, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, y + r);
      ctx.lineTo(px + Math.cos(phase) * r, y + r + Math.sin(phase) * r);
      ctx.stroke();
    }

    // Marcas tenues del recorrido: dicen hasta donde va a llegar antes de que
    // llegue, que es lo que evita colocarla y descubrir tarde que barre de mas.
    ctx.save();
    ctx.strokeStyle = THEME.structureSoft;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo((this.homeX - RANGE - half) * s, y);
    ctx.lineTo((this.homeX + RANGE + half + 1) * s, y);
    ctx.stroke();
    ctx.restore();
  }
}
