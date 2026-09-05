import type { Point } from './draw';

export type StrokeMode = 'draw' | 'erase' | 'gadget' | 'fire';

/**
 * La herramienta activa.
 *
 * Es el primer modo que tiene esta escena, y va contra la regla que la venia
 * rigiendo: no habia herramienta activa, todo gesto hacia siempre lo mismo y el
 * contexto decidia si dibujaba o borraba. El fuego no cabe en ese esquema —no
 * es una pieza que se coloque ni algo que caiga, es lo que hace el puntero— y
 * la alternativa era inventarle un gesto que hubiera que aprender. Se paga con
 * un boton que hay que acordarse de apagar; a cambio, prender es el mismo gesto
 * con raton y con dedo.
 */
export type Tool = 'draw' | 'fire';

export interface InputHooks {
  /** Pixeles CSS del elemento a coordenadas de celda. */
  toCell(px: number, py: number): Point;
  /** ¿Hay pared del usuario ahi? Decide si el gesto dibuja o borra. */
  hasWall(cell: Point): boolean;
  /** Pinta el segmento entre dos celdas. */
  paint(from: Point, to: Point, erase: boolean): void;
  /** ¿Hay una pieza bajo esta celda? Tiene prioridad sobre el trazo. */
  hasGadget?(cell: Point): boolean;
  /** La herramienta activa. Sin esto, siempre se dibuja. */
  tool?(): Tool;
  /** Prende el segmento entre dos celdas: la antorcha. */
  ignite?(from: Point, to: Point): void;
  /** Agarra la pieza que hay en esta celda. */
  grab?(cell: Point): void;
  /** Arrastra la pieza agarrada. Las coordenadas de pantalla son para la papelera. */
  dragTo?(cell: Point, clientX: number, clientY: number): void;
  /**
   * Suelta la pieza: la recoloca, o la borra si cayo en la papelera.
   * `tap` indica que el gesto apenas se movio, asi que era un toque: no hay que
   * mirar la papelera y la pieza decide que hacer (la bomba, detonar).
   */
  drop?(cell: Point, clientX: number, clientY: number, tap: boolean): void;
}

/** Recorrido y duracion por debajo de los cuales un gesto cuenta como toque. */
const TAP_CELLS = 5;
const TAP_MS = 400;

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
  private readonly handlers: Array<[string, EventListener]> = [];
  /** Coordenadas de pantalla del ultimo evento: la papelera vive en el DOM. */
  private clientX = 0;
  private clientY = 0;
  /** Donde y cuando empezo el gesto, para separar un toque de un arrastre. */
  private origin: Point | null = null;
  private originT = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly hooks: InputHooks,
  ) {
    this.on('pointerdown', (e) => this.down(e as PointerEvent));
    this.on('pointermove', (e) => this.move(e as PointerEvent));
    this.on('pointerup', () => this.up());
    this.on('pointercancel', () => this.up(true));
    // Red de seguridad: si el navegador retira la captura sin mandar pointerup
    // —el puntero sale de la ventana, otra pestana roba el foco— el gesto se
    // quedaria abierto, y con una pieza en la mano eso deja el dock convertido
    // en papelera para siempre. Tras un pointerup normal esto tambien salta,
    // pero entonces el gesto ya esta cerrado y no hace nada.
    this.on('lostpointercapture', () => this.up(true));
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
    this.clientX = e.clientX;
    this.clientY = e.clientY;
    this.present = true;
    return this.hooks.toCell(this.x, this.y);
  }

  private down(e: PointerEvent): void {
    const cell = this.local(e);
    this.origin = cell;
    this.originT = performance.now();

    // La antorcha gana a todo lo demas, incluido el agarre de piezas: tocar una
    // bomba con fuego tiene que detonarla, no arrastrarla. El boton derecho se
    // queda fuera a proposito — sigue borrando aunque la antorcha este
    // encendida, y es la salida de emergencia por si te has quedado atrapado
    // prendiendo lo que querias borrar.
    if (e.button !== 2 && this.hooks.tool?.() === 'fire') {
      this.mode = 'fire';
      this.active = true;
      this.last = cell;
      this.capture(e);
      this.hooks.ignite?.(cell, cell);
      return;
    }

    // Una pieza colocada gana al trazo: si el gesto empieza encima de una, lo
    // que se quiere es moverla, no dibujar una pared sobre ella. Es la unica
    // decision nueva del gesto; todo lo de abajo sigue igual que antes.
    if (this.hooks.hasGadget?.(cell)) {
      this.mode = 'gadget';
      this.active = true;
      this.last = cell;
      this.capture(e);
      this.hooks.grab?.(cell);
      return;
    }

    // El boton derecho fuerza borrar; con el izquierdo lo decide el contexto:
    // empezar sobre una pared borra, empezar sobre vacio dibuja. El modo se
    // fija para todo el gesto — recalculandolo en cada movimiento alternaria
    // solo y seria imposible de controlar.
    this.mode = e.button === 2 || this.hooks.hasWall(cell) ? 'erase' : 'draw';
    this.active = true;
    this.last = cell;
    this.capture(e);

    this.hooks.paint(cell, cell, this.mode === 'erase');
  }

  /**
   * Lanza NotFoundError si el puntero ya no esta activo (un toque que se suelta
   * antes de que corra el handler). Sin proteger, la excepcion aborta el resto
   * del metodo y se pierde la primera marca del trazo: el gesto empieza cojo
   * sin que nada lo indique.
   */
  private capture(e: PointerEvent): void {
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      /* sin captura: el gesto sigue funcionando mientras no salga del canvas */
    }
  }

  private move(e: PointerEvent): void {
    if (!this.active) {
      this.local(e);
      return;
    }

    if (this.mode === 'gadget') {
      const cell = this.local(e);
      this.last = cell;
      this.hooks.dragTo?.(cell, this.clientX, this.clientY);
      return;
    }

    // Los eventos agrupados traen las posiciones intermedias que el navegador
    // junto en un solo `pointermove`. Sin leerlas se pierde fidelidad en los
    // trazos rapidos aunque se interpole.
    const points = e.getCoalescedEvents?.() ?? [];
    const seq = points.length > 0 ? points : [e];
    const fuego = this.mode === 'fire';
    const erase = this.mode === 'erase';

    for (const p of seq) {
      const cell = this.local(p as PointerEvent);
      if (this.last) {
        if (fuego) this.hooks.ignite?.(this.last, cell);
        else this.hooks.paint(this.last, cell, erase);
      }
      this.last = cell;
    }
  }

  private up(cancelled = false): void {
    if (this.mode === 'gadget' && this.active) {
      const cell = this.last ?? this.origin;
      // Un gesto que apenas se movio y duro poco es un toque, no un arrastre.
      // Sin esa distincion, tocar una bomba para detonarla la recolocaria un
      // pixel mas alla y no habria forma de dispararla a mano.
      const o = this.origin;
      const quiet =
        !cancelled &&
        o !== null &&
        cell !== null &&
        Math.abs(cell.x - o.x) <= TAP_CELLS &&
        Math.abs(cell.y - o.y) <= TAP_CELLS &&
        performance.now() - this.originT < TAP_MS;

      // `drop` se llama siempre, tambien en el toque: es el unico camino de
      // suelta que hay, y separarlo en dos dejaria la pieza agarrada para
      // siempre por la rama que no soltara.
      if (cell) this.hooks.drop?.(cell, this.clientX, this.clientY, quiet);
      this.mode = 'draw';
    }
    this.active = false;
    this.last = null;
    this.origin = null;
  }

  destroy(): void {
    for (const [type, fn] of this.handlers) this.el.removeEventListener(type, fn);
    this.handlers.length = 0;
  }
}
