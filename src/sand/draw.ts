import type { Grid } from './grid';
import { EMPTY, WALL } from './materials';
import { isDrawable } from './world';

export interface Point {
  x: number;
  y: number;
}

/**
 * Pinta o borra un trazo entre dos puntos, en coordenadas de celda.
 *
 * Interpola: estampa discos solapados a lo largo del segmento en vez de uno
 * solo en el destino. Es el detalle del que depende que dibujar se sienta bien.
 * Los eventos de puntero llegan espaciados y a 120 Hz un movimiento rapido
 * salta decenas de celdas entre uno y otro; estampando solo donde cae el
 * evento, la linea sale punteada y el material se cuela por los huecos.
 */
export function paintStroke(
  g: Grid,
  from: Point,
  to: Point,
  radius: number,
  erase: boolean,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  // Medio radio entre marcas: con separaciones mayores el trazo sale festoneado.
  const stepLen = Math.max(0.5, radius * 0.5);
  const steps = Math.max(1, Math.ceil(dist / stepLen));

  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    dab(g, from.x + dx * t, from.y + dy * t, radius, erase);
  }
}

/** Una marca circular de la brocha. */
export function dab(g: Grid, cx: number, cy: number, radius: number, erase: boolean): void {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(g.w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(g.h - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y++) {
    if (!isDrawable(g, y)) continue;
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;

      const i = g.idx(x, y);
      if (erase) {
        // Solo se retira lo que dibujo el usuario. El material suelto no se
        // borra: al quitarle el suelo cae solo, que es lo que se espera.
        if (g.mat[i] !== WALL) continue;
        g.mat[i] = EMPTY;
        g.wake(x, y);
      } else {
        // `stamp` aparta el material que quede debajo en vez de destruirlo.
        g.stamp(x, y, WALL);
      }
    }
  }
}

/** ¿Hay pared del usuario bajo este punto? Decide si el gesto dibuja o borra. */
export function hasWallNear(g: Grid, cx: number, cy: number, radius: number): boolean {
  const r = Math.ceil(radius);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!g.inBounds(x, y)) continue;
      if (g.mat[g.idx(x, y)] === WALL) return true;
    }
  }
  return false;
}
