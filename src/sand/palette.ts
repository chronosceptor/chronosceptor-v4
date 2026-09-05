export type Rgb = [number, number, number];

export interface Palette {
  /** Identidad estable para detectar cambios sin comparar arrays. */
  id: string;
  /** Nombre visible: es el `title` de su muestra en el dock. */
  name: string;
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

/** Igual, pero con alfa. Lo usa el agua, que es lo unico que no es opaco. */
export function packColorA(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
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

/**
 * Los cuatro pesos de siempre: dos tonos de masa, un realce claro y un acento
 * suelto.
 *
 * No es decoración. Con los cuatro colores igual de probables la cuenca sale
 * confeti, y como el color de cada grano se guarda ya resuelto, los estratos
 * que deja un cambio de paleta dependen de que cada paleta tenga una masa
 * reconocible.
 */
const MEZCLA = [3, 3, 2, 1];

const paleta = (id: string, name: string, ...hex: string[]): Palette => ({
  id,
  name,
  colors: hex.map(hexToRgb),
  weights: MEZCLA,
});

/**
 * Las paletas que ofrece el dock.
 *
 * Escritas a mano y no sacadas de un generador de paletas. El fondo es
 * `#0B0B0C` y un color por debajo de ~0,45 de luminancia deja de leerse como
 * arena y pasa a ser ruido oscuro: la mitad de los colores de cualquier paleta
 * «trending» —pensadas todas sobre blanco— cae ahí. Las de aquí van de 0,49 al
 * 0,96, y ordenadas por tono para que la fila del dock se lea como una rueda.
 *
 * La primera es la de serie.
 */
export const PALETTES: readonly Palette[] = [
  paleta('ocre', 'Ocre', '#C97B4A', '#E0B48C', '#F2E4CE', '#7E9B8A'),
  paleta('brasa', 'Brasa', '#EF6D3C', '#F7A85F', '#F9E4B6', '#E0685F'),
  paleta('rosa', 'Rosa', '#E8998D', '#F2C9A9', '#F6EEE2', '#C0849A'),
  paleta('ciruela', 'Ciruela', '#D45FBE', '#EE9AD3', '#F4D8EC', '#9E7EDC'),
  paleta('oceano', 'Océano', '#3FA9E0', '#79C7EC', '#CFE6F2', '#5B7FD4'),
  paleta('menta', 'Menta', '#2EC4B6', '#8CE0CE', '#E4FBF4', '#5FA8A0'),
  paleta('bosque', 'Bosque', '#8FA96B', '#C2CFA0', '#E7EFD6', '#5E9E7E'),
  paleta('crudo', 'Crudo', '#B9B4A6', '#DAD5C6', '#F0ECE2', '#8C8880'),
];

/** La de serie: la que corre mientras nadie elija otra. */
export const DEFAULT_PALETTE: Palette = PALETTES[0]!;

/** Busca por `id`; devuelve la de serie si el id no existe (o viene de una versión anterior). */
export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
}

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
  /**
   * Llama viva. El unico color saturado del tema, que por lo demas es todo
   * grises sobre `#0B0B0C`.
   *
   * Se permite porque es transitorio y pequeno —una banda de unas doscientas
   * celdas que avanza y se apaga—, nunca un velo ni un halo por encima del
   * lienzo: eso apagaria el color de la arena, que es lo unico saturado que
   * tiene que haber en el cuadro.
   */
  fire: '#FF8A3D',
  /** Brasa: la misma llama ya consumiendose. */
  ember: '#C2410C',
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

/**
 * Azul de referencia al que tira toda el agua, sea cual sea la paleta.
 *
 * El color del agua sale de la paleta —como todo lo demas del cuadro— pero no
 * puede salir *solo* de ella: el acento de Brasa es un coral, y un lerp suave
 * hacia el azul deja un agua roja. Pesando la referencia por encima del acento
 * (`AGUA_MIX`) el agua queda siempre en la mitad fria y conserva un rastro del
 * tono de su paleta, que es lo que la mantiene dentro del cuadro.
 */
const AGUA_REF: Rgb = [18, 50, 74];
const AGUA_MIX = 0.72;
/**
 * Alfa del agua. Es lo unico translucido de la escena.
 *
 * El canvas de arena va sobre el fondo de `#escena`, asi que por debajo del
 * charco se lee la trama del fondo: sin eso el agua queda como una plancha de
 * plastico opaca, y con eso se lee como liquido sin necesidad de ningun
 * brillo ni reflejo pintado encima.
 */
const AGUA_ALFA = 210;

/**
 * Una celda de agua concreta.
 *
 * El color se guarda ya resuelto en la celda, igual que el de un grano: al
 * cambiar de paleta el agua que ya estaba conserva su tono y los estratos
 * siguen contando la historia.
 *
 * La variacion de brillo es mucho mas floja que la de la arena (±8% contra
 * ±12%): el agua es una masa, no granos, y con la variacion de la arena la
 * superficie del charco sale moteada.
 */
export function waterColor(p: Palette, rand: () => number): number {
  const [r, g, b] = p.colors[p.colors.length - 1] ?? p.colors[0]!;
  const shade = 0.92 + rand() * 0.16;
  const mezcla = (c: number, ref: number) => (c + (ref - c) * AGUA_MIX) * shade;
  return packColorA(
    clamp255(mezcla(r, AGUA_REF[0])),
    clamp255(mezcla(g, AGUA_REF[1])),
    clamp255(mezcla(b, AGUA_REF[2])),
    AGUA_ALFA,
  );
}

/**
 * Cuanto oscurece la saturacion completa a un grano: 0,35 = se queda en el 65%.
 *
 * Es lo que hace que el lodo se vea lodo. Mas oscuro se confunde con el agua
 * —que anda por 0,26-0,30 de luminancia— y el charco deja de distinguirse del
 * barro del fondo; menos, y mojar la arena no se nota.
 */
export const WET_DARK = 0.35;

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
