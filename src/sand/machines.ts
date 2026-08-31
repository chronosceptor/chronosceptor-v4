import type { Grid } from './grid';
import { BELT_L, BELT_R, CHUTE_L, CHUTE_R, DYN, EMPTY, GATE, LEDGE, SAND, SIEVE, WALL } from './materials';
import type { Rng } from './rng';
import { randFloat, randInt } from './rng';
import { THEME } from './palette';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  /** Píxeles de pantalla por celda del grid. */
  s: number;
}

export interface Machine {
  kind: string;
  bbox: Box;
  /** Columnas por donde esta máquina escupe arena hacia abajo. Alimenta el encadenado del layout. */
  outputs: number[];
  /** Geometría estática. Se llama una vez al construir la escena. */
  stamp(g: Grid): void;
  /** Máquinas con movimiento. `dt` en segundos. */
  tick?(g: Grid, dt: number): void;
  /** Capa vectorial encima del bitmap. */
  draw?(d: DrawCtx): void;
}

const TAU = Math.PI * 2;
/** Alto por defecto del tope de entrada de una banda, en celdas. */
const STOP_H = 10;

// ---------------------------------------------------------------------------
// Viga / repisa: la arena se acumula encima y se desborda por los dos extremos.
// ---------------------------------------------------------------------------
export class Ledge implements Machine {
  kind = 'ledge';
  bbox: Box;
  outputs: number[];

  constructor(readonly x: number, readonly y: number, readonly len: number) {
    this.bbox = { x0: x, y0: y, x1: x + len - 1, y1: y };
    this.outputs = [x - 1, x + len];
  }

  stamp(g: Grid): void {
    g.fillRect(this.bbox.x0, this.y, this.bbox.x1, this.y, LEDGE);
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    const y = Math.round(this.y * s) + 0.5;
    ctx.beginPath();
    ctx.moveTo(this.bbox.x0 * s, y);
    ctx.lineTo((this.bbox.x1 + 1) * s, y);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Colina / cuña: parte el chorro en dos. No lleva lógica propia — la regla
// diagonal de la física hace todo el trabajo sobre un triángulo de WALL.
// ---------------------------------------------------------------------------
export class Wedge implements Machine {
  kind = 'wedge';
  bbox: Box;
  outputs: number[];

  constructor(readonly cx: number, readonly y: number, readonly halfW: number) {
    this.bbox = { x0: cx - halfW, y0: y, x1: cx + halfW, y1: y + halfW };
    this.outputs = [cx - halfW - 1, cx + halfW + 1];
  }

  stamp(g: Grid): void {
    for (let k = 0; k <= this.halfW; k++) {
      g.fillRect(this.cx - k, this.y + k, this.cx + k, this.y + k, WALL);
    }
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((this.cx - this.halfW) * s, (this.y + this.halfW + 1) * s);
    ctx.lineTo((this.cx + 0.5) * s, this.y * s);
    ctx.lineTo((this.cx + this.halfW + 1) * s, (this.y + this.halfW + 1) * s);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Banda transportadora.
// ---------------------------------------------------------------------------
/** Tramo de una cinta con su propia velocidad. */
export interface BeltSegment {
  len: number;
  speed: number;
}

export class Belt implements Machine {
  kind = 'belt';
  bbox: Box;
  outputs: number[];
  private phase = 0;
  private dirNow: -1 | 1;
  private flipTimer: number;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly len: number,
    readonly dir: -1 | 1,
    /** 0..1, se guarda por celda para que cada banda corra a su ritmo. */
    readonly speed: number,
    /**
     * Segundos entre inversiones de sentido. 0 = banda fija.
     *
     * La banda de reparto sobre la cuenca lo usa para barrer el deposito de un
     * lado a otro: con un unico punto de caida la cuenca crece como un solo
     * cono y los estratos salen en capas concentricas en vez de horizontales.
     */
    readonly flipPeriod = 0,
    /**
     * Alto del tope en el extremo de entrada, en celdas. 0 = sin tope.
     *
     * Alto en el extremo muerto de un tramo, que es por donde se derrama el
     * material. Bajo entre piezas encadenadas, para que retenga el monton sin
     * asomar por encima de la pieza anterior y frenarla.
     */
    readonly stopHeight = 0,
    /**
     * Perfil de velocidad a lo largo de la cinta, desde su extremo de entrada.
     *
     * El material se amontona solo en los tramos lentos, que es lo que da los
     * montones caracteristicos de la referencia. Hacerlo con cintas separadas
     * y escalones obliga a que el material salte de una pieza a la siguiente, y
     * cada salto es una constriccion donde el caudal se estrangula; sobre una
     * cinta continua no hay ninguna.
     */
    readonly segments: BeltSegment[] | null = null,
  ) {
    this.bbox = { x0: x, y0: y, x1: x + len - 1, y1: y };
    this.outputs = flipPeriod > 0 ? [x - 1, x + len] : [dir === 1 ? x + len : x - 1];
    this.dirNow = dir;
    this.flipTimer = flipPeriod;
  }

  stamp(g: Grid): void {
    this.write(g);
  }

  private write(g: Grid): void {
    const mat = this.dirNow === 1 ? BELT_R : BELT_L;
    const byte = (v: number): number => Math.max(1, Math.min(255, Math.round(v * 255)));

    if (!this.segments) {
      const sp = byte(this.speed);
      for (let x = this.bbox.x0; x <= this.bbox.x1; x++) {
        g.stamp(x, this.y, mat);
        if (g.inBounds(x, this.y)) g.beltSpeed[g.idx(x, this.y)] = sp;
      }
    } else {
      // Se recorre desde el extremo de entrada, que cambia si la cinta invierte.
      let x = this.dirNow === 1 ? this.bbox.x0 : this.bbox.x1;
      for (const seg of this.segments) {
        const sp = byte(seg.speed);
        for (let k = 0; k < seg.len; k++) {
          if (x < this.bbox.x0 || x > this.bbox.x1) break;
          g.stamp(x, this.y, mat);
          g.beltSpeed[g.idx(x, this.y)] = sp;
          x += this.dirNow;
        }
      }
      // Lo que sobre por redondeo se completa a velocidad nominal.
      const sp = byte(this.speed);
      while (x >= this.bbox.x0 && x <= this.bbox.x1) {
        g.stamp(x, this.y, mat);
        g.beltSpeed[g.idx(x, this.y)] = sp;
        x += this.dirNow;
      }
    }

    this.writeStops(g);
    g.wakeRect(this.bbox.x0, this.y - 3, this.bbox.x1, this.y + 1);
  }

  /** Fronteras entre tramos, en coordenadas de celda. Marcan donde van poleas. */
  private boundaries(): number[] {
    if (!this.segments) return [];
    const out: number[] = [];
    let x = this.dirNow === 1 ? this.bbox.x0 : this.bbox.x1;
    for (const seg of this.segments) {
      x += this.dirNow * seg.len;
      if (x > this.bbox.x0 && x < this.bbox.x1) out.push(x);
    }
    return out;
  }

  /**
   * Tope en el extremo de entrada.
   *
   * El monton que se forma en el punto de caida se extiende hacia atras por su
   * propio talud, llega al final de la cinta y se derrama al vacio. El tope lo
   * retiene, igual que los faldones de una cinta de verdad.
   */
  private writeStops(g: Grid): void {
    if (this.stopHeight <= 0) return;
    const back = this.dirNow === 1 ? this.bbox.x0 - 1 : this.bbox.x1 + 1;
    const front = this.dirNow === 1 ? this.bbox.x1 + 1 : this.bbox.x0 - 1;
    // Se limpia el tope viejo antes de escribir el nuevo: la banda de reparto
    // invierte el sentido y el tope tiene que cambiar de lado con ella.
    for (const x of [back, front]) {
      for (let d = 1; d <= STOP_H; d++) g.clearStructure(x, this.y - d, x, this.y - d, LEDGE);
    }
    for (let d = 1; d <= this.stopHeight; d++) g.stamp(back, this.y - d, LEDGE);
  }

  tick(g: Grid, dt: number): void {
    this.phase += dt * this.speed * this.dirNow * 6;
    if (this.flipPeriod <= 0) return;
    this.flipTimer -= dt;
    if (this.flipTimer <= 0) {
      this.flipTimer = this.flipPeriod;
      this.dirNow = this.dirNow === 1 ? -1 : 1;
      this.write(g);
    }
  }

  draw({ ctx, s }: DrawCtx): void {
    const y = Math.round(this.y * s) + 0.5;
    const xa = this.bbox.x0 * s;
    const xb = (this.bbox.x1 + 1) * s;
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    ctx.stroke();

    if (this.stopHeight > 0) {
      const bx = (this.dirNow === 1 ? this.bbox.x0 : this.bbox.x1 + 1) * s;
      ctx.beginPath();
      ctx.moveTo(Math.round(bx) + 0.5, y);
      ctx.lineTo(Math.round(bx) + 0.5, y - this.stopHeight * s);
      ctx.stroke();
    }

    // Poleas en los extremos y en cada frontera de tramo. Son las que dan el
    // ritmo horizontal: sin ellas la fila vuelve a ser una raya continua.
    const r = Math.max(3, s * 1.6);
    const marks = [xa, xb, ...this.boundaries().map((cx) => cx * s)];
    for (const px of marks) {
      ctx.beginPath();
      ctx.arc(px, y + r, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, y + r);
      ctx.lineTo(px + Math.cos(this.phase) * r, y + r + Math.sin(this.phase) * r);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Resbaladero: la arena acelera y sale disparada de lado.
// ---------------------------------------------------------------------------
export class Chute implements Machine {
  kind = 'chute';
  bbox: Box;
  outputs: number[];

  constructor(
    readonly x: number,
    readonly y: number,
    readonly len: number,
    readonly dir: -1 | 1,
  ) {
    const ex = x + dir * len;
    this.bbox = { x0: Math.min(x, ex), y0: y, x1: Math.max(x, ex), y1: y + len + 1 };
    this.outputs = [ex + dir];
  }

  stamp(g: Grid): void {
    const mat = this.dir === 1 ? CHUTE_R : CHUTE_L;
    // Dos celdas de grosor: una diagonal de una sola celda solo se toca por las
    // esquinas y en pantalla se lee como una fila de puntos sueltos.
    for (let k = 0; k <= this.len; k++) {
      g.stamp(this.x + this.dir * k, this.y + k, mat);
      g.stamp(this.x + this.dir * k, this.y + k + 1, mat);
    }
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.structureSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x * s, this.y * s);
    ctx.lineTo((this.x + this.dir * this.len + (this.dir === 1 ? 1 : 0)) * s, (this.y + this.len + 1) * s);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Embudo: recoge ancho y escupe un hilo delgado.
// ---------------------------------------------------------------------------
export class Funnel implements Machine {
  kind = 'funnel';
  bbox: Box;
  outputs: number[];

  constructor(
    readonly cx: number,
    readonly y: number,
    readonly halfW: number,
    readonly gap: number,
  ) {
    const depth = halfW - gap;
    this.bbox = { x0: cx - halfW, y0: y, x1: cx + halfW, y1: y + depth + 1 };
    this.outputs = [cx];
  }

  stamp(g: Grid): void {
    const depth = this.halfW - this.gap;
    for (let k = 0; k <= depth; k++) {
      g.stamp(this.cx - this.halfW + k, this.y + k, CHUTE_R);
      g.stamp(this.cx - this.halfW + k, this.y + k + 1, CHUTE_R);
      g.stamp(this.cx + this.halfW - k, this.y + k, CHUTE_L);
      g.stamp(this.cx + this.halfW - k, this.y + k + 1, CHUTE_L);
    }
  }

  draw({ ctx, s }: DrawCtx): void {
    const depth = this.halfW - this.gap;
    ctx.strokeStyle = THEME.structureSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((this.cx - this.halfW) * s, this.y * s);
    ctx.lineTo((this.cx - this.gap + 1) * s, (this.y + depth + 1) * s);
    ctx.moveTo((this.cx + this.halfW + 1) * s, this.y * s);
    ctx.lineTo((this.cx + this.gap) * s, (this.y + depth + 1) * s);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Criba: deja pasar parte y retiene el resto.
// ---------------------------------------------------------------------------
export class Sieve implements Machine {
  kind = 'sieve';
  bbox: Box;
  outputs: number[];

  constructor(readonly x: number, readonly y: number, readonly len: number) {
    this.bbox = { x0: x, y0: y, x1: x + len - 1, y1: y };
    this.outputs = [x + (len >> 1), x - 1, x + len];
  }

  stamp(g: Grid): void {
    g.fillRect(this.bbox.x0, this.y, this.bbox.x1, this.y, SIEVE);
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    const y = Math.round(this.y * s) + 0.5;
    ctx.beginPath();
    // Trazo discontinuo: se lee como tamiz sin necesidad de tocar la física.
    for (let x = this.bbox.x0; x <= this.bbox.x1; x += 2) {
      ctx.moveTo(x * s, y);
      ctx.lineTo((x + 1) * s, y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Balancín: acumula hasta que el peso lo vuelca, tira todo de golpe y regresa.
// ---------------------------------------------------------------------------
type TipPhase = 'filling' | 'tipping' | 'holding' | 'returning';

export class Tipper implements Machine {
  kind = 'tipper';
  bbox: Box;
  outputs: number[];

  private angle = 0;
  private phase: TipPhase = 'filling';
  private hold = 0;
  private side: -1 | 1;
  private sinceTip = 0;
  private readonly maxAngle = 0.95;
  /**
   * Segundos como maximo entre vuelcos.
   *
   * Con el vertedero, el material rebosa solo y la cubeta puede quedarse
   * indefinidamente por debajo de su capacidad; sin un plazo maximo dejaria de
   * volcar nunca y se convertiria en una simple repisa.
   */
  private readonly maxInterval = 9;

  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly halfW: number,
    readonly depth: number,
    readonly capacity: number,
    side: -1 | 1,
    /** En linea vuelca siempre hacia donde avanza; suelto, alterna los lados. */
    private readonly alternate = true,
  ) {
    this.side = side;
    const reach = Math.ceil(Math.hypot(halfW, depth)) + 1;
    this.bbox = { x0: cx - reach, y0: cy - reach, x1: cx + reach, y1: cy + reach };
    this.outputs = [cx - halfW - 2, cx + halfW + 2];
  }

  stamp(g: Grid): void {
    this.render(g);
  }

  tick(g: Grid, dt: number): void {
    switch (this.phase) {
      case 'filling':
        this.sinceTip += dt;
        if (this.countSand(g) >= this.capacity || this.sinceTip > this.maxInterval) {
          this.phase = 'tipping';
        }
        break;
      case 'tipping':
        // Ni muy rapido ni muy lento. Mientras vuelca y vuelve, la cubeta no
        // acepta material, asi que su tiempo muerto pone un techo al caudal de
        // la linea; pero volcando de golpe el piso barre el material en lugar
        // de dejarlo deslizarse, y sale despedido en vez de verterse.
        this.angle += this.side * dt * 2.6;
        if (Math.abs(this.angle) >= this.maxAngle) {
          this.angle = this.side * this.maxAngle;
          this.phase = 'holding';
          this.hold = 0.3;
        }
        break;
      case 'holding':
        this.hold -= dt;
        if (this.hold <= 0) this.phase = 'returning';
        break;
      case 'returning':
        this.angle -= this.side * dt * 3.2;
        if (this.side * this.angle <= 0) {
          this.angle = 0;
          this.phase = 'filling';
          this.sinceTip = 0;
          // Alterna el lado de volcado: la arena sale a un lado y luego al otro.
          if (this.alternate) this.side = this.side === 1 ? -1 : 1;
        }
        break;
    }
    this.render(g);
  }

  /** Cuenta la arena que descansa dentro de la cubeta. */
  private countSand(g: Grid): number {
    let n = 0;
    const y0 = Math.max(0, this.cy - this.depth - 1);
    const y1 = Math.min(g.h - 1, this.cy);
    const x0 = Math.max(0, this.cx - this.halfW);
    const x1 = Math.min(g.w - 1, this.cx + this.halfW);
    for (let y = y0; y <= y1; y++) {
      const row = y * g.w;
      for (let x = x0; x <= x1; x++) if (g.mat[row + x] === SAND) n++;
    }
    return n;
  }

  /** Reescribe el cuerpo en el grid según el ángulo actual. */
  private render(g: Grid): void {
    g.clearStructure(this.bbox.x0, this.bbox.y0, this.bbox.x1, this.bbox.y1, DYN);
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const rot = (lx: number, ly: number): [number, number] => [
      this.cx + lx * c - ly * s,
      this.cy + lx * s + ly * c,
    ];
    const [flx, fly] = rot(-this.halfW, 0);
    const [frx, fry] = rot(this.halfW, 0);
    // Vertedero: el muro del lado de descarga es mas bajo que el de atras.
    //
    // Sin el, la cubeta es un dispositivo por lotes en una linea continua:
    // mientras vuelca y vuelve no admite material, asi que siempre acaba
    // embalsando lo que viene por detras, por grande que se haga. Con el muro
    // rebajado el caudal de regimen rebosa solo y el vuelco pasa a ser un
    // evento que ocurre por encima de ese flujo, no un tapon.
    const backDepth = this.depth;
    const frontDepth = Math.max(1, this.depth - 2);
    const [wlx, wly] = rot(-this.halfW, -(this.side === -1 ? frontDepth : backDepth));
    const [wrx, wry] = rot(this.halfW, -(this.side === 1 ? frontDepth : backDepth));
    // Se declara hacia donde vuelca: el material que el piso levanta al girar
    // se aparta hacia el lado de descarga en vez de salir por detras.
    const push = this.phase === 'filling' ? 0 : this.side;
    g.line(flx, fly, frx, fry, DYN, 1, push);
    g.line(flx, fly, wlx, wly, DYN, 1, push);
    g.line(frx, fry, wrx, wry, DYN, 1, push);
    g.wakeRect(this.bbox.x0, this.bbox.y0, this.bbox.x1, this.bbox.y1);
  }

  draw({ ctx, s }: DrawCtx): void {
    const c = Math.cos(this.angle);
    const sn = Math.sin(this.angle);
    const pt = (lx: number, ly: number): [number, number] => [
      (this.cx + lx * c - ly * sn + 0.5) * s,
      (this.cy + lx * sn + ly * c + 0.5) * s,
    ];
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const backDepth = this.depth;
    const frontDepth = Math.max(1, this.depth - 2);
    const a = pt(-this.halfW, -(this.side === -1 ? frontDepth : backDepth));
    const b = pt(-this.halfW, 0);
    const d = pt(this.halfW, 0);
    const e = pt(this.halfW, -(this.side === 1 ? frontDepth : backDepth));
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.lineTo(e[0], e[1]);
    ctx.stroke();
    // Pivote
    ctx.beginPath();
    ctx.arc((this.cx + 0.5) * s, (this.cy + 0.5) * s, Math.max(1.5, s * 0.6), 0, TAU);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Rueda de paletas: gira con la arena que le cae encima y avienta lo que carga.
// ---------------------------------------------------------------------------
export class Wheel implements Machine {
  kind = 'wheel';
  bbox: Box;
  outputs: number[];
  private angle = 0;
  private omega = 0;

  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly r: number,
    readonly spokes: number,
    readonly dir: -1 | 1,
  ) {
    this.bbox = { x0: cx - r - 1, y0: cy - r - 1, x1: cx + r + 1, y1: cy + r + 1 };
    this.outputs = [cx - r - 2, cx + r + 2];
  }

  stamp(g: Grid): void {
    this.render(g);
  }

  tick(g: Grid, dt: number): void {
    // El par lo aporta la arena que hay dentro de la caja: más arena, más vuelta.
    let load = 0;
    const y0 = Math.max(0, this.cy - this.r);
    const y1 = Math.min(g.h - 1, this.cy);
    const x0 = Math.max(0, this.cx - this.r);
    const x1 = Math.min(g.w - 1, this.cx + this.r);
    for (let y = y0; y <= y1; y++) {
      const row = y * g.w;
      for (let x = x0; x <= x1; x++) if (g.mat[row + x] === SAND) load++;
    }
    const target = 0.5 + Math.min(load / 40, 1) * 2.6;
    this.omega += (target - this.omega) * Math.min(1, dt * 3);
    this.angle += this.dir * this.omega * dt;
    this.render(g);
  }

  private render(g: Grid): void {
    g.clearStructure(this.bbox.x0, this.bbox.y0, this.bbox.x1, this.bbox.y1, DYN);
    for (let k = 0; k < this.spokes; k++) {
      const a = this.angle + (k * TAU) / this.spokes;
      g.line(this.cx, this.cy, this.cx + Math.cos(a) * this.r, this.cy + Math.sin(a) * this.r, DYN);
    }
    g.wakeRect(this.bbox.x0, this.bbox.y0, this.bbox.x1, this.bbox.y1);
  }

  draw({ ctx, s }: DrawCtx): void {
    const cx = (this.cx + 0.5) * s;
    const cy = (this.cy + 0.5) * s;
    const r = (this.r + 0.5) * s;
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    // Los radios se trazan aqui porque el cuerpo ya no se pinta en el bitmap.
    ctx.beginPath();
    for (let k = 0; k < this.spokes; k++) {
      const a = this.angle + (k * TAU) / this.spokes;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Compuerta: abre y cierra en ciclo. Le da ritmo pulsado a la escena en vez de
// lluvia continua.
// ---------------------------------------------------------------------------
export class Trapdoor implements Machine {
  kind = 'trapdoor';
  bbox: Box;
  outputs: number[];
  private t: number;
  private open = false;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly len: number,
    readonly period: number,
    readonly openFrac: number,
    phase: number,
  ) {
    this.bbox = { x0: x, y0: y, x1: x + len - 1, y1: y };
    this.outputs = [x + (len >> 1)];
    this.t = phase * period;
  }

  stamp(g: Grid): void {
    g.fillRect(this.bbox.x0, this.y, this.bbox.x1, this.y, GATE);
  }

  tick(g: Grid, dt: number): void {
    this.t = (this.t + dt) % this.period;
    const shouldOpen = this.t > this.period * (1 - this.openFrac);
    if (shouldOpen === this.open) return;
    this.open = shouldOpen;
    if (shouldOpen) {
      for (let x = this.bbox.x0; x <= this.bbox.x1; x++) {
        if (g.inBounds(x, this.y) && g.mat[g.idx(x, this.y)] === GATE) {
          g.mat[g.idx(x, this.y)] = EMPTY;
        }
      }
    } else {
      g.fillRect(this.bbox.x0, this.y, this.bbox.x1, this.y, GATE);
    }
    g.wakeRect(this.bbox.x0, this.bbox.y0 - 2, this.bbox.x1, this.bbox.y1 + 2);
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    const y = Math.round(this.y * s) + 0.5;
    ctx.beginPath();
    if (this.open) {
      // Batientes colgando: la compuerta se lee abierta aunque no haya celdas.
      ctx.moveTo(this.bbox.x0 * s, y);
      ctx.lineTo(this.bbox.x0 * s, y + s * 3);
      ctx.moveTo((this.bbox.x1 + 1) * s, y);
      ctx.lineTo((this.bbox.x1 + 1) * s, y + s * 3);
    } else {
      ctx.moveTo(this.bbox.x0 * s, y);
      ctx.lineTo((this.bbox.x1 + 1) * s, y);
    }
    ctx.stroke();
  }
}

/** Fábricas con parámetros aleatorios, para que las use el generador de layout. */
export const build = {
  ledge: (r: Rng, x: number, y: number, w: number) => new Ledge(x, y, randInt(r, Math.max(6, w * 0.3) | 0, w)),
  wedge: (r: Rng, cx: number, y: number, w: number) =>
    new Wedge(cx, y, Math.max(3, Math.min(randInt(r, 4, 10), w >> 1))),
  belt: (r: Rng, x: number, y: number, w: number) =>
    new Belt(x, y, Math.max(10, w), r() < 0.5 ? -1 : 1, randFloat(r, 0.25, 0.75)),
  chute: (r: Rng, x: number, y: number, w: number) =>
    new Chute(x, y, Math.max(5, Math.min(w, randInt(r, 6, 16))), r() < 0.5 ? -1 : 1),
  funnel: (r: Rng, cx: number, y: number, w: number) => {
    const halfW = Math.max(5, Math.min(w >> 1, randInt(r, 6, 12)));
    return new Funnel(cx, y, halfW, randInt(r, 1, 2));
  },
  sieve: (_r: Rng, x: number, y: number, w: number) => new Sieve(x, y, Math.max(6, w)),
  tipper: (r: Rng, cx: number, y: number) => {
    const halfW = randInt(r, 4, 7);
    const depth = randInt(r, 3, 5);
    return new Tipper(cx, y, halfW, depth, Math.round(halfW * depth * 0.9), r() < 0.5 ? -1 : 1);
  },
  wheel: (r: Rng, cx: number, y: number) =>
    new Wheel(cx, y, randInt(r, 5, 9), randInt(r, 4, 6), r() < 0.5 ? -1 : 1),
  trapdoor: (r: Rng, x: number, y: number, w: number) =>
    new Trapdoor(x, y, Math.max(5, Math.min(w, 12)), randFloat(r, 4, 9), 0.28, r()),
};

// ---------------------------------------------------------------------------
// Muros laterales. Encierran la linea de un extremo a otro para que nada pueda
// escaparse por el costado, pase lo que pase con los montones.
// ---------------------------------------------------------------------------
export class SideWalls implements Machine {
  kind = 'walls';
  bbox: Box;
  outputs: number[] = [];

  constructor(
    readonly xLeft: number,
    readonly xRight: number,
    readonly y0: number,
    readonly y1: number,
  ) {
    this.bbox = { x0: xLeft, y0, x1: xRight, y1 };
  }

  stamp(g: Grid): void {
    for (let y = this.y0; y <= this.y1; y++) {
      g.stamp(this.xLeft, y, LEDGE);
      g.stamp(this.xRight, y, LEDGE);
    }
  }

  draw({ ctx, s }: DrawCtx): void {
    ctx.strokeStyle = THEME.frame;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of [this.xLeft + 1, this.xRight]) {
      const px = Math.round(x * s) + 0.5;
      ctx.moveTo(px, this.y0 * s);
      ctx.lineTo(px, (this.y1 + 1) * s);
    }
    ctx.stroke();
  }
}
