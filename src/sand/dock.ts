import type { EmitMaterial, GadgetKind, SandApp } from './index';
import { paletteById } from './palette';

/** Donde se guarda la paleta elegida. */
const CLAVE = 'chronosceptor:paleta';

/**
 * Cablea el dock con el lienzo.
 *
 * Tres gestos: arrastrar una ficha coloca, arrastrar una pieza la mueve, y
 * soltarla sobre el dock la quita.
 *
 * Y una sola herramienta activa, la antorcha, que es la excepcion a la regla
 * que regia esto —no habia nada seleccionado y todo gesto hacia siempre lo
 * mismo—. El fuego no cabia en ese esquema: no es una pieza que se coloque ni
 * algo que caiga, es lo que hace el puntero. Se apaga sola en cuanto se saca
 * una ficha o se vacia el lienzo, que es lo que evita que se quede encendida
 * sin que nadie se acuerde.
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
    onCount(_count, full, onlyBomb, balls) {
      root.classList.toggle('lleno', full);
      root.classList.toggle('solo-bomba', onlyBomb);
      root.classList.toggle('sin-bolas', balls === 0);
    },
    onTool(t) {
      marcarAntorcha(t === 'fire');
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
      // La fuente sale en dos sabores y son dos fichas distintas: lo que
      // siembra cada chorro se decide aqui y no vuelve a cambiar.
      app.beginPlacement(kind, chip.dataset.material as EmitMaterial | undefined);
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

  // --- La antorcha ----------------------------------------------------------
  //
  // El unico boton del dock que deja algo encendido. No consulta `lleno` ni
  // `solo-bomba` —y su marcado no lleva la clase `.ficha`, que es la que se
  // atenua— porque el fuego no ocupa ninguna de las diez plazas: al contrario,
  // es otra forma de hacer sitio, como la bomba.
  //
  // Tampoco se guarda en localStorage. La paleta si, porque es una preferencia
  // de aspecto; abrir la pagina con la antorcha encendida se descubriria
  // quemando el primer trazo que dibujas.
  const antorcha = root.querySelector<HTMLButtonElement>('#dock-fuego');

  function marcarAntorcha(on_: boolean): void {
    if (!antorcha) return;
    antorcha.setAttribute('aria-pressed', String(on_));
    const rotulo = on_ ? 'Torch on: set fire to your walls' : 'Torch: set fire to your walls';
    antorcha.title = rotulo;
    antorcha.setAttribute('aria-label', rotulo);
  }

  if (antorcha) {
    on(antorcha, 'click', () => {
      app.setTool(app.tool === 'fire' ? 'draw' : 'fire');
      // El marcado lo pone `onTool`, no esta linea: la antorcha tambien se
      // apaga sola al sacar una ficha o al vaciar, y con dos caminos para el
      // mismo estado uno de los dos acaba mintiendo.
      onActivity();
    });
  }

  // --- Reventar las bolas ---------------------------------------------------
  //
  // Las **arma**, no las detona: enciende su mecha y cada una sigue rebotando
  // los dos segundos que arde. La cadena se va corriendo por el lienzo en vez
  // de resolverse donde estaban, que es toda la gracia.
  //
  // Se apaga cuando no hay ninguna bola puesta. Un boton que no puede hacer
  // nada tiene que decirlo antes de que lo pulsen, no despues.
  const reventar = root.querySelector<HTMLButtonElement>('#dock-reventar');
  if (reventar) {
    on(reventar, 'click', () => {
      if (root.classList.contains('sin-bolas')) return;
      app.armBalls();
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
