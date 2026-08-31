import type { Grid } from '../grid';
import { drawNozzle, type DrawCtx } from '../render';
import { mulberry32 } from '../rng';
import { Source } from '../world';
import type { Gadget, TickCtx } from './index';

/** Radio de agarre, en celdas. */
const GRAB_R = 8;
/**
 * Caudal, en granos/s. Por debajo de la fuente principal (700 en escritorio):
 * es un chorro secundario, y a caudal igual compite con el original.
 */
const RATE = 500;
/**
 * Semiancho de la boquilla, en celdas. Es el techo real del caudal, no `RATE`.
 *
 * Con 3 se veia el problema que el README ya documenta para la fuente
 * principal: la boquilla solo puede sembrar en sus celdas libres, asi que
 * rechaza lo que no cabe y el chorro sale a guiones en vez de como un hilo. Se
 * pedian 320 granos/s y salian del orden de 180.
 */
const NOZZLE = 4;
/** Segundos entre cambios de color dominante. */
const COLOR_PERIOD = 26;

/**
 * Fuente de arena colocable.
 *
 * Es la misma `Source` de la escena, solo que puesta donde el usuario quiera.
 * Cada una lleva su propio generador aleatorio, asi que rota su color dominante
 * por libre: con dos o tres repartidas, la cuenca deja de ser una papilla
 * uniforme y sale estratificada por chorros — que es justo lo que anticipaba el
 * comentario de `grainColor` mucho antes de que hubiera varios emisores.
 *
 * No tiene cuerpo solido: una boquilla que ademas fuese pared se taponaria con
 * su propia arena.
 */
export class Emitter implements Gadget {
  readonly kind = 'emitter';
  readonly radius = GRAB_R;
  dead = false;

  private readonly source: Source;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.source = new Source(
      cx,
      NOZZLE,
      RATE,
      COLOR_PERIOD,
      mulberry32((Date.now() ^ (cx * 2654435761)) >>> 0),
      cy,
    );
  }

  onMoved(): void {
    this.source.x = this.cx;
    this.source.y = this.cy;
  }

  clear(_g: Grid): void {
    // Sin cuerpo que borrar.
  }

  tick(c: TickCtx, dt: number): void {
    this.source.tick(c.grid, dt, c.palette, c.rand, c.budget);
  }

  draw(d: DrawCtx): void {
    drawNozzle(d, this.cx, this.cy);
  }
}
