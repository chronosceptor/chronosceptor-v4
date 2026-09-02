import { Grid } from './grid';
import { EMPTY, LEDGE, SAND, SINK, WALL } from './materials';
import { grainColor, type Palette } from './palette';
import { mulberry32, randFloat, randInt, type Rng } from './rng';

/** Filas del borde inferior reservadas al drenaje: no se puede dibujar en ellas. */
export const RESERVED_ROWS = 3;
/**
 * Filas que ocupa la tolva de una fuente por encima de la fila que siembra.
 *
 * Vive aqui, con la fuente, y no en el render que la pinta, porque manda sobre
 * dos cosas a la vez: el dibujo y donde puede estar la fuente. La de serie tenia
 * su boquilla en la fila 0 y una tolva dibujada ahi se sale por arriba de la
 * pantalla.
 */
export const NOZZLE_H = 14;

/**
 * Filas que hay que dejar libres por encima de la fila de siembra para que
 * quepa el DIBUJO de la tolva.
 *
 * Va aparte de `NOZZLE_H` porque no miden lo mismo: `NOZZLE_H` es el alto del
 * trazo vectorial, y el dibujo es casi cuadrado y ademas se escala por su cano
 * —ver `SPOUT_FRAC`—, asi que ocupa casi el triple. Con las 17 filas que daba
 * `NOZZLE_H` la tolva salia recortada por el borde de arriba y solo asomaba la
 * punta del cano. Una fuente colocada mas arriba que esto no pinta el dibujo y
 * cae al trazo, que si cabe.
 */
export const NOZZLE_SPRITE_ROWS = 31;

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
  /**
   * Semiancho de la boquilla, en celdas.
   *
   * Es el techo real del caudal, no `rate`: la fuente solo puede sembrar en las
   * celdas libres de las dos primeras filas, asi que una boquilla estrecha
   * rechaza todo lo que no cabe por mucho que se suba `rate`. Con tres celdas
   * el maximo eran ~180 granos/s aunque se pidieran 520.
   */
  nozzle: number;
  /** Tope de arena viva, como red de seguridad de rendimiento. */
  maxSand: number;
  /** Fraccion del lienzo que se deja llenar antes de que el fondo empiece a drenar. */
  fillFrac: number;
  /**
   * Ancho de la boca de descarga, en celdas.
   *
   * Manda sobre la forma del vaciado: una boca estrecha abre un pozo vertical
   * que solo se lleva la columna del centro y deja los lados intactos; una
   * ancha hunde la superficie en V y arrastra material de todo el monton, que
   * es lo que revuelve los estratos de unas canciones con otras.
   */
  mouth: number;
}

export function profileFor(cssW: number, cssH: number): Profile {
  const portrait = cssH > cssW || cssW < 720;
  if (portrait) {
    // Algo mas ancha en tactil: el dedo es menos preciso que el raton.
    return { name: 'portrait', cell: 4, rate: 400, brush: 1.5, nozzle: 3, maxSand: 46000, fillFrac: 0.72, mouth: 34 };
  }
  // Brocha fina: un trazo de una sola celda de grosor ya retiene el material
  // (la regla diagonal exige que la celda lateral tambien este libre), asi que
  // no hay razon fisica para engordarla y con ella se dibuja con precision.
  return { name: 'desktop', cell: cssW > 2400 ? 4 : 3, rate: 700, brush: 1.0, nozzle: 4, maxSand: 135000, fillFrac: 0.72, mouth: 76 };
}

/**
 * La fuente de material, arriba en el centro mientras nadie la mueva.
 *
 * Rota el color dominante cada cierto tiempo y en cada cambio de cancion, de
 * modo que lo que cae va tinendose por lotes y los montones que atrape el
 * dibujo del usuario quedan estratificados.
 */
export class Source {
  private acc = 0;
  private dominant = 0;
  private colorTimer = 0;
  /** Segundos seguidos queriendo emitir sin conseguir colocar un solo grano. */
  private blockedFor = 0;

  constructor(
    /**
     * Posicion de la boquilla, en celdas. No es `readonly` porque las fuentes
     * que el usuario coloca se arrastran; la fija de la escena nunca la cambia.
     */
    public x: number,
    readonly halfWidth: number,
    readonly rate: number,
    private readonly colorPeriod: number,
    private readonly rng: Rng,
    /** Fila donde siembra. Su tolva se pinta por encima, ver `NOZZLE_H`. */
    public y = 0,
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

    let placed = 0;
    for (let k = 0; k < n; k++) {
      const x = this.x + randInt(rand, -this.halfWidth, this.halfWidth);
      // Se siembra en dos filas: con una sola, los granos que no caben se
      // pierden y el chorro sale entrecortado.
      if (g.addSand(x, this.y, grainColor(palette, rand, this.dominant, 0.94))) placed++;
      else if (g.addSand(x, this.y + 1, grainColor(palette, rand, this.dominant, 0.94))) placed++;
    }
    this.blockedFor = placed === 0 ? this.blockedFor + dt : 0;
  }

  /** La boquilla lleva un rato sepultada y no consigue soltar nada. */
  get blocked(): boolean {
    return this.blockedFor > 2;
  }
}

export interface World {
  grid: Grid;
  source: Source;
  drain: Drain;
  profile: Profile;
}

export function createWorld(cssW: number, cssH: number, fillOverride?: number): World {
  const profile = profileFor(cssW, cssH);
  if (fillOverride !== undefined) profile.fillFrac = fillOverride;
  const w = Math.max(80, Math.floor(cssW / profile.cell));
  const h = Math.max(80, Math.floor(cssH / profile.cell));
  const grid = new Grid(w, h);
  const high = Math.round(w * h * profile.fillFrac);
  const drain = new Drain(profile.mouth, high, Math.round(high * 0.5));
  drain.reset(grid);

  const source = new Source(
    w >> 1,
    profile.nozzle,
    profile.rate,
    26,
    mulberry32((Date.now() ^ 0x9e3779b9) >>> 0),
    // No en la fila 0: su tolva se pinta por encima de la fila que siembra y
    // ahi arriba no cabria. Un chorro que empieza unas filas mas abajo no se
    // nota; una fuente sin tolva, si. Las tres filas de mas son aire por encima
    // de la boca, que pegada al borde parece recortada.
    //
    // Lo que manda es el dibujo, no el trazo: `NOZZLE_H` daba 17 y con el PNG
    // la tolva salia recortada por arriba — solo asomaba la punta del cano.
    NOZZLE_SPRITE_ROWS + 3,
  );

  return { grid, source, drain, profile };
}



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
 * La boca es una sola y va en el centro, como la de un silo: al abrirse, la
 * superficie se hunde en cono invertido y los lados resbalan hacia dentro.
 * Es el flujo en embudo de un silo de verdad, y se ve mucho mejor que varias
 * troneras repartidas, que abren chimeneas sueltas por todo el fondo.
 *
 * El sumidero va SOLO en la ultima fila, nunca repartido en altura.
 *
 * Se probo estampandolo en V, ocupando varias filas, para forzar la forma de
 * embudo: el resultado es que el material se consume en el aire, a la altura a
 * la que toca el borde del embudo, y en pantalla aparecen huecos negros de la
 * nada sin que nada llegue a caer hasta abajo. Lo que se ve tiene que salir por
 * el borde del mundo, no evaporarse a media altura.
 *
 * La forma de embudo sale sola de la fisica: con una boca ancha, la superficie
 * se hunde en cono y los lados resbalan hacia el centro. El ancho manda sobre
 * esa forma —una boca estrecha abre un pozo de paredes casi verticales que solo
 * se lleva la columna del centro; una ancha hunde el monton entero y revuelve
 * los estratos de unas canciones con otras.
 */
export class Drain {
  private open = false;

  constructor(
    /** Ancho de la boca, en celdas. */
    private readonly mouth: number,
    /** Nivel al que se abre: el lienzo lleno. */
    private readonly high: number,
    /**
     * Nivel al que se vuelve a cerrar.
     *
     * Se vacia hasta la mitad, no hasta un pelo por debajo del tope. Asi el
     * ciclo es un suceso con principio y final —llenarse, descargar, volver a
     * llenarse— y cada vuelta trae los colores de otra cancion, que es lo que
     * hace que se vayan combinando en capas.
     */
    private readonly low: number,
  ) {}

  /**
   * `sourceBlocked` abre el drenaje aunque no se haya llegado al nivel.
   *
   * Sin esa salida, si el monton crece hasta sepultar la fuente antes de
   * alcanzar el tope, la fuente deja de emitir, el nivel no vuelve a subir y el
   * drenaje no abre nunca: el lienzo se queda lleno para siempre. Cuanto mas
   * alto se pone el nivel de llenado, mas facil es caer en eso.
   */
  tick(g: Grid, sourceBlocked = false): void {
    const should = this.open
      ? g.sandCount > this.low
      : g.sandCount > this.high || sourceBlocked;
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
      const half = Math.max(1, this.mouth >> 1);
      const cx = g.w >> 1;
      g.fillRect(Math.max(0, cx - half), y, Math.min(g.w - 1, cx + half), y, SINK);
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
