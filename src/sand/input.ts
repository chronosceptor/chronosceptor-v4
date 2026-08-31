export type PointerMode = 'pour' | 'dig';

/**
 * Estado del puntero. No aplica nada por sí mismo: el bucle principal lo lee
 * cada frame, así el ritmo de vertido no depende de cuántos eventos mande el
 * navegador.
 */
export class Input {
  x = 0;
  y = 0;
  present = false;
  active = false;
  mode: PointerMode = 'pour';
  leverHover = false;

  private readonly handlers: Array<[string, EventListener]> = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly hooks: {
      /** ¿El puntero cae sobre la palanca? */
      isLever: (x: number, y: number) => boolean;
      onLever: () => void;
      /** ¿Hay arena bajo el puntero? Decide excavar en vez de verter. */
      hasSand: (x: number, y: number) => boolean;
    },
  ) {
    this.on('pointerdown', (e) => this.down(e as PointerEvent));
    this.on('pointermove', (e) => this.move(e as PointerEvent));
    this.on('pointerup', () => this.up());
    this.on('pointercancel', () => this.up());
    this.on('pointerleave', () => {
      this.present = false;
      this.up();
    });
  }

  private on(type: string, fn: EventListener): void {
    this.el.addEventListener(type, fn);
    this.handlers.push([type, fn]);
  }

  private local(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
    this.present = true;
  }

  private down(e: PointerEvent): void {
    this.local(e);
    if (this.hooks.isLever(this.x, this.y)) {
      this.hooks.onLever();
      return;
    }
    // El modo se fija en el pointerdown y se mantiene todo el gesto: si se
    // recalculara en cada movimiento, excavar alternaría con verter y sería
    // imposible de controlar.
    this.mode = this.hooks.hasSand(this.x, this.y) ? 'dig' : 'pour';
    this.active = true;
    this.el.setPointerCapture?.(e.pointerId);
  }

  private move(e: PointerEvent): void {
    this.local(e);
    this.leverHover = !this.active && this.hooks.isLever(this.x, this.y);
  }

  private up(): void {
    this.active = false;
  }

  destroy(): void {
    for (const [type, fn] of this.handlers) this.el.removeEventListener(type, fn);
    this.handlers.length = 0;
  }
}
