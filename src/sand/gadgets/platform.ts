import type { Grid } from '../grid';
import { DYN, EMPTY, SAND } from '../materials';
import { THEME } from '../palette';
import type { DrawCtx } from '../render';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

const TAU = Math.PI * 2;
/** Largo de la bandeja, en celdas. */
const LEN = 26;
/** Recorrido a cada lado del punto donde se solto, en celdas. */
const RANGE = 40;
/** Velocidad de patrulla, en celdas/s. */
const SPEED = 14;
/** Radio de agarre. Generoso a proposito: con el dedo hay que poder cogerla. */
const GRAB_R = 13;
/**
 * Alto de los costados, en celdas. Es la cabida de la bandeja.
 *
 * Sin costados no transporta practicamente nada: un monton tiene su angulo de
 * reposo, asi que en cuanto es mas alto que media barra su falda sobresale por
 * los dos extremos y se descuelga por ellos. Lo que le cae encima se cae al
 * lado de donde cayo, y entonces la plataforma no aleja el material de su
 * origen, que es justamente para lo que uno la pone.
 */
const LIP = 8;

/**
 * Bandeja que patrulla de izquierda a derecha llevandose la carga.
 *
 * Suelo y dos costados, y lo que va dentro viaja con ella: cada vez que avanza
 * una celda, traslada una celda lo que lleva encima. Eso es lo que la hace
 * transportar de verdad, y cuesta creer lo que costo llegar hasta aqui.
 *
 * Primero fue una barra solida, y se escurria por debajo del monton: el suelo
 * se retira de la celda que abandona y lo que habia encima se cuela por el
 * hueco. Despues fue material de cinta (BELT_L / BELT_R), aprovechando el
 * arrastre por rozamiento que `physics.ts` llevaba escrito y sin usar desde la
 * fabrica original. Parecia la respuesta y no lo era: **la cinta no puede mover
 * una carga compacta**. El arrastre es un paso lateral y `slideLateral` exige
 * que la celda de destino este vacia, asi que en una bandeja llena el unico
 * grano que puede moverse es el de delante de cada capa — y ese esta contra el
 * costado. Medido: la bandeja salia de debajo del chorro con 124 granos y
 * llegaba al otro extremo con 22. Los otros 102 no es que se cayeran por
 * ningun sitio: es que nunca se movieron, y la bandeja se fue de debajo.
 *
 * Trasladar la carga a mano no es hacer trampa: es lo mismo que ya hace
 * `Grid.stamp()` cuando aparta el grano que le estorba a una pieza, solo que en
 * bloque. Y sale mas barato que el arrastre — 208 celdas repasadas cada vez que
 * avanza una celda, catorce veces por segundo.
 *
 * Cargada por encima de los costados rebosa, claro. Es una bandeja llena y se
 * lee como tal: lo que sobra se queda por el camino y el resto sigue viaje.
 */
export class Platform implements Gadget {
  readonly kind = 'platform';
  readonly radius = GRAB_R;
  dead = false;

  /** Centro de la patrulla. La bandeja va y viene alrededor de el. */
  private homeX: number;
  /** Desplazamiento respecto al centro, en celdas. En coma flotante: a 14
   *  celdas/s avanza 0,23 celdas por paso y en enteros no se moveria. */
  private offset = 0;
  private dir: 1 | -1 = 1;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva, con carga y todo. */
  private readonly wick = new Wick();
  private box: [number, number, number, number] | null = null;

  constructor(
    public cx: number,
    public cy: number,
  ) {
    this.homeX = cx;
  }

  /** El arrastre la ha recolocado: la patrulla se recentra donde se solto. */
  onMoved(): void {
    this.homeX = this.cx;
    this.offset = 0;
  }

  clear(g: Grid): void {
    if (!this.box) return;
    const [x0, y0, x1, y1] = this.box;
    g.clearStructure(x0, y0, x1, y1, DYN);
    g.wakeRect(x0, y0, x1, y1);
    this.box = null;
  }

  /** Toque: si esta encendida, revienta ya. Apagada no hace nada. */
  tap(): void {
    this.wick.tap();
  }

  ignite(b: Blast): void {
    this.wick.ignite(b, this.cx, this.cy, LEN >> 1);
  }

  tick(c: TickCtx, dt: number): void {
    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      this.dead = true;
      return;
    }
    // Reventada, no vuelve a estampar el cuerpo: la carga que llevaba se queda
    // en el aire y cae, que es exactamente lo que tiene que pasarle a un carro
    // al que le acaban de volar el suelo.
    if (paso === 'humo') return;

    const g = c.grid;
    const half = LEN >> 1;
    // Ambos extremos se recortan al mundo y `hi` nunca baja de `lo`: en un grid
    // estrecho, o con un centro de patrulla fuera de rango, un intervalo
    // invertido manda la bandeja a rebotar entre dos puntos imposibles.
    const lo = Math.max(half, Math.min(g.w - 1 - half, this.homeX - RANGE));
    const hi = Math.max(lo, Math.min(g.w - 1 - half, this.homeX + RANGE));

    const antes = this.cx;
    this.offset += this.dir * SPEED * dt;
    let x = this.homeX + this.offset;
    if (x >= hi) {
      x = hi;
      this.offset = hi - this.homeX;
      this.dir = -1;
    } else if (x <= lo) {
      x = lo;
      this.offset = lo - this.homeX;
      this.dir = 1;
    }
    this.cx = Math.round(x);

    // La carga se mueve antes de reescribir el cuerpo, y con el cuerpo viejo ya
    // borrado: la capa borra todas las piezas antes de que ninguna estampe, asi
    // que ahora mismo lo que hay dentro de la bandeja es arena en el aire y las
    // celdas a las que va no las ocupa ningun costado.
    if (this.cx !== antes) this.carry(g, antes - half, antes + half, Math.sign(this.cx - antes));

    const x0 = this.cx - half;
    const x1 = this.cx + half;
    // `pushDir` en el sentido de la marcha: el borde de ataque aparta hacia
    // delante la arena que se encuentra, en vez de hacia un lado al azar.
    for (let px = x0; px <= x1; px++) g.stamp(px, this.cy, DYN, this.dir);
    for (let py = this.cy - LIP; py < this.cy; py++) {
      g.stamp(x0, py, DYN, this.dir);
      g.stamp(x1, py, DYN, this.dir);
    }

    // La caja cubre todo el recorrido posible de un paso, no solo la bandeja:
    // si se limpiara justo su ancho, la celda que acaba de abandonar se quedaria
    // escrita y la plataforma iria dejando un rastro solido.
    this.box = [x0 - 2, this.cy - LIP - 1, x1 + 2, this.cy + 1];
    g.wakeRect(x0 - 2, this.cy - LIP - 2, x1 + 2, this.cy + 1);
  }

  /**
   * Traslada un paso la arena que va dentro.
   *
   * Se recorre empezando por delante: al reves, cada grano se estamparia encima
   * del siguiente y la carga se compactaria en una sola columna en vez de
   * moverse. El grano que no encuentra su celda libre —la bandeja esta entrando
   * en un monton— se queda donde esta y lo aparta luego el cuerpo al estamparse,
   * que es lo mismo que le pasa a cualquier pieza que embiste material.
   */
  private carry(g: Grid, fromX0: number, fromX1: number, dir: number): void {
    const { w, mat, col, vel } = g;
    const desde = dir === 1 ? fromX1 : fromX0;
    const hasta = dir === 1 ? fromX0 : fromX1;
    const paso = -dir;

    for (let y = this.cy - LIP; y < this.cy; y++) {
      if (y < 0) continue;
      for (let x = desde; ; x += paso) {
        const nx = x + dir;
        if (g.inBounds(x, y) && g.inBounds(nx, y)) {
          const i = y * w + x;
          const ni = y * w + nx;
          if (mat[i] === SAND && mat[ni] === EMPTY) {
            mat[ni] = SAND;
            col[ni] = col[i]!;
            vel[ni] = 0;
            mat[i] = EMPTY;
            col[i] = 0;
            // sandCount no cambia: el grano se ha movido, no se ha creado.
            g.wake(x, y);
            g.wake(nx, y);
          }
        }
        if (x === hasta) break;
      }
    }
  }

  draw(d: DrawCtx): void {
    const { ctx, s } = d;

    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }

    const half = LEN >> 1;
    const y = Math.round(this.cy * s) + 0.5;
    const xa = (this.cx - half) * s;
    const xb = (this.cx + half + 1) * s;

    ctx.strokeStyle = THEME.structureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    // Los costados. Se pintan porque paran la arena de verdad: lo que se dibuja
    // tiene que ser lo que la para, igual que la cruz perdio su aro por sugerir
    // una llanta que no existia.
    ctx.moveTo(xa + 0.5, y);
    ctx.lineTo(xa + 0.5, y - LIP * s);
    ctx.moveTo(xb - 0.5, y);
    ctx.lineTo(xb - 0.5, y - LIP * s);
    ctx.stroke();

    // Ruedas girando. Antes eran poleas, de cuando el suelo era una cinta; ya no
    // lo es, y una polea diria que la carga se desliza por encima cuando lo que
    // hace es ir montada. Una rueda dice lo que pasa: el carro entero se mueve.
    const r = Math.max(3, s * 1.6);
    const phase = this.offset * 0.6;
    for (const px of [xa + r, xb - r]) {
      ctx.beginPath();
      ctx.arc(px, y + r, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, y + r);
      ctx.lineTo(px + Math.cos(phase) * r, y + r + Math.sin(phase) * r);
      ctx.stroke();
    }

    // Marcas tenues del recorrido: dicen hasta donde va a llegar antes de que
    // llegue, que es lo que evita colocarla y descubrir tarde que barre de mas.
    ctx.save();
    ctx.strokeStyle = THEME.structureSoft;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo((this.homeX - RANGE - half) * s, y);
    ctx.lineTo((this.homeX + RANGE + half + 1) * s, y);
    ctx.stroke();
    ctx.restore();

    this.wick.drawFuse(d, this.cx, this.cy, half);
  }
}
