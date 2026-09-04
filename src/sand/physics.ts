import type { Grid } from './grid';
import {
  BELT_L, BELT_R, CHUTE_L, CHUTE_R, EMPTY, SAND, SIEVE, SINK, WALL, WATER,
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
 * Celdas que recorre de lado una celda de agua en un frame.
 *
 * Es lo que separa un charco de un monton: la arena se aparta una celda cada
 * vez y por eso hace talud, el agua barre hasta encontrar sitio y por eso queda
 * plana. Con 1 el agua se nivela, pero tan despacio que un vertido se lee como
 * arena azul cayendo; con 8 el frente corre lo bastante para que un cuenco se
 * llene a nivel a la vista.
 *
 * El barrido se corta en cuanto aparece un hueco por debajo del camino: el agua
 * quiere bajar, no correr, y sin ese corte pasaria de largo por encima de los
 * agujeros.
 */
const FLOW_REACH = 8;
/**
 * Probabilidad de que una celda de agua se cuele por la arena que tiene debajo,
 * intercambiandose con ella. Es la regla que fabrica el lodo.
 *
 * Se intento antes con absorcion —el agua desaparece y el grano que toca queda
 * saturado— y no vale: la arena apilada es maciza, asi que el agua solo llega a
 * la costra. Medido sobre un monton de 20.000 granos, absorbiendo se mojaban
 * 1.573; y no habia numero que lo arreglara, porque el limite no es el ritmo
 * sino que el agua no tiene por donde entrar. Filtrandose SI entra: baja por el
 * monton como baja de verdad, mojando lo que atraviesa, y sale por abajo a
 * encharcarse. El lodo deja de ser una capa de pintura y pasa a ser el monton.
 *
 * Va por frame y solo para el agua que ya no puede caer: una gota en vuelo no
 * se filtra por la pared de arena que roza. Y es una probabilidad y no un paso
 * seguro para que se lea como filtrarse y no como caer — dentro de la arena el
 * agua avanza a la sexta parte de la velocidad que en el aire.
 */
const SOAK_P = 0.16;
/**
 * Humedad a partir de la cual un grano no se aparta, pase lo que pase.
 *
 * Es un umbral y no una probabilidad, y esa es la diferencia entre que el lodo
 * se sostenga y que no. Con la cohesion escrita solo como probabilidad —«se
 * desliza con probabilidad 1 - humedad»— una cara vertical de barro saturado se
 * venia abajo igual que la arena seca: la probabilidad frena un frame, pero
 * llegan cientos, y basta con que la humedad baje un punto por debajo del tope
 * para que la cara tenga sesenta oportunidades por segundo de desmoronarse.
 * Medido con el monton entero a 255 y sin umbral: la cara aguantaba un 60% de
 * su altura contra el 55% de la arena seca, o sea nada.
 *
 * Por debajo del umbral si es una probabilidad, y ahi esta el gradiente: un
 * barro que se va secando pasa por una franja en la que se desmorona cada vez
 * mas deprisa antes de volver a ser arena suelta. Con `DRY` a 8 por segundo,
 * un grano saturado esta rigido unos 20 s y se derrumba durante los 12
 * siguientes.
 */
const WET_HOLD = 96;

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
  const { w, h, size, mat, col, vel, wet, flow, awake, moved, beltSpeed } = g;
  moved.fill(0);
  const leftFirst = (frame & 1) === 0;

  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    const xStart = leftFirst ? 0 : w - 1;
    const xEnd = leftFirst ? w : -1;
    const xStep = leftFirst ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = row + x;
      // Dos comparaciones contra literales. La version obvia de esto es una
      // tabla `IS_MOBILE[m]` —que es como estan escritas `SOLID` e `IS_MASS`—
      // y sale un 20-40% mas cara: mete una segunda lectura de array en el
      // guardia, que es la unica linea que se ejecuta para las 326.000 celdas
      // del lienzo esten como esten. Medido con el lienzo lleno y asentado:
      // 1,72 ms el bucle de una sola comparacion de siempre, 1,75 asi, 2,11
      // con la tabla. Si algun dia hay un tercer material que caiga, hay que
      // volver a medirlo antes de dar por bueno el `switch`.
      const m = mat[i]!;
      if ((m !== SAND && m !== WATER) || moved[i] === 1 || awake[i] === 0) continue;
      if (m === WATER) {
        stepWater(g, x, y, i, rand);
        continue;
      }

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
        wet[dst] = wet[i]!;
        moved[dst] = 1;
        awake[dst] = 1;
        mat[i] = EMPTY;
        col[i] = 0;
        vel[i] = 0;
        wet[i] = 0;
        g.wake(x, y);
        g.wake(nx, ny);
        continue;
      }

      // --- A2. Hundirse en el agua ------------------------------------
      //
      // Un intercambio de UNA celda, y no el raycast de la caida libre: bajando
      // varias filas de golpe el agua que habia en medio saldria teletransportada
      // arriba del todo. Ademas la arena baja mas despacio dentro del agua, que
      // es justo lo que se ve.
      if (below >= 0 && mat[below] === WATER) {
        const wcol = col[below]!;
        mat[below] = SAND;
        col[below] = col[i]!;
        vel[below] = 1;
        // Meterse en el agua satura. La cohesion es lo unico que frena a un
        // grano, y el agua cuenta como hueco para las diagonales: sin saturar,
        // la arena sumergida se desliza SIN ROZAMIENTO y la ladera se licua.
        wet[below] = 255;
        moved[below] = 1;
        awake[below] = 1;
        mat[i] = WATER;
        col[i] = wcol;
        vel[i] = 0;
        wet[i] = 0;
        flow[i] = 0;
        g.wake(x, y);
        g.wake(x, y + 1);
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

      // --- F y G. Cohesión: la arena mojada no se desmorona ------------
      //
      // Es todo el lodo. Un grano seco (`wet` 0) pasa de largo sin pagar ni un
      // `rand()`, asi que la arena de siempre se comporta exactamente igual que
      // antes; por encima de `WET_HOLD` no se aparta nunca, y por eso una pared
      // de barro se sostiene de pie. Entre medias es una probabilidad, y ahi
      // esta el gradiente del desmoronamiento mientras se seca.
      //
      // Medido apoyando un monton contra una pared dibujada y quitandola: de la
      // cara vertical, la arena seca conserva el 55% de su altura y derrama 66
      // celdas; el mismo monton mojado conserva el 100% y derrama 4.
      //
      // Lo que NO se toca es la caida libre: un grano mojado en el aire cae. Sin
      // esa asimetria el lodo formaria arcos y voladizos colgando de la nada.
      //
      // Tocar agua satura, y va ANTES de la puerta, no al aterrizar en la celda
      // de destino: un grano seco que se desliza y se moja al llegar ya ha dado
      // el paso, y con la ladera entera haciendo eso una vez por frame el
      // monton se derrite en vez de apelmazarse.
      //
      // Solo mira a los lados: debajo no hace falta, porque un grano con agua
      // debajo se hunde en A2 y no llega hasta aqui.
      let wv = wet[i]!;
      if (wv < 255
        && ((x > 0 && mat[i - 1] === WATER) || (x < w - 1 && mat[i + 1] === WATER))) {
        wv = 255;
        wet[i] = 255;
      }
      if (wv < WET_HOLD && (wv === 0 || rand() * WET_HOLD >= wv)) {
        // --- F. Ángulo de reposo: diagonales, encadenadas en avalancha --
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

        // --- G. Arrastre lateral hacia un desnivel ----------------------
        if (rand() < CREEP_P) {
          const cd = rand() < 0.5 ? -1 : 1;
          if (tryCreep(g, x, y, i, cd) || tryCreep(g, x, y, i, -cd)) continue;
        }
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
  const { w, h, mat, col, vel, wet, flow, awake, moved } = g;
  const nx = x + dir;
  const ny = y + 1;
  if (nx < 0 || nx >= w || ny >= h) return -1;
  const side = y * w + nx;
  const diag = ny * w + nx;
  const ms = mat[side]!;
  const md = mat[diag]!;
  // El agua cuenta como hueco en los dos sitios: sin eso un monton sumergido no
  // podria avalanchar y se apilaria en columnas de 90 grados dentro del charco.
  if ((ms !== EMPTY && ms !== WATER) || (md !== EMPTY && md !== WATER)) return -1;

  const desalojada = md === WATER ? col[diag]! : 0;
  mat[diag] = mat[i]!;
  col[diag] = col[i]!;
  vel[diag] = 0;
  // Igual que al hundirse: meterse en el agua satura. Es lo que hace que una
  // avalancha bajo el agua se pare sola en vez de seguir hasta lo plano.
  wet[diag] = md === WATER ? 255 : wet[i]!;
  awake[diag] = 1;
  moved[diag] = 1;
  if (md === WATER) {
    mat[i] = WATER;
    col[i] = desalojada;
  } else {
    mat[i] = EMPTY;
    col[i] = 0;
  }
  vel[i] = 0;
  wet[i] = 0;
  flow[i] = 0;
  g.wake(x, y);
  g.wake(nx, ny);
  return diag;
}

/** Paso lateral puro sobre una superficie. Lo usan las bandas. */
function slideLateral(g: Grid, x: number, y: number, i: number, dir: number): boolean {
  const { w, mat, col, vel, wet, flow, awake, moved } = g;
  const nx = x + dir;
  if (nx < 0 || nx >= w) return false;
  const t = y * w + nx;
  if (mat[t] !== EMPTY) return false;

  mat[t] = mat[i]!;
  col[t] = col[i]!;
  vel[t] = 0;
  wet[t] = wet[i]!;
  flow[t] = flow[i]!;
  awake[t] = 1;
  moved[t] = 1;
  mat[i] = EMPTY;
  col[i] = 0;
  wet[i] = 0;
  flow[i] = 0;
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

/**
 * Un paso de una celda de agua.
 *
 * Va en su propia funcion y no inline en `step` por dos razones. La primera es
 * que el camino de la arena es el que corre millones de veces por frame y no
 * queria tocarlo mas de lo imprescindible: sigue siendo el mismo codigo, con el
 * guardia cambiado y el arrastre de `wet`. La segunda es que el agua no
 * comparte casi nada con la arena — las secciones de cinta, rampa y criba no le
 * aplican, y la diagonal y el paso lateral tienen otras condiciones.
 *
 * El orden importa: primero cae, y solo cuando ya no puede caer se empapa. Una
 * gota en vuelo que mojara la pared de arena por la que pasa rozando dejaria un
 * chorro absorbido a media altura, sin llegar nunca abajo.
 */
function stepWater(g: Grid, x: number, y: number, i: number, rand: () => number): void {
  const { w, h, mat, col, vel, wet, flow, awake, moved } = g;

  const belowY = y + 1;
  const below = belowY < h ? i + w : -1;

  // --- a. Caída libre, igual que la arena y con la misma deriva ---------
  if (below >= 0 && mat[below] === EMPTY) {
    let v = vel[i]! + 1;
    if (v > MAX_VEL) v = MAX_VEL;
    let ny = y;
    for (let k = 0; k < v; k++) {
      const ty = ny + 1;
      if (ty >= h || mat[ty * w + x] !== EMPTY) break;
      ny = ty;
    }
    let nx = x;
    if (rand() < DRIFT_P) {
      const tx = x + (rand() < 0.5 ? -1 : 1);
      if (tx >= 0 && tx < w && mat[ny * w + tx] === EMPTY) nx = tx;
    }
    const dst = ny * w + nx;
    mat[dst] = WATER;
    col[dst] = col[i]!;
    vel[dst] = v;
    wet[dst] = 0;
    flow[dst] = flow[i]!;
    moved[dst] = 1;
    awake[dst] = 1;
    mat[i] = EMPTY;
    col[i] = 0;
    vel[i] = 0;
    flow[i] = 0;
    g.wake(x, y);
    g.wake(nx, ny);
    return;
  }

  vel[i] = 0;
  const under = below >= 0 ? mat[below]! : WALL;

  // --- b. Drenaje ------------------------------------------------------
  if (under === SINK) {
    g.removeAt(i);
    return;
  }

  // --- c. Filtrarse por la arena: la única regla que fabrica lodo -------
  //
  // Intercambio, no absorcion: el agua ocupa el poro y el grano sube. Y el
  // grano que sube queda saturado, asi que el frente de mojado va pegado al
  // agua que baja en vez de tener que difundirse detras de ella.
  if (under === SAND && rand() < SOAK_P) {
    const arena = col[below]!;
    mat[below] = WATER;
    col[below] = col[i]!;
    vel[below] = 0;
    wet[below] = 0;
    flow[below] = flow[i]!;
    moved[below] = 1;
    awake[below] = 1;
    mat[i] = SAND;
    col[i] = arena;
    vel[i] = 0;
    wet[i] = 255;
    flow[i] = 0;
    g.wake(x, y);
    g.wake(x, y + 1);
    return;
  }

  // --- d. Diagonal -----------------------------------------------------
  //
  // Sin exigir que el lateral este libre, al reves que la arena. Esa condicion
  // es justo la que hace que una brocha de una celda retenga un monton, y el
  // agua no debe quedarse retenida por un hueco diagonal: se cuela por donde
  // quepa, que es lo que la distingue.
  const first = rand() < 0.5 ? -1 : 1;
  if (slideDiagonal(g, x, y, i, first) || slideDiagonal(g, x, y, i, -first)) return;

  // --- e. Correr de lado a buscar nivel --------------------------------
  let d = flow[i]!;
  if (d === 0) d = rand() < 0.5 ? -1 : 1;
  if (waterFlow(g, x, y, i, d)) return;
  if (waterFlow(g, x, y, i, -d)) return;

  // --- f. Nada funcionó: a dormir --------------------------------------
  //
  // Un charco a nivel se duerme entero, que es lo que lo hace tan barato como
  // un monton asentado: cada celda tiene agua a los dos lados y debajo, y no
  // hay a donde ir. Solo las dos celdas del borde siguen despiertas, y avanzan
  // hasta topar con algo.
  awake[i] = 0;
}

/** Diagonal abajo-`dir` para el agua: solo mira la celda de destino. */
function slideDiagonal(g: Grid, x: number, y: number, i: number, dir: number): boolean {
  const { w, h, mat, col, vel, wet, flow, awake, moved } = g;
  const nx = x + dir;
  const ny = y + 1;
  if (nx < 0 || nx >= w || ny >= h) return false;
  const diag = ny * w + nx;
  if (mat[diag] !== EMPTY) return false;

  mat[diag] = WATER;
  col[diag] = col[i]!;
  vel[diag] = 0;
  wet[diag] = 0;
  flow[diag] = dir;
  awake[diag] = 1;
  moved[diag] = 1;
  mat[i] = EMPTY;
  col[i] = 0;
  flow[i] = 0;
  g.wake(x, y);
  g.wake(nx, ny);
  return true;
}

/**
 * Barrido lateral hasta `FLOW_REACH` celdas, o hasta el primer sitio por el que
 * se pueda bajar.
 *
 * El sentido se guarda en `flow` y se hereda: sin esa memoria cada celda
 * sortearia un lado nuevo cada frame, y un charco no se nivelaria — herviria,
 * sin dormirse nunca ninguna celda.
 */
function waterFlow(g: Grid, x: number, y: number, i: number, dir: number): boolean {
  const { w, h, mat, col, vel, wet, flow, awake, moved } = g;
  const row = y * w;
  let bx = x;
  for (let d = 1; d <= FLOW_REACH; d++) {
    const nx = x + dir * d;
    if (nx < 0 || nx >= w || mat[row + nx] !== EMPTY) break;
    bx = nx;
    if (y + 1 < h && mat[row + w + nx] === EMPTY) break;
  }
  if (bx === x) return false;

  const t = row + bx;
  mat[t] = WATER;
  col[t] = col[i]!;
  vel[t] = 0;
  wet[t] = 0;
  flow[t] = dir;
  awake[t] = 1;
  moved[t] = 1;
  mat[i] = EMPTY;
  col[i] = 0;
  flow[i] = 0;
  g.wake(x, y);
  g.wake(bx, y);
  return true;
}
