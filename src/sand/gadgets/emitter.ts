import type { Grid } from '../grid';
import { drawNozzle, nozzleBox, type DrawCtx } from '../render';
import { mulberry32 } from '../rng';
import { Source } from '../world';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

/** Radio de agarre, en celdas. */
const GRAB_R = 8;
/**
 * Caudal, en granos/s. Por debajo de la fuente principal (700 en escritorio):
 * es un chorro secundario, y a caudal igual compite con el original.
 */
const RATE = 500;
/**
 * Semiancho de la boquilla, en celdas. Es el techo real del caudal, no `RATE`.
 *
 * Con 3 se veia el problema que el README ya documenta para la fuente
 * principal: la boquilla solo puede sembrar en sus celdas libres, asi que
 * rechaza lo que no cabe y el chorro sale a guiones en vez de como un hilo. Se
 * pedian 320 granos/s y salian del orden de 180.
 */
const NOZZLE = 4;
/** Segundos entre cambios de color dominante. */
const COLOR_PERIOD = 26;
/**
 * Lo que tarda la fuente fija en rehacerse despues de que se la lleve una bomba.
 *
 * Bastante para que se note que la has volado y el lienzo se quede sin chorro
 * —esa es toda la gracia de poder volarla—, pero no tanto como para que parezca
 * que la has roto para siempre. Las demas piezas no vuelven; esta no puede no
 * volver, porque sin ella no hay arena.
 */
const REBIRTH = 2.5;

/**
 * Fuente de arena colocable.
 *
 * Es la misma `Source` de la escena, solo que puesta donde el usuario quiera.
 * Cada una lleva su propio generador aleatorio, asi que rota su color dominante
 * por libre: con dos o tres repartidas, la cuenca deja de ser una papilla
 * uniforme y sale estratificada por chorros — que es justo lo que anticipaba el
 * comentario de `grainColor` mucho antes de que hubiera varios emisores.
 *
 * No tiene cuerpo solido: una boquilla que ademas fuese pared se taponaria con
 * su propia arena.
 *
 * La fuente fija de la escena es esta misma pieza, adoptando la `Source` que ya
 * vivia en el mundo (`Emitter.main`). Homologarla salio practicamente gratis y
 * a cambio se arrastra, estorba a las demas y se pinta por el mismo camino que
 * las otras cuatro; antes era un caso aparte que solo sabia estar arriba en el
 * centro. Lo unico que conserva de excepcion es que no ocupa hueco del tope y
 * que vaciar el lienzo la repone: volarla y tirarla se puede, como a cualquiera.
 */
export class Emitter implements Gadget {
  readonly kind = 'emitter';
  readonly radius = GRAB_R;
  dead = false;

  /**
   * Se coge por toda la tolva, no por el trocito de cano que hay alrededor de
   * la boca.
   *
   * Es un getter y no un campo porque el dibujo carga por red: hasta que llega,
   * lo que se pinta es el trazo vectorial, que es mucho mas pequeno, y el area
   * de agarre tiene que ser la de lo que se este viendo en ese momento.
   */
  get grabBox(): { half: number; up: number; down: number } {
    return nozzleBox(this.source.halfWidth);
  }

  readonly permanent: boolean;

  private readonly source: Source;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva. */
  private readonly wick = new Wick();
  /** Segundos que le quedan a la fija para volver de una explosion. */
  private dark = 0;

  /**
   * `adoptada` es la `Source` que ya existia; solo la pasa la fuente fija de la
   * escena, que no puede fabricarse una nueva porque el drenaje y los cambios
   * de cancion hablan con la del mundo.
   */
  constructor(
    public cx: number,
    public cy: number,
    adoptada?: Source,
  ) {
    this.permanent = adoptada !== undefined;
    this.source =
      adoptada ??
      new Source(
        cx,
        NOZZLE,
        RATE,
        COLOR_PERIOD,
        mulberry32((Date.now() ^ (cx * 2654435761)) >>> 0),
        cy,
      );
  }

  /** La fuente fija de la escena, envuelta como pieza. */
  static main(source: Source): Emitter {
    return new Emitter(source.x, source.y, source);
  }

  onMoved(): void {
    this.source.x = this.cx;
    this.source.y = this.cy;
  }

  clear(_g: Grid): void {
    // Sin cuerpo que borrar.
  }

  /** Toque: si esta encendida, revienta ya. Apagada no hace nada. */
  tap(): void {
    this.wick.tap();
  }

  ignite(b: Blast): void {
    // La fija tambien arde. Ser la unica pieza a la que una explosion no le
    // hacia nada se veia mal justo cuando mas se mira: la onda le pasa por
    // encima, se lleva la arena que tiene debajo y ella sigue manando. Lo que
    // no puede es perderse —sin ella el lienzo se queda sin arena y sin forma
    // de recuperarla—, asi que revienta como cualquiera y despues se rehace.
    this.wick.ignite(b, this.cx, this.cy, GRAB_R);
  }

  tick(c: TickCtx, dt: number): void {
    // Volada y rehaciendose: ni siembra ni se pinta entera. Va antes que la
    // mecha porque la mecha ya esta apagada — este es el rato de despues.
    if (this.dark > 0) {
      this.dark -= dt;
      if (this.dark > 0) return;
    }

    const paso = this.wick.step(c, dt, this.cx, this.cy);
    if (paso === 'fin') {
      if (!this.permanent) {
        this.dead = true;
        return;
      }
      this.wick.revive();
      this.dark = REBIRTH;
      return;
    }
    // Reventada, deja de manar. Una boquilla que sigue soltando arena desde
    // dentro de su propia explosion no se lee como una boquilla destruida.
    if (paso === 'humo') return;

    this.source.tick(c.grid, dt, c.palette, c.rand, c.budget);
  }

  draw(d: DrawCtx): void {
    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }
    // Rehaciendose: la boquilla reaparece atenuada y va cogiendo cuerpo. Es la
    // unica senal de que el chorro va a volver; sin ella, el rato sin arena se
    // lee como que la has roto.
    if (this.dark > 0) {
      const { ctx } = d;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.88 * (1 - this.dark / REBIRTH);
      ctx.setLineDash([2, 3]);
      drawNozzle(d, this.cx, this.cy, this.source.halfWidth);
      ctx.restore();
      return;
    }
    drawNozzle(d, this.cx, this.cy, this.source.halfWidth);
    this.wick.drawFuse(d, this.cx, this.cy, GRAB_R);
  }
}
