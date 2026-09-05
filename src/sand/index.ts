import { createWorld, clearWorld, isDrawable, transferDrawing, type World } from './world';
import { alongStroke, hasWallNear, paintStroke, type Point } from './draw';
import { step } from './physics';
import { moisture } from './moisture';
import { Fire } from './fire';
import { Renderer, type CursorMode, type DrawCtx } from './render';
import { Input, type Tool } from './input';
import { SAND, WALL, WATER } from './materials';
import { DEFAULT_PALETTE, THEME, type Palette } from './palette';
import { mulberry32 } from './rng';
import { Ejecta } from './ejecta';
import { createGadget, GadgetLayer, type Gadget, type GadgetKind } from './gadgets';
import { Emitter } from './gadgets/emitter';

/**
 * Lo que siembra una fuente. Se elige al colocarla, con la ficha.
 *
 * Ya no es un interruptor de escena: cada chorro lleva el suyo y no cambia. El
 * unico sitio que aun habla en estos terminos es `setEmitMaterial`, que es una
 * ayuda de consola para la fuente de serie.
 */
export type EmitMaterial = 'sand' | 'water';

export interface BootOptions {
  sandCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  debug?: boolean;
  /**
   * Sobreescribe la fraccion de llenado a la que dispara el drenaje.
   * Bajarla acorta muchisimo el ciclo y hace practicable probar la descarga.
   */
  fillFrac?: number;
  /**
   * Sobreescribe los pixeles por celda: el tamano del grano.
   *
   * Para comparar granos en la misma sesion (`?cell=2`). No es solo el tamano:
   * el perfil entero se reescala con el, ver `regrain` en `world.ts`.
   */
  cell?: number;
}

/**
 * Lo que el dock necesita del lienzo, y lo que el lienzo necesita del dock.
 *
 * `src/sand/` no sabe nada del DOM del dock: pregunta por la papelera a traves
 * de este puente en vez de buscar el elemento por id.
 */
export interface DockHooks {
  /** ¿Este punto de pantalla cae sobre la papelera? */
  isTrash(clientX: number, clientY: number): boolean;
  /** Se agarro una pieza del lienzo: el dock se convierte en papelera. */
  onGrab(): void;
  /** Se solto. */
  onRelease(): void;
  /**
   * Cambio el numero de piezas colocadas.
   *
   * `full` es que no cabe nada; `onlyBomb`, que solo cabe ya una bomba. Son dos
   * estados distintos porque el dock los pinta distinto: con el lienzo lleno se
   * apagan todas las fichas menos la de la bomba, que es la que sigue sirviendo
   * para hacer sitio.
   *
   * `balls` va aparte del total porque el boton de reventarlas no tiene nada
   * que hacer si no hay ninguna, y un boton que no hace nada tiene que decirlo
   * antes de que lo pulsen.
   */
  onCount(count: number, full: boolean, onlyBomb: boolean, balls: number): void;
  /**
   * Cambio la herramienta activa.
   *
   * La antorcha se apaga sola al empezar a colocar una pieza, y sin avisar de
   * eso su boton se quedaria resaltado prometiendo un modo que ya no esta. Es
   * el mismo motivo por el que `onCount` se deduce comparando en vez de
   * acordarse de llamarlo en cada sitio.
   */
  onTool(tool: Tool): void;
}

export interface SandApp {
  destroy(): void;
  /** Cambia la paleta con una pausa de "cambio de turno" de por medio. */
  setPalette(p: Palette): void;
  /**
   * Cambia lo que siembra la fuente de SERIE, desde el fotograma siguiente.
   *
   * Ayuda de consola, no interfaz: las fuentes que se colocan traen su material
   * de la ficha con la que se sacaron y no se les toca. Sirve para medir agua
   * sin arrastrar nada. No repinta lo ya caido: el charco sigue siendo charco.
   */
  setEmitMaterial(m: EmitMaterial): void;
  readonly emitMaterial: EmitMaterial;
  /** La antorcha: con `'fire'`, el gesto prende paredes en vez de dibujarlas. */
  setTool(t: Tool): void;
  readonly tool: Tool;
  /**
   * Enciende la mecha de todas las bolas puestas. Devuelve cuantas.
   *
   * Las arma, no las detona: siguen rebotando los dos segundos que arden y
   * revientan en cadena por donde les pille.
   */
  armBalls(): number;
  /** Vacia el lienzo. */
  clear(): void;
  readonly palette: Palette;
  inspect(): {
    sand: number;
    agua: number;
    mojada: number;
    walls: number;
    fps: number;
    grid: string;
    msSim: number;
    msRender: number;
    despiertas: number;
    piezas: number;
    donde: Array<{ kind: string; x: number; y: number; r: number }>;
    ejecta: number;
    perdidos: number;
    /** Celdas de pared ardiendo ahora mismo. */
    fuego: number;
  };
  /** Vuelca los materiales de una region como texto. Depuracion pura. */
  dump(x0: number, y0: number, w: number, h: number): string[];

  // --- Colocacion de piezas, para el dock ---------------------------------
  setDockHooks(h: DockHooks): void;
  /** Empieza a arrastrar una ficha del dock. `material` solo le importa a la fuente. */
  beginPlacement(kind: GadgetKind, material?: EmitMaterial): void;
  /** Mueve el fantasma. Coordenadas de pantalla: el dock captura el puntero. */
  movePlacement(clientX: number, clientY: number): void;
  /** Suelta la ficha. Devuelve true si la pieza se coloco. */
  endPlacement(): boolean;
  cancelPlacement(): void;
}

const SIM_HZ = 60;
const SIM_DT = 1 / SIM_HZ;

export function boot(opts: BootOptions): SandApp {
  const { sandCanvas, fxCanvas } = opts;
  const container = fxCanvas.parentElement ?? document.body;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let palette: Palette = DEFAULT_PALETTE;
  /**
   * La herramienta activa.
   *
   * No persiste en `localStorage` — al reves que la paleta. La paleta es una
   * preferencia; arrancar con la antorcha encendida sin haberlo pedido seria
   * descubrirlo quemando el primer trazo que dibujas.
   */
  let tool: Tool = 'draw';

  let world!: World;
  let renderer!: Renderer;
  let input: Input | null = null;
  const rand = mulberry32((Date.now() ^ 0x2545f491) >>> 0);

  // --- Piezas -------------------------------------------------------------
  //
  // Viven fuera de `build()`: un redimensionado rehace el grid pero no debe
  // tirar lo que el usuario haya colocado, igual que no tira su dibujo.
  const gadgets = new GadgetLayer();
  const ejecta = new Ejecta();
  /**
   * Las paredes que arden. Fuera de `build()` como la ejecta, pero al reves que
   * ella se vacia en cada reconstruccion: guarda indices de celda, y en un grid
   * de otro tamano un indice apunta a cualquier sitio.
   */
  const fire = new Fire();
  let dock: DockHooks | null = null;
  /**
   * La pieza que se esta arrastrando. Puede ser una del lienzo (`held`) o el
   * fantasma de una ficha del dock, que es una pieza de verdad sin meter en la
   * capa: asi la vista previa no puede desviarse de lo que se va a colocar.
   */
  let held: Gadget | null = null;
  let ghost: Gadget | null = null;
  let ghostOk = false;
  /**
   * Desde donde arranco el arrastre de la ficha, y si llego a salir de ahi.
   *
   * Mucha gente toca la ficha en vez de arrastrarla. Sin esto, ese toque no
   * hace absolutamente nada y la pieza parece rota; con esto cae en el centro
   * de la escena, que ademas es donde se ve lo que hace.
   */
  let ghostFrom: { x: number; y: number } | null = null;
  let ghostMoved = false;

  /**
   * Ultimo numero de piezas comunicado al dock.
   *
   * El aviso se deduce de comparar el contador, no de acordarse de llamarlo en
   * cada sitio que anade o quita: la bomba se consume sola dentro del bucle de
   * simulacion, donde no hay ningun gesto del usuario del que colgar la
   * notificacion, y su hueco se quedaba sin liberar — el dock seguia
   * anunciandose lleno con una plaza libre.
   */
  /**
   * Apaga o enciende la antorcha, avisando al dock.
   *
   * Vive aqui dentro y no solo en la interfaz publica porque hay dos sitios que
   * la apagan solos: colocar una pieza y vaciar el lienzo.
   */
  function usarHerramienta(t: Tool): void {
    if (t === tool) return;
    tool = t;
    dock?.onTool(t);
  }

  let announced = -1;
  const announce = (): void => {
    announced = gadgets.count;
    dock?.onCount(gadgets.count, gadgets.full, gadgets.onlyBomb, gadgets.balls);
  };

  /**
   * La pieza bajo el puntero. La actualiza el pintado en cada frame.
   *
   * Solo la pieza senalada tiene boton de quitar activo: un aspa se cruza con
   * el de la vecina en cuanto hay dos juntas, y pulsar el boton invisible de
   * una pieza que ni siquiera esta senalada es la clase de sorpresa que hace
   * desconfiar de una herramienta.
   */
  let hovered: Gadget | null = null;

  /**
   * Boton de quitar, arriba a la derecha de la pieza.
   *
   * La papelera del dock funciona, pero solo se descubre despues de haber
   * arrastrado una pieza hasta alli — es decir, despues de haber adivinado que
   * existe. Una aspa visible en cuanto senalas la pieza no hay que adivinarla.
   *
   * Su posicion se fija al senalar la pieza y no se recalcula despues. La
   * plataforma patrulla, asi que un boton atado a su centro se aparta mientras
   * vas a pulsarlo: el raton llega donde estaba y la pieza ya no. Un boton no
   * puede huir del cursor.
   */
  const BADGE_R = 7;
  let badge: Point | null = null;

  function badgeAt(g: Gadget): Point {
    const d = g.radius + 4;
    // Las piezas redondas llevan la × en diagonal, rozando el borde. La fuente
    // no es redonda ni esta centrada en su dibujo, asi que su × va a la esquina
    // de la caja de agarre: puesta a `radius` se quedaba pegada a la boca, en
    // mitad de la tolva, senalando un tamano que no es el de la pieza.
    const caja = g.grabBox;
    const p = caja
      ? {
          x: Math.round(g.cx + caja.half - BADGE_R),
          y: Math.round(g.cy - caja.up + BADGE_R),
        }
      : { x: Math.round(g.cx + d * 0.707), y: Math.round(g.cy - d * 0.707) };

    // Y donde no se pueda pulsar, no vale. La fuente de serie vive en la fila 0
    // y su × caia por encima del borde superior: invisible e imposible de
    // acertar, justo la pieza de la que mas gente quiere deshacerse. Si arriba
    // no cabe, se pone debajo.
    const { w, h } = world.grid;
    const r = Math.ceil(BADGE_R);
    if (p.y < r) p.y = Math.round(g.cy + d * 0.707);
    return {
      x: Math.max(r, Math.min(w - 1 - r, p.x)),
      y: Math.max(r, Math.min(h - 1 - r, p.y)),
    };
  }
  function overBadge(c: Point): boolean {
    if (!badge) return false;
    const dx = c.x - badge.x;
    const dy = c.y - badge.y;
    // Radio de acierto algo mayor que el dibujado: es un objetivo pequeno.
    return dx * dx + dy * dy <= (BADGE_R + 1.5) * (BADGE_R + 1.5);
  }
  function setHovered(g: Gadget | null): void {
    if (g === hovered) return;
    hovered = g;
    badge = g ? badgeAt(g) : null;
  }

  /**
   * El sitio que ocupa una pieza, que no tiene por que ser su radio de agarre.
   * Las reglas de colocacion van con esto; el aro y el boton de quitar, con el
   * radio de agarre.
   */
  const size = (g: Gadget): number => g.footprint ?? g.radius;

  /** ¿Cabe una pieza de este tamano centrada aqui? */
  function canPlace(cx: number, cy: number, radius: number, ignore?: Gadget | null): boolean {
    const g = world.grid;
    if (cx - radius < 0 || cx + radius > g.w - 1) return false;
    if (cy - radius < 0) return false;
    // Las filas reservadas protegen el drenaje, igual que con la brocha.
    if (!isDrawable(g, cy + radius)) return false;
    return gadgets.fits(cx, cy, radius, ignore);
  }

  let raf = 0;
  let last = 0;
  let acc = 0;
  let frame = 0;
  let fps = 60;
  let slowFrames = 0;
  /** Baja a 30 Hz de simulacion si el equipo no da los 60. */
  let simDivider = 1;
  let disposed = false;
  /** Coste medido por frame, para saber si queda margen de verdad. */
  let msSim = 0;
  let msRender = 0;

  // --- Construccion -------------------------------------------------------

  function build(previous?: World): void {
    const cssW = container.clientWidth || window.innerWidth;
    const cssH = container.clientHeight || window.innerHeight;

    input?.destroy();
    world = createWorld(cssW, cssH, opts.fillFrac, opts.cell);
    if (previous) {
      transferDrawing(previous.grid, world.grid);
      // La boquilla fija se arrastra, asi que donde este es cosa del usuario y
      // no del tamano de la ventana. Se copia en celdas del grid viejo porque
      // el reescalado de las piezas corre justo despues y la va a convertir.
      world.source.x = previous.source.x;
      world.source.y = previous.source.y;
      // Y lo que sembraba: sin esto, redimensionar la ventana devolvia la
      // fuente de serie a arena aunque se le hubiera puesto agua a mano.
      world.source.material = previous.source.material;
    }
    // Los indices de celda no sobreviven a un grid nuevo. Se ata antes de que
    // nadie pueda prender nada.
    fire.attach(world.grid);
    // La fuente de la escena es una pieza mas, solo que fija: se arrastra y
    // estorba a las demas como cualquiera, pero no ocupa hueco ni se puede
    // quitar. Se reinstala en cada build porque el mundo nuevo trae su `Source`.
    gadgets.setPermanent(Emitter.main(world.source));

    // El grano que una pieza en movimiento no logra apartar sale volando en vez
    // de evaporarse. Es lo que convierte a la cruz en algo que avienta y no en
    // algo que se come la arena, y de paso mantiene constante la masa.
    world.grid.overflow = (x, y, color, pushDir) => {
      const dir = pushDir !== 0 ? pushDir : rand() < 0.5 ? -1 : 1;
      // Con algo de impulso hacia arriba: lanzado en horizontal dentro de un
      // monton, el grano choca en la celda de al lado y vuelve a quedar bajo la
      // misma aspa, que lo barre otra vez.
      return ejecta.launch(x, y, dir * (45 + rand() * 45), -30 - rand() * 40, color);
    };

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

      // El boton de quitar cae fuera del radio de la pieza, asi que tambien
      // tiene que reclamar el gesto: si no, pulsarlo dibujaria una pared.
      hasGadget: (c) => gadgets.hit(c.x, c.y) !== null || overBadge(c),

      tool: () => tool,

      // La antorcha recorre el segmento con el MISMO paso que la brocha
      // (`alongStroke`), asi que prende exactamente donde el circulo del cursor
      // dice que va a prender. El radio tambien es el de la brocha: si fuera
      // mayor, el circulo estaria mintiendo sobre su alcance.
      ignite: (from, to) => {
        const g = world.grid;
        const r = world.profile.brush;
        const r2 = r * r;
        alongStroke(from, to, r, (cx, cy) => {
          const x0 = Math.max(0, Math.floor(cx - r));
          const x1 = Math.min(g.w - 1, Math.ceil(cx + r));
          const y0 = Math.max(0, Math.floor(cy - r));
          const y1 = Math.min(g.h - 1, Math.ceil(cy + r));
          for (let y = y0; y <= y1; y++) {
            const dy = y - cy;
            for (let x = x0; x <= x1; x++) {
              const dx = x - cx;
              if (dx * dx + dy * dy > r2) continue;
              if (fire.light(g, x, y)) gadgets.spark(x, y);
            }
          }
          // Y enciende piezas aunque no haya ni una pared donde prender: tocar
          // una bomba con la antorcha tiene que detonarla, haya trazo o no.
          gadgets.spark(Math.round(cx), Math.round(cy));
        });
      },

      grab: (c) => {
        if (hovered && overBadge(c)) {
          gadgets.remove(hovered, world.grid);
          setHovered(null);
          announce();
          return; // `held` sigue vacio: esto no era el principio de un arrastre
        }
        held = gadgets.hit(c.x, c.y);
        if (held) {
          held.held = true;
          dock?.onGrab();
        }
      },

      dragTo: (c) => {
        if (!held) return;
        // Se mueve aunque el destino sea invalido: frenar la pieza contra un
        // obstaculo la despega del dedo y se siente rota. La validez decide
        // donde se queda al soltar, no donde puede pasar mientras arrastra.
        held.cx = c.x;
        held.cy = c.y;
        held.onMoved?.();
      },

      drop: (c, clientX, clientY, tap) => {
        const g = held;
        held = null;
        if (g) g.held = false;
        // La pieza ya no esta donde estaba, asi que su × tampoco. El sitio del
        // boton se fija al senalar la pieza y `setHovered` no lo recalcula
        // mientras siga siendo la misma: sin soltar aqui la marca, el boton se
        // quedaba en el punto donde la pieza estaba antes del arrastre — y
        // pulsar donde ahora se ve la × dibujaba una pared. Era el motivo real
        // de que "no se pueda quitar la fuente": basta con haberla movido.
        setHovered(null);
        // Se pregunta por la papelera ANTES de soltarla. `isTrash` exige que el
        // dock este en modo papelera, y `onRelease` es justo lo que le quita ese
        // modo: llamandolo primero, la pregunta salia siempre que no, y tirar
        // una pieza al dock no borraba nada.
        const tirar = !tap && (dock?.isTrash(clientX, clientY) ?? false);
        dock?.onRelease();
        if (!g) return;

        if (tap) {
          g.tap?.();
          if (g.dead) announce();
          return;
        }
        if (tirar) {
          gadgets.remove(g, world.grid);
          announce();
          return;
        }
        // Destino invalido: la pieza vuelve a un sitio donde quepa.
        if (!canPlace(c.x, c.y, size(g), g)) {
          const home = nearestFit(c.x, c.y, size(g), g);
          g.cx = home.x;
          g.cy = home.y;
        }
        g.onMoved?.();
        g.onPlaced?.();
      },
    });
  }

  /**
   * El sitio valido mas cercano para una pieza.
   *
   * Se busca en anillos hacia fuera. Si no hay ninguno —lienzo abarrotado— se
   * devuelve el punto pedido: es mejor una pieza solapada que una que
   * desaparece sin explicacion al soltarla.
   */
  function nearestFit(x: number, y: number, radius: number, ignore?: Gadget | null): Point {
    const g = world.grid;
    const cx = Math.max(radius, Math.min(g.w - 1 - radius, x));
    const cy = Math.max(radius, Math.min(g.h - 1 - radius, y));
    if (canPlace(cx, cy, radius, ignore)) return { x: cx, y: cy };
    for (let r = 2; r < 60; r += 2) {
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        const nx = Math.round(cx + Math.cos(t) * r);
        const ny = Math.round(cy + Math.sin(t) * r);
        if (canPlace(nx, ny, radius, ignore)) return { x: nx, y: ny };
      }
    }
    return { x: cx, y: cy };
  }

  // --- Bucle --------------------------------------------------------------

  /**
   * Un paso de simulacion.
   *
   * El orden importa y no es arbitrario:
   *
   *  1. El drenaje decide si abre.
   *  2. Las piezas borran y reescriben su cuerpo (dos pasadas, ver GadgetLayer).
   *  3. Los emisores siembran.
   *  4. El fuego. Despues de las piezas, porque los cuerpos se estampan ahi y
   *     el chispazo tiene que encontrarlas ya en su sitio; y antes del
   *     automata, para que la pared que acaba de consumirse suelte lo que
   *     aguantaba en este mismo paso.
   *  5. La arena en vuelo se integra y aterriza, ANTES del automata, para que
   *     lo que acaba de depositarse se asiente en este mismo paso en vez de
   *     quedarse flotando un frame.
   *  6. El automata. Intacto: ni las piezas ni el fuego le anaden una rama.
   */
  function simulate(dt: number): void {
    const { grid, source, drain, profile } = world;
    drain.tick(grid, source.blocked);

    const headroom = (): number => Math.max(0, profile.maxSand - grid.ocupadas);

    gadgets.tick({ grid, ejecta, palette, rand, budget: headroom() }, dt);
    // Una pieza puede haberse consumido sola (la bomba al estallar).
    if (gadgets.count !== announced) announce();

    fire.step(grid, dt, profile.k, (x, y) => gadgets.spark(x, y));

    ejecta.step(grid, dt);
    // El filtrado y el secado van ANTES del automata: la humedad que cambia
    // despierta celdas, y asi el monton que acaba de secarse se desmorona en
    // este mismo paso en vez de esperar al siguiente.
    moisture(grid, frame);
    step(grid, rand, frame++);
  }

  function render(): void {
    renderer.paintSand(ejecta);
    const d = renderer.beginFx();
    // Debajo de las piezas y de los tiradores: el aro de la pieza senalada y su
    // aspa tienen que quedar por encima de cualquier cosa que este ardiendo.
    fire.draw(d);
    gadgets.draw(d);

    // El fantasma es una pieza de verdad sin colocar: se pinta con su propio
    // draw() y no con un dibujo aparte que pudiera mentir sobre el tamano.
    if (ghost) {
      const { ctx } = d;
      ctx.save();
      ctx.globalAlpha = ghostOk ? 0.55 : 0.25;
      if (!ghostOk) ctx.setLineDash([3, 3]);
      ghost.draw(d);
      ctx.restore();
    }

    if (input?.present && !held && !ghost) {
      const cell = { x: Math.floor(input.x / renderer.s), y: Math.floor(input.y / renderer.s) };
      // La pieza senalada se mantiene mientras el puntero siga sobre ella o
      // sobre su boton de quitar; si no, el boton desapareceria justo al ir a
      // pulsarlo, que es el clasico menu que se escapa.
      setHovered(gadgets.hit(cell.x, cell.y) ?? (overBadge(cell) ? hovered : null));

      if (hovered) {
        drawHandles(d, hovered);
      } else {
        // El modo sale de la herramienta y no de `input.mode`, que se queda con
        // el ultimo gesto: apagando la antorcha sin mover el raton, el cursor
        // seguiria pintado de llama hasta el siguiente clic.
        const modo: CursorMode = tool === 'fire' ? 'fire' : input.mode === 'erase' ? 'erase' : 'draw';
        renderer.drawCursor(d, input.x, input.y, world.profile.brush, modo);
      }
    } else if (!held) {
      setHovered(null);
    }

    if (opts.debug) drawDebug(d.ctx);
  }

  /**
   * Lo que aparece al senalar una pieza: el aro de agarre y el boton de quitar.
   *
   * El aro es la unica senal de que el gesto va a mover la pieza en vez de
   * dibujar una pared encima de ella, y la aspa es la respuesta a "y esto como
   * se quita", que arrastrandolo hasta el dock no se contesta sola.
   */
  function drawHandles(d: DrawCtx, g: Gadget): void {
    const { ctx, s } = d;
    ctx.save();
    ctx.lineWidth = 1;

    ctx.strokeStyle = THEME.ink;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    // El aro tiene que dibujar lo que se puede agarrar. Para la fuente eso es su
    // caja, no un circulo: es la unica pieza que se pinta casi entera por encima
    // de su centro, y un aro alrededor del centro le prometia al usuario un
    // objetivo del tamano de la boca cuando en realidad se coge por toda la
    // tolva.
    const caja = g.grabBox;
    if (caja) {
      ctx.rect(
        (g.cx + 0.5 - caja.half) * s,
        (g.cy + 0.5 - caja.up) * s,
        caja.half * 2 * s,
        (caja.up + caja.down) * s,
      );
    } else {
      ctx.arc((g.cx + 0.5) * s, (g.cy + 0.5) * s, (g.radius + 2.5) * s, 0, Math.PI * 2);
    }
    ctx.stroke();

    const b = badge ?? badgeAt(g);
    const bx = (b.x + 0.5) * s;
    const by = (b.y + 0.5) * s;
    const r = BADGE_R * s;
    ctx.setLineDash([]);
    // Relleno opaco: encima de un monton de arena clara, una aspa a pelo se
    // pierde entre los granos.
    ctx.fillStyle = 'rgba(11,11,12,0.85)';
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = THEME.inkBright;
    ctx.stroke();

    const k = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(bx - k, by - k);
    ctx.lineTo(bx + k, by + k);
    ctx.moveTo(bx + k, by - k);
    ctx.lineTo(bx - k, by + k);
    ctx.stroke();
    ctx.restore();
  }

  function countWalls(): number {
    const { mat, size } = world.grid;
    let n = 0;
    for (let i = 0; i < size; i++) if (mat[i] === 2 /* WALL */) n++;
    return n;
  }

  /** Celdas con algo de humedad. Un solo recorrido, y solo en modo depuracion. */
  function countWet(): number {
    const { wet, size } = world.grid;
    let n = 0;
    for (let i = 0; i < size; i++) if (wet[i]! > 0) n++;
    return n;
  }

  function drawDebug(ctx: CanvasRenderingContext2D): void {
    const { grid, profile } = world;
    const lines = [
      `${profile.name}  ${grid.w}x${grid.h}  celda ${profile.cell}px`,
      `fps ${fps.toFixed(0)}  sim ${SIM_HZ / simDivider}Hz`,
      `arena ${grid.sandCount}  agua ${grid.waterCount}  paredes ${countWalls()}`,
      `mojada ${countWet()}  fuego ${fire.count}`,
      `sim ${msSim.toFixed(1)}ms  pintado ${msRender.toFixed(1)}ms`,
      `brocha ${profile.brush}  util ${tool}  modo ${input?.mode ?? '-'}`,
      `piezas ${gadgets.count}  ejecta ${ejecta.count}  perdidos ${ejecta.lost}`,
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
    const tSim = performance.now();
    while (acc >= budget && steps < 3) {
      simulate(budget);
      acc -= budget;
      steps++;
    }
    if (steps === 3) acc = 0; // no acumular deuda que nunca se paga
    if (steps > 0) msSim += (performance.now() - tSim - msSim) * 0.1;

    const tRender = performance.now();
    render();
    msRender += (performance.now() - tRender - msRender) * 0.1;

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
      const prevW = world.grid.w;
      const prevH = world.grid.h;
      build(world);
      // Las piezas guardan celdas, no pixeles: con un grid nuevo hay que
      // reescalarlas o acaban descolocadas respecto al dibujo, que si se
      // transfiere celda a celda. La arena en vuelo se descarta.
      gadgets.rescale(world.grid.w / prevW, world.grid.h / prevH, world.grid);
      ejecta.clear();
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
      if (p.id === palette.id) return;
      palette = p;
      // Paleta nueva, lote nuevo: la eleccion se ve en el chorro al instante.
      // Los granos ya asentados conservan la suya, que es lo que estratifica.
      world.source.newBatch();
    },
    setEmitMaterial(m: EmitMaterial): void {
      world.source.material = m === 'water' ? WATER : SAND;
    },
    get emitMaterial(): EmitMaterial {
      return world.source.material === WATER ? 'water' : 'sand';
    },
    setTool(t: Tool): void {
      usarHerramienta(t);
    },
    armBalls(): number {
      return gadgets.armBalls();
    },
    get tool(): Tool {
      return tool;
    },
    clear(): void {
      gadgets.clearAll(world.grid);
      // La fuente de serie vuelve, en el sitio donde estuviera: se puede volar
      // y se puede tirar, pero vaciar el lienzo es dejarlo como estaba, y como
      // estaba habia una fuente. Si no, se puede acabar con un lienzo en blanco
      // del que no cae nada y sin nada que explique por que.
      gadgets.setPermanent(Emitter.main(world.source));
      ejecta.clear();
      fire.clear();
      held = null;
      ghost = null;
      usarHerramienta('draw');
      clearWorld(world.grid, world.drain);
      announce();
    },

    setDockHooks(h: DockHooks): void {
      dock = h;
      announce();
    },

    beginPlacement(kind: GadgetKind, material?: EmitMaterial): void {
      if (!gadgets.roomFor(kind)) return;
      // Sacar una ficha apaga la antorcha. Si no, se coloca la pieza y el
      // primer trazo que se dibuja despues sale ardiendo sin que nada lo haya
      // anunciado — el boton sigue encendido, pero nadie mira ahi.
      usarHerramienta('draw');
      // Nace fuera de la pantalla: hasta el primer movimiento no hay sitio al
      // que apuntar, y aparecer en la esquina superior izquierda seria un
      // parpadeo en un sitio que no significa nada.
      // El fantasma de una fuente ensena el contorno de su chorro, y ese
      // contorno depende del material —el agua se abre en la boca y luego baja
      // recta—, asi que la ficha tiene que traerlo puesto desde el principio.
      ghost = createGadget(kind, -1000, -1000, {
        gridW: world.grid.w,
        k: world.profile.k,
        material: material === 'water' ? WATER : SAND,
      });
      // El fantasma se lleva en la mano igual que una pieza ya colocada, y hay
      // piezas a las que eso les cambia el dibujo: la fuente no se ve, asi que
      // solo mientras la llevas ensena el cono por donde va a salir la arena.
      // Sin esto, colocar una fuente desde el dock seria a ciegas.
      ghost.held = true;
      ghostOk = false;
      ghostFrom = null;
      ghostMoved = false;
    },

    movePlacement(clientX: number, clientY: number): void {
      if (!ghost) return;
      if (!ghostFrom) ghostFrom = { x: clientX, y: clientY };
      else if (Math.hypot(clientX - ghostFrom.x, clientY - ghostFrom.y) > 12) ghostMoved = true;

      const r = fxCanvas.getBoundingClientRect();
      ghost.cx = Math.floor((clientX - r.left) / renderer.s);
      ghost.cy = Math.floor((clientY - r.top) / renderer.s);
      // El fantasma nace fuera de la pantalla y aqui se le asigna el sitio de
      // golpe, sin pasar por ningun arrastre: sin avisarlo, una pieza que ate
      // estado a su posicion —la plataforma centra ahi su patrulla— se queda
      // creyendo que vive en la esquina imposible donde se instancio.
      ghost.onMoved?.();
      ghostOk = canPlace(ghost.cx, ghost.cy, size(ghost));
    },

    endPlacement(): boolean {
      const g = ghost;
      ghost = null;
      if (!g) return false;
      // Ya no se lleva en la mano. Sin esto la fuente se quedaba con su cono de
      // colocacion pintado para siempre, porque nada mas lo apaga: el `held` de
      // una pieza agarrada lo quita el soltar, y el fantasma no pasa por ahi.
      g.held = false;

      // Un toque sin arrastre la coloca en el centro de la escena, bajo el
      // chorro: es donde se ve lo que hace la pieza.
      if (!ghostMoved) {
        const home = nearestFit(world.grid.w >> 1, Math.round(world.grid.h * 0.45), size(g));
        g.cx = home.x;
        g.cy = home.y;
      } else if (!ghostOk) {
        return false;
      }

      g.onMoved?.();
      if (!gadgets.add(g)) return false;
      // Ya esta puesta: que lo diga. Solo la fuente tiene algo que decir aqui,
      // porque es la unica que no se ve al aparecer — ver `onPlaced`.
      g.onPlaced?.();
      announce();
      return true;
    },

    cancelPlacement(): void {
      ghost = null;
    },

    get palette(): Palette {
      return palette;
    },
    inspect() {
      const { awake, wet, size } = world.grid;
      let despiertas = 0;
      let mojada = 0;
      for (let i = 0; i < size; i++) {
        despiertas += awake[i]!;
        if (wet[i]! > 0) mojada++;
      }
      return {
        sand: world.grid.sandCount,
        agua: world.grid.waterCount,
        // Granos con algo de humedad. Es el tamano del lodo: sube al mojar y
        // vuelve a cero solo cuando se ha secado del todo.
        mojada,
        walls: countWalls(),
        fps: Math.round(fps),
        grid: `${world.grid.w}x${world.grid.h}`,
        msSim: +msSim.toFixed(2),
        msRender: +msRender.toFixed(2),
        despiertas,
        piezas: gadgets.count,
        // Que hay y donde. La bola y la fuente no escriben en el grid, asi que
        // un dump() de materiales no las encuentra.
        donde: gadgets.positions(),
        ejecta: ejecta.count,
        // Celdas de pared ardiendo. Es la unica forma de ver de un vistazo si
        // un incendio sigue vivo o ya se apago contra el agua.
        fuego: fire.count,
        // Granos que no encontraron hueco al aterrizar. Deberia quedarse en
        // cero o casi: si sube sin parar, la ejecta esta perdiendo masa.
        perdidos: ejecta.lost,
      };
    },
    dump(x0: number, y0: number, w: number, h: number): string[] {
      const { grid } = world;
      const glyph = ['.', 'o', '#', '<', '>', '\\', '/', ':', '=', '@', 'v', '_', '~'];
      const lines: string[] = [];
      for (let y = y0; y < y0 + h && y < grid.h; y++) {
        let line = String(y).padStart(4) + ' ';
        for (let x = x0; x < x0 + w && x < grid.w; x++) {
          const i = y * grid.w + x;
          // La arena mojada sale en mayuscula. Sin eso no hay forma de ver por
          // donde va el frente de mojado, y es lo primero que hace falta mirar
          // cuando el lodo no se comporta.
          if (grid.mat[i] === SAND && grid.wet[i]! > 0) {
            line += 'O';
            continue;
          }
          // La pared que arde sigue siendo WALL, asi que en el volcado saldria
          // como cualquier otra. Sin distinguirla no hay forma de ver por donde
          // va el frente del fuego, que es lo primero que hace falta mirar.
          if (grid.mat[i] === WALL && fire.burning(i)) {
            line += '*';
            continue;
          }
          line += glyph[grid.mat[i]!] ?? '?';
        }
        lines.push(line);
      }
      return lines;
    },
  };
}

export type { Palette } from './palette';
export type { GadgetKind } from './gadgets';
export type { Tool } from './input';
