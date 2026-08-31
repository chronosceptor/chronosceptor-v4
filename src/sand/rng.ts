/**
 * PRNG con semilla (mulberry32). Determinista: la misma semilla reconstruye
 * exactamente el mismo layout, que es lo que hace usable `?seed=` para depurar.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Entero en [min, max] inclusivo. */
export const randInt = (r: Rng, min: number, max: number): number =>
  min + Math.floor(r() * (max - min + 1));

/** Flotante en [min, max). */
export const randFloat = (r: Rng, min: number, max: number): number =>
  min + r() * (max - min);

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)]!;
}

/** Elige por peso. `weights` corre paralelo a `items`. */
export function pickWeighted<T>(r: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let n = r() * total;
  for (let i = 0; i < items.length; i++) {
    n -= weights[i]!;
    if (n <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
