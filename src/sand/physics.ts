import type { Grid } from './grid';
import {
  BELT_L, BELT_R, CHUTE_L, CHUTE_R, EMPTY, SAND, SIEVE, SINK, WALL,
} from './materials';

/**
 * Celdas por frame que puede caer un grano en caída libre. Con valores altos el
 * chorro se rompe en guiones: los granos se separan más de lo que el emisor
 * puede rellenar y deja de leerse como un hilo continuo.
 *
 * Cinco y no tres desde que el grano es de 2 px: lo que no puede cambiar es la
 * velocidad en PANTALLA, y son celdas por frame. Con 5 caen 10 px por frame,
 * contra los 9 de las 3 celdas de 3 px. El margen de guiones no se estrecha,
 * al contrario: el caudal subio con el cuadrado de la finura y la velocidad
 * solo con la finura, asi que la columna va mas poblada que antes —5,2 granos
 * por fila contra 3,9—.
 */
const MAX_VEL = 5;
/**
 * Probabilidad de que un grano en caida libre se desplace una celda de lado.
 *
 * Sin esto el chorro no se abre nunca: los granos nacen con velocidad
 * horizontal cero y `vel` solo sabe de caida vertical, asi que la columna mide
 * abajo exactamente lo mismo que en la boquilla —medido: 10 celdas en la fila
 * 20, 10 en la 100— y se lee como una cortina rigida bajando, no como un
 * vertido. Con la deriva el ancho crece con la raiz de la distancia, que es
 * como se abre un chorro de verdad.
 *
 * Es la unica rama que se le ha anadido nunca al bucle caliente, y va aqui y no
 * en la fuente a proposito: que un grano cayendo pueda irse de lado es de la
 * caida, no de quien lo suelta. Cuesta un `rand()` por grano **en vuelo** y por
 * frame, no por grano: los asentados duermen. Medido con la escena cargada,
 * 1,07 -> 1,13 ms de simulacion de un presupuesto de 16,7.
 *
 * El valor es una perilla de gusto y el margen util es estrecho. Medido por la
 * desviacion tipica de la x de los granos, que arranca en 2,6 celdas por el
 * ancho de la boquilla: con 0,25 apenas se despega de ahi y no se nota; con 0,6
 * llega a 6,8 en la fila 150 pero deja de leerse como un chorro y pasa a
 * parecer rociado disperso. 0,4 abre lo justo para que se vea caer.
 */
const DRIFT_P = 0.4;
/** Pasos diagonales que da un grano por frame sobre una rampa. */
const CHUTE_STEPS = 5;
/** Probabilidad de que un grano atraviese una criba en un frame dado. */
const SIEVE_P = 0.06;
/**
 * Probabilidad de deslizamiento lateral hacia un desnivel cercano.
 *
 * Solo con las diagonales el talud queda clavado en 45°. Este arrastre lo
 * tiende: cuanto mas alto, mas se extiende el material y mas plano queda el
 * monton. Es la palanca que decide cuanta pantalla llega a cubrirse — con una
 * fuente central, un talud empinado forma un cono que por geometria no puede
 * alcanzar las esquinas por mucha arena que se le eche.
 */
const CREEP_P = 0.8;
/**
 * Hasta que distancia mira el arrastre para encontrar el desnivel, en celdas.
 *
 * Es lo que fija el talud de verdad, mas que `CREEP_P`: un grano se aparta si
 * hay un escalon a su alcance, asi que una ladera con menos pendiente que «una
 * fila cada CREEP_REACH celdas» ya no le da razones para moverse y ahi se para.
 * Con el alcance clavado en 2 el monton se asienta a poco menos de 45°, y un
 * cono de 45° con una sola fuente central toca la boquilla —y la ahoga— cuando
 * lleva 145.000 granos, la mitad del lienzo: el nivel de disparo del drenaje
 * no llegaba a alcanzarse nunca.
 */
const CREEP_REACH = 5;
/**
 * Capas de arena por encima de la banda que esta sigue arrastrando.
 *
 * Si solo se mueve la capa que toca la cinta, la banda transporta un grano de
 * alto y nada mas: con cualquier caudal decente el resto se apila en el punto
 * de caida y acaba desbordando por el extremo. Una cinta real arrastra el
 * monton entero por rozamiento, y sin esto la linea no fluye.
 */
const BELT_REACH = 8;
/**
 * Pasos diagonales seguidos que puede dar un grano por una ladera.
 * Con uno solo, un chorro intenso apila más rápido de lo que el montón alcanza
 * a repartir y crece una torre vertical imposible. Encadenando la caída se
 * comporta como una avalancha y los conos se mantienen en su ángulo.
 */
const AVALANCHE_STEPS = 5;

/**
 * Un paso de simulación.
 *
 * Recorre de abajo hacia arriba para que una columna en caída se desplace
 * completa en una sola pasada, y alterna el sentido en x cada frame: sin esa
 * alternancia los montones se recargan de forma visible hacia un lado.
 *
 * Solo se procesan las celdas despiertas. Un grano que no logró moverse se
 * duerme y solo lo revive un cambio en su vecindario 3x3, así una cuenca llena
 * y asentada cuesta prácticamente nada.
 */
export function step(g: Grid, rand: () => number, frame: number): void {
  const { w, h, size, mat, col, vel, awake, moved, beltSpeed } = g;
  moved.fill(0);
  const leftFirst = (frame & 1) === 0;

  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    const xStart = leftFirst ? 0 : w - 1;
    const xEnd = leftFirst ? w : -1;
    const xStep = leftFirst ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = row + x;
      if (mat[i] !== SAND || moved[i] === 1 || awake[i] === 0) continue;

      const belowY = y + 1;
      const below = belowY < h ? i + w : -1;

      // --- A. Caída libre con aceleración -------------------------------
      if (below >= 0 && mat[below] === EMPTY) {
        let v = vel[i]! + 1;
        if (v > MAX_VEL) v = MAX_VEL;
        let ny = y;
        for (let k = 0; k < v; k++) {
          const ty = ny + 1;
          if (ty >= h || mat[ty * w + x] !== EMPTY) break;
          ny = ty;
        }
        // Deriva lateral. Se prueba sobre la celda de destino ya calculada, de
        // modo que la caida manda y el desvio solo ocurre si hay hueco: un
        // grano que baja por una rendija estrecha sigue bajando recto.
        let nx = x;
        if (rand() < DRIFT_P) {
          const tx = x + (rand() < 0.5 ? -1 : 1);
          if (tx >= 0 && tx < w && mat[ny * w + tx] === EMPTY) nx = tx;
        }

        const dst = ny * w + nx;
        mat[dst] = SAND;
        col[dst] = col[i]!;
        vel[dst] = v;
        moved[dst] = 1;
        awake[dst] = 1;
        mat[i] = EMPTY;
        col[i] = 0;
        vel[i] = 0;
        g.wake(x, y);
        g.wake(nx, ny);
        continue;
      }

      // A partir de aquí el grano descansa sobre algo.
      vel[i] = 0;
      const under = below >= 0 ? mat[below]! : WALL;

      // --- B. Drenaje ---------------------------------------------------
      if (under === SINK) {
        g.removeAt(i);
        continue;
      }

      // --- C. Arrastre de banda transportadora --------------------------
      // Se busca la cinta hacia abajo atravesando la arena apilada encima, y
      // el arrastre pierde fuerza con la profundidad, como el rozamiento real.
      let beltMat = under;
      let beltAt = below;
      let depth = 0;
      if (under === SAND && below >= 0) {
        let k = below;
        for (let d = 1; d <= BELT_REACH; d++) {
          k += w;
          if (k >= size) break;
          const m = mat[k]!;
          if (m === SAND) continue;
          if (m === BELT_L || m === BELT_R) {
            beltMat = m;
            beltAt = k;
            depth = d;
          }
          break;
        }
      }
      if (beltMat === BELT_L || beltMat === BELT_R) {
        const bdir = beltMat === BELT_L ? -1 : 1;
        const grip = beltSpeed[beltAt]! * (1 - depth * 0.13);
        if (rand() * 255 < grip && slideLateral(g, x, y, i, bdir)) continue;
      }

      // --- D. Deslizamiento de rampa ------------------------------------
      if (under === CHUTE_L || under === CHUTE_R) {
        const dir = under === CHUTE_L ? -1 : 1;
        let cx = x;
        let cy = y;
        let ci = i;
        let slid = false;
        for (let s = 0; s < CHUTE_STEPS; s++) {
          const ni = tryDiagonal(g, cx, cy, ci, dir);
          if (ni < 0) break;
          slid = true;
          ci = ni;
          cx += dir;
          cy += 1;
        }
        if (slid) {
          moved[ci] = 1;
          continue;
        }
      }

      // --- E. Criba -----------------------------------------------------
      if (under === SIEVE && rand() < SIEVE_P) {
        const ty = y + 2;
        if (ty < h) {
          const t = ty * w + x;
          if (mat[t] === EMPTY) {
            mat[t] = SAND;
            col[t] = col[i]!;
            vel[t] = 0;
            awake[t] = 1;
            moved[t] = 1;
            mat[i] = EMPTY;
            col[i] = 0;
            g.wake(x, y);
            g.wake(x, ty);
            continue;
          }
        }
      }

      // --- F. Ángulo de reposo: diagonales, encadenadas en avalancha ----
      const first = rand() < 0.5 ? -1 : 1;
      let dir = first;
      let ni = tryDiagonal(g, x, y, i, dir);
      if (ni < 0) {
        dir = -first;
        ni = tryDiagonal(g, x, y, i, dir);
      }
      if (ni >= 0) {
        let cx = x + dir;
        let cy = y + 1;
        let ci = ni;
        for (let a = 1; a < AVALANCHE_STEPS; a++) {
          const nx = tryDiagonal(g, cx, cy, ci, dir);
          if (nx < 0) break;
          ci = nx;
          cx += dir;
          cy += 1;
        }
        moved[ci] = 1;
        continue;
      }

      // --- G. Arrastre lateral hacia un desnivel ------------------------
      if (rand() < CREEP_P) {
        const cd = rand() < 0.5 ? -1 : 1;
        if (tryCreep(g, x, y, i, cd) || tryCreep(g, x, y, i, -cd)) continue;
      }

      // --- H. Nada funcionó: a dormir -----------------------------------
      //
      // Salvo si lo sostiene una cinta o una criba. Esas dos siguen actuando
      // aunque el grano no se haya podido mover en este frame, y dormirlo lo
      // dejaria fuera del bucle para siempre: como solo lo despierta un cambio
      // en su vecindario, un monton compacto sobre una banda se duerme entero
      // a la vez y la linea se queda congelada sin que nada pueda revivirla.
      if (beltMat !== BELT_L && beltMat !== BELT_R && under !== SIEVE) awake[i] = 0;
    }
  }
}

/**
 * Diagonal abajo-`dir`. Exige que la celda lateral también esté libre; sin esa
 * condición la arena se cuela por las juntas diagonales y atraviesa las rampas
 * como si no existieran.
 * Devuelve el índice destino, o -1 si no se pudo.
 */
function tryDiagonal(g: Grid, x: number, y: number, i: number, dir: number): number {
  const { w, h, mat, col, vel, awake, moved } = g;
  const nx = x + dir;
  const ny = y + 1;
  if (nx < 0 || nx >= w || ny >= h) return -1;
  const side = y * w + nx;
  const diag = ny * w + nx;
  if (mat[side] !== EMPTY || mat[diag] !== EMPTY) return -1;

  mat[diag] = SAND;
  col[diag] = col[i]!;
  vel[diag] = 0;
  awake[diag] = 1;
  moved[diag] = 1;
  mat[i] = EMPTY;
  col[i] = 0;
  vel[i] = 0;
  g.wake(x, y);
  g.wake(nx, ny);
  return diag;
}

/** Paso lateral puro sobre una superficie. Lo usan las bandas. */
function slideLateral(g: Grid, x: number, y: number, i: number, dir: number): boolean {
  const { w, mat, col, vel, awake, moved } = g;
  const nx = x + dir;
  if (nx < 0 || nx >= w) return false;
  const t = y * w + nx;
  if (mat[t] !== EMPTY) return false;

  mat[t] = SAND;
  col[t] = col[i]!;
  vel[t] = 0;
  awake[t] = 1;
  moved[t] = 1;
  mat[i] = EMPTY;
  col[i] = 0;
  g.wake(x, y);
  g.wake(nx, y);
  return true;
}

/**
 * Arrastre hacia un desnivel: si dos celdas más allá hay una caída, el grano da
 * un paso lateral para asomarse a ella. Es lo que tiende el talud por debajo de
 * los 45° y hace que los montones se vean de arena y no de ladrillos.
 */
function tryCreep(g: Grid, x: number, y: number, i: number, dir: number): boolean {
  const { w, h, mat } = g;
  const nx = x + dir;
  if (nx < 0 || nx >= w || y + 1 >= h) return false;

  const row = y * w;
  const rowBelow = row + w;
  // Al lado hay piso (si no, la diagonal ya se habría encargado)...
  if (mat[row + nx] !== EMPTY || mat[rowBelow + nx] === EMPTY) return false;

  // ...y en algun punto del alcance hay un escalón hacia abajo. Se recorre la
  // superficie: en cuanto aparece algo por encima de ella —arena, una pared, el
  // borde— se acaba la ladera y no hay adonde ir; el escalon es la primera
  // celda de la fila de abajo que este vacia.
  for (let d = 2; d <= CREEP_REACH; d++) {
    const fx = x + dir * d;
    if (fx < 0 || fx >= w) return false;
    if (mat[row + fx] !== EMPTY) return false;
    if (mat[rowBelow + fx] === EMPTY) return slideLateral(g, x, y, i, dir);
  }
  return false;
}
