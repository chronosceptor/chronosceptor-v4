import type { Grid } from './grid';
import { EMPTY, IS_MASS, MATERIAL_COUNT, SAND, WATER } from './materials';
import { THEME, WET_DARK, packColor } from './palette';
import { type Source } from './world';

/**
 * Baja el brillo de un color empaquetado en proporcion a la humedad, dejando el
 * alfa intacto. Todo en enteros: esto puede correr sobre cientos de miles de
 * pixeles por frame.
 */
function oscurecer(c: number, wv: number): number {
  const f = 256 - ((wv * ((WET_DARK * 256) | 0)) >> 8);
  const r = ((c & 0xff) * f) >> 8;
  const g = (((c >> 8) & 0xff) * f) >> 8;
  const b = (((c >> 16) & 0xff) * f) >> 8;
  return ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Contexto de la capa vectorial: `s` son pixeles CSS por celda. */
export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  s: number;
}

/**
 * Filas de aire por encima del vertice que entran en la caja de agarre.
 *
 * La fuente no se ve, asi que lo unico que hay que poder agarrar es el chorro
 * — y el chorro empieza en el vertice. Estas filas de mas son para que la x de
 * quitar caiga por encima de el, sobre fondo y no sobre arena: puesta dentro
 * del cono se pierde entre los granos justo cuando hay que acertarle.
 */
const AIRE = 12;
/** Holgura lateral de la caja de agarre, en celdas. */
const HOLGURA = 3;

/**
 * Lo que se puede agarrar de una fuente, en celdas y relativo a su vertice.
 *
 * Es la caja del cono, no un circulo: la fuente no se dibuja alrededor de su
 * centro, es que no se dibuja en absoluto, y lo unico que hay ahi para senalar
 * es la arena que sale — que cuelga entera por debajo del vertice.
 *
 * Antes esta caja la daba el tamano del PNG de la tolva y media unas 39x39
 * celdas: se comia los gestos de dibujar en toda esa zona. La del cono es
 * bastante mas pequena, asi que ahora se puede dibujar mucho mas cerca del
 * chorro.
 */
export function jetBox(source: Source): { half: number; up: number; down: number } {
  return { half: source.halfWidth + HOLGURA, up: AIRE, down: source.spread };
}

/**
 * El contorno del cono por donde va a salir la arena.
 *
 * La fuente es invisible en reposo — de eso se trata: la arena aparece de la
 * nada y se abre. Pero hay dos momentos en los que no puede serlo:
 *
 *  - Mientras la llevas, incluida la ficha que se arrastra desde el dock. Sin
 *    esto, colocar una fuente seria a ciegas y moverla tambien.
 *  - Mientras vuelve de una explosion. Son un par de segundos sin arena, y sin
 *    ninguna senal de que va a volver el lienzo parece roto.
 *
 * Se traza desde el `halfAt` de la propia fuente y no con una cuenta paralela,
 * para que lo que se promete sea exactamente por donde va a salir.
 */
export function drawJetHint({ ctx, s }: DrawCtx, source: Source, x: number, y: number): void {
  const px = (x + 0.5) * s;
  const py = y * s;
  // El tono claro, y no el de la maquinaria: esta linea no compite con ninguna
  // pieza dibujada porque no hay pieza dibujada. Es lo unico que se ve.
  //
  // Y solida y algo gruesa por la misma razon. En `structureLine`, a un pixel y
  // a rayas no se veia: son diagonales, asi que el antialias ya reparte cada
  // linea entre dos pixeles a medio tono, y encima el fantasma va al 55% de
  // opacidad. Entre las tres cosas quedaba en un gris casi igual al fondo.
  //
  // Las rayas las pone quien llama, no esta funcion: el fantasma se pinta a
  // rayas cuando la pieza NO cabe ahi, y ponerlas aqui borraba esa senal.
  ctx.strokeStyle = THEME.inkBright;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Dos tramos por lado y no uno, aunque para la arena los dos sean la misma
  // recta: el agua se abre en la boca y luego baja recta, y un contorno
  // trazado solo entre el vertice y el final prometeria un cono por donde va a
  // salir un chorro.
  const boca = source.seedRows;
  const fin = source.spread;
  const bx = (source.halfAt(boca) + 0.5) * s;
  const fx = (source.halfAt(fin) + 0.5) * s;
  ctx.moveTo(px - fx, py + fin * s);
  ctx.lineTo(px - bx, py + boca * s);
  ctx.lineTo(px, py);
  ctx.lineTo(px + bx, py + boca * s);
  ctx.lineTo(px + fx, py + fin * s);
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
    const { mat, col, wet, size } = this.grid;
    const buf = this.buf;
    const lut = this.matLut;
    for (let i = 0; i < size; i++) {
      const m = mat[i]!;
      // Dos comparaciones contra literales, y no un `USES_COL[m]` indexado.
      // Parece lo mismo y no lo es: la tabla mete una segunda lectura de array
      // por pixel y este bucle son 326.000 pixeles por frame. Medido sobre un
      // lienzo seco: 0,36 ms el bucle original, 0,54 con las comparaciones,
      // 0,76 con la tabla.
      if (m !== SAND && m !== WATER) {
        buf[i] = lut[m]!;
        continue;
      }
      // El lodo no tiene color propio: es el del grano, bajado de brillo segun
      // lo mojado que este. Guardar el color oscurecido en `col` seria mas
      // barato aqui, pero el secado no tendria como devolver el original —y no
      // hay sitio para dos colores por celda—. La rama solo se paga en las
      // celdas mojadas; en un lienzo seco el bucle es el de siempre.
      const wv = wet[i]!;
      buf[i] = wv === 0 ? col[i]! : oscurecer(col[i]!, wv);
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
