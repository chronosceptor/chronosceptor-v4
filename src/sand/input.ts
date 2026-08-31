import type { Point } from './draw';

export type StrokeMode = 'draw' | 'erase';

export interface InputHooks {
  /** Pixeles CSS del elemento a coordenadas de celda. */
  toCell(px: number, py: number): Point;
  /** ¿Hay pared del usuario ahi? Decide si el gesto dibuja o borra. */
  hasWall(cell: Point): boolean;
  /** Pinta el segmento entre dos celdas. */
  paint(from: Point, to: Point, erase: boolean): void;
  /** Primer trazo de la sesion: sirve para retirar la pista inicial. */
  onFirstStroke(): void;
}

/**
 * Gestos de dibujo.
 *
 * El trazo se aplica **en el evento**, no en el bucle de simulacion. Leyendolo
 * desde el bucle solo se conoce la ultima posicion del puntero y se pierden
 * todos los puntos intermedios, que es justo lo que rompe las lineas rapidas.
 */
export class Input {
  x = 0;
  y = 0;
  present = false;
  active = false;
  mode: StrokeMode = 'draw';

  private last: Point | null = null;
  private drew = false;
  private readonly handlers: Array<[string, EventListener]> = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly hooks: InputHooks,
  ) {
    this.on('pointerdown', (e) => this.down(e as PointerEvent));
    this.on('pointermove', (e) => this.move(e as PointerEvent));
    this.on('pointerup', () => this.up());
    this.on('pointercancel', () => this.up());
    this.on('pointerleave', () => {
      this.present = false;
    });
    this.on('pointerenter', () => {
      this.present = true;
    });
    // Sin esto el boton derecho abre el menu del navegador a media goma.
    this.on('contextmenu', (e) => e.preventDefault());
  }

  private on(type: string, fn: EventListener): void {
    this.el.addEventListener(type, fn);
    this.handlers.push([type, fn]);
  }

  private local(e: PointerEvent): Point {
    const r = this.el.getBoundingClientRect();
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
    this.present = true;
    return this.hooks.toCell(this.x, this.y);
  }

  private down(e: PointerEvent): void {
    const cell = this.local(e);
    // El boton derecho fuerza borrar; con el izquierdo lo decide el contexto:
    // empezar sobre una pared borra, empezar sobre vacio dibuja. El modo se
    // fija para todo el gesto — recalculandolo en cada movimiento alternaria
    // solo y seria imposible de controlar.
    this.mode = e.button === 2 || this.hooks.hasWall(cell) ? 'erase' : 'draw';
    this.active = true;
    this.last = cell;
    // Lanza NotFoundError si el puntero ya no esta activo (un toque que se
    // suelta antes de que corra el handler). Sin proteger, la excepcion aborta
    // el resto del metodo y se pierden la primera marca del trazo y la senal de
    // primer trazo: el gesto empieza cojo sin que nada lo indique.
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      /* sin captura: el gesto sigue funcionando mientras no salga del canvas */
    }

    this.hooks.paint(cell, cell, this.mode === 'erase');
    if (!this.drew) {
      this.drew = true;
      this.hooks.onFirstStroke();
    }
  }

  private move(e: PointerEvent): void {
    if (!this.active) {
      this.local(e);
      return;
    }
    // Los eventos agrupados traen las posiciones intermedias que el navegador
    // junto en un solo `pointermove`. Sin leerlas se pierde fidelidad en los
    // trazos rapidos aunque se interpole.
    const points = e.getCoalescedEvents?.() ?? [];
    const seq = points.length > 0 ? points : [e];
    const erase = this.mode === 'erase';

    for (const p of seq) {
      const cell = this.local(p as PointerEvent);
      if (this.last) this.hooks.paint(this.last, cell, erase);
      this.last = cell;
    }
  }

  private up(): void {
    this.active = false;
    this.last = null;
  }

  destroy(): void {
    for (const [type, fn] of this.handlers) this.el.removeEventListener(type, fn);
    this.handlers.length = 0;
  }
}
