import { SAND, WALL } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import type { Blast, TickCtx } from './index';

const TAU = Math.PI * 2;
/** Radio de la explosion, en celdas. */
export const BLAST_R = 42;
/** Rapidez en el centro de la explosion, en celdas/s. */
const POWER = 520;
/**
 * Impulso hacia arriba anadido a todo lo que sale despedido.
 *
 * Sin el, la mitad inferior de la esfera sale disparada contra el suelo, se
 * deposita a dos celdas y no se ve nada: la explosion parece un chasquido. Con
 * el, el material sube y vuelve a caer, que es lo que se lee como explosion.
 */
const LIFT = 120;
/** Segundos de mecha. */
export const FUSE = 2;
/** Duracion del anillo de choque, en segundos. */
const FLASH = 0.35;
/**
 * Fraccion del radio dentro de la cual la pared se lleva siempre.
 *
 * Mas alla, la probabilidad cae hasta cero justo en el borde, y el agujero
 * queda deshilachado. Con un corte limpio a radio fijo, lo que aparece en medio
 * de un trazo hecho a mano parece un recorte de compas y no una explosion.
 */
const RUBBLE_CORE = 0.72;
/**
 * Lo que tarda en reventar algo que ya estaba encendido y recibe una onda.
 *
 * Casi nada, y a proposito: la mecha de dos segundos es para convencer a lo que
 * no era una bomba. A lo que ya lo era no hay que convencerlo de nada, y una
 * fila de bombas tiene que caer en cascada rapida y no de dos en dos segundos.
 */
const SYMPATHY = 0.15;
/** Practicamente cero, pero positivo: la mecha sigue encendida hasta el paso siguiente. */
const NOW = 0.0001;

/**
 * La explosion, suelta y no como metodo de la bomba.
 *
 * Cualquier pieza puede acabar estallando —basta con que le pille dentro una
 * onda— y duplicar esto seria condenarse a que las explosiones se fueran
 * separando a la primera correccion.
 */
export function detonateAt(c: TickCtx, cx: number, cy: number): void {
  const { grid: g, ejecta, rand } = c;
  const r2 = BLAST_R * BLAST_R;
  const y0 = Math.max(0, cy - BLAST_R);
  const y1 = Math.min(g.h - 1, cy + BLAST_R);
  const x0 = Math.max(0, cx - BLAST_R);
  const x1 = Math.min(g.w - 1, cx + BLAST_R);

  /**
   * Primero se vacia la esfera entera, y solo despues sale todo despedido.
   *
   * Haciendolo en un solo recorrido —sacar un grano y lanzarlo acto seguido—
   * los primeros salen mientras el resto de la esfera sigue compacta: vuelan
   * una celda, chocan contra arena que aun no se ha retirado y no encuentran
   * hueco donde aterrizar. Medido asi, la explosion perdia 236 granos. Vaciar
   * antes deja el crater abierto y todos vuelan por aire libre.
   */
  const salen: Array<{ x: number; y: number; d: number; dx: number; dy: number; col: number }> = [];

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;

      const i = g.idx(x, y);
      const m = g.mat[i]!;

      // Las paredes del usuario tambien vuelan. Solo las suyas: LEDGE es el
      // suelo del mundo y el sumidero del fondo, y DYN o las cintas son
      // cuerpos de otras piezas que se reescriben solos cada paso.
      if (m === WALL) {
        // El borde se deshilacha en vez de cortar en circunferencia perfecta.
        // Un agujero de compas en mitad de un trazo a mano se lee como un
        // recorte, no como una explosion.
        const d = Math.sqrt(d2);
        if (d < BLAST_R * RUBBLE_CORE || rand() < 1 - (d / BLAST_R - RUBBLE_CORE) / (1 - RUBBLE_CORE)) {
          g.removeAt(i);
        }
        continue;
      }

      if (m !== SAND) continue;
      // Si no cabe una particula mas, el grano se queda donde esta. Sacarlo
      // del grid sin poder lanzarlo seria destruirlo, y una explosion mueve
      // material, no lo hace desaparecer.
      if (salen.length >= ejecta.room) continue;

      salen.push({ x, y, d: Math.sqrt(d2), dx, dy, col: g.col[i]! });
      g.removeAt(i);
    }
  }

  for (const p of salen) {
    // En el centro exacto no hay direccion radial que valga: se sortea.
    const a = p.d < 1 ? rand() * TAU : 0;
    const ux = p.d < 1 ? Math.cos(a) : p.dx / p.d;
    const uy = p.d < 1 ? Math.sin(a) : p.dy / p.d;
    const f = (1 - p.d / BLAST_R) * POWER * (0.7 + rand() * 0.6);
    ejecta.launch(p.x, p.y, ux * f, uy * f - LIFT, p.col);
  }

  g.wakeRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);

  // Aviso a las demas piezas de que aqui ha estallado algo. Lo reparte la capa
  // al final del paso, no quien estalla: prender a otro es cosa de la pareja,
  // igual que el choque entre bolas. Ademas, repartirlo aqui dejaria estallar en
  // cascada dentro del mismo paso — toda una cadena en un fotograma, sin que se
  // llegue a ver ninguna de las explosiones.
  c.blasts.push({ x: cx, y: cy, r: BLAST_R });
}

/**
 * Aro del alcance y arco de mecha, lo que lleva encima cualquier cosa
 * encendida.
 *
 * El aro va tenue y discontinuo, y no es decoracion: con un radio de 42 celdas,
 * colocar una bomba a ciegas es descubrir despues que se ha llevado medio
 * dibujo por delante. El arco se vacia en sentido horario desde arriba y dice
 * cuanto queda sin numeros ni barra de progreso.
 *
 * `ringR` es donde va el arco, que cambia con el tamano de quien arde.
 */
export function drawFuse({ ctx, s }: DrawCtx, cx: number, cy: number, left: number, ringR: number): void {
  const px = (cx + 0.5) * s;
  const py = (cy + 0.5) * s;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = THEME.structureSoft;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(px, py, BLAST_R * s, 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.inkBright;
  ctx.beginPath();
  ctx.arc(px, py, (ringR + 1) * s, -Math.PI / 2, -Math.PI / 2 + left * TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * Anillo de choque: se abre hasta el radio real de la explosion y se apaga. Es
 * lo que explica de un vistazo hasta donde ha llegado.
 */
export function drawBlastRing({ ctx, s }: DrawCtx, cx: number, cy: number, flash: number): void {
  const t = 1 - flash / FLASH;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = THEME.inkBright;
  ctx.beginPath();
  ctx.arc((cx + 0.5) * s, (cy + 0.5) * s, BLAST_R * s * t, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Lo que la mecha le dice a su pieza que haga en este paso. */
export type WickStep =
  /** Nada que reportar: la pieza hace su paso normal. */
  | 'sigue'
  /** Ya ha reventado y se esta apagando el anillo: la pieza no hace nada. */
  | 'humo'
  /** Se apago el anillo: la pieza tiene que marcarse muerta. */
  | 'fin';

/**
 * Mecha, por composicion y no por herencia.
 *
 * Cualquier pieza puede acabar encendida: basta con que una explosion la pille
 * dentro. Vive aparte porque no es de ninguna en particular — todas se
 * encienden igual, arden igual y revientan igual, y lo unico distinto es el
 * cuerpo que dejan de estampar mientras arden. Repetirlo en cada clase seria
 * condenarse a que se fueran separando a la primera correccion.
 *
 * Que se lleve por delante la pieza entera no es un efecto secundario: es media
 * gracia de la bomba. Sin esto, quitar una cruz del lienzo es arrastrarla hasta
 * la papelera; con esto, es volarla.
 */
export class Wick {
  private fuse = 0;
  private flash = 0;

  /** Ardiendo ahora mismo. */
  get lit(): boolean {
    return this.fuse > 0;
  }

  /** Ya ha reventado: solo queda que se apague el anillo. */
  get blown(): boolean {
    return this.flash > 0;
  }

  /** Enciende la mecha desde cero. La bomba nace encendida. */
  light(): void {
    if (this.flash <= 0) this.fuse = FUSE;
  }

  /**
   * Apaga mecha y anillo: la pieza vuelve a estar entera.
   *
   * Lo usa solo la fuente fija de la escena, que es la unica que no se puede
   * perder — vuela como cualquier otra, pero en vez de quedarse muerta se
   * reconstruye. Sin esto tendria que seguir siendo inmune a las explosiones,
   * que era justo lo que se veia raro: la onda le pasa por encima, se lleva la
   * arena que tiene debajo y la boquilla sigue manando tan tranquila.
   */
  revive(): void {
    this.fuse = 0;
    this.flash = 0;
  }

  /** Acorta lo que quede de mecha. Nunca la alarga. */
  hurry(s: number): void {
    if (this.fuse > 0) this.fuse = Math.min(this.fuse, s);
  }

  /** Toque: revienta en el paso siguiente. Apagada, no hace nada. */
  tap(): void {
    this.hurry(NOW);
  }

  /**
   * Ha estallado algo cerca.
   *
   * El alcance se mide contra el cuerpo de la pieza y no contra su centro:
   * basta con que la onda la roce. Midiendo por el centro, una pieza a la que
   * la explosion le ha arrancado media esfera de arena de debajo se quedaria
   * tan tranquila, que es exactamente lo que uno no espera al ver el aro
   * pasarle por encima.
   *
   * A lo que ya estaba ardiendo la onda lo precipita en vez de reiniciarlo. Sin
   * esa distincion, dos piezas encendidas a la vez se irian reencendiendo la
   * una a la otra y ninguna llegaria a estallar nunca.
   */
  ignite(b: Blast, cx: number, cy: number, bodyR: number): void {
    if (this.flash > 0) return;
    const dx = cx - b.x;
    const dy = cy - b.y;
    const r = b.r + bodyR;
    if (dx * dx + dy * dy > r * r) return;
    if (this.fuse > 0) this.hurry(SYMPATHY);
    else this.fuse = FUSE;
  }

  /** Avanza la mecha. Lo primero de cada `tick`. */
  step(c: TickCtx, dt: number, cx: number, cy: number): WickStep {
    if (this.flash > 0) {
      this.flash -= dt;
      return this.flash > 0 ? 'humo' : 'fin';
    }
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        detonateAt(c, cx, cy);
        this.flash = FLASH;
        return 'humo';
      }
    }
    return 'sigue';
  }

  /** El anillo de choque. Lo pinta la pieza en vez de su cuerpo. */
  drawRing(d: DrawCtx, cx: number, cy: number): void {
    drawBlastRing(d, cx, cy, this.flash);
  }

  /** El aro y el arco, encima del cuerpo. No hace nada si esta apagada. */
  drawFuse(d: DrawCtx, cx: number, cy: number, ringR: number): void {
    if (this.fuse > 0) drawFuse(d, cx, cy, this.fuse / FUSE, ringR);
  }
}
