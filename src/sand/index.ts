import { buildScene, profileFor, type Scene } from './layout';
import { step } from './physics';
import { Renderer } from './render';
import { Input } from './input';
import { DEFAULT_PALETTE, grainColor, type Palette } from './palette';
import { SAND } from './materials';
import { mulberry32 } from './rng';

export interface BootOptions {
  sandCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  seed?: number;
  debug?: boolean;
}

export interface SandApp {
  destroy(): void;
  /** Cambia la paleta con una pausa de "cambio de turno" de por medio. */
  setPalette(p: Palette): void;
  readonly palette: Palette;
  readonly seed: number;
  /** Estado interno, para depurar desde la consola. */
  inspect(): {
    fill: number;
    draining: boolean;
    sand: number;
    basinSand: number;
    floorOpen: number;
    bands: number;
  };
  /** Mapa grueso de ocupacion, para ver por donde va (y por donde se escapa) la arena. */
  probe(): { cols: number[]; rows: number[]; w: number; h: number };
  /** Vuelca los materiales de una region como texto. Depuracion pura. */
  dump(x0: number, y0: number, w: number, h: number): string[];
}

const SIM_HZ = 60;
const SIM_DT = 1 / SIM_HZ;
const BRUSH_RADIUS = 5;
const POUR_PER_STEP = 16;
/** Pausa entre canciones antes de que empiece a caer la paleta nueva. */
const SHIFT_PAUSE = 1.4;

export function boot(opts: BootOptions): SandApp {
  const { sandCanvas, fxCanvas } = opts;
  const container = fxCanvas.parentElement ?? document.body;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let seed = opts.seed ?? (Math.random() * 0x7fffffff) | 0;
  let palette: Palette = DEFAULT_PALETTE;
  let pending: Palette | null = null;
  let shift = 0;

  let scene!: Scene;
  let renderer!: Renderer;
  let input: Input | null = null;
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  let raf = 0;
  let last = 0;
  let acc = 0;
  let frame = 0;
  let slowFrames = 0;
  /** Baja a 30 Hz de simulación si el equipo no da los 60. */
  let simDivider = 1;
  let disposed = false;

  // --- Construcción y reconstrucción -------------------------------------

  function rebuild(): void {
    const cssW = container.clientWidth || window.innerWidth;
    const cssH = container.clientHeight || window.innerHeight;
    const profile = profileFor(cssW, cssH);
    const gw = Math.max(80, Math.floor(cssW / profile.cell));
    const gh = Math.max(80, Math.floor(cssH / profile.cell));

    input?.destroy();
    scene = buildScene(gw, gh, seed, profile);
    renderer = new Renderer(sandCanvas, fxCanvas, scene.grid);
    renderer.resize(cssW, cssH);

    input = new Input(fxCanvas, {
      isLever: (x, y) => scene.basin.leverHit(x, y, renderer.s),
      onLever: () => scene.basin.pullLever(),
      hasSand: (x, y) => hasSandNear(x, y),
    });

    if (reducedMotion) settleAndFreeze();
  }

  function hasSandNear(px: number, py: number): boolean {
    const { grid } = scene;
    const cx = Math.floor(px / renderer.s);
    const cy = Math.floor(py / renderer.s);
    const r = BRUSH_RADIUS;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (grid.inBounds(x, y) && grid.mat[grid.idx(x, y)] === SAND) return true;
      }
    }
    return false;
  }

  // --- Bucle --------------------------------------------------------------

  function simulate(dt: number): void {
    const { grid, machines, basin, hopper, profile } = scene;

    for (const m of machines) m.tick?.(grid, dt);
    basin.tick(dt);

    if (shift > 0) {
      shift -= dt;
      if (shift <= 0 && pending) {
        palette = pending;
        pending = null;
        // Cancion nueva, lote nuevo: el color arranca de inmediato en vez de
        // esperar al siguiente giro del temporizador.
        hopper.newBatch();
      }
    } else {
      const budget = Math.max(0, profile.maxSand - grid.sandCount);
      hopper.tick(grid, dt, palette, rand, budget);
    }

    applyBrush();
    step(grid, rand, frame++);
  }

  function applyBrush(): void {
    if (!input?.active) return;
    const { grid } = scene;
    const s = renderer.s;
    const cx = Math.floor(input.x / s);
    const cy = Math.floor(input.y / s);
    const r = BRUSH_RADIUS;

    if (input.mode === 'pour') {
      for (let k = 0; k < POUR_PER_STEP; k++) {
        // Punto uniforme dentro del disco.
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * r;
        grid.addSand(cx + Math.round(Math.cos(a) * d), cy + Math.round(Math.sin(a) * d), grainColor(palette, rand));
      }
      return;
    }

    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (!grid.inBounds(x, y)) continue;
        const i = grid.idx(x, y);
        // Borrado parcial: el hueco se abre de forma progresiva en vez de golpe.
        if (grid.mat[i] === SAND && rand() < 0.5) grid.removeAt(i);
      }
    }
  }

  function render(): void {
    const { machines, basin, hopper } = scene;
    renderer.paintSand();
    const d = renderer.beginFx();
    renderer.drawHopper(d, hopper.x);
    for (const m of machines) m.draw?.(d);
    basin.setHover(input?.leverHover ?? false);
    basin.draw(d);
    basin.drawArchive(d);
    if (input?.present) {
      renderer.drawCursor(d, input.x, input.y, BRUSH_RADIUS, input.active && input.mode === 'dig');
    }
    if (opts.debug) drawDebug(d.ctx);
  }

  function drawDebug(ctx: CanvasRenderingContext2D): void {
    const { grid, basin, machines } = scene;
    let awake = 0;
    for (let i = 0; i < grid.size; i++) awake += grid.awake[i]!;
    const lines = [
      `seed ${scene.seed}  ${scene.profile.name}  ${grid.w}x${grid.h}`,
      `fps ${fps.toFixed(0)}  sim ${SIM_HZ / simDivider}Hz`,
      `arena ${grid.sandCount}  despiertas ${awake}`,
      `cuenca ${(basin.fill * 100).toFixed(0)}%  ${basin.isDraining ? 'DRENANDO' : ''}`,
      `máquinas ${machines.length}  bandas ${basin.bands.length}`,
    ];
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(11,11,12,0.8)';
    ctx.fillRect(8, 8, 230, lines.length * 15 + 10);
    ctx.fillStyle = '#A8A8B4';
    lines.forEach((l, i) => ctx.fillText(l, 16, 26 + i * 15));
    ctx.restore();
  }

  let fps = 60;

  function loop(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const t0 = performance.now();

    if (last === 0) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // pestaña que vuelve del fondo
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.08;

    acc += dt;
    let steps = 0;
    const budget = SIM_DT * simDivider;
    while (acc >= budget && steps < 3) {
      simulate(budget);
      acc -= budget;
      steps++;
    }
    if (steps === 3) acc = 0; // no acumular deuda que nunca se paga

    render();

    // Si el equipo no da los 60 Hz de simulación, se baja a 30 antes de que
    // la animación empiece a dar tirones.
    const cost = performance.now() - t0;
    if (cost > 20) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 30 && simDivider === 1) {
      simDivider = 2;
      slowFrames = 0;
    }
  }

  /**
   * Con `prefers-reduced-motion` se muestra una composición ya asentada, quieta.
   *
   * El límite es de tiempo y no de iteraciones: en un equipo lento un número
   * fijo de pasos bloquearía el hilo principal varios segundos, y en uno rápido
   * se quedaría corto y la escena saldría medio vacía.
   */
  function settleAndFreeze(): void {
    const { grid, machines, basin, hopper, profile } = scene;
    const deadline = performance.now() + 450;
    let i = 0;
    while (i < 4000 && performance.now() < deadline) {
      hopper.tick(grid, SIM_DT, palette, rand, Math.max(0, profile.maxSand - grid.sandCount));
      for (const m of machines) m.tick?.(grid, SIM_DT);
      basin.tick(SIM_DT);
      step(grid, rand, i++);
    }
    render();
  }

  // --- Ciclo de vida ------------------------------------------------------

  let resizeTimer = 0;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // Escena nueva en cada cambio de tamaño: es más honesto que estirar un
      // grid pensado para otra proporción.
      seed = (Math.random() * 0x7fffffff) | 0;
      rebuild();
    }, 250);
  };

  rebuild();
  window.addEventListener('resize', onResize);
  if (!reducedMotion) raf = requestAnimationFrame(loop);

  return {
    destroy(): void {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      input?.destroy();
    },
    setPalette(p: Palette): void {
      if (p.id === palette.id && !pending) return;
      pending = p;
      shift = SHIFT_PAUSE;
    },
    get palette(): Palette {
      return pending ?? palette;
    },
    get seed(): number {
      return scene.seed;
    },
    dump(x0: number, y0: number, w: number, h: number) {
      const { grid } = scene;
      const glyph = ['.', 'o', '#', '<', '>', '\\', '/', ':', '=', '@', 'v', '_'];
      const lines: string[] = [];
      for (let y = y0; y < y0 + h && y < grid.h; y++) {
        let line = String(y).padStart(4) + ' ';
        for (let x = x0; x < x0 + w && x < grid.w; x++) {
          line += glyph[grid.mat[y * grid.w + x]!] ?? '?';
        }
        lines.push(line);
      }
      return lines;
    },
    probe() {
      const { grid } = scene;
      const COLS = 24;
      const ROWS = 24;
      const cols = new Array(COLS).fill(0);
      const rows = new Array(ROWS).fill(0);
      for (let y = 0; y < grid.h; y++) {
        const row = y * grid.w;
        for (let x = 0; x < grid.w; x++) {
          if (grid.mat[row + x] !== SAND) continue;
          cols[Math.min(COLS - 1, ((x / grid.w) * COLS) | 0)]++;
          rows[Math.min(ROWS - 1, ((y / grid.h) * ROWS) | 0)]++;
        }
      }
      return { cols, rows, w: grid.w, h: grid.h };
    },
    inspect() {
      const { grid, basin } = scene;
      let basinSand = 0;
      for (let y = basin.topY; y < basin.floorY; y++) {
        const row = y * grid.w;
        for (let x = 0; x < grid.w; x++) if (grid.mat[row + x] === SAND) basinSand++;
      }
      let floorOpen = 0;
      for (let x = 0; x < grid.w; x++) {
        if (grid.mat[grid.idx(x, basin.floorY)] !== 8 /* GATE */) floorOpen++;
      }
      return {
        fill: basin.fill,
        draining: basin.isDraining,
        sand: grid.sandCount,
        basinSand,
        floorOpen,
        bands: basin.bands.length,
      };
    },
  };
}

export type { Palette } from './palette';
