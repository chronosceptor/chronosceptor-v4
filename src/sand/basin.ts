import type { Grid } from './grid';
import { EMPTY, GATE, SAND, SINK, WALL } from './materials';
import { THEME, averagePacked, rgbCss, type Rgb } from './palette';
import type { DrawCtx } from './machines';

/** Filas del borde inferior reservadas a la franja de archivo. */
const ARCHIVE_H = 3;
const SINK_H = 1;
/** Altura del pozo de drenaje: lo que se ve caer antes de que la arena se consuma. */
const SHAFT_H = 7;

const MAX_BANDS = 240;
const STORAGE_KEY = 'fabrica-de-arena:archivo';

export interface ArchiveBand {
  color: Rgb;
  /** El drenaje manual deja banda de altura completa; el automático, media. */
  full: boolean;
}

/**
 * La cuenca de mezcla: el tercio inferior donde se acumula todo.
 *
 * Nunca se limpia sola mientras hay espacio, y por eso los estratos funcionan
 * como línea de tiempo de la sesión de escucha. Al llenarse drena, y cada
 * drenaje deja una banda en la franja permanente del borde inferior.
 */
export class Basin {
  readonly floorY: number;
  readonly topY: number;
  readonly sinkY: number;
  readonly archiveY: number;

  fill = 0;
  averageColor: Rgb = [40, 40, 44];
  bands: ArchiveBand[] = [];

  private draining = false;
  private drainTime = 0;
  private countdown = 0;
  private readonly depth: number;
  /** Altura de arena por columna. Preasignado: measure() corre 8 veces/s. */
  private readonly heights: Int32Array;
  private leverPull = 0;
  private hover = false;

  constructor(readonly g: Grid, depth: number) {
    this.archiveY = g.h - ARCHIVE_H;
    this.sinkY = this.archiveY - SINK_H;
    this.floorY = this.sinkY - SHAFT_H;
    this.topY = Math.max(1, this.floorY - depth);
    this.depth = Math.max(1, this.floorY - this.topY);
    this.heights = new Int32Array(g.w);
    this.bands = loadBands();
  }

  stamp(): void {
    const { g } = this;
    g.fillRect(0, this.floorY, g.w - 1, this.floorY, GATE);
    g.fillRect(0, this.sinkY, g.w - 1, this.sinkY, SINK);
    g.fillRect(0, this.archiveY, g.w - 1, g.h - 1, WALL);
  }

  tick(dt: number): void {
    this.countdown -= dt;
    if (this.countdown <= 0) {
      this.countdown = 0.12;
      this.measure();
    }

    if (this.draining) {
      this.drainTime += dt;
      // Se cierra cuando ya casi no queda nada, con un tope duro por si algo
      // se atora y el piso se quedaría abierto para siempre.
      if (this.fill < 0.02 || this.drainTime > 22) this.closeFloor();
    } else if (this.fill >= 1) {
      this.drain(false);
    }

    if (this.leverPull > 0 && !this.draining) {
      this.leverPull = Math.max(0, this.leverPull - dt * 2.2);
    }
  }

  /**
   * Llenado y color promedio de lo que hay dentro.
   *
   * El llenado se mide por la altura de la superficie, no por volumen: la arena
   * se apila en conos, así que por volumen la cuenca marcaría 55% justo cuando
   * los picos ya se salen por arriba y empiezan a sepultar las máquinas. Se usa
   * el percentil 80 de las columnas para que un solo pico no dispare el aviso
   * pero un nivel general alto sí.
   */
  private measure(): void {
    const { g, heights } = this;
    heights.fill(0);
    const samples: number[] = [];

    for (let y = this.topY; y < this.floorY; y++) {
      const row = y * g.w;
      for (let x = 0; x < g.w; x++) {
        if (g.mat[row + x] !== SAND) continue;
        // Primera fila con arena de esta columna: es la superficie.
        if (heights[x] === 0) heights[x] = this.floorY - y;
        // Muestreo disperso: para el color promedio no hace falta leerlo todo.
        if ((row + x) % 53 === 0) samples.push(g.col[row + x]!);
      }
    }

    const sorted = Array.from(heights).sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!;
    this.fill = Math.min(1, p90 / this.depth);
    if (samples.length > 0) this.averageColor = averagePacked(samples);
  }

  get isDraining(): boolean {
    return this.draining;
  }

  /** true cuando el medidor está por encima del 90% y conviene jalar la palanca. */
  get isWarning(): boolean {
    return !this.draining && this.fill > 0.9;
  }

  drain(manual: boolean): void {
    if (this.draining) return;
    this.draining = true;
    this.drainTime = 0;
    if (this.fill > 0.05) {
      this.bands.push({ color: this.averageColor, full: manual });
      if (this.bands.length > MAX_BANDS) this.bands.shift();
      saveBands(this.bands);
    }
    this.openGates();
  }

  /**
   * Abre unas cuantas troneras en vez del piso entero.
   *
   * Con el piso completo abierto la cuenca se vacía en dos segundos y el
   * drenaje pasa desapercibido. Por ranuras, los estratos se hunden en embudo
   * durante varios segundos y el vaciado se ve, que es de lo que se trataba.
   */
  private openGates(): void {
    const { g } = this;
    const slots = 5;
    const slotW = Math.max(3, Math.round((g.w * 0.28) / slots));
    const stride = g.w / slots;
    for (let k = 0; k < slots; k++) {
      const start = Math.round(stride * (k + 0.5) - slotW / 2);
      for (let x = start; x < start + slotW; x++) {
        if (x < 0 || x >= g.w) continue;
        const i = g.idx(x, this.floorY);
        if (g.mat[i] === GATE) g.mat[i] = EMPTY;
      }
    }
    g.wakeRect(0, this.floorY - 3, g.w - 1, this.floorY + 3);
  }

  private closeFloor(): void {
    this.draining = false;
    this.g.fillRect(0, this.floorY, this.g.w - 1, this.floorY, GATE);
    this.g.wakeRect(0, this.floorY - 2, this.g.w - 1, this.floorY + 2);
  }

  pullLever(): void {
    this.leverPull = 1;
    this.drain(true);
  }

  // --- Palanca y medidor, en coordenadas de pantalla ----------------------

  private leverRect(s: number) {
    const w = Math.max(22, s * 6);
    const h = Math.max(52, s * 14);
    // Contra el muro izquierdo, alineada con el marco de la escena.
    return { x: s * 3.5, y: (this.topY + 3) * s, w, h };
  }

  /** ¿El puntero cae sobre la palanca? Se prueba antes que verter o excavar. */
  leverHit(px: number, py: number, s: number): boolean {
    const r = this.leverRect(s);
    return px >= r.x - 8 && px <= r.x + r.w + 8 && py >= r.y - 8 && py <= r.y + r.h + 8;
  }

  setHover(on: boolean): void {
    this.hover = on;
  }

  draw({ ctx, s }: DrawCtx): void {
    const g = this.g;
    const top = this.topY * s;
    const floor = this.floorY * s;

    // Marco de la cuenca
    ctx.strokeStyle = THEME.frame;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(top) + 0.5);
    ctx.lineTo(g.w * s, Math.round(top) + 0.5);
    ctx.stroke();

    this.drawGauge(ctx, s, top, floor);
    this.drawLever(ctx, s);
  }

  /**
   * Medidor de nivel, contra el muro derecho.
   *
   * Con escala de marcas y no solo una barra: unas pocas divisiones bastan para
   * que se lea como un instrumento y no como un elemento decorativo, y para que
   * el aviso del 90% tenga contra que compararse.
   */
  private drawGauge(ctx: CanvasRenderingContext2D, s: number, top: number, floor: number): void {
    const w = Math.max(6, s * 2.2);
    const x = Math.round(this.g.w * s - w - s * 3.5);
    const y = Math.round(top + s * 3);
    const h = Math.round(floor - y - s * 3);
    if (h < 12) return;

    ctx.save();
    const warn = this.isWarning;
    const pulse = warn ? 0.5 + 0.5 * Math.sin(performance.now() / 150) : 1;

    // Relleno con el color promedio de la cuenca: el medidor resume la sesion.
    const fh = Math.round(h * this.fill);
    if (fh > 1) {
      ctx.fillStyle = rgbCss(this.averageColor);
      ctx.fillRect(x, y + h - fh, w, fh);
    }

    // Caja
    ctx.strokeStyle = warn ? `rgba(201,123,74,${pulse})` : THEME.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    // Divisiones: cuartos hacia fuera, para no ensuciar la columna del relleno.
    ctx.strokeStyle = THEME.structureLine;
    ctx.beginPath();
    for (let k = 1; k < 4; k++) {
      const ty = Math.round(y + (h * k) / 4) + 0.5;
      ctx.moveTo(x + w + 1, ty);
      ctx.lineTo(x + w + 1 + (k === 2 ? 7 : 4), ty);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Palanca de vaciado, contra el muro izquierdo.
   *
   * Lleva placa, guia y maneta porque es el unico elemento de la escena que se
   * puede accionar: sin algo que se lea como mando, nadie descubre que la
   * cuenca se puede vaciar a voluntad.
   */
  private drawLever(ctx: CanvasRenderingContext2D, s: number): void {
    const r = this.leverRect(s);
    const active = this.draining || this.leverPull > 0;
    const travel = active ? 1 : this.hover ? 0.22 : 0;
    const cx = Math.round(r.x + r.w / 2) + 0.5;
    const top = Math.round(r.y + 8);
    const bottom = Math.round(r.y + r.h - 8);
    const knobY = Math.round(top + (bottom - top) * travel) + 0.5;

    ctx.save();
    ctx.lineWidth = 1;

    // Placa: dos filetes horizontales que fijan la guia al muro.
    ctx.strokeStyle = THEME.structureLine;
    ctx.beginPath();
    ctx.moveTo(r.x, top - 0.5);
    ctx.lineTo(r.x + r.w, top - 0.5);
    ctx.moveTo(r.x, bottom + 0.5);
    ctx.lineTo(r.x + r.w, bottom + 0.5);
    ctx.stroke();

    // Guia
    ctx.strokeStyle = this.isWarning
      ? `rgba(201,123,74,${0.5 + 0.5 * Math.sin(performance.now() / 150)})`
      : this.hover || active
        ? THEME.inkBright
        : THEME.frame;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, bottom);
    ctx.stroke();

    // Maneta
    const kw = r.w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - kw, knobY);
    ctx.lineTo(cx + kw, knobY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, knobY, Math.max(2.5, s * 0.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Pinta la franja permanente del borde inferior. */
  drawArchive({ ctx, s }: DrawCtx): void {
    const g = this.g;
    const y = this.archiveY * s;
    const h = ARCHIVE_H * s;
    ctx.fillStyle = '#141416';
    ctx.fillRect(0, y, g.w * s, h);
    if (this.bands.length === 0) return;

    // Ancho fijo por banda, creciendo desde la izquierda. Repartir el ancho
    // total entre las bandas haría que un solo drenaje pintara toda la franja,
    // que se lee como decoración y no como registro.
    const bw = Math.max(3, s * 1.6);
    const maxVisible = Math.floor((g.w * s) / bw);
    const visible = this.bands.slice(-maxVisible);
    for (let i = 0; i < visible.length; i++) {
      const b = visible[i]!;
      ctx.fillStyle = rgbCss(b.color);
      const bh = b.full ? h : h * 0.5;
      ctx.fillRect(i * bw, y + (h - bh), bw - 1, bh);
    }
  }
}

function loadBands(): ArchiveBand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is ArchiveBand => !!b && Array.isArray(b.color) && b.color.length === 3,
    );
  } catch {
    // Ventana privada, almacenamiento bloqueado o JSON corrupto: se arranca en blanco.
    return [];
  }
}

function saveBands(bands: ArchiveBand[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bands));
  } catch {
    /* sin persistencia, la franja sigue funcionando en memoria */
  }
}
