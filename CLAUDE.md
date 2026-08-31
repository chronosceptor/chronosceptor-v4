# CLAUDE.md

Lienzo de física: cae arena, el usuario dibuja paredes que la desvían, y el color sale de
la portada del disco que suena (Last.fm). Astro estático + 2 endpoints serverless.

La justificación de fondo de cada decisión de física está en el README, sección
**"Decisiones no obvias"**. Léela antes de tocar `src/sand/`.

## Entorno

- **Node 22 obligatorio** (Astro 7 exige ≥22.12). El `node` por defecto de esta máquina es
  20.19.6 y falla al arrancar. Hay `.nvmrc`: `nvm use`, o
  `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` en cada shell.
- `npx astro dev` queda **corriendo en segundo plano** entre invocaciones. `astro dev stop`
  para matarlo, `astro dev logs` para leerlo.
- No hay PHP instalado: `php/*.php` nunca se ha ejecutado ni pasado `php -l`.

## Gotchas que ya costaron tiempo

- **Vite sirve el CSS viejo tras editar un `<style>` de un `.astro`.** El marcado se
  actualiza pero los estilos no. Pasó dos veces y en ambas concluí en falso que mi edición
  no se había aplicado. Cura: `astro dev stop && rm -rf node_modules/.vite` y relanzar.
- **El HMR apila instancias de la app y corrompe cualquier medición.** Editar con la página
  abierta vuelve a ejecutar el `<script>` de `index.astro`, así que `boot()` y `mountDock()`
  corren otra vez: varios bucles `rAF` a la vez, los manejadores del dock duplicados y
  `window.fabrica` apuntando solo al último. Se ve como piezas que aparecen de diez en diez
  con un solo gesto, paredes que nadie ha dibujado y `despiertas` disparado. Ojo: **`astro
  check` regenera `.astro/types.d.ts` y eso basta para disparar el HMR**, así que no vale
  con no editar. Antes de medir nada, navegar de nuevo a la página (una URL con parámetro
  distinto obliga a la carga) y no tocar archivos hasta acabar. Confirmación rápida de que
  el entorno está limpio: un gesto debe dejar `inspect().piezas` en exactamente 1.
- **`astro preview` no funciona con el adaptador de Netlify** (el proceso muere antes de
  escuchar), así que no hay forma fácil de medir contra un build de producción.
- **Verifica que una edición aterrizó antes de medir nada.** Dos reemplazos de texto con
  `python3 .replace()` no encontraron su objetivo y fallaron en silencio; estuve varios
  turnos midiendo código que nunca cambió y culpando a la caché. Usa la herramienta Edit
  (falla en alto) o confirma con `grep` después de escribir.
- **Nunca `import.meta.env` para secretos de servidor.** Vite lo sustituye por el valor
  literal al compilar y la API key acaba dentro del artefacto. Van por `astro:env/server`
  con `access: 'secret'`.
- **El sumidero solo puede ir en la última fila.** Repartido en altura, la arena se consume
  en el aire y aparecen huecos negros de la nada.
- **Instantáneas no miden caudal.** Contar granos por zona en un sistema en flujo da
  deltas negativos sin sentido; hay que hacer series temporales.
- **Una pieza que se mueve dentro de un montón se come la arena si no se le da salida.**
  `displaceSand()` destruye el grano que no cabe en ningún hueco. Sin `Grid.overflow`, una
  sola cruz bajo el chorro se comía 337 granos en 5 s (15% del caudal). Para medirlo hay
  que comparar la ganancia con y sin la pieza en la misma ventana, nunca mirar `sand` a
  secas: la fuente y el drenaje enmascaran la fuga. `inspect().perdidos` debe quedarse en 0.

## Depuración

Todo desde la consola del navegador, sobre `window.fabrica`:

- `fabrica.dump(x, y, w, h)` — vuelca los materiales de una región como texto. **Es la que
  encontró todos los bugs de física**; sin ella no se ve por qué la arena no pasa.
- `fabrica.inspect()` — arena, paredes, fps, coste real de simulación y pintado, celdas
  despiertas.
- `fabrica.clear()` — vacía el lienzo (arena, paredes y piezas).
- `fabrica.beginPlacement(kind)` / `movePlacement(x, y)` / `endPlacement()` — coloca una
  pieza sin gestos. Imprescindible para probar con Playwright: los `PointerEvent`
  sintéticos no consiguen `setPointerCapture`, así que un arrastre simulado sobre una ficha
  del dock nunca mueve el fantasma y la pieza acaba en el centro por la ruta del toque.

Parámetros de URL: `?debug=1` (overlay), `?mock=1` (canción fija, sin API key),
`?fill=0.2` (baja el nivel de disparo del drenaje; sin esto, probar la descarga son varios
minutos por ciclo).

## Rendimiento

El coste va con la arena **en movimiento**, no con la total: los granos asentados se
duermen. Medido: 90.000 granos → 1,4 ms de simulación por frame de un presupuesto de 16,7.
Si algo va lento, el sospechoso no es el número de granos.

Las piezas tampoco lo son: cuatro a la vez suben la simulación a 2,4 ms, y una explosión
con 1.300 granos en vuelo la deja en 1,4. Los sospechosos serían el número de partículas de
ejecta o el borrado de cuerpos, nunca la cantidad de arena.

`inspect().despiertas` sale disparado después de un `clear()` y no significa nada:
`clearWorld` marca todas las celdas como despiertas y las vacías nunca se vuelven a dormir,
porque el autómata solo recorre las que tienen arena. Es previo a las piezas.

## Historia

El primer commit (`253dbfc`) es una versión distinta del proyecto: una fábrica generativa
con línea de ensamblaje, cintas, balancines y cuenca. Se descartó porque solo se podía
mirar. La física de cintas y rampas sigue en `physics.ts` aunque no se use.
