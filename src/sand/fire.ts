import type { Grid } from './grid';
import { SAND, WALL, WATER } from './materials';
import { THEME } from './palette';
import type { DrawCtx } from './render';

/**
 * Cuantas celdas pueden estar ardiendo a la vez.
 *
 * Un frente normal son unas doscientas —la banda encendida mide `BURN_TIME`
 * segundos de avance por el grosor de la brocha—, asi que esto es holgura para
 * varios incendios simultaneos y no un numero al que se llegue jugando. Al
 * tope, prender falla en silencio: el fuego deja de crecer pero lo que ya arde
 * termina de arder. Es preferible a reservar un array del tamano del lienzo,
 * que serian 2,6 MB para algo que casi siempre esta vacio.
 */
const CAP = 16384;

/**
 * Lo que tarda una celda de pared en consumirse, en segundos.
 *
 * No es la velocidad del fuego —esa la manda `FRONT_SPEED`—, es la longitud de
 * la estela: a 90 celdas/s, con 0,7 s arden unas 63 celdas por detras del
 * frente. Es lo que se lee como una mecha y no como un punto que avanza.
 */
const BURN_TIME = 0.7;

/**
 * Velocidad del frente, en celdas/s y para el grano de serie.
 *
 * Va por LONGITUD, asi que se multiplica por `k` como la boquilla y el cono
 * (ver `regrain` en `world.ts`). Con 90, un trazo que cruce un escritorio —unas
 * 800 celdas— arde en unos nueve segundos.
 *
 * Se propaga en pasadas de una celda y no dando saltos del tamano del paso: un
 * radio de dos celdas iria al doble de deprisa, pero cruzaria los huecos de una
 * celda, y que el fuego no salte los cortes es media gracia del cortafuegos.
 */
const FRONT_SPEED = 90;

/** Estados de `mark`, indexado por celda. */
const APAGADA = 0;
const ARDE = 1;
/** Ya intento prender a sus vecinas: no se vuelve a mirar. */
const ARDE_YA_CONTAGIO = 2;

/**
 * El fuego: paredes del usuario ardiendo.
 *
 * Vive fuera del automata, como la ejecta y por la misma razon. `physics.step`
 * despacha 326.000 celdas por frame y su bucle caliente esta escrito para no
 * tener ni una rama de mas —el guardia son dos comparaciones contra literales y
 * no una tabla, y eso esta medido—, asi que un material nuevo que ardiera se
 * pagaria en cada celda del lienzo para algo que ocurre en doscientas.
 *
 * Por eso una celda que arde SIGUE SIENDO `WALL` en `mat`: no hay material
 * nuevo, `SOLID` no cambia, el bitmap de arena no gana una comparacion y la
 * arena se sigue apoyando encima hasta que la pared desaparece de verdad. Lo
 * unico que hay aparte es esta lista y un byte por celda para saber cual esta
 * ya encendida.
 */
export class Fire {
  private readonly cells = new Int32Array(CAP);
  /** Segundos que le quedan a cada celda de la lista. */
  private readonly left = new Float32Array(CAP);
  private n = 0;
  /** Por celda del grid: `APAGADA`, `ARDE` o `ARDE_YA_CONTAGIO`. */
  private mark = new Uint8Array(0);
  /** Ancho del grid, para deshacer el indice de celda al pintar. */
  private gw = 1;
  /** Pasadas de contagio pendientes. El frente avanza una celda por pasada. */
  private acc = 0;

  get count(): number {
    return this.n;
  }

  /**
   * Ata la capa a un grid. Hay que llamarlo en cada `build()`: los indices de
   * celda no significan nada en un grid de otro tamano.
   */
  attach(g: Grid): void {
    this.mark = new Uint8Array(g.size);
    this.gw = g.w;
    this.n = 0;
    this.acc = 0;
  }

  clear(): void {
    this.mark.fill(APAGADA);
    this.n = 0;
    this.acc = 0;
  }

  /** ¿Arde esta celda? Para `dump()`. */
  burning(i: number): boolean {
    return this.mark[i] !== APAGADA;
  }

  /**
   * Prende una celda.
   *
   * Solo arde `WALL`, que es lo que dibuja el usuario. La arena no arde, y el
   * suelo del mundo (`LEDGE`, que ademas lleva el sumidero) tampoco: es la
   * misma linea que traza `detonateAt` para decidir que se lleva una explosion.
   */
  light(g: Grid, x: number, y: number): boolean {
    if (!g.inBounds(x, y)) return false;
    const i = y * g.w + x;
    if (g.mat[i] !== WALL) return false;
    if (this.mark[i] !== APAGADA) return false;
    if (this.n >= CAP) return false;
    if (mojada(g, x, y)) return false;
    this.mark[i] = ARDE;
    this.cells[this.n] = i;
    this.left[this.n] = BURN_TIME;
    this.n++;
    return true;
  }

  /**
   * Un paso.
   *
   * `spark` se llama con cada celda que se enciende en este paso, y solo con
   * esas: es lo que prende las piezas. Avisando en cada frame de cada celda que
   * ya ardia, el coste seria el frente entero por el numero de piezas y por
   * fotograma, para repetir un aviso que la mecha ya ha recibido.
   */
  step(g: Grid, dt: number, k: number, spark: (x: number, y: number) => void): void {
    if (this.n === 0) {
      this.acc = 0;
      return;
    }
    const { w, mat } = g;

    // Consumo y apagado. Se recorre hacia atras para poder sacar de la lista
    // intercambiando con la ultima sin saltarse la siguiente.
    for (let j = this.n - 1; j >= 0; j--) {
      const i = this.cells[j]!;
      const x = i % w;
      const y = (i / w) | 0;

      // La borro otra cosa: la goma, una bomba, o el fuego de al lado al
      // derrumbarse el trazo. La entrada se queda apuntando a una celda vacia.
      if (mat[i] !== WALL) {
        this.mark[i] = APAGADA;
        this.swapOut(j);
        continue;
      }

      // El agua lo apaga y la pared se salva. Es lo unico que salva un trazo ya
      // prendido, y lo que hace que echarle agua a un incendio signifique algo.
      if (mojada(g, x, y)) {
        this.mark[i] = APAGADA;
        this.swapOut(j);
        g.wake(x, y);
        continue;
      }

      const t = this.left[j]! - dt;
      if (t <= 0) {
        this.mark[i] = APAGADA;
        this.swapOut(j);
        g.removeAt(i);
        continue;
      }
      this.left[j] = t;
    }

    // Contagio. El frente avanza una celda por pasada y `FRONT_SPEED` celdas
    // por segundo, asi que a 60 Hz salen una o dos pasadas por paso; el resto
    // se acumula para que una velocidad no entera no se pierda por el camino.
    this.acc += FRONT_SPEED * k * dt;
    let pasadas = 0;
    while (this.acc >= 1 && pasadas < 8) {
      this.acc -= 1;
      pasadas++;
      // Se copia el corte de la lista antes de empezar: lo que se encienda en
      // esta pasada pertenece a la siguiente, o el frente avanzaria de golpe
      // hasta el final del trazo en un solo fotograma.
      const hasta = this.n;
      for (let j = 0; j < hasta; j++) {
        if (this.mark[this.cells[j]!] === ARDE_YA_CONTAGIO) continue;
        const i = this.cells[j]!;
        this.mark[i] = ARDE_YA_CONTAGIO;
        const x = i % w;
        const y = (i / w) | 0;
        // Ocho vecinas y no cuatro: Bresenham deja los trazos inclinados
        // conectados solo en diagonal, asi que con cuatro una raya torcida no
        // arderia mas alla de la primera celda.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (this.light(g, x + dx, y + dy)) spark(x + dx, y + dy);
          }
        }
      }
    }
    if (this.n === 0) this.acc = 0;
  }

  private swapOut(j: number): void {
    this.n--;
    this.cells[j] = this.cells[this.n]!;
    this.left[j] = this.left[this.n]!;
  }

  /**
   * Las celdas encendidas, en la capa vectorial y encima del bitmap.
   *
   * Tres cubos de intensidad y tres rellenos, no un `fillStyle` por celda: son
   * doscientas celdas y cambiar el estilo doscientas veces por frame cuesta
   * mas que dibujarlas.
   *
   * Y marcas duras del tamano de la celda, sin halo ni velo por encima: el
   * color de la arena es lo unico saturado de la escena y cualquier capa
   * translucida superpuesta lo apaga — ya paso con unas rayas que volvian el
   * amarillo un verde sucio.
   */
  draw({ ctx, s }: DrawCtx): void {
    if (this.n === 0) return;
    const viva: number[] = [];
    const media: number[] = [];
    const brasa: number[] = [];
    for (let j = 0; j < this.n; j++) {
      const f = this.left[j]! / BURN_TIME;
      const dest = f > 0.66 ? viva : f > 0.33 ? media : brasa;
      dest.push(this.cells[j]!);
    }
    ctx.save();
    this.fill(ctx, s, viva, THEME.fire, 1);
    this.fill(ctx, s, media, THEME.fire, 0.6);
    this.fill(ctx, s, brasa, THEME.ember, 0.85);
    ctx.restore();
  }

  private fill(
    ctx: CanvasRenderingContext2D,
    s: number,
    list: number[],
    color: string,
    alpha: number,
  ): void {
    if (list.length === 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const i of list) {
      const x = i % this.gw;
      const y = (i / this.gw) | 0;
      ctx.rect(x * s, y * s, s, s);
    }
    ctx.fill();
  }
}

/**
 * ¿Toca agua esta celda?
 *
 * Cuenta el charco y tambien la arena mojada: el lodo apaga igual que el agua,
 * y sin eso una pared metida en barro ardería tan tranquila. La humedad de una
 * celda solo significa algo si es `SAND` — en cualquier otra es un byte viejo.
 */
function mojada(g: Grid, x: number, y: number): boolean {
  const { w, h, mat, wet } = g;
  const x0 = x > 0 ? x - 1 : 0;
  const x1 = x < w - 1 ? x + 1 : w - 1;
  const y0 = y > 0 ? y - 1 : 0;
  const y1 = y < h - 1 ? y + 1 : h - 1;
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * w;
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx;
      const m = mat[i]!;
      if (m === WATER) return true;
      if (m === SAND && wet[i]! > 0) return true;
    }
  }
  return false;
}
