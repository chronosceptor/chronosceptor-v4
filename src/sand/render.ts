import type { Grid } from './grid';
import { EMPTY, IS_MASS, MATERIAL_COUNT, SAND } from './materials';
import { THEME, packColor } from './palette';
import type { DrawCtx } from './machines';

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
    const sctx = sandCanvas.getContext('2d', { alpha: false });
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
    const bg = packColor(...THEME.bg);
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

  paintSand(): void {
    const { mat, col, size } = this.grid;
    const buf = this.buf;
    const lut = this.matLut;
    for (let i = 0; i < size; i++) {
      const m = mat[i]!;
      buf[i] = m === SAND ? col[i]! : lut[m]!;
    }
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

  /** La tolva, unica fuente de la escena. */
  drawHopper(d: DrawCtx, x: number): void {
    const { ctx, s } = d;
    ctx.strokeStyle = THEME.structureSoft;
    ctx.lineWidth = 1;
    const w = Math.max(7, s * 4);
    const px = (x + 0.5) * s;
    ctx.beginPath();
    ctx.moveTo(px - w, 0);
    ctx.lineTo(px - w * 0.25, s * 4);
    ctx.lineTo(px + w * 0.25, s * 4);
    ctx.lineTo(px + w, 0);
    ctx.stroke();
  }

  /** Círculo de la brocha bajo el puntero. */
  drawCursor(d: DrawCtx, px: number, py: number, radiusCells: number, digging: boolean): void {
    const { ctx, s } = d;
    ctx.save();
    ctx.strokeStyle = digging ? THEME.inkBright : THEME.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, radiusCells * s, 0, Math.PI * 2);
    ctx.stroke();
    if (digging) {
      ctx.beginPath();
      ctx.moveTo(px - 4, py);
      ctx.lineTo(px + 4, py);
      ctx.stroke();
    }
    ctx.restore();
  }
}
