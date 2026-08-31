import type { Grid } from '../grid';
import type { Palette } from '../palette';
import type { DrawCtx } from '../render';
import type { Ejecta } from '../ejecta';
import { Spinner } from './spinner';
import { Platform } from './platform';
import { Bomb } from './bomb';
import { Emitter } from './emitter';

export type GadgetKind = 'spinner' | 'platform' | 'bomb' | 'emitter';

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
    case 'spinner':
    default:
      return new Spinner(cx, cy);
  }
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
}

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
  /** La bomba se marca al explotar; la capa la retira al final del paso. */
  dead: boolean;
  /** Borra el cuerpo del grid y despierta lo que tenia alrededor. */
  clear(g: Grid): void;
  /** Avanza el estado y vuelve a estampar el cuerpo. */
  tick(c: TickCtx, dt: number): void;
  /** Trazo vectorial, encima del bitmap de arena. */
  draw(d: DrawCtx): void;
  /** Toque sin arrastre. Solo la bomba lo usa (detona). */
  tap?(): void;
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

export class GadgetLayer {
  private items: Gadget[] = [];

  get count(): number {
    return this.items.length;
  }

  get full(): boolean {
    return this.items.length >= MAX_GADGETS;
  }

  add(g: Gadget): boolean {
    if (this.full) return false;
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
  tick(c: TickCtx, dt: number): void {
    for (const g of this.items) g.clear(c.grid);
    for (const g of this.items) g.tick(c, dt);
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

  /** ¿Cabe una pieza de este radio aqui sin solapar otra? */
  fits(x: number, y: number, radius: number, ignore?: Gadget | null): boolean {
    for (const g of this.items) {
      if (g === ignore) continue;
      const dx = x - g.cx;
      const dy = y - g.cy;
      const r = g.radius + radius;
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  }

  clearAll(grid: Grid): void {
    for (const g of this.items) g.clear(grid);
    this.items = [];
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
    }
  }
}
