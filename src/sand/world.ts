import { Grid } from './grid';
import { EMPTY, LEDGE, SAND, SINK, WALL } from './materials';
import { grainColor, type Palette } from './palette';
import { mulberry32, randFloat, randInt, type Rng } from './rng';

/** Filas del borde inferior reservadas al drenaje: no se puede dibujar en ellas. */
export const RESERVED_ROWS = 5;

/**
 * Filas que tarda el chorro en abrirse desde el vertice hasta su ancho.
 *
 * La fuente no se dibuja: lo unico que se ve de ella es la arena saliendo. Por
 * eso el chorro no puede nacer ya con su ancho final, como nacia cuando habia
 * una tolva pintada encima que tapaba la fila de siembra: sin nada que la tape,
 * una linea de nueve celdas que aparece de golpe se lee como una costura. Con
 * el vertice de una sola celda, el punto donde la arena aparece de la nada deja
 * de ser el fallo y pasa a ser el efecto.
 *
 * Se siembra en cono y no se deja que lo abra la deriva de la caida (`DRIFT_P`,
 * en `physics.ts`): esa se abre con la raiz de la distancia, asi que no tiene
 * vertice y no se queda nunca en un ancho, y subirla toca la unica rama del
 * bucle caliente. Sembrando, la forma es exacta y la fisica no se entera.
 *
 * Va en celdas y lo reescala `regrain`: lo que tiene que medir lo mismo es el
 * cono en PANTALLA. Son 51 con el grano de 2 px y eran 34 con el de 3.
 */
export const SPREAD_ROWS = 51;

/**
 * Fila donde nace el chorro de la fuente de serie.
 *
 * Es aire por encima del vertice, y ese aire es el efecto entero: pegado al
 * borde de arriba no se ve nacer nada, porque el vertice queda fuera de
 * pantalla o rozandola. Lo que hay que ver es el punto exacto en el que la
 * arena aparece de la nada.
 *
 * Salio del alto que ocupaba el dibujo de la tolva, cuando lo habia, y se
 * conservo al quitarlo para que en pantalla el chorro siguiera empezando donde
 * empezaba; ahora la razon es esa medida en pantalla y no el dibujo. Va en
 * celdas, asi que lo reescala `regrain` con la finura del grano: son 51 con el
 * grano de 2 px y eran 34 con el de 3.
 */
const SOURCE_ROW = 51;

export interface Profile {
  name: 'desktop' | 'portrait';
  /** Pixeles de pantalla por celda. */
  cell: number;
  /**
   * Finura del grano respecto al de serie: `cellDeSerie / cell`.
   *
   * Uno en el perfil normal. Solo lo mueve `?cell=N`, y esta aqui para que las
   * piezas que se calibraron en celdas —la boquilla de un emisor colocado, su
   * cono— puedan reescalarse solas: una medida en celdas escrita a mano vale
   * para un tamano de grano y para ningun otro.
   */
  k: number;
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
   * celdas libres del cono, asi que una boquilla estrecha rechaza todo lo que
   * no cabe por mucho que se suba `rate`. Con tres celdas el maximo eran ~180
   * granos/s aunque se pidieran 520.
   *
   * Es el ancho del FINAL del cono: arriba el chorro es de una celda y se va
   * abriendo hasta este ancho, ver `SPREAD_ROWS`.
   */
  nozzle: number;
  /**
   * Tope de arena viva, como red de seguridad de rendimiento.
   *
   * No sale de la tabla del perfil sino del lienzo: lo pone `createWorld` a
   * partir de las celdas que hay. Ver `SAND_CAP`.
   */
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
  /** Filas que tarda el chorro en abrirse. Ver `SPREAD_ROWS`. */
  spread: number;
  /** Fila del vertice del chorro de la fuente de serie. Ver `SOURCE_ROW`. */
  sourceRow: number;
}

/**
 * El perfil tal y como se escribe a mano: todo menos el tope de arena, que no
 * es una propiedad del dispositivo sino del lienzo que salga. Ver `SAND_CAP`.
 */
type DeviceProfile = Omit<Profile, 'maxSand'>;

/**
 * Tope de arena viva, como fraccion de las celdas del lienzo.
 *
 * Es una red de seguridad de rendimiento y nada mas: por debajo manda el
 * drenaje, que abre al `fillFrac` (72%), asi que este numero no deberia
 * alcanzarse jamas jugando.
 *
 * Iba escrito en granos absolutos —304.000, que era justo el lienzo entero de
 * un portatil— y en una pantalla grande dejaba de ser una red para ser el tope
 * de verdad: un lienzo 4K pasa de 400.000 celdas y uno ultrapanoramico de
 * 550.000, asi que el emisor se cortaba aqui y el drenaje no llegaba a abrir
 * nunca. Como fraccion sube sola con el lienzo, y de paso desaparece el `k²`
 * que habia que acordarse de aplicarle al cambiar la finura del grano: las
 * celdas ya suben con el cuadrado ellas solas.
 *
 * Que no sea 1 es a proposito: un lienzo lleno hasta la ultima celda no es un
 * estado de juego, es que algo se ha ido de las manos, y ahi la red tiene que
 * existir. Que el rendimiento aguanta esta medido —200.000 granos con siete
 * fuentes cuestan 2,6 ms de simulacion de un presupuesto de 16,7— asi que el
 * tope no esta puesto para proteger a los fps de una partida normal.
 */
const SAND_CAP = 0.95;

export function profileFor(cssW: number, cssH: number, cellOverride?: number): DeviceProfile {
  const base = deviceProfile(cssW, cssH);
  if (cellOverride === undefined || cellOverride === base.cell) return base;
  return regrain(base, cellOverride);
}

/**
 * El grano fino no es una escala del grueso: es el que hay.
 *
 * Toda esta tabla se recalibro al bajar `cell` de 3 a 2 en escritorio y de 4 a 3
 * en vertical. Los numeros no son «los de antes por 1,5»: son los de antes
 * llevados a que en PANTALLA todo mida lo mismo que media, que es lo unico que
 * se ve. Lo que va por longitud subio con la finura y lo que llena area subio
 * con su cuadrado. Si vuelves a mover `cell`, hay que rehacer los dos grupos —y
 * ademas las constantes en celdas que viven en `physics`, `ejecta`, `ball`,
 * `blast`, `bomb` y `render`, que no salen de aqui—. `?cell=N` reescala esta
 * tabla al vuelo para poder comparar, pero esas otras no las toca.
 */
function deviceProfile(cssW: number, cssH: number): DeviceProfile {
  const comun = { k: 1, fillFrac: 0.72, spread: SPREAD_ROWS, sourceRow: SOURCE_ROW };
  const portrait = cssH > cssW || cssW < 720;
  if (portrait) {
    // Algo mas ancha en tactil: el dedo es menos preciso que el raton.
    return { ...comun, name: 'portrait', cell: 3, rate: 710, brush: 2.0, nozzle: 4, mouth: 45 };
  }
  // Brocha fina: un trazo de una sola celda de grosor ya retiene el material
  // (la regla diagonal exige que la celda lateral tambien este libre), asi que
  // no hay razon fisica para engordarla y con ella se dibuja con precision.
  //
  // El salto de celda en pantallas muy anchas mantiene el grid mas o menos
  // constante en celdas —unas 750-850 de ancho—, que es para lo que esta escrito
  // todo lo demas de esta tabla.
  return { ...comun, name: 'desktop', cell: cssW > 2400 ? 3 : 2, rate: 1575, brush: 1.5, nozzle: 6, mouth: 114 };
}

/**
 * El mismo perfil con otro tamano de grano, para comparar sin recompilar:
 * `?cell=3` devuelve a ojo el grano grueso de antes, `?cell=4` uno mas gordo.
 *
 * Bajar `cell` a secas no da una version fina de esta escena, da otra escena:
 * todo lo que esta calibrado en celdas encoge en pantalla en la misma
 * proporcion. Lo que va por longitud —brocha, boquilla, boca del drenaje, el
 * cono— se multiplica por `k`, y lo que va por superficie —el caudal, que llena
 * area— por `k²`. El tope de arena ya no esta aqui y no hay que acordarse de el:
 * sale de las celdas del lienzo, que suben con el cuadrado ellas solas. Cuando
 * era un numero de esta tabla y se olvidaba el `k²`, el emisor se cortaba por el
 * tope antes de que el drenaje llegara a dispararse nunca.
 *
 * Lo que esto NO alcanza son las constantes en celdas de los otros modulos —la
 * bola, la explosion, la ejecta, los agarres, `MAX_VEL`—, que estan escritas
 * para el grano de serie y aqui no llegan. Es decir: `?cell=N` sirve para juzgar
 * la ARENA, no las piezas. Si un tamano nuevo se adopta de verdad, esas hay que
 * rehacerlas a mano, como se hizo al pasar de 3 a 2.
 */
function regrain(p: DeviceProfile, cell: number): DeviceProfile {
  const k = p.cell / cell;
  const largo = (n: number): number => Math.max(1, Math.round(n * k));
  const area = (n: number): number => Math.round(n * k * k);
  return {
    ...p,
    cell,
    k,
    rate: area(p.rate),
    brush: p.brush * k,
    nozzle: largo(p.nozzle),
    mouth: largo(p.mouth),
    spread: largo(p.spread),
    sourceRow: largo(p.sourceRow),
  };
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
    /** Fila del vertice del cono: donde aparece el primer grano. */
    public y = 0,
    /**
     * Filas que tarda en abrirse. Ver `SPREAD_ROWS`, que es el valor de serie.
     *
     * Es un dato de la fuente y no una constante del modulo porque con el grano
     * fino hacen falta mas filas para el mismo cono en pantalla.
     */
    readonly spread = SPREAD_ROWS,
  ) {}

  /**
   * Semiancho de la siembra en la fila `r` del cono, en celdas.
   *
   * Cero en el vertice —una sola celda— y `halfWidth` al final. Vive en la
   * fuente y no en quien la pinta porque el contorno que se ensena al
   * arrastrarla tiene que ser exactamente por donde va a salir la arena: si
   * fuesen dos cuentas distintas, acabarian siendo dos formas distintas.
   */
  halfAt(r: number): number {
    if (r >= this.spread) return this.halfWidth;
    return Math.round((this.halfWidth * (r + 1)) / this.spread);
  }

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
      // Cada grano nace en una fila cualquiera del cono y baja hasta encontrar
      // hueco, sorteando su x dentro del semiancho de la fila en la que acabe.
      //
      // Bajar es lo que hace que el vertice salga macizo en vez de punteado:
      // las filas de arriba son de una o dos celdas y se saturan enseguida, y
      // lo que no cabe rellena las filas anchas en vez de perderse. Es la misma
      // razon por la que antes se sembraba en dos filas y no en una, extendida
      // al cono entero — y de paso sube el techo real de caudal, que es el
      // numero de celdas donde se puede sembrar y no `rate`.
      for (let r = randInt(rand, 0, this.spread - 1); r <= this.spread; r++) {
        const hw = this.halfAt(r);
        const x = this.x + randInt(rand, -hw, hw);
        if (g.addSand(x, this.y + r, grainColor(palette, rand, this.dominant, 0.94))) {
          placed++;
          break;
        }
      }
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

export function createWorld(
  cssW: number,
  cssH: number,
  fillOverride?: number,
  cellOverride?: number,
): World {
  const base = profileFor(cssW, cssH, cellOverride);
  const w = Math.max(80, Math.floor(cssW / base.cell));
  const h = Math.max(80, Math.floor(cssH / base.cell));
  // El tope de arena se cierra aqui y no en la tabla: es una fraccion de las
  // celdas que han salido, no un numero escrito para un tamano de pantalla.
  const profile: Profile = { ...base, maxSand: Math.round(w * h * SAND_CAP) };
  if (fillOverride !== undefined) profile.fillFrac = fillOverride;
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
    profile.sourceRow,
    profile.spread,
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
