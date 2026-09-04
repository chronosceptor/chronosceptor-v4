import type { Grid } from './grid';
import { SAND } from './materials';

/**
 * Frames en los que se recorre la rejilla entera. A 60 Hz, una pasada por
 * segundo.
 *
 * Amortizado a franjas de filas y no de golpe: el barrido es el unico sitio del
 * proyecto que toca celdas dormidas, asi que hacerlo entero cada frame seria
 * pagar el lienzo completo 60 veces por segundo justo para evitar tener que
 * pagarlo. Repartido son unas 8.000 celdas por frame en escritorio, un
 * recorrido lineal de un `Uint8Array`.
 */
const SWEEP_FRAMES = 60;
/**
 * Humedad que pierde un grano en cada pasada, o sea por segundo.
 *
 * Con 8, un grano saturado tarda unos 32 s en quedar seco del todo — el tiempo
 * que tarda un monton de lodo en volver a desmoronarse como arena. Es una
 * perilla de gusto: subirlo hace el lodo un efecto pasajero, bajarlo lo vuelve
 * permanente a efectos practicos.
 */
const DRY = 8;
/**
 * Humedad que como mucho pasa un grano al de debajo en cada pasada.
 *
 * Sin este filtrado el agua se queda en la costra de arriba: el charco moja la
 * primera fila, esa fila se satura y deja de beber, y el monton entero por
 * debajo sigue seco mientras encima se acumula agua que no entra. Con el, el
 * mojado abre un frente que baja — que es como se comporta un vertido de
 * verdad, y ademas libera la superficie para que siga absorbiendo.
 */
const SEEP = 64;

/**
 * Filtrado y secado de la humedad.
 *
 * Va aparte del automata a proposito. `physics.step` solo mira celdas
 * despiertas, y la arena mojada asentada duerme: si el secado viviera ahi, un
 * monton de lodo se dormiria entero y no volveria a secarse jamas. Este barrido
 * es lo unico que puede despertarlo, y por eso llama a `wake` en cuanto la
 * humedad de una celda cambia — sin eso el lodo se secaria en el array y
 * seguiria de pie en la pantalla.
 */
export function moisture(g: Grid, frame: number): void {
  const { w, h, mat, wet } = g;
  const rows = Math.ceil(h / SWEEP_FRAMES);
  const y0 = (frame % SWEEP_FRAMES) * rows;
  const y1 = Math.min(h, y0 + rows);

  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const v = wet[i]!;
      if (v === 0 || mat[i] !== SAND) continue;

      let n = v;
      if (y + 1 < h) {
        const b = i + w;
        if (mat[b] === SAND) {
          const vb = wet[b]!;
          // La mitad de la diferencia, con tope: pasar toda la diferencia haria
          // que la humedad rebotara arriba y abajo en vez de repartirse.
          const t = vb < n ? Math.min(SEEP, (n - vb) >> 1) : 0;
          if (t > 0) {
            wet[b] = vb + t;
            n -= t;
            g.wake(x, y + 1);
          }
        }
      }

      n = n > DRY ? n - DRY : 0;
      wet[i] = n;
      if (n !== v) g.wake(x, y);
    }
  }
}
