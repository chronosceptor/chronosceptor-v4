import type { Grid } from '../grid';
import { drawJetHint, jetBox, type DrawCtx } from '../render';
import { mulberry32 } from '../rng';
import { Source, SPREAD_ROWS } from '../world';
import { Wick } from './blast';
import type { Blast, Gadget, TickCtx } from './index';

/** Radio de agarre, en celdas. */
const GRAB_R = 12;
/**
 * Caudal, en granos/s. Por debajo de la fuente principal (1.575 en escritorio):
 * es un chorro secundario, y a caudal igual compite con el original.
 */
const RATE = 1125;
/**
 * Semiancho de la boquilla, en celdas. Es el techo real del caudal, no `RATE`.
 *
 * Con 3 celdas del grano grueso de entonces se veia el problema que el README
 * ya documenta para la fuente
 * principal: la boquilla solo puede sembrar en sus celdas libres, asi que
 * rechaza lo que no cabe y el chorro sale a guiones en vez de como un hilo. Se
 * pedian 320 granos/s y salian del orden de 180.
 */
const NOZZLE = 6;
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
 * Lo que sigue viendose el cono despues de soltar la fuente, en segundos.
 *
 * Es el acuse de recibo de la colocacion. Sin el, poner una fuente de un toque
 * en la ficha del dock no se distingue de no ponerla: aterriza en el centro,
 * como la bola y la bomba, pero ahi no hay nada que aparezca —no tiene cuerpo—
 * y su chorro sale por dentro del que ya baja del centro. La escena queda
 * identica y el gesto parece perdido.
 *
 * Se va desvaneciendo en vez de apagarse de golpe porque lo que hay que leer no
 * es el contorno, es donde ha caido: el desvanecido deja mirar el sitio un rato
 * despues de haber dejado de mirar la ficha.
 */
const PLACED_HINT = 1.2;

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
   * Se coge por el chorro, que es lo unico que hay de ella a la vista.
   *
   * Cuelga entera por debajo del centro —el centro es el vertice, donde nace el
   * primer grano—, asi que un circulo centrado ahi prometeria un objetivo que
   * no es el que se ve.
   */
  get grabBox(): { half: number; up: number; down: number } {
    return jetBox(this.source);
  }

  readonly permanent: boolean;
  held = false;

  private readonly source: Source;
  /** Apagada mientras nada le estalle al lado. Una bomba se la lleva. */
  private readonly wick = new Wick();
  /** Segundos que le quedan a la fija para volver de una explosion. */
  private dark = 0;
  /** Segundos que le quedan al acuse de recibo de la colocacion. */
  private placed = 0;

  /**
   * `adoptada` es la `Source` que ya existia; solo la pasa la fuente fija de la
   * escena, que no puede fabricarse una nueva porque el drenaje y los cambios
   * de cancion hablan con la del mundo.
   */
  constructor(
    public cx: number,
    public cy: number,
    adoptada?: Source,
    /**
     * Finura del grano (`Profile.k`). Uno salvo con `?cell=N`.
     *
     * `NOZZLE` y `RATE` estan escritos en celdas y en granos/s para el grano de
     * serie: con el grano fino, dejarlos tal cual daria un chorro de la mitad de
     * ancho y con un caudal que no llena lo que llenaba. Ver `regrain`.
     */
    k = 1,
  ) {
    this.permanent = adoptada !== undefined;
    this.source =
      adoptada ??
      new Source(
        cx,
        Math.max(1, Math.round(NOZZLE * k)),
        Math.round(RATE * k * k),
        COLOR_PERIOD,
        mulberry32((Date.now() ^ (cx * 2654435761)) >>> 0),
        cy,
        Math.max(1, Math.round(SPREAD_ROWS * k)),
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

  onPlaced(): void {
    this.placed = PLACED_HINT;
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
    // Antes de cualquier salida temprana: el acuse de recibo corre igual aunque
    // la fuente este reventada, o se quedaria congelado esperando a que vuelva.
    if (this.placed > 0) this.placed -= dt;

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

  /**
   * En reposo no se pinta nada: la fuente es invisible y lo unico que se ve de
   * ella es la arena saliendo del vertice y abriendose. De eso se trata.
   *
   * Solo hay cuatro momentos en los que si tiene que verse algo, y ninguno es
   * el normal: mientras la llevas, el instante justo despues de soltarla,
   * mientras esta reventada y mientras vuelve.
   */
  draw(d: DrawCtx): void {
    if (this.wick.blown) {
      this.wick.drawRing(d, this.cx, this.cy);
      return;
    }
    // Rehaciendose: el contorno del cono entra poco a poco. Es la unica senal de
    // que el chorro va a volver; sin ella, el rato sin arena se lee como que la
    // has roto para siempre.
    if (this.dark > 0) {
      const { ctx } = d;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.88 * (1 - this.dark / REBIRTH);
      drawJetHint(d, this.source, this.cx, this.cy);
      ctx.restore();
      return;
    }
    // Mientras la llevas —o mientras es el fantasma de una ficha del dock, que
    // tambien nace `held`— se ensena por donde va a salir la arena. Colocar a
    // ciegas una pieza que no se ve es colocarla al azar.
    if (this.held) {
      const { ctx } = d;
      ctx.save();
      drawJetHint(d, this.source, this.cx, this.cy);
      ctx.restore();
    } else if (this.placed > 0) {
      // Recien colocada: el mismo cono, apagandose. Es la continuacion natural
      // del que se veia mientras la llevabas —y el unico que se llega a ver
      // cuando la pieza se coloca de un toque, sin arrastre ninguno.
      const { ctx } = d;
      ctx.save();
      ctx.globalAlpha = this.placed / PLACED_HINT;
      drawJetHint(d, this.source, this.cx, this.cy);
      ctx.restore();
    }
    this.wick.drawFuse(d, this.cx, this.cy, GRAB_R);
  }
}
