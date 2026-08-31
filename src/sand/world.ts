import { Grid } from './grid';
import { EMPTY, LEDGE, SAND, SINK, WALL } from './materials';
import { grainColor, type Palette } from './palette';
import { mulberry32, randFloat, randInt, type Rng } from './rng';

/** Filas del borde inferior reservadas al drenaje: no se puede dibujar en ellas. */
export const RESERVED_ROWS = 2;

export interface Profile {
  name: 'desktop' | 'portrait';
  /** Pixeles de pantalla por celda. */
  cell: number;
  /**
   * Granos por segundo que suelta la fuente.
   *
   * Tiene que bastar para que el chorro en caida libre se lea como un hilo
   * continuo: los granos aceleran al caer y se separan, asi que con caudales
   * bajos el chorro sale punteado aunque el monton de abajo crezca bien.
   */
  rate: number;
  /** Radio de la brocha, en celdas. */
  brush: number;
  /** Tope de arena viva, como red de seguridad de rendimiento. */
  maxSand: number;
  /** Fraccion del lienzo que se deja llenar antes de que el fondo empiece a drenar. */
  fillFrac: number;
}

export function profileFor(cssW: number, cssH: number): Profile {
  const portrait = cssH > cssW || cssW < 720;
  if (portrait) {
    // Algo mas ancha en tactil: el dedo es menos preciso que el raton.
    return { name: 'portrait', cell: 4, rate: 170, brush: 1.5, maxSand: 26000, fillFrac: 0.3 };
  }
  // Brocha fina: un trazo de una sola celda de grosor ya retiene el material
  // (la regla diagonal exige que la celda lateral tambien este libre), asi que
  // no hay razon fisica para engordarla y con ella se dibuja con precision.
  return { name: 'desktop', cell: cssW > 2400 ? 4 : 3, rate: 280, brush: 1.0, maxSand: 70000, fillFrac: 0.3 };
}

/**
 * La fuente de material, fija en el centro superior.
 *
 * Rota el color dominante cada cierto tiempo y en cada cambio de cancion, de
 * modo que lo que cae va tinendose por lotes y los montones que atrape el
 * dibujo del usuario quedan estratificados.
 */
export class Source {
  private acc = 0;
  private dominant = 0;
  private colorTimer = 0;

  constructor(
    readonly x: number,
    readonly halfWidth: number,
    readonly rate: number,
    private readonly colorPeriod: number,
    private readonly rng: Rng,
  ) {}

  /** Arranca un lote de color nuevo. Lo llama el cambio de cancion. */
  newBatch(): void {
    this.colorTimer = 0;
  }

  tick(g: Grid, dt: number, palette: Palette, rand: () => number, budget: number): void {
    this.colorTimer -= dt;
    if (this.colorTimer <= 0) {
      this.colorTimer = randFloat(this.rng, this.colorPeriod * 0.7, this.colorPeriod * 1.4);
      this.dominant = randInt(this.rng, 0, Math.max(0, palette.colors.length - 1));
    }

    if (budget <= 0) return;
    this.acc += this.rate * dt;
    let n = Math.floor(this.acc);
    if (n <= 0) return;
    this.acc -= n;
    if (n > budget) n = budget;

    for (let k = 0; k < n; k++) {
      const x = this.x + randInt(rand, -this.halfWidth, this.halfWidth);
      // Se siembra en las dos primeras filas: con una sola, los granos que no
      // caben se pierden y el chorro sale entrecortado.
      if (!g.addSand(x, 0, grainColor(palette, rand, this.dominant, 0.94))) {
        g.addSand(x, 1, grainColor(palette, rand, this.dominant, 0.94));
      }
    }
  }
}

export interface World {
  grid: Grid;
  source: Source;
  drain: Drain;
  profile: Profile;
}

export function createWorld(cssW: number, cssH: number): World {
  const profile = profileFor(cssW, cssH);
  const w = Math.max(80, Math.floor(cssW / profile.cell));
  const h = Math.max(80, Math.floor(cssH / profile.cell));
  const grid = new Grid(w, h);
  const high = Math.round(w * h * profile.fillFrac);
  const drain = new Drain(high, Math.round(high * 0.92));
  drain.reset(grid);

  const source = new Source(
    w >> 1,
    Math.max(1, Math.round(profile.brush * 0.6)),
    profile.rate,
    26,
    mulberry32((Date.now() ^ 0x9e3779b9) >>> 0),
  );

  return { grid, source, drain, profile };
}

/** Troneras abiertas cuando el drenaje actua. */
const DRAIN_PORTS = 6;

/**
 * Drenaje del fondo con nivel de guarda.
 *
 * Cerrado, la ultima fila es suelo y el material se acumula: el lienzo se llena
 * de verdad. Solo al pasar de cierto nivel se abren unas pocas troneras, las
 * justas para mantenerlo ahi y que nunca se inunde del todo.
 *
 * Con la fila entera consumiendo siempre —que era como estaba— nada llega a
 * acumularse: lo que no atrape el dibujo desaparece al tocar el fondo y la
 * pantalla se queda perpetuamente vacia.
 *
 * Las troneras son pocas a proposito. Abriendo la fila completa el vaciado va
 * miles de granos por segundo y el nivel cae de golpe, que se ve como un
 * bombeo; con seis, el caudal queda apenas por encima del de la fuente y el
 * nivel baja despacio, sin que se note.
 */
export class Drain {
  private open = false;

  constructor(
    /** Nivel al que se abre. */
    private readonly high: number,
    /** Nivel al que se vuelve a cerrar. La histeresis evita el parpadeo. */
    private readonly low: number,
  ) {}

  tick(g: Grid): void {
    const should = this.open ? g.sandCount > this.low : g.sandCount > this.high;
    if (should === this.open) return;
    this.open = should;
    this.write(g);
  }

  /** Cierra el drenaje y lo reescribe. Lo usa el vaciado del lienzo. */
  reset(g: Grid): void {
    this.open = false;
    this.write(g);
  }

  private write(g: Grid): void {
    const y = g.h - 1;
    g.fillRect(0, y, g.w - 1, y, LEDGE);
    if (this.open) {
      const stride = g.w / DRAIN_PORTS;
      for (let k = 0; k < DRAIN_PORTS; k++) {
        const x = Math.min(g.w - 1, Math.round(stride * (k + 0.5)));
        g.stamp(x, y, SINK);
      }
    }
    g.wakeRect(0, y - 2, g.w - 1, y);
  }
}

/** ¿Se puede dibujar en esta fila? Las reservadas protegen el drenaje. */
export function isDrawable(g: Grid, y: number): boolean {
  return y >= 0 && y < g.h - RESERVED_ROWS;
}

/** Vacia el lienzo: quita paredes y material, deja el drenaje cerrado. */
export function clearWorld(g: Grid, drain: Drain): void {
  const { mat, col, vel, awake, size } = g;
  for (let i = 0; i < size; i++) {
    if (mat[i] === WALL || mat[i] === SAND) {
      mat[i] = EMPTY;
      col[i] = 0;
      vel[i] = 0;
    }
    awake[i] = 1;
  }
  g.sandCount = 0;
  drain.reset(g);
}

/**
 * Copia paredes y material de un mundo al nuevo tras un redimensionado.
 *
 * Rehacer el lienzo en blanco al cambiar de tamano tirarian el dibujo, y en iOS
 * la barra del navegador cambia la altura de la ventana con solo hacer scroll.
 */
export function transferDrawing(from: Grid, to: Grid): void {
  const w = Math.min(from.w, to.w);
  const h = Math.min(from.h, to.h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = from.idx(x, y);
      if (from.mat[src] !== WALL) continue;
      if (!isDrawable(to, y)) continue;
      to.mat[to.idx(x, y)] = WALL;
    }
  }
}
