export type Rgb = [number, number, number];

export interface Palette {
  /** Identidad estable para detectar cambios de canción sin comparar arrays. */
  id: string;
  colors: Rgb[];
  /** Peso de emisión, paralelo a `colors`. Se normaliza al usarse. */
  weights: number[];
}

/**
 * Empaqueta a los enteros de 32 bits que consume un ImageData.
 * El byte más alto es alfa en little-endian, que es lo que corre en cualquier
 * plataforma a la que apunta esto (x86 y ARM).
 */
export function packColor(r: number, g: number, b: number): number {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function unpack(c: number): Rgb {
  return [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff];
}

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n | 0);

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Paleta ocre por defecto: la que corre cuando no hay música sonando. */
export const DEFAULT_PALETTE: Palette = {
  id: 'ocre',
  colors: [hexToRgb('#C97B4A'), hexToRgb('#E0B48C'), hexToRgb('#F2E4CE'), hexToRgb('#7E9B8A')],
  weights: [3, 3, 2, 1],
};

/**
 * Tres pesos de trazo, no uno.
 *
 * Con un unico gris para todo, el marco, las cintas y las rampas compiten entre
 * si y la escena se lee plana. El marco sostiene la composicion, las cintas son
 * la linea principal y las rampas son secundarias.
 */
export const THEME = {
  bg: hexToRgb('#0B0B0C'),
  /** Masa solida (colinas). */
  structure: hexToRgb('#31313A'),
  /** Marco: muros laterales y borde de la cuenca. */
  frame: '#6A6A77',
  /** Linea principal: cintas y vigas. */
  structureLine: '#4E4E59',
  /** Secundario: rampas, embudos, tolva. */
  structureSoft: '#393942',
  ink: '#6E6E78',
  inkBright: '#B4B4C0',
} as const;

/**
 * Un grano concreto: elige un color por peso y le mete una variación de brillo.
 * Sin esa variación los montones se ven como manchas planas de color; con ella
 * se leen como arena de verdad.
 *
 * `dominant` sesga la elección hacia un color de la paleta. Cada emisor se
 * queda con uno: así cada chorro tiene identidad propia y la cuenca acaba en
 * estratos legibles en vez de una papilla uniforme de confeti.
 */
export function grainColor(p: Palette, rand: () => number, dominant = -1, bias = 0): number {
  let idx: number;
  if (dominant >= 0 && dominant < p.colors.length && rand() < bias) {
    idx = dominant;
  } else {
    let total = 0;
    for (const w of p.weights) total += w;
    let n = rand() * total;
    idx = p.colors.length - 1;
    for (let i = 0; i < p.colors.length; i++) {
      n -= p.weights[i]!;
      if (n <= 0) {
        idx = i;
        break;
      }
    }
  }
  const [r, g, b] = p.colors[idx]!;
  const shade = 0.86 + rand() * 0.24;
  return packColor(clamp255(r * shade), clamp255(g * shade), clamp255(b * shade));
}

/** Promedio de una lista de colores empaquetados. Alimenta el medidor de la cuenca. */
export function averagePacked(colors: number[]): Rgb {
  if (colors.length === 0) return [0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of colors) {
    r += c & 0xff;
    g += (c >> 8) & 0xff;
    b += (c >> 16) & 0xff;
  }
  const n = colors.length;
  return [(r / n) | 0, (g / n) | 0, (b / n) | 0];
}

export const rgbCss = ([r, g, b]: Rgb): string => `rgb(${r},${g},${b})`;
