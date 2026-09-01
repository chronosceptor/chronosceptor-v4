import type { GadgetKind, SandApp } from './index';

/**
 * Cablea el dock con el lienzo.
 *
 * Tres gestos y ninguno mas: arrastrar una ficha coloca, arrastrar una pieza la
 * mueve, y soltarla sobre el dock la quita. No hay modo seleccionado ni
 * herramienta activa, asi que no hay nada que recordar entre gesto y gesto.
 *
 * El puntero lo captura la ficha, no el canvas, asi que mientras se coloca una
 * pieza el lienzo no ve un solo evento: por eso la posicion del fantasma se le
 * pasa a mano en coordenadas de pantalla.
 */
export function mountDock(app: SandApp, root: HTMLElement, onActivity: () => void): () => void {
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.ficha'));
  const off: Array<() => void> = [];

  const on = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ): void => {
    el.addEventListener(type, fn as EventListener);
    off.push(() => el.removeEventListener(type, fn as EventListener));
  };

  app.setDockHooks({
    isTrash(clientX, clientY) {
      // Solo cuenta como papelera cuando de verdad lo es. Sin esta condicion,
      // colocar una pieza cerca del borde inferior y volver a cogerla la
      // borraria sin que nada lo hubiera anunciado.
      if (!root.classList.contains('papelera')) return false;
      const r = root.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    },
    onGrab() {
      root.classList.add('papelera');
      // El dock puede estar desvanecido cuando se agarra una pieza; sin esto no
      // habria adonde apuntar para tirarla.
      onActivity();
    },
    onRelease() {
      root.classList.remove('papelera');
    },
    onCount(_count, full, onlyBomb) {
      root.classList.toggle('lleno', full);
      root.classList.toggle('solo-bomba', onlyBomb);
    },
  });

  for (const chip of chips) {
    const kind = chip.dataset.kind as GadgetKind | undefined;
    if (!kind) continue;

    on(chip, 'pointerdown', (e) => {
      if (root.classList.contains('lleno')) return;
      // Con el lienzo al tope, la bomba sigue disponible: es lo que hace sitio.
      if (kind !== 'bomb' && root.classList.contains('solo-bomba')) return;
      e.preventDefault();
      try {
        chip.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura: el arrastre sigue mientras no salga de la ficha */
      }
      app.beginPlacement(kind);
      app.movePlacement(e.clientX, e.clientY);
    });

    on(chip, 'pointermove', (e) => {
      if (!chip.hasPointerCapture?.(e.pointerId)) return;
      app.movePlacement(e.clientX, e.clientY);
      onActivity();
    });

    on(chip, 'pointerup', () => {
      app.endPlacement();
      onActivity();
    });

    on(chip, 'pointercancel', () => app.cancelPlacement());
  }

  return () => {
    for (const fn of off) fn();
  };
}
