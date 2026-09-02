import type { Grid } from './grid';
import { EMPTY, IS_MASS, MATERIAL_COUNT, SAND } from './materials';
import { THEME, packColor } from './palette';
import { sprite } from './sprites';
import { NOZZLE_H } from './world';

/**
 * Cuanto mide el cano del PNG de la fuente, en fraccion de su ancho total.
 *
 * Es una propiedad del dibujo y hay que volver a medirla si se regenera:
 * `python3 scripts/asset-alfa.py --perfil dibujo.png` la saca.
 *
 * La escala del dibujo la manda el cano y no la boca porque lo que se ve salir
 * es el chorro: un cano mas estrecho que su propio chorro es la misma mentira
 * que un aro que no para nada. Por eso este numero decide el tamano de la
 * pieza entera, y con un cano fino la tolva se va a un tamano absurdo — el
 * primer dibujo tenia un 12% y pedia 275 px de ancho.
 */
const SPOUT_FRAC = 0.3;

/**
 * Celdas que el dibujo de la fuente baja por debajo de su fila de siembra.
 *
 * La fuente siembra en las dos primeras filas libres bajo la boca, y sin este
 * solape se ve el punto exacto en el que cada grano aparece de la nada: la
 * arena no sale de la pieza, sale debajo de la pieza, con una costura entre las
 * dos. Con el cano tapando esas filas —la capa vectorial va por encima de la
 * arena— los granos asoman ya cayendo.
 *
 * Tres celdas es lo justo para cubrir la siembra y un poco de la caida. Mas
 * empieza a tragarse chorro visible y la pieza parece flotar sobre el.
 */
const SOLAPE = 3;


/** Contexto de la capa vectorial: `s` son pixeles CSS por celda. */
export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  s: number;
}

/**
 * Tolva de una fuente de material: cuerpo por encima y garganta en (`x`, `y`).
 *
 * Vive aqui y no en el renderer porque la comparten la fuente fija de la escena
 * y las fuentes que el usuario coloca: son la misma cosa y tienen que verse
 * igual, no parecerse.
 *
 * Lo importante es donde va respecto a la fila que siembra: el cuerpo por
 * encima y la garganta en esa fila. Antes se pintaba al reves —el embudo se
 * abria hacia arriba con la boca ancha en la fila de siembra— y entonces los
 * granos aparecian dentro del embudo, en su parte ancha, como salidos de la
 * nada; ahora se ve caer el chorro por la garganta, que es de donde sale.
 *
 * El dibujo ademas baja unas celdas por debajo de esa fila, ver `SOLAPE`: es lo
 * que hace que la arena salga *de* la pieza y no *debajo* de la pieza.
 *
 * `half` es el semiancho real de la siembra, y por eso se pasa en vez de
 * elegirlo aqui: la garganta dibujada tiene que medir lo que mide el chorro. Un
 * cano estrecho sobre un chorro ancho es la misma mentira que un aro que no
 * para nada.
 */
/**
 * Lo que ocupa el dibujo de la tolva, en celdas y relativo a su boca.
 *
 * Sirve para que el area de agarre sea lo que se ve y no un circulo pegado a la
 * boca: la pieza se dibuja casi entera *por encima* de su fila de siembra, asi
 * que un radio centrado ahi deja fuera toda la tolva y solo se puede coger por
 * un trocito del cano.
 *
 * Va en celdas y no en pixeles porque `s` se cancela: el ancho sale de `half`,
 * que ya esta en celdas, y de `SPOUT_FRAC`, que es una proporcion.
 */
export function nozzleBox(half: number): { half: number; up: number; down: number } {
  const img = sprite('fuente');
  if (!img) return { half: (half + 1.5) * 2.6, up: NOZZLE_H, down: 0 };
  const halfW = (half + 1.5) / SPOUT_FRAC;
  const alto = halfW * 2 * (img.naturalHeight / img.naturalWidth);
  return { half: halfW, up: alto - SOLAPE, down: SOLAPE };
}

export function drawNozzle({ ctx, s }: DrawCtx, x: number, y: number, half: number): void {
  const px = (x + 0.5) * s;
  const boca = y * s;
  // Garganta: el ancho de la siembra, con una celda de holgura a cada lado para
  // que el chorro salga rozando el cano y no pegado a la linea.
  const th = (half + 1.5) * s;
  const alto = NOZZLE_H * s;
  const ancho = th * 2.6;
  // Tramo recto de cano antes de la boca. Sin el, las dos paredes se juntan en
  // punta y la salida no se lee como una salida.
  const cano = s * 3;

  const img = sprite('fuente');
  // Alto que ocupa el dibujo por encima de la fila de siembra. Si no cabe se
  // pinta el trazo, que ocupa mucho menos.
  const w = img ? (th * 2) / SPOUT_FRAC : 0;
  const h = img ? (w * img.naturalHeight) / img.naturalWidth : 0;
  if (img && h - SOLAPE * s <= boca) {
    // Se ancla por la boca, no por el centro: lo que tiene que caer en la fila
    // de siembra es la salida, y el alto lo pone la proporcion del dibujo.
    // Anclarlo por el centro dejaria el chorro naciendo del aire.
    //
    // La escala la manda el cano, no la boca: lo que se ve salir es el chorro,
    // y un cano mas estrecho que su propio chorro es la misma mentira que un
    // aro que no para nada. `SPOUT_FRAC` es lo que mide el cano del dibujo en
    // fraccion de su ancho total, medido sobre el PNG.
    //
    // Y baja `SOLAPE` por debajo de la fila de siembra a proposito. La capa
    // vectorial va encima de la arena, asi que ese trozo de cano tapa las filas
    // donde nacen los granos: sin el se ve el punto exacto en que aparecen de
    // la nada y la arena no sale de la pieza, sale debajo de la pieza.
    ctx.drawImage(img, px - w / 2, boca + SOLAPE * s - h, w, h);
    return;
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.structureSoft;
  ctx.beginPath();
  // La boca de arriba, cerrada de lado a lado. Sin esa linea las dos paredes
  // quedan sueltas en el aire y la pieza se lee como un par de alas, no como
  // una tolva; es lo unico que la hace reconocible de un vistazo.
  ctx.moveTo(px - ancho, boca - alto);
  ctx.lineTo(px + ancho, boca - alto);
  ctx.moveTo(px - ancho, boca - alto);
  ctx.lineTo(px - th, boca - cano);
  ctx.moveTo(px + ancho, boca - alto);
  ctx.lineTo(px + th, boca - cano);
  ctx.stroke();

  // El cano, un tono mas claro: es la parte que dice por donde sale.
  ctx.strokeStyle = THEME.structureLine;
  ctx.beginPath();
  ctx.moveTo(px - th, boca - cano);
  ctx.lineTo(px - th, boca);
  ctx.moveTo(px + th, boca - cano);
  ctx.lineTo(px + th, boca);
  ctx.stroke();
}

/**
 * Render en dos capas superpuestas:
 *
 *  1. La arena va a un ImageData a resolución de grid, en un <canvas> pequeño
 *     que el navegador escala con `image-rendering: pixelated`. Sale grano
 *     nítido sin pagar un solo `drawImage`.
 *  2. La maquinaria se traza como vector encima, a resolución de pantalla
 *     completa, para que las líneas queden finas en cualquier densidad.
 *
 * Esa mezcla es lo que da el aire limpio en vez de pixel-art de los noventa.
 */
export class Renderer {
  private readonly sandCtx: CanvasRenderingContext2D;
  readonly fxCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly buf: Uint32Array;
  private readonly matLut: Uint32Array;

  /** Píxeles CSS por celda. */
  s = 1;
  private dpr = 1;

  constructor(
    private readonly sandCanvas: HTMLCanvasElement,
    private readonly fxCanvas: HTMLCanvasElement,
    private readonly grid: Grid,
  ) {
    sandCanvas.width = grid.w;
    sandCanvas.height = grid.h;
    // Con alfa: el hueco vacio queda transparente y se ve el fondo de `#escena`.
    const sctx = sandCanvas.getContext('2d');
    const fctx = fxCanvas.getContext('2d');
    if (!sctx || !fctx) throw new Error('No hay contexto 2D disponible');
    this.sandCtx = sctx;
    this.fxCtx = fctx;

    this.image = sctx.createImageData(grid.w, grid.h);
    this.buf = new Uint32Array(this.image.data.buffer);

    // Tabla material → color. Un lookup por celda, sin ramas en el bucle caliente.
    //
    // Todo se pinta del fondo salvo las colinas: vigas, bandas y rampas quedan
    // invisibles en el bitmap y aparecen solo como trazo fino en la capa
    // vectorial. Es lo que evita que la maquinaria se vea como barras gruesas.
    this.matLut = new Uint32Array(MATERIAL_COUNT);
    const bg = 0; // transparente: deja pasar el fondo de la escena
    const mass = packColor(...THEME.structure);
    this.matLut.fill(bg);
    for (let m = 0; m < MATERIAL_COUNT; m++) if (IS_MASS[m]) this.matLut[m] = mass;
    this.matLut[EMPTY] = bg;
  }

  resize(cssW: number, cssH: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.s = cssW / this.grid.w;
    this.fxCanvas.width = Math.round(cssW * this.dpr);
    this.fxCanvas.height = Math.round(cssH * this.dpr);
    this.fxCanvas.style.width = `${cssW}px`;
    this.fxCanvas.style.height = `${cssH}px`;
    this.sandCanvas.style.width = `${cssW}px`;
    this.sandCanvas.style.height = `${cssH}px`;
  }

  /**
   * `ejecta` se superpone en el mismo buffer que los granos asentados, no en
   * una capa aparte: la arena en vuelo es del mismo material a la vista, y asi
   * no cuesta ni un drawImage.
   */
  paintSand(ejecta?: { paint(buf: Uint32Array, w: number, h: number): void }): void {
    const { mat, col, size } = this.grid;
    const buf = this.buf;
    const lut = this.matLut;
    for (let i = 0; i < size; i++) {
      const m = mat[i]!;
      buf[i] = m === SAND ? col[i]! : lut[m]!;
    }
    ejecta?.paint(buf, this.grid.w, this.grid.h);
    this.sandCtx.putImageData(this.image, 0, 0);
  }

  beginFx(): DrawCtx {
    const ctx = this.fxCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.fxCanvas.width / this.dpr, this.fxCanvas.height / this.dpr);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    return { ctx, s: this.s };
  }

  /** La fuente, en el centro superior. */
  /**
   * Circulo de la brocha bajo el puntero.
   *
   * En modo goma se dibuja discontinuo: es la unica senal de que el gesto va a
   * borrar en vez de dibujar, y sin ella el cambio de modo por contexto resulta
   * invisible hasta que ya es tarde.
   */
  drawCursor(d: DrawCtx, px: number, py: number, radiusCells: number, erasing: boolean): void {
    const { ctx, s } = d;
    ctx.save();
    ctx.strokeStyle = erasing ? THEME.inkBright : THEME.ink;
    ctx.lineWidth = 1;
    if (erasing) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, radiusCells * s), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
