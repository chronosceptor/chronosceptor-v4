import type { Grid } from '../grid';
import { SAND } from '../materials';
import { THEME, rgbCss } from '../palette';
import type { DrawCtx } from '../render';
import { RESERVED_ROWS } from '../world';
import type { Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/**
 * Radio de la bola, en celdas. Es tambien el ancho de lo que borra a su paso.
 *
 * Lo que barre por segundo va con el radio por la rapidez, asi que estos dos
 * numeros son los que deciden si la bola limpia de verdad o solo hace cosquillas.
 * Con radio 7 y 90 celdas/s, tres bolas apenas frenaban el 41% de lo que suelta
 * la fuente: la pantalla se seguia llenando y no se parecia en nada a limpiarla.
 */
const BALL_R = 13;
/**
 * Radio de agarre, mayor que la bola.
 *
 * Generoso a proposito: a esta velocidad la bola cruza el punto donde esta el
 * cursor en una decima de segundo, y con un objetivo del tamano justo de la
 * bola no habria manera humana de cogerla para moverla o tirarla.
 */
const GRAB_R = 18;
/** Rapidez, en celdas/s. Constante: no hay gravedad ni rozamiento. */
const SPEED = 145;

/**
 * Bola que rebota en los bordes y se come la arena que toca.
 *
 * No tiene cuerpo solido en el grid. Podria estamparse como DYN para que la
 * arena chocase con ella, pero seria trabajo tirado: lo que hay dentro de su
 * radio deja de existir en el mismo paso, asi que nunca habria nada contra lo
 * que chocar.
 *
 * Rebota solo contra los bordes del lienzo, no contra las paredes dibujadas.
 * Es deliberado: sirve para vaciar la pantalla, y una bola que rebotase en el
 * dibujo se quedaria encerrada dentro del primer cuenco que se encontrara y no
 * volveria a limpiar nada.
 */
export class Ball implements Gadget {
  readonly kind = 'ball';
  readonly radius = GRAB_R;
  /** Lo que ocupa de verdad es la bola, no la holgura para poder cogerla. */
  readonly footprint = BALL_R;
  dead = false;
  held = false;

  /** Posicion en celdas, en coma flotante: a esta velocidad los enteros dan tirones. */
  private px: number;
  private py: number;
  private vx: number;
  private vy: number;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.px = cx;
    this.py = cy;
    // Un angulo lejos de la horizontal y de la vertical. Saliendo casi recta,
    // la bola barre una sola franja y deja el resto de la pantalla intacto.
    const a = (25 + Math.random() * 40) * (Math.PI / 180);
    const sx = Math.random() < 0.5 ? -1 : 1;
    const sy = Math.random() < 0.5 ? -1 : 1;
    this.vx = Math.cos(a) * SPEED * sx;
    this.vy = Math.sin(a) * SPEED * sy;
  }

  /** El arrastre la ha recolocado: la posicion fina sigue a la celda. */
  onMoved(): void {
    this.px = this.cx;
    this.py = this.cy;
  }

  clear(_g: Grid): void {
    // Sin cuerpo que borrar.
  }

  tick(c: TickCtx, dt: number): void {
    const g = c.grid;
    // Mientras se arrastra se queda quieta, o se escaparia del dedo.
    if (!this.held) {
      this.px += this.vx * dt;
      this.py += this.vy * dt;

      // Rebote. Se refleja la posicion ademas de invertir la velocidad: dejando
      // solo la velocidad, un paso largo puede terminar mas alla del borde y la
      // bola se queda vibrando pegada a el.
      const lo = BALL_R;
      const hiX = g.w - 1 - BALL_R;
      // Por abajo el limite es la zona jugable, no el borde del mundo: las
      // ultimas filas son el drenaje y la bola taparia esa linea.
      const hiY = g.h - 1 - RESERVED_ROWS - BALL_R;

      if (this.px < lo) {
        this.px = lo + (lo - this.px);
        this.vx = Math.abs(this.vx);
      } else if (this.px > hiX) {
        this.px = hiX - (this.px - hiX);
        this.vx = -Math.abs(this.vx);
      }
      if (this.py < lo) {
        this.py = lo + (lo - this.py);
        this.vy = Math.abs(this.vy);
      } else if (this.py > hiY) {
        this.py = hiY - (this.py - hiY);
        this.vy = -Math.abs(this.vy);
      }

      this.cx = Math.round(this.px);
      this.cy = Math.round(this.py);
    }

    this.devour(g);
  }

  /** Se lleva la arena que le cabe dentro. Las paredes dibujadas no se tocan. */
  private devour(g: Grid): void {
    const r2 = BALL_R * BALL_R;
    const y0 = Math.max(0, this.cy - BALL_R);
    const y1 = Math.min(g.h - 1, this.cy + BALL_R);
    const x0 = Math.max(0, this.cx - BALL_R);
    const x1 = Math.min(g.w - 1, this.cx + BALL_R);

    for (let y = y0; y <= y1; y++) {
      const dy = y - this.cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - this.cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = g.idx(x, y);
        if (g.mat[i] === SAND) g.removeAt(i);
      }
    }
    // Lo que quedaba encima se desmorona en el hueco que acaba de abrir.
    g.wakeRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  draw({ ctx, s }: DrawCtx): void {
    const cx = (this.cx + 0.5) * s;
    const cy = (this.cy + 0.5) * s;
    ctx.save();
    // Del mismo material que las paredes que dibuja el usuario: relleno con el
    // color de la masa y filete con el de la linea, que es exactamente como se
    // ve un trazo suyo. En negro sobre el fondo negro seria invisible.
    ctx.fillStyle = rgbCss(THEME.structure);
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, BALL_R * s, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
