import { EMPTY, SAND, SOLID } from './materials';

/**
 * El estado del mundo. Todo son arrays tipados planos indexados por `y * w + x`.
 *
 * `col` guarda el color RGBA ya resuelto de cada grano, no un índice de paleta.
 * Esa decisión es la que permite que la cuenca funcione como línea de tiempo:
 * cuando cambia la canción y con ella la paleta, los granos viejos conservan
 * su color en vez de remapearse a los nuevos.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly size: number;

  readonly mat: Uint8Array;
  readonly col: Uint32Array;
  /** Velocidad de caída en celdas/frame; da aceleración en vez de goteo constante. */
  readonly vel: Uint8Array;
  /** 0 = el grano está asentado y se salta. Es lo que hace barata una cuenca llena. */
  readonly awake: Uint8Array;
  /** Evita mover el mismo grano dos veces en un frame. */
  readonly moved: Uint8Array;
  /**
   * Velocidad de la banda por celda, 0-255 (se lee como probabilidad /255).
   * Vive en el grid y no en la máquina para que la física la consulte con un
   * solo acceso de array, y así cada banda puede correr a su propio ritmo.
   */
  readonly beltSpeed: Uint8Array;

  sandCount = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.size = w * h;
    this.mat = new Uint8Array(this.size);
    this.col = new Uint32Array(this.size);
    this.vel = new Uint8Array(this.size);
    this.awake = new Uint8Array(this.size);
    this.moved = new Uint8Array(this.size);
    this.beltSpeed = new Uint8Array(this.size);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  at(x: number, y: number): number {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return SOLID_OUT_OF_BOUNDS;
    return this.mat[y * this.w + x]!;
  }

  /** Despierta el vecindario 3x3. Cualquier cambio en una celda debe llamar a esto. */
  wake(x: number, y: number): void {
    const { w, h, awake } = this;
    const x0 = x > 0 ? x - 1 : 0;
    const x1 = x < w - 1 ? x + 1 : w - 1;
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < h - 1 ? y + 1 : h - 1;
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * w;
      for (let xx = x0; xx <= x1; xx++) awake[row + xx] = 1;
    }
  }

  /** Despierta un rectángulo entero. Lo usan las máquinas que reescriben su cuerpo. */
  wakeRect(x0: number, y0: number, x1: number, y1: number): void {
    const { w, h, awake } = this;
    const ax = Math.max(0, x0 - 1);
    const bx = Math.min(w - 1, x1 + 1);
    const ay = Math.max(0, y0 - 1);
    const by = Math.min(h - 1, y1 + 1);
    for (let y = ay; y <= by; y++) {
      const row = y * w;
      for (let x = ax; x <= bx; x++) awake[row + x] = 1;
    }
  }

  addSand(x: number, y: number, color: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    if (this.mat[i] !== EMPTY) return false;
    this.mat[i] = SAND;
    this.col[i] = color;
    this.vel[i] = 0;
    this.sandCount++;
    this.wake(x, y);
    return true;
  }

  removeAt(i: number): void {
    if (this.mat[i] === SAND) this.sandCount--;
    this.mat[i] = EMPTY;
    this.col[i] = 0;
    this.vel[i] = 0;
    this.wake(i % this.w, (i / this.w) | 0);
  }

  /**
   * Escribe estructura. Si tapa un grano, intenta empujarlo a un hueco cercano
   * antes de borrarlo: sin esto, una rueda de paletas se come la arena que la
   * mueve y el nivel de arena de la escena se desangra poco a poco.
   */
  /**
   * `pushDir` (-1, 0, 1) es hacia donde se mueve la pieza que estampa. El grano
   * desplazado se aparta preferentemente en ese sentido.
   */
  stamp(x: number, y: number, material: number, pushDir = 0): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    if (this.mat[i] === SAND) this.displaceSand(x, y, pushDir);
    this.mat[i] = material;
    this.wake(x, y);
  }

  /**
   * Aparta un grano que ha quedado bajo una pieza en movimiento.
   *
   * El orden en que se prueban los huecos importa mucho mas de lo que parece:
   * una lista fija que mire a la izquierda antes que a la derecha hace que toda
   * pieza que barra material lo expulse siempre hacia el mismo lado. En un
   * balancin eso significa que al volcar casi todo sale por detras en vez de
   * por el lado hacia el que esta volcando.
   *
   * Con `pushDir` se aparta hacia donde va la pieza; sin el, el sentido se
   * alterna segun la paridad de la celda, que no introduce sesgo y mantiene el
   * determinismo de la semilla.
   */
  private displaceSand(x: number, y: number, pushDir = 0): void {
    const i = this.idx(x, y);
    const color = this.col[i]!;
    const d = pushDir !== 0 ? pushDir : ((x ^ y) & 1) === 0 ? 1 : -1;
    const offsets: Array<readonly [number, number]> = [
      [d, -1], [0, -1], [-d, -1], [d, 0], [-d, 0], [d * 2, -1], [0, -2], [-d * 2, -1],
    ];
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = ny * this.w + nx;
      if (this.mat[ni] === EMPTY) {
        this.mat[ni] = SAND;
        this.col[ni] = color;
        this.vel[ni] = 0;
        this.wake(nx, ny);
        this.mat[i] = EMPTY;
        return; // sandCount no cambia: el grano se movió, no se destruyó
      }
    }
    // No cabía en ningún lado: ahora sí se pierde.
    this.mat[i] = EMPTY;
    this.col[i] = 0;
    this.sandCount--;
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, material: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.stamp(x, y, material);
  }

  /** Bresenham, para rampas y aspas en cualquier ángulo. */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    material: number,
    thickness = 1,
    pushDir = 0,
  ): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let t = 0; t < thickness; t++) this.stamp(x, y + t, material, pushDir);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Borra estructura (no arena) en un rectángulo. Para máquinas con movimiento. */
  clearStructure(x0: number, y0: number, x1: number, y1: number, material: number): void {
    const ax = Math.max(0, x0);
    const bx = Math.min(this.w - 1, x1);
    const ay = Math.max(0, y0);
    const by = Math.min(this.h - 1, y1);
    for (let y = ay; y <= by; y++) {
      const row = y * this.w;
      for (let x = ax; x <= bx; x++) {
        if (this.mat[row + x] === material) this.mat[row + x] = EMPTY;
      }
    }
  }
}

/** Fuera del grid se trata como sólido: la arena no se escapa por los bordes. */
export const SOLID_OUT_OF_BOUNDS = 2; // WALL

export const isSolid = (m: number): boolean => SOLID[m] === 1;
