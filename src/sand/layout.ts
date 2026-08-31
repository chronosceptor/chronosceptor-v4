import { Grid } from './grid';
import { Basin } from './basin';
import { Belt, Chute, Funnel, SideWalls, Tipper, Wheel, type BeltSegment, type Machine } from './machines';
import { mulberry32, randFloat, randInt, type Rng } from './rng';
import { grainColor, type Palette } from './palette';

/** Perfil de resolucion y composicion. Retrato no es la version recortada del ancho. */
export interface Profile {
  name: 'desktop' | 'portrait';
  /** Pixeles de pantalla por celda. */
  cell: number;
  /** Tramos de la serpentina. Cada uno recorre el ancho en sentido contrario al anterior. */
  rows: number;
  /** Profundidad de la cuenca, como fraccion del alto total. */
  basinFrac: number;
  /** Granos por segundo que suelta la tolva. */
  sourceRate: number;
  /** Velocidad de banda, 0..1. */
  belt: [number, number];
  /** Piezas por tramo. Mas piezas = mas textura, menos raya continua. */
  pieces: [number, number];
  maxSand: number;
}

/**
 * La unica fuente de arena de la escena.
 *
 * Con una sola boquilla el recorrido se puede seguir de principio a fin, y cada
 * cambio de color viaja por toda la linea como un frente visible antes de
 * llegar abajo. Con varias fuentes eso se pierde: solo se ve lluvia.
 */
export class Hopper {
  private acc = 0;
  private dominant = 0;
  private colorTimer = 0;
  /** Pausa de cambio de turno: da respiro y marca el arranque de un lote nuevo. */
  private pause = 0;
  private idle = 0;

  constructor(
    readonly x: number,
    readonly halfWidth: number,
    readonly rate: number,
    private readonly colorPeriod: number,
    private readonly rng: Rng,
  ) {
    this.idle = randFloat(rng, 18, 40);
  }

  /** Arranca un lote de color nuevo. Lo llama el cambio de cancion. */
  newBatch(): void {
    this.colorTimer = 0;
  }

  tick(g: Grid, dt: number, palette: Palette, rand: () => number, budget: number): number {
    if (this.pause > 0) {
      this.pause -= dt;
      return 0;
    }
    this.idle -= dt;
    if (this.idle <= 0) {
      this.idle = randFloat(this.rng, 25, 55);
      this.pause = randFloat(this.rng, 1.5, 3.5);
      return 0;
    }

    this.colorTimer -= dt;
    if (this.colorTimer <= 0) {
      this.colorTimer = randFloat(this.rng, this.colorPeriod * 0.7, this.colorPeriod * 1.4);
      this.dominant = randInt(this.rng, 0, Math.max(0, palette.colors.length - 1));
    }

    if (budget <= 0) return 0;
    this.acc += this.rate * dt;
    let n = Math.floor(this.acc);
    if (n <= 0) return 0;
    this.acc -= n;
    if (n > budget) n = budget;

    let placed = 0;
    for (let k = 0; k < n; k++) {
      const x = this.x + randInt(rand, -this.halfWidth, this.halfWidth);
      // Se siembra en las dos primeras filas: con una sola, los granos que no
      // caben se pierden y el chorro sale entrecortado.
      if (g.addSand(x, 0, grainColor(palette, rand, this.dominant, 0.94))) placed++;
      else if (g.addSand(x, 1, grainColor(palette, rand, this.dominant, 0.94))) placed++;
    }
    return placed;
  }
}

export interface Scene {
  grid: Grid;
  machines: Machine[];
  basin: Basin;
  hopper: Hopper;
  /** Banda de reparto sobre la cuenca; invierte el sentido cada tantos segundos. */
  shuttle: Belt | null;
  seed: number;
  profile: Profile;
}

export function profileFor(cssW: number, cssH: number): Profile {
  const portrait = cssH > cssW || cssW < 720;
  if (portrait) {
    return {
      name: 'portrait',
      cell: 4,
      rows: 6,
      basinFrac: 0.22,
      sourceRate: 11,
      belt: [0.85, 0.98],
      pieces: [3, 4],
      maxSand: 26000,
    };
  }
  return {
    name: 'desktop',
    // Grano fino: a 3px la arena se lee como material y no como pixel-art.
    cell: cssW > 2400 ? 4 : 3,
    rows: cssH > 900 ? 8 : 7,
    basinFrac: 0.17,
    /**
     * Caudal muy por debajo del limite de la cinta.
     *
     * En un automata de arena una cinta solo mueve un grano si la celda de
     * delante esta libre, asi que su caudal maximo se alcanza con la banda
     * medio llena: si se compacta, el transporte se desploma a cero y la linea
     * se atasca como un embotellamiento. Mejor una hilera suelta de material en
     * movimiento, que ademas es como se ve una cinta en una fabrica de verdad.
     */
    /**
     * Justo por debajo de la capacidad natural de la linea (~17 granos/s con
     * este perfil de cintas y balancines). Por encima, la tolva rechaza el
     * sobrante y se le forma un buffer que solo crece.
     */
    sourceRate: 17,
    belt: [0.85, 0.98],
    pieces: [3, 5],
    maxSand: 70000,
  };
}

/**
 * Arma la escena: una linea de ensamblaje en serpentina.
 *
 * Una sola tolva arriba, y la arena baja recorriendo el ancho en zigzag —
 * izquierda a derecha, cae al final del tramo, derecha a izquierda en el
 * siguiente— hasta la cuenca. Es la estructura de la referencia de After Dark
 * y la de un circuito de canicas: todo pasa por el mismo camino, y ese camino
 * se puede seguir con la vista de principio a fin.
 */
export function buildScene(gridW: number, gridH: number, seed: number, profile: Profile): Scene {
  const r = mulberry32(seed);
  const grid = new Grid(gridW, gridH);
  const basin = new Basin(grid, Math.round(gridH * profile.basinFrac));
  basin.stamp();

  const machines: Machine[] = [];
  const marginX = Math.max(3, Math.round(gridW * 0.05));
  const left = marginX;
  const right = gridW - marginX - 1;

  const lineTop = Math.max(8, Math.round(gridH * 0.06));
  const lineBottom = basin.topY - 12;

  /**
   * Alturas de los tramos con separaciones desiguales.
   *
   * Filas equidistantes son lo que hace que la escena se lea como papel
   * pautado. Agrupando —dos juntas, un respiro, tres juntas— aparece un ritmo
   * vertical y la composicion deja de ser una reja.
   */
  const weights: number[] = [];
  for (let i = 0; i < profile.rows; i++) weights.push(randFloat(r, 0.82, 1.22));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const rowYs: number[] = [];
  const rowGaps: number[] = [];
  let acc = lineTop;
  for (let i = 0; i < profile.rows; i++) {
    rowYs.push(Math.round(acc));
    const g = ((lineBottom - lineTop) * weights[i]!) / totalW;
    rowGaps.push(g);
    acc += g;
  }
  const rowGap = (lineBottom - lineTop) / profile.rows;
  /**
   * Largo de la rampa de transferencia entre tramos. Se queda unas celdas por
   * encima del tramo siguiente para que la caida se vea.
   */
  const turnLen = Math.max(6, Math.min(18, Math.floor(rowGap) - 3));

  machines.push(new SideWalls(left - 2, right + 2, 0, basin.topY - 1));

  const hopperX = left + 28;
  const hopper = new Hopper(hopperX, 2, profile.sourceRate, 30, r);
  machines.push(new Funnel(hopperX, 1, 4, 1));

  let lastEnd = { x: right, y: lineTop };
  let lastDir: -1 | 1 = 1;

  for (let i = 0; i < profile.rows; i++) {
    const rowY = rowYs[i]!;
    const gapHere = rowGaps[i]!;
    const dir: -1 | 1 = i % 2 === 0 ? 1 : -1;
    const sx = dir === 1 ? left : right;
    // El ultimo tramo muere en el centro, no en el borde: asi la entrega cae en
    // mitad de la banda de reparto y esta puede repartir hacia los dos lados.
    // Terminando en el borde, el material aterriza a dos celdas del extremo y
    // se desborda ahi mismo formando un unico cono en la esquina.
    const ex =
      i === profile.rows - 1
        ? Math.round((left + right) / 2)
        : dir === 1
          ? right
          : left;

    lastEnd = buildRow(r, machines, rowY, gapHere, dir, sx, ex, profile);
    lastDir = dir;

    if (i === profile.rows - 1) break;

    // Rampa de transferencia: recoge lo que sale del tramo y lo devuelve hacia
    // dentro, sobre el tramo siguiente.
    //
    // Sin ella la linea se rompe: la arena abandona la banda una celda mas alla
    // de su extremo, donde ya no hay nada que la reciba, y cae al vacio.
    //
    // Arranca del final REAL del tramo, no de su altura nominal: si un modulo
    // bajo la linea, la ultima cinta va mas abajo, y una rampa trazada desde la
    // altura de partida la atravesaria por el medio y la cortaria en dos.
    const nextY = rowYs[i + 1] ?? lineBottom;
    // La rampa arranca tres celdas por debajo de la cinta, no pegada a ella.
    // Si su primera celda queda justo debajo del extremo de la banda, la
    // diagonal por la que deberia deslizarse la arena choca contra la propia
    // cinta y el material se apila contra el muro sin poder bajar.
    const turnY = lastEnd.y + 3;
    const len = Math.max(4, Math.min(turnLen, nextY - turnY - 3));
    const turnX = clamp(lastEnd.x + dir, left - 1, right + 1);
    machines.push(new Chute(turnX, turnY, len, -dir as -1 | 1));

    // Rueda de paletas junto a la vuelta: la mueve la arena que cae, sin
    // meterse en el camino.
    if (r() < 0.4) {
      const wr = randInt(r, 4, 6);
      const wy = turnY + len + wr + 2;
      const wx = turnX - dir * (len + wr + 3);
      if (wy + wr < nextY - 1 && wx > left + wr && wx < right - wr) {
        machines.push(new Wheel(wx, wy, wr, randInt(r, 4, 6), dir === 1 ? -1 : 1));
      }
    }
  }

  // Rampa final y banda de reparto sobre la cuenca.
  //
  // La banda se coloca DESPUES de saber donde escupe la rampa, con su extremo
  // justo debajo: al reves, la rampa entrega fuera de la banda y todo el
  // material cae de golpe en una esquina de la cuenca.
  const shuttleY = basin.topY - 6;
  const feedDir: -1 | 1 = lastDir;
  const feedY = lastEnd.y + 3;
  const feedX = clamp(lastEnd.x + lastDir, left, right);
  const feedLen = clamp(shuttleY - 4 - feedY, 4, 20);
  machines.push(new Chute(feedX, feedY, feedLen, feedDir));
  const feedExit = feedX + feedDir * feedLen;

  const shuttleLen = Math.min(Math.round((right - left) * 0.7), right - left - 2);
  // Centrada bajo la entrega.
  const shuttleX = clamp(feedExit - Math.round(shuttleLen / 2), left, right - shuttleLen);
  const shuttle = new Belt(
    shuttleX,
    shuttleY,
    shuttleLen,
    feedDir,
    // Mas rapida que las demas: recibe TODO el caudal de la linea concentrado
    // en un punto, y a la velocidad de una cinta normal se le forma un monton
    // encima que acaba atascando la entrega.
    randFloat(r, 0.92, 0.99),
    randFloat(r, 16, 30),
  );
  machines.push(shuttle);

  for (const m of machines) m.stamp(grid);

  return { grid, machines, basin, hopper, shuttle, seed, profile };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Construye un tramo: una cinta continua con velocidad variable a lo largo.
 *
 * Una cinta lisa de borde a borde deja siete lineas horizontales identicas que
 * se leen como papel pautado. La referencia de After Dark hace lo contrario:
 * cada fila son varias piezas de anchos distintos con un monton de material
 * encima de cada una, y ese monton es su firma visual.
 *
 * Se consigue con un perfil de velocidad: el material se amontona solo en los
 * tramos lentos y corre en los rapidos, y las poleas marcan las fronteras. La
 * alternativa —piezas separadas y escalonadas— da el mismo dibujo pero obliga
 * al material a saltar de una a otra, y cada salto es una constriccion que
 * estrangula el caudal de la linea entera.
 *
 * Devuelve el final real del tramo.
 */
function buildRow(
  r: Rng,
  out: Machine[],
  rowY: number,
  rowGap: number,
  dir: -1 | 1,
  sx: number,
  ex: number,
  profile: Profile,
): { x: number; y: number } {
  const span = Math.abs(ex - sx) + 1;
  const maxY = rowY + Math.max(3, Math.floor(rowGap * 0.72));

  /** Perfil de velocidad alternando tramos rapidos y lentos. */
  const makeSegments = (len: number): BeltSegment[] => {
    const n = randInt(r, profile.pieces[0], profile.pieces[1]);
    // Al menos un tramo lento por fila, elegido de antemano.
    //
    // Dejandolo al azar salen filas enteras solo de tramos rapidos: el material
    // las cruza sin detenerse, no deja monton, y en pantalla esa fila se ve
    // vacia aunque este pasando material por ella todo el rato.
    const forced = n >= 3 ? randInt(r, 1, n - 2) : -1;
    const segs: BeltSegment[] = [];
    let leftLen = len;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      const l = last ? leftLen : Math.max(10, Math.round((len / n) * randFloat(r, 0.55, 1.45)));
      const take = Math.min(l, leftLen);
      if (take <= 0) break;
      // El primero y el ultimo siempre rapidos: son la entrada y la entrega.
      const slow = !last && k > 0 && (k === forced || r() < 0.4);
      segs.push({
        len: take,
        // Lento pero por encima del umbral de atasco: el caudal de la linea
        // entera lo fija su tramo mas lento, y el contraste con los rapidos
        // (0.9) sigue bastando para que se forme monton.
        speed: slow ? randFloat(r, 0.6, 0.75) : randFloat(r, profile.belt[0], profile.belt[1]),
      });
      leftLen -= take;
      if (leftLen <= 0) break;
    }
    return segs;
  };

  const belt = (from: number, len: number, y: number, stop: number): void => {
    if (len < 6) return;
    out.push(new Belt(from, y, len, dir, profile.belt[1], 0, stop, makeSegments(len)));
  };

  // Un modulo parte el tramo en dos como mucho. Mas de uno y el tramo se llena
  // de saltos verticales que es justo lo que se queria evitar.
  if (span > 90 && r() < 0.5) {
    const cut = Math.round(span * randFloat(r, 0.35, 0.6));
    const modX = sx + dir * cut;
    const placed = placeModule(r, out, modX, rowY, dir, maxY);
    if (placed) {
      belt(dir === 1 ? sx : sx - cut + 1, cut, rowY, 10);
      const restLen = Math.abs(ex - placed.x) + 1;
      // Sin tope: aqui es justo donde el modulo entrega el material.
      belt(dir === 1 ? placed.x : placed.x - restLen + 1, restLen, placed.y, 0);
      return { x: ex, y: placed.y };
    }
  }

  belt(dir === 1 ? sx : sx - span + 1, span, rowY, 10);
  return { x: ex, y: rowY };
}

interface Placed {
  x: number;
  y: number;
}

/**
 * Modulos que se intercalan en un tramo sin romper el sentido de avance.
 *
 * `x` es la columna por la que la arena abandona la cinta y cae; todo se
 * posiciona respecto a ese punto.
 */
function placeModule(
  r: Rng,
  out: Machine[],
  x: number,
  y: number,
  dir: -1 | 1,
  maxY: number,
): Placed | null {
  // Escalon: la arena se desliza en diagonal y el tramo continua mas abajo.
  if (r() < 0.5) {
    const len = Math.min(randInt(r, 5, 10), maxY - y - 2);
    if (len < 4) return null;
    out.push(new Chute(x, y, len, dir));
    return { x: x + dir * (len + 1), y: y + len + 2 };
  }

  // Balancin: se llena, vuelca hacia donde avanza la linea y suelta el lote de
  // golpe sobre el tramo siguiente.
  //
  // Cubetas generosas: son la unica masa con volumen del tramo medio y a tamano
  // pequeno se pierden entre las lineas.
  const halfW = randInt(r, 7, 10);
  const depth = randInt(r, 3, 5);
  // El borde de la cubeta queda POR DEBAJO del nivel al que viaja el material.
  // A la misma altura la pared no lo recibe: lo frena, y el tramo se atasca.
  const cy = y + depth + 1;
  const cx = x + dir * (halfW - 1);

  /**
   * La cinta de salida se coloca segun la cubeta VOLCADA, no en reposo.
   *
   * Al girar, el labio de descarga baja y se desplaza hacia fuera, y el canto
   * del piso barre todavia mas abajo. Situandola con la geometria en reposo, la
   * cinta acaba por encima del labio y unas celdas corta: el material se vierte
   * justo por delante de su extremo y cae al vacio. Es exactamente el sintoma
   * de "se cae del lado que no es".
   *
   * Con el angulo maximo (0.95 rad) el labio cae a ~cy+4 y el canto del piso
   * baja hasta ~cy+7, asi que la cinta va a cy+9; y su extremo se retranquea
   * por dentro del punto de vertido para recogerlo con holgura.
   */
  const outY = cy + 9;
  if (outY + 1 > maxY) return null;

  out.push(new Tipper(cx, cy, halfW, depth, Math.round(halfW * depth * 0.85), dir, false));
  return { x: cx + dir * (halfW - 2), y: outY };
}
