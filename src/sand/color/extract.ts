import type { Palette, Rgb } from '../palette';

/** Lado al que se reduce la portada antes de analizarla. */
const SAMPLE = 64;
/** Cajas del median-cut. Se piden más de las que se usan y luego se filtra. */
const BOXES = 14;
const KEEP = 5;
/**
 * Luminancia mínima para que un color se distinga sobre el fondo #0B0B0C.
 * La paleta ocre por defecto ronda 0.53, así que por debajo de esto un grano
 * deja de leerse como arena y pasa a ser ruido oscuro.
 */
const MIN_LUMA = 0.38;
/**
 * Distancia minima (suma de diferencias RGB) para admitir un color mas.
 * Muy alto deja portadas apagadas con solo dos tonos; muy bajo llena la paleta
 * de variaciones del mismo color y la mezcla de la cuenca deja de leerse.
 */
const DEDUPE = 40;

const luma = ([r, g, b]: Rgb): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const chroma = ([r, g, b]: Rgb): number => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

const dist = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/**
 * Saca una paleta de arena de la portada del disco.
 *
 * Devuelve null si la imagen no se puede leer, y en ese caso quien llama se
 * queda con la paleta que ya tenía en vez de dejar la escena sin color.
 */
export async function paletteFromImage(src: string, id: string): Promise<Palette | null> {
  const img = await loadImage(src);
  if (!img) return null;

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    // El canvas quedó contaminado: la portada no vino del mismo origen.
    return null;
  }

  const pixels: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  }
  if (pixels.length < 32) return null;

  const boxes = medianCut(pixels, BOXES);
  const scored = boxes
    .map((b) => ({
      color: b.color,
      // Se premia el color saturado sobre el gris de fondo: una portada muy
      // oscura aporta igual sus acentos en vez de dar cuatro grises iguales.
      score: b.count * (0.3 + chroma(b.color) * 1.7),
    }))
    .sort((a, b) => b.score - a.score);

  const chosen: Rgb[] = [];
  const weights: number[] = [];
  for (const { color, score } of scored) {
    const lifted = lift(color);
    // El negro del fondo de la portada no se puede aclarar sin inventarle un
    // tono, así que se descarta en vez de colarlo como un gris oscuro que
    // sobre el fondo de la escena no se distingue de la nada.
    if (!lifted) continue;
    // Se descartan casi-duplicados: si no, una portada monocroma produce cinco
    // versiones del mismo tono y la mezcla de la cuenca no se lee.
    if (chosen.some((c) => dist(c, lifted) < DEDUPE)) continue;
    chosen.push(lifted);
    weights.push(score);
    if (chosen.length >= KEEP) break;
  }
  // Con menos de dos colores utiles se devuelve null y quien llama conserva la
  // paleta que ya tenia: mejor eso que una escena de un solo tono apagado.
  if (chosen.length < 2) return null;

  // Pesos normalizados y aplanados: sin aplanar, el color dominante se come
  // toda la escena y los acentos no aparecen nunca.
  const max = Math.max(...weights);
  const flat = weights.map((w) => 0.35 + (w / max) * 0.65);

  return { id, colors: chosen, weights: flat };
}

/**
 * Sube el brillo de un color demasiado oscuro para verse sobre el fondo.
 *
 * Devuelve null si ni siquiera amplificando al maximo llega al minimo: por
 * encima de ese factor lo que se amplifica es el ruido del JPEG, y el color
 * resultante ya no tiene nada que ver con la portada.
 */
const MAX_LIFT = 6;

function lift(c: Rgb): Rgb | null {
  const l = luma(c);
  if (l >= MIN_LUMA) return c;
  if (l * MAX_LIFT < MIN_LUMA) return null;
  const k = MIN_LUMA / l;
  return [
    Math.min(255, Math.round(c[0] * k)),
    Math.min(255, Math.round(c[1] * k)),
    Math.min(255, Math.round(c[2] * k)),
  ];
}

interface Box {
  color: Rgb;
  count: number;
}

/**
 * Median-cut: parte repetidamente el conjunto de píxeles por el canal de mayor
 * rango, siempre por la caja más poblada, y promedia cada caja resultante.
 */
function medianCut(pixels: Rgb[], target: number): Box[] {
  let ranges: Array<[number, number]> = [[0, pixels.length]];

  while (ranges.length < target) {
    // Se parte la caja más poblada que todavía se pueda partir.
    let bestIdx = -1;
    let bestSize = 1;
    for (let i = 0; i < ranges.length; i++) {
      const size = ranges[i]![1] - ranges[i]![0];
      if (size > bestSize) {
        bestSize = size;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;

    const [start, end] = ranges[bestIdx]!;
    const ch = widestChannel(pixels, start, end);
    const slice = pixels.slice(start, end).sort((a, b) => a[ch] - b[ch]);
    for (let i = 0; i < slice.length; i++) pixels[start + i] = slice[i]!;
    const mid = start + ((end - start) >> 1);
    ranges.splice(bestIdx, 1, [start, mid], [mid, end]);
  }

  return ranges
    .filter(([s, e]) => e > s)
    .map(([s, e]) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = s; i < e; i++) {
        r += pixels[i]![0];
        g += pixels[i]![1];
        b += pixels[i]![2];
      }
      const n = e - s;
      return { color: [(r / n) | 0, (g / n) | 0, (b / n) | 0] as Rgb, count: n };
    });
}

function widestChannel(pixels: Rgb[], start: number, end: number): 0 | 1 | 2 {
  const min: Rgb = [255, 255, 255];
  const max: Rgb = [0, 0, 0];
  for (let i = start; i < end; i++) {
    const p = pixels[i]!;
    for (let c = 0; c < 3; c++) {
      if (p[c]! < min[c]!) min[c] = p[c]!;
      if (p[c]! > max[c]!) max[c] = p[c]!;
    }
  }
  const spread = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (spread[0]! >= spread[1]! && spread[0]! >= spread[2]!) return 0;
  return spread[1]! >= spread[2]! ? 1 : 2;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
