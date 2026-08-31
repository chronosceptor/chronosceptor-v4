import { createWorld, clearWorld, transferDrawing, type World } from './world';
import { hasWallNear, paintStroke, type Point } from './draw';
import { step } from './physics';
import { Renderer } from './render';
import { Input } from './input';
import { DEFAULT_PALETTE, type Palette } from './palette';
import { mulberry32 } from './rng';

export interface BootOptions {
  sandCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  debug?: boolean;
  /** Se llama en el primer trazo, para retirar la pista inicial. */
  onFirstStroke?: () => void;
}

export interface SandApp {
  destroy(): void;
  /** Cambia la paleta con una pausa de "cambio de turno" de por medio. */
  setPalette(p: Palette): void;
  /** Vacia el lienzo. */
  clear(): void;
  readonly palette: Palette;
  inspect(): { sand: number; walls: number; fps: number; grid: string };
  /** Vuelca los materiales de una region como texto. Depuracion pura. */
  dump(x0: number, y0: number, w: number, h: number): string[];
}

const SIM_HZ = 60;
const SIM_DT = 1 / SIM_HZ;
/** Pausa entre canciones antes de que empiece a caer la paleta nueva. */
const SHIFT_PAUSE = 1.2;

export function boot(opts: BootOptions): SandApp {
  const { sandCanvas, fxCanvas } = opts;
  const container = fxCanvas.parentElement ?? document.body;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let palette: Palette = DEFAULT_PALETTE;
  let pending: Palette | null = null;
  let shift = 0;

  let world!: World;
  let renderer!: Renderer;
  let input: Input | null = null;
  const rand = mulberry32((Date.now() ^ 0x2545f491) >>> 0);

  let raf = 0;
  let last = 0;
  let acc = 0;
  let frame = 0;
  let fps = 60;
  let slowFrames = 0;
  /** Baja a 30 Hz de simulacion si el equipo no da los 60. */
  let simDivider = 1;
  let disposed = false;

  // --- Construccion -------------------------------------------------------

  function build(previous?: World): void {
    const cssW = container.clientWidth || window.innerWidth;
    const cssH = container.clientHeight || window.innerHeight;

    input?.destroy();
    world = createWorld(cssW, cssH);
    if (previous) transferDrawing(previous.grid, world.grid);

    renderer = new Renderer(sandCanvas, fxCanvas, world.grid);
    renderer.resize(cssW, cssH);

    const toCell = (px: number, py: number): Point => ({
      x: Math.floor(px / renderer.s),
      y: Math.floor(py / renderer.s),
    });

    input = new Input(fxCanvas, {
      toCell,
      hasWall: (c) => hasWallNear(world.grid, c.x, c.y, world.profile.brush),
      paint: (from, to, erase) =>
        paintStroke(world.grid, from, to, world.profile.brush, erase),
      onFirstStroke: () => opts.onFirstStroke?.(),
    });
  }

  // --- Bucle --------------------------------------------------------------

  function simulate(dt: number): void {
    const { grid, source, profile } = world;

    if (shift > 0) {
      shift -= dt;
      if (shift <= 0 && pending) {
        palette = pending;
        pending = null;
        // Cancion nueva, lote nuevo: el color arranca de inmediato.
        source.newBatch();
      }
    } else {
      source.tick(grid, dt, palette, rand, Math.max(0, profile.maxSand - grid.sandCount));
    }

    step(grid, rand, frame++);
  }

  function render(): void {
    renderer.paintSand();
    const d = renderer.beginFx();
    renderer.drawSource(d, world.source.x);
    if (input?.present) {
      renderer.drawCursor(d, input.x, input.y, world.profile.brush, input.mode === 'erase');
    }
    if (opts.debug) drawDebug(d.ctx);
  }

  function countWalls(): number {
    const { mat, size } = world.grid;
    let n = 0;
    for (let i = 0; i < size; i++) if (mat[i] === 2 /* WALL */) n++;
    return n;
  }

  function drawDebug(ctx: CanvasRenderingContext2D): void {
    const { grid, profile } = world;
    const lines = [
      `${profile.name}  ${grid.w}x${grid.h}  celda ${profile.cell}px`,
      `fps ${fps.toFixed(0)}  sim ${SIM_HZ / simDivider}Hz`,
      `arena ${grid.sandCount}  paredes ${countWalls()}`,
      `brocha ${profile.brush}  modo ${input?.mode ?? '-'}`,
    ];
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(11,11,12,0.8)';
    ctx.fillRect(8, 8, 220, lines.length * 15 + 10);
    ctx.fillStyle = '#A8A8B4';
    lines.forEach((l, i) => ctx.fillText(l, 16, 26 + i * 15));
    ctx.restore();
  }

  function loop(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const t0 = performance.now();

    if (last === 0) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // pestana que vuelve del fondo
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

    const cost = performance.now() - t0;
    if (cost > 20) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 30 && simDivider === 1) {
      simDivider = 2;
      slowFrames = 0;
    }
  }

  // --- Ciclo de vida ------------------------------------------------------

  let resizeTimer = 0;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const cssW = container.clientWidth || window.innerWidth;
      const cssH = container.clientHeight || window.innerHeight;
      const w = Math.max(80, Math.floor(cssW / world.profile.cell));
      const h = Math.max(80, Math.floor(cssH / world.profile.cell));
      // Solo se rehace si el grid cambia de verdad. En iOS la barra del
      // navegador altera la altura de la ventana con solo hacer scroll, y
      // reconstruir en cada temblor tiraria el dibujo a cada rato.
      if (Math.abs(w - world.grid.w) < 3 && Math.abs(h - world.grid.h) < 3) return;
      build(world);
    }, 250);
  };

  build();
  window.addEventListener('resize', onResize);
  if (!reducedMotion) raf = requestAnimationFrame(loop);
  else render();

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
    clear(): void {
      clearWorld(world.grid);
    },
    get palette(): Palette {
      return pending ?? palette;
    },
    inspect() {
      return {
        sand: world.grid.sandCount,
        walls: countWalls(),
        fps: Math.round(fps),
        grid: `${world.grid.w}x${world.grid.h}`,
      };
    },
    dump(x0: number, y0: number, w: number, h: number): string[] {
      const { grid } = world;
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
  };
}

export type { Palette } from './palette';
