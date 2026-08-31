/** Identificadores de material. Caben en un Uint8Array. */
export const EMPTY = 0;
export const SAND = 1;
/** Estructura estática: vigas, cuñas, paredes de embudo. */
export const WALL = 2;
/** Superficie de banda transportadora; arrastra la arena que descansa encima. */
export const BELT_L = 3;
export const BELT_R = 4;
/** Rampa: la arena de encima se desliza en diagonal, rápido. */
export const CHUTE_L = 5;
export const CHUTE_R = 6;
/** Criba: sólida, pero deja pasar granos con probabilidad. */
export const SIEVE = 7;
/** Compuerta: sólida cuando está cerrada, la máquina la vuelve EMPTY al abrir. */
export const GATE = 8;
/** Cuerpo de máquina con movimiento (balancín, rueda). Se reescribe cada frame. */
export const DYN = 9;
/** Consume la arena que lo toca (drenaje de la cuenca). */
export const SINK = 10;
/**
 * Viga: solida para la fisica pero invisible al pintar.
 *
 * El cuerpo se pinta del color del fondo y encima se traza una regla de 1px en
 * el borde superior, justo donde se apoya la arena. Asi la estructura se lee
 * como una linea fina de verdad y no como una barra del grosor de una celda.
 */
export const LEDGE = 11;

export const MATERIAL_COUNT = 12;

/**
 * Tabla de solidez indexada por material: 1 = bloquea el paso de la arena.
 * Un lookup en un Uint8Array sale más barato que una cadena de comparaciones,
 * y esto se consulta varias veces por celda y por frame.
 */
export const SOLID = new Uint8Array(MATERIAL_COUNT);
SOLID[WALL] = 1;
SOLID[BELT_L] = 1;
SOLID[BELT_R] = 1;
SOLID[CHUTE_L] = 1;
SOLID[CHUTE_R] = 1;
SOLID[SIEVE] = 1;
SOLID[GATE] = 1;
SOLID[DYN] = 1;
SOLID[SAND] = 1;
SOLID[LEDGE] = 1;

/** Materiales que forman parte de la maquinaria (se dibujan, no se mueven). */
export const IS_STRUCTURE = new Uint8Array(MATERIAL_COUNT);
for (const m of [WALL, BELT_L, BELT_R, CHUTE_L, CHUTE_R, SIEVE, GATE, DYN, LEDGE]) {
  IS_STRUCTURE[m] = 1;
}

/**
 * Materiales que se pintan como masa solida. El resto de la estructura queda
 * invisible en el bitmap y se dibuja como trazo vectorial encima.
 * Solo las colinas son masa: todo lo demas es una linea.
 */
export const IS_MASS = new Uint8Array(MATERIAL_COUNT);
IS_MASS[WALL] = 1;
