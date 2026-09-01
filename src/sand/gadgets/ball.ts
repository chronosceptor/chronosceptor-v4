import type { Grid } from '../grid';
import { SAND, WALL } from '../materials';
import { THEME, rgbCss } from '../palette';
import type { DrawCtx } from '../render';
import { RESERVED_ROWS } from '../world';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/**
 * Radio de la bola, en celdas. Es tambien el ancho de lo que borra a su paso.
 *
 * Lo que barre por segundo va con el radio por la rapidez, asi que estos dos
 * numeros son los que deciden si la bola limpia de verdad o solo hace cosquillas.
 * Con radio 7 y 90 celdas/s, tres bolas apenas frenaban el 41% de lo que suelta
 * la fuente: la pantalla se seguia llenando y no se parecia en nada a limpiarla.
 */
const BALL_R = 13;
/**
 * Radio de agarre, mayor que la bola.
 *
 * Generoso a proposito: a esta velocidad la bola cruza el punto donde esta el
 * cursor en una decima de segundo, y con un objetivo del tamano justo de la
 * bola no habria manera humana de cogerla para moverla o tirarla.
 */
const GRAB_R = 18;
/** Rapidez, en celdas/s. Constante: no hay gravedad ni rozamiento. */
const SPEED = 145;
/**
 * Celdas que se aparta de una pared en cada paso en que la toca.
 *
 * Hace falta para el caso en que la pared aparece encima de la bola —dibujas
 * justo donde esta— y no basta con rebotar: hay que ir sacandola.
 */
const PUSH_OUT = 1.5;
/**
 * Radio del mordisco que cada golpe arranca de la pared, en celdas.
 *
 * Muy por debajo del radio de la bola a proposito. Llevandose de un tajo todas
 * las celdas que toca —que es lo que sale solo, porque ya estan contadas para
 * calcular la normal— cualquier trazo fino se parte en el primer golpe, la bola
 * lo atraviesa y se acaba el pinball: el dibujo dejaria de desviarla justo
 * cuando empiezas a usarlo para dirigirla.
 */
const BITE_R = 5;
/**
 * Cuanto se lleva un golpe de frente a plena velocidad, como fraccion de las
 * celdas del mordisco. El resto de golpes salen de ahi hacia abajo.
 */
const BITE_P = 0.8;

/**
 * Bola que rebota y se come la arena que toca.
 *
 * Rebota contra los bordes del lienzo y contra las paredes dibujadas, asi que
 * el trazo sirve para dirigirla: una rampa la desvia, un cuenco la encierra a
 * ricochetear dentro y una pared la manda de vuelta.
 *
 * Encerrarla es posible y es parte del juego. Al principio atravesaba el dibujo
 * justamente para que no pudiera quedar atrapada y dejase de limpiar, pero eso
 * era tratarla solo como una escoba: pudiendo chocar, el dibujo se convierte en
 * la mesa de un pinball. Si se queda encerrada, se saca arrastrandola.
 *
 * Y cada golpe deja mella: la pared se va desportillando por donde la bola la
 * golpea. Un cuenco que la encierra no la encierra para siempre — lo va picando
 * hasta abrirse — y una pared puesta a modo de raqueta se gasta con el uso. El
 * dibujo deja de ser decorado permanente y pasa a ser algo que hay que
 * mantener, que es lo que da tension a tenerlas sueltas por el lienzo.
 *
 * Y si le pilla dentro una explosion, se enciende: se vuelve ella misma una
 * bomba y estalla al agotarse la mecha, prendiendo de paso a las que le pillen
 * dentro a ella. Sigue rebotando mientras arde, que es lo que la separa de la
 * bomba de mecha —esa se queda donde la dejas— y lo que hace que la cadena
 * valga la pena: la explosion no se propaga en el sitio, se va corriendo.
 *
 * No tiene cuerpo solido en el grid. Podria estamparse como DYN para que la
 * arena chocase con ella, pero seria trabajo tirado: lo que hay dentro de su
 * radio deja de existir en el mismo paso, asi que nunca habria nada contra lo
 * que chocar.
 */
export class Ball implements Gadget {
  readonly kind = 'ball';
  readonly radius = GRAB_R;
  /** Lo que ocupa de verdad es la bola, no la holgura para poder cogerla. */
  readonly footprint = BALL_R;
  dead = false;
  held = false;

  /** Apagada mientras nada le estalle al lado, que es lo normal. */
  private readonly wick = new Wick();

  /**
   * Posicion y velocidad en celdas y celdas/s, en coma flotante: a esta
   * velocidad los enteros dan tirones.
   *
   * No son privados porque `resolveBallCollisions` los toca. El choque entre
   * dos bolas no es comportamiento de ninguna de ellas por separado, asi que
   * vive fuera de la clase.
   */
  px: number;
  py: number;
  vx: number;
  vy: number;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.px = cx;
    this.py = cy;
    // Un angulo lejos de la horizontal y de la vertical. Saliendo casi recta,
    // la bola barre una sola franja y deja el resto de la pantalla intacto.
    const a = (25 + Math.random() * 40) * (Math.PI / 180);
    const sx = Math.random() < 0.5 ? -1 : 1;
    const sy = Math.random() < 0.5 ? -1 : 1;
    this.vx = Math.cos(a) * SPEED * sx;
    this.vy = Math.sin(a) * SPEED * sy;
  }

  /** El arrastre la ha recolocado: la posicion fina sigue a la celda. */
  onMoved(): void {
    this.px = this.cx;
    this.py = this.cy;
  }

  /**
   * La celda sigue a la posicion fina.
   *
   * Lo llama la resolucion de choques, que corre despues de que todas las
   * piezas hayan hecho su paso: mueve `px`/`py` cuando dos bolas se separan, y
   * sin esto la celda se quedaria en el valor de antes del choque — que es la
   * que se pinta y con la que se come la arena.
   */
  syncCell(): void {
    this.cx = Math.round(this.px);
    this.cy = Math.round(this.py);
  }

  clear(_g: Grid): void {
    // Sin cuerpo que borrar.
  }

  ignite(b: Blast): void {
    this.wick.ignite(b, this.px, this.py, BALL_R);
  }

  /** Toque: si esta encendida, revienta ya. Apagada no hace nada. */
  tap(): void {
    this.wick.tap();
  }

  tick(c: TickCtx, dt: number): void {
    const g = c.grid;

    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      this.dead = true;
      return;
    }
    // Ya reventada: ni se mueve ni se come nada mientras se apaga el anillo.
    // Ha dejado de ser una bola.
    if (paso === 'humo') return;

    // Mientras se arrastra se queda quieta, o se escaparia del dedo.
    if (!this.held) {
      const prevX = this.px;
      const prevY = this.py;
      this.px += this.vx * dt;
      this.py += this.vy * dt;

      this.bounceEdges(g);
      this.bounceWalls(c, prevX, prevY);
      this.clampInside(g);

      this.cx = Math.round(this.px);
      this.cy = Math.round(this.py);
    }

    this.devour(g);
  }

  /** Limites de la zona jugable, en celdas. */
  private bounds(g: Grid): { lo: number; hiX: number; hiY: number } {
    return {
      lo: BALL_R,
      hiX: g.w - 1 - BALL_R,
      // Por abajo el limite es la zona jugable, no el borde del mundo: las
      // ultimas filas son el drenaje y la bola taparia esa linea.
      hiY: g.h - 1 - RESERVED_ROWS - BALL_R,
    };
  }

  private bounceEdges(g: Grid): void {
    const { lo, hiX, hiY } = this.bounds(g);
    // Se refleja la posicion ademas de invertir la velocidad: dejando solo la
    // velocidad, un paso largo puede terminar mas alla del borde y la bola se
    // queda vibrando pegada a el.
    if (this.px < lo) {
      this.px = lo + (lo - this.px);
      this.vx = Math.abs(this.vx);
    } else if (this.px > hiX) {
      this.px = hiX - (this.px - hiX);
      this.vx = -Math.abs(this.vx);
    }
    if (this.py < lo) {
      this.py = lo + (lo - this.py);
      this.vy = Math.abs(this.vy);
    } else if (this.py > hiY) {
      this.py = hiY - (this.py - hiY);
      this.vy = -Math.abs(this.vy);
    }
  }

  /**
   * Rebote contra el dibujo del usuario, y mordisco en el punto del golpe.
   *
   * La normal se calcula sumando hacia donde queda el centro de la bola desde
   * cada celda de pared que la toca. No basta con invertir el eje del
   * movimiento: casi nadie dibuja lineas rectas horizontales o verticales, y
   * contra un trazo inclinado esa simplificacion devuelve la bola por donde
   * vino en vez de desviarla, que es justo la gracia de poder dirigirla.
   *
   * De ese mismo recorrido sale ademas el centro de la zona de contacto, que es
   * donde muerde. Se usa el centro de las celdas que la tocan y no el punto de
   * su superficie en direccion de la normal porque contra una esquina o un
   * trazo casi tangente los dos no coinciden, y la mella tiene que quedar donde
   * se ha visto el impacto.
   */
  private bounceWalls(c: TickCtx, prevX: number, prevY: number): void {
    const g = c.grid;
    const r2 = BALL_R * BALL_R;
    const cx = Math.round(this.px);
    const cy = Math.round(this.py);
    const y0 = Math.max(0, cy - BALL_R);
    const y1 = Math.min(g.h - 1, cy + BALL_R);
    const x0 = Math.max(0, cx - BALL_R);
    const x1 = Math.min(g.w - 1, cx + BALL_R);

    let sx = 0;
    let sy = 0;
    let mx = 0;
    let my = 0;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy > r2) continue;
        if (g.mat[g.idx(x, y)] !== WALL) continue;
        // Vector de la celda hacia el centro: sumados, apuntan hacia afuera.
        sx -= dx;
        sy -= dy;
        mx += x;
        my += y;
        n++;
      }
    }
    if (n === 0) return;

    const len = Math.hypot(sx, sy);
    if (len < 1e-6) {
      // Sepultada en una masa simetrica de pared —le han dibujado encima— y no
      // hay una direccion de salida mejor que otra, asi que se devuelve por
      // donde vino. El mordisco va a plena fuerza: es lo que la deja abrirse
      // una cavidad y salir, en vez de quedarse dentro rebotando para siempre.
      this.vx = -this.vx;
      this.vy = -this.vy;
      this.chip(g, mx / n, my / n, 1, c.rand);
      return;
    }

    const nx = sx / len;
    const ny = sy / len;
    const vn = this.vx * nx + this.vy * ny;
    // Solo si va hacia dentro. Sin esta condicion, una bola que ya se esta
    // separando se refleja otra vez y se queda pegada al muro temblando; y
    // ademas seguiria comiendose la pared mientras se aleja de ella.
    if (vn < 0) {
      this.vx -= 2 * vn * nx;
      this.vy -= 2 * vn * ny;
      // La fuerza del mordisco es la componente normal de la velocidad, no la
      // rapidez: un golpe de refilon apenas raya la pared y uno de frente saca
      // un bocado. Es lo que permite dirigir el desgaste con el trazo — una
      // rampa tendida aguanta y un muro puesto de frente se gasta.
      this.chip(g, mx / n, my / n, Math.min(1, -vn / SPEED), c.rand);
    }
    // Vuelve a donde no chocaba y se aparta un poco por la normal. Lo segundo
    // es lo que la saca cuando la pared ha aparecido encima de ella.
    this.px = prevX + nx * PUSH_OUT;
    this.py = prevY + ny * PUSH_OUT;
  }

  /**
   * Arranca un mordisco de pared alrededor del punto de impacto.
   *
   * La probabilidad cae hacia el borde en vez de cortar a radio fijo, igual que
   * en el boquete de la bomba: una mella de compas en mitad de un trazo hecho a
   * mano se lee como un recorte, no como un golpe. Solo se lleva WALL, que es
   * lo que dibuja el usuario; el suelo del mundo y los cuerpos de otras piezas
   * no son suyos y ademas se reescriben solos cada paso.
   */
  private chip(g: Grid, atX: number, atY: number, force: number, rand: () => number): void {
    const y0 = Math.max(0, Math.floor(atY - BITE_R));
    const y1 = Math.min(g.h - 1, Math.ceil(atY + BITE_R));
    const x0 = Math.max(0, Math.floor(atX - BITE_R));
    const x1 = Math.min(g.w - 1, Math.ceil(atX + BITE_R));

    for (let y = y0; y <= y1; y++) {
      const dy = y - atY;
      for (let x = x0; x <= x1; x++) {
        const dx = x - atX;
        const d = Math.hypot(dx, dy);
        if (d > BITE_R) continue;
        const i = g.idx(x, y);
        if (g.mat[i] !== WALL) continue;
        if (rand() < force * BITE_P * (1 - d / (BITE_R + 1))) g.removeAt(i);
      }
    }
    // Lo que aguantaba encima de lo que se acaba de ir tiene que desplomarse.
    g.wakeRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** El empuje de salida puede haberla sacado del lienzo. */
  private clampInside(g: Grid): void {
    const { lo, hiX, hiY } = this.bounds(g);
    if (this.px < lo) this.px = lo;
    else if (this.px > hiX) this.px = hiX;
    if (this.py < lo) this.py = lo;
    else if (this.py > hiY) this.py = hiY;
  }

  /** Se lleva la arena que le cabe dentro. Las paredes dibujadas no se tocan. */
  private devour(g: Grid): void {
    const r2 = BALL_R * BALL_R;
    const y0 = Math.max(0, this.cy - BALL_R);
    const y1 = Math.min(g.h - 1, this.cy + BALL_R);
    const x0 = Math.max(0, this.cx - BALL_R);
    const x1 = Math.min(g.w - 1, this.cx + BALL_R);

    for (let y = y0; y <= y1; y++) {
      const dy = y - this.cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - this.cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = g.idx(x, y);
        if (g.mat[i] === SAND) g.removeAt(i);
      }
    }
    // Lo que quedaba encima se desmorona en el hueco que acaba de abrir.
    g.wakeRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  draw(d: DrawCtx): void {
    const { ctx, s } = d;
    const cx = (this.cx + 0.5) * s;
    const cy = (this.cy + 0.5) * s;

    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }

    ctx.save();
    // Del mismo material que las paredes que dibuja el usuario: relleno con el
    // color de la masa y filete con el de la linea, que es exactamente como se
    // ve un trazo suyo. En negro sobre el fondo negro seria invisible.
    ctx.fillStyle = rgbCss(THEME.structure);
    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, BALL_R * s, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Lo mismo que lleva la bomba encendida, y a proposito: el aro tenue del
    // alcance y el arco de mecha que se vacia. Una bola encendida es una bomba,
    // y tiene que avisar de lo que se va a llevar con el mismo idioma — sobre
    // todo esta, que ademas lo lleva paseando por el lienzo.
    this.wick.drawFuse(d, this.cx, this.cy, BALL_R);
  }
}

/**
 * Choque entre bolas.
 *
 * Vive fuera de la clase porque no es comportamiento de ninguna bola por
 * separado: si cada una resolviera su choque por su cuenta, el par se
 * resolveria dos veces y el intercambio se anularia solo.
 *
 * Todas pesan igual, asi que un choque elastico se reduce a intercambiar la
 * componente de la velocidad a lo largo de la linea que une los centros; la
 * componente perpendicular no la toca ninguna de las dos.
 */
export function resolveBallCollisions(balls: readonly Ball[]): void {
  const min = BALL_R * 2;

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i]!;
      const b = balls[j]!;
      // Una bola en la mano hace de pared inmovil: no se la puede empujar.
      if (a.held && b.held) continue;

      let dx = b.px - a.px;
      let dy = b.py - a.py;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;

      if (d < 1e-6) {
        // Exactamente superpuestas: no hay linea de centros que valga y hay que
        // inventarse una o la division de abajo revienta.
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;

      // Separarlas, a partes iguales salvo que una este agarrada.
      const overlap = min - d;
      if (a.held) {
        b.px += nx * overlap;
        b.py += ny * overlap;
      } else if (b.held) {
        a.px -= nx * overlap;
        a.py -= ny * overlap;
      } else {
        a.px -= nx * overlap * 0.5;
        a.py -= ny * overlap * 0.5;
        b.px += nx * overlap * 0.5;
        b.py += ny * overlap * 0.5;
      }

      // Velocidad relativa a lo largo de la normal. Si es negativa ya se estan
      // separando —se tocan por un solape que aun se esta deshaciendo— y
      // rebotar otra vez las dejaria enganchadas.
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) continue;

      if (!a.held) {
        a.vx -= vn * nx;
        a.vy -= vn * ny;
      }
      if (!b.held) {
        b.vx += vn * nx;
        b.vy += vn * ny;
      }

      // La direccion sale de la fisica, pero la rapidez se devuelve a su valor
      // nominal. Un choque de refilon reparte la energia de forma desigual y
      // puede dejar una bola casi parada; ademas el rebote contra los bordes y
      // contra el dibujo ya conserva la rapidez, asi que una bola que ademas
      // frenase al chocar con otra seria de otro material.
      if (!a.held) renormalize(a);
      if (!b.held) renormalize(b);

      a.syncCell();
      b.syncCell();
    }
  }
}

function renormalize(b: Ball): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 1e-6) {
    const a = Math.random() * TAU;
    b.vx = Math.cos(a) * SPEED;
    b.vy = Math.sin(a) * SPEED;
    return;
  }
  const k = SPEED / sp;
  b.vx *= k;
  b.vy *= k;
}
