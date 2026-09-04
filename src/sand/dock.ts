import type { GadgetKind, SandApp } from './index';
import { paletteById } from './palette';

/** Donde se guarda la paleta elegida. */
const CLAVE = 'chronosceptor:paleta';

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
      // El panel de paletas vive donde va a caer la papelera.
      abrirPaletas(false);
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

  // --- Que cae: arena o agua ------------------------------------------------
  //
  // Es un interruptor de la escena, no una herramienta: cambia lo que siembran
  // todas las fuentes a la vez y entra en el fotograma siguiente, sin repintar
  // nada de lo que ya cayo. Igual que la paleta — y por la misma razon, que es
  // que lo que se ve en el lienzo es historia y no estado.
  //
  // No se guarda en localStorage a proposito. La paleta si, porque es una
  // preferencia de aspecto; abrir la pagina y que caiga agua sin haberlo pedido
  // se leeria como que algo se ha roto.
  const material = root.querySelector<HTMLButtonElement>('#dock-material');
  if (material) {
    on(material, 'click', () => {
      const agua = app.emitMaterial !== 'water';
      app.setEmitMaterial(agua ? 'water' : 'sand');
      material.setAttribute('aria-pressed', String(agua));
      const rotulo = agua ? 'Cae agua' : 'Cae arena';
      material.title = rotulo;
      material.setAttribute('aria-label', rotulo);
      onActivity();
    });
  }

  // --- Color de la arena ----------------------------------------------------
  //
  // El color no es un modo ni una herramienta activa: se elige una vez y se
  // queda. Por eso el panel se cierra solo al elegir y la eleccion sobrevive a
  // la recarga — volver a la ocre en cada visita seria deshacer lo que se pidio.

  const boton = root.querySelector<HTMLButtonElement>('#dock-color');
  const disco = root.querySelector<HTMLElement>('#dock-color-disco');
  const muestras = Array.from(root.querySelectorAll<HTMLButtonElement>('.muestra'));

  function abrirPaletas(abierto: boolean): void {
    root.classList.toggle('paleta', abierto);
    boton?.setAttribute('aria-expanded', String(abierto));
  }

  function elegir(id: string, persistir = true): void {
    const muestra = muestras.find((m) => m.dataset.palette === id);
    if (!muestra) return;
    app.setPalette(paletteById(id));
    for (const m of muestras) m.setAttribute('aria-pressed', String(m === muestra));
    // El disco del boton es la muestra elegida: se le copia el fondo en vez de
    // rehacer el degradado, que ya se calculo al compilar.
    if (disco) disco.style.background = muestra.style.background;
    if (!persistir) return;
    try {
      localStorage.setItem(CLAVE, id);
    } catch {
      /* modo privado o almacenamiento lleno: la eleccion dura la sesion */
    }
  }

  if (boton) {
    on(boton, 'click', () => {
      abrirPaletas(!root.classList.contains('paleta'));
      onActivity();
    });
  }

  for (const muestra of muestras) {
    on(muestra, 'click', () => {
      const id = muestra.dataset.palette;
      if (id) elegir(id);
      abrirPaletas(false);
      onActivity();
    });
  }

  // Se cierra al tocar fuera o con Escape. Sin esto el panel se queda abierto
  // sobre la escena y se dibuja debajo de el sin verlo.
  const fuera = (e: PointerEvent): void => {
    if (!root.contains(e.target as Node)) abrirPaletas(false);
  };
  const escape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') abrirPaletas(false);
  };
  document.addEventListener('pointerdown', fuera, true);
  document.addEventListener('keydown', escape);
  off.push(() => document.removeEventListener('pointerdown', fuera, true));
  off.push(() => document.removeEventListener('keydown', escape));

  let guardada: string | null = null;
  try {
    guardada = localStorage.getItem(CLAVE);
  } catch {
    /* sin almacenamiento: arranca con la de serie */
  }
  // Por `id` resuelto y no por el bruto: un id de una version anterior cae en la
  // de serie en vez de dejar el boton sin muestra marcada.
  elegir(paletteById(guardada).id, false);

  return () => {
    for (const fn of off) fn();
  };
}
