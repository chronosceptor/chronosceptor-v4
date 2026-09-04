import type { Grid } from './grid';
import { SOLID } from './materials';

/**
 * Arena en vuelo balistico.
 *
 * `Grid.vel` es un Uint8Array de caida vertical: no sabe representar un grano
 * que sale disparado en diagonal. Meter velocidad vectorial en el grid
 * engordaria el bucle caliente del automata —que hoy despacha 90.000 granos en
 * 1,4 ms— a cambio de un efecto que dura un segundo.
 *
 * Asi que la arena lanzada sale del automata y vive aparte: arrays paralelos de
 * posicion y velocidad en coma flotante, integrados con gravedad, que vuelven a
 * ser granos normales en cuanto chocan con algo. Mientras vuelan no son celdas
 * del grid, solo pixeles que el render superpone.
 */

/** Aceleracion, en celdas/s². */
const GRAVITY = 630;
/**
 * Rapidez maxima, en celdas/s.
 *
 * El automata cae como mucho a MAX_VEL = 5 celdas/frame (300 celdas/s), y el
 * primer valor que se probo aqui rondaba esa cifra para que la arena en vuelo
 * pareciera del mismo material. Con una explosion es al reves: si el tope
 * recorta la energia de la bomba, sube la potencia y no pasa nada en pantalla,
 * porque el limite se la come entera. Una explosion tiene que verse mas rapida
 * que la caida libre; para eso es una explosion.
 */
const MAX_SPEED = 630;

export class Ejecta {
  /** Posicion en celdas, en coma flotante. */
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  /** Velocidad en celdas/s. */
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly col: Uint32Array;
  private n = 0;
  /** Granos que no encontraron hueco al aterrizar. Diagnostico de fugas. */
  lost = 0;

  /**
   * `cap` es el techo de granos en vuelo a la vez, y por tanto el techo real de
   * lo que una explosion puede levantar: lo que no cabe se queda en el suelo.
   * Una bomba de radio 42 barre unas 5.500 celdas, asi que por debajo de eso el
   * crater sale mordido por un lado.
   */
  constructor(readonly cap = 8000) {
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.col = new Uint32Array(cap);
  }

  get count(): number {
    return this.n;
  }

  /** Cuantas particulas mas caben. La explosion se limita a esto. */
  get room(): number {
    return this.cap - this.n;
  }

  clear(): void {
    this.n = 0;
  }

  /**
   * Lanza un grano. Devuelve false si el buffer esta lleno.
   *
   * Quien llama es responsable de haber sacado ya el grano del grid, y de NO
   * sacarlo si esto devuelve false: es lo que mantiene la masa constante.
   */
  launch(x: number, y: number, vx: number, vy: number, color: number): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.col[i] = color;
    return true;
  }

  /**
   * Integra un paso y deposita lo que haya chocado.
   *
   * El recorrido es celda a celda, no un salto directo al destino: a 200
   * celdas/s una particula cruza tres o cuatro celdas por frame y saltando de
   * golpe atravesaria paredes finas —justo las que dibuja el usuario— como si
   * no estuvieran.
   */
  step(g: Grid, dt: number): void {
    const { w, h, mat } = g;

    for (let i = 0; i < this.n; ) {
      let vx = this.vx[i]!;
      let vy = this.vy[i]! + GRAVITY * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        vx *= k;
        vy *= k;
      }

      const x0 = this.px[i]!;
      const y0 = this.py[i]!;
      const dx = vx * dt;
      const dy = vy * dt;

      // Un muestreo por celda recorrida, minimo uno.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      let lx = x0;
      let ly = y0;
      let hit = false;

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const nx = x0 + dx * t;
        const ny = y0 + dy * t;
        const cx = Math.floor(nx);
        const cy = Math.floor(ny);
        // Fuera del mundo cuenta como solido: la arena no se escapa por los
        // bordes, igual que en el automata.
        if (cx < 0 || cx >= w || cy < 0 || cy >= h || SOLID[mat[cy * w + cx]!] === 1) {
          hit = true;
          break;
        }
        lx = nx;
        ly = ny;
      }

      if (hit) {
        this.land(g, lx, ly, this.col[i]!);
        this.swapRemove(i);
        continue;
      }

      this.px[i] = lx;
      this.py[i] = ly;
      this.vx[i] = vx;
      this.vy[i] = vy;
      i++;
    }
  }

  /**
   * Vuelve a ser un grano del automata.
   *
   * La busqueda en anillos no es paranoia: la mayoria de las particulas nacen
   * de una pieza en movimiento que barrio un grano dentro de un monton
   * compacto, asi que su celda de origen y todo lo que la rodea estan ocupados.
   * Mirando solo el vecindario inmediato se perdian casi todas — 432 granos en
   * una prueba de diez segundos. El hueco existe, pero esta varias celdas mas
   * alla, en la cavidad que la propia pieza ha abierto.
   *
   * Se recorre de arriba hacia abajo para que el grano reaparezca por encima
   * del monton y caiga, en vez de materializarse debajo.
   */
  private land(g: Grid, x: number, y: number, color: number): void {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (g.addSand(cx, cy, color)) return;

    for (let r = 1; r <= LAND_SEARCH; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // Solo el borde del anillo: el interior ya se probo en la vuelta anterior.
          if (dx > -r && dx < r && dy > -r && dy < r) continue;
          if (g.addSand(cx + dx, cy + dy, color)) return;
        }
      }
    }

    // Ultimo recurso: subir por la columna hasta asomar. Lo necesitan sobre
    // todo los granos que una explosion lanza hacia abajo contra el fondo, que
    // aterrizan en la zona mas compacta de la escena y no tienen ningun hueco a
    // seis celdas a la redonda. En un monton siempre hay aire por encima, y un
    // grano que reaparece en la superficie se nota muchisimo menos que un grano
    // que desaparece.
    for (let y = cy - LAND_SEARCH - 1; y >= 0 && cy - y <= LAND_CLIMB; y--) {
      if (g.addSand(cx, y, color)) return;
    }
    this.lost++;
  }

  private swapRemove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.px[i] = this.px[last]!;
    this.py[i] = this.py[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.col[i] = this.col[last]!;
  }

  /**
   * Superpone las particulas en el bitmap de arena.
   *
   * Van al mismo buffer que los granos asentados, no a una capa aparte: asi son
   * del mismo material a la vista y no cuestan ni un drawImage.
   */
  paint(buf: Uint32Array, w: number, h: number): void {
    for (let i = 0; i < this.n; i++) {
      const x = this.px[i]! | 0;
      const y = this.py[i]! | 0;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      buf[y * w + x] = this.col[i]!;
    }
  }
}

/**
 * Radio maximo, en celdas, al que se busca hueco para aterrizar.
 *
 * Solo se recorre en el camino de fallo, que es raro, y aun en el peor caso son
 * unos 170 accesos a un array plano.
 */
const LAND_SEARCH = 9;
/** Celdas que se sube por la columna como ultimo recurso antes de darlo por perdido. */
const LAND_CLIMB = 90;
