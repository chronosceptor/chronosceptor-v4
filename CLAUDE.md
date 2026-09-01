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
- **El overlay de error de Vite se traga los eventos de puntero y no lo parece.** El servidor
  de desarrollo lanza `UnhandledRejection: Could not establish a connection to the Netlify
  Edge Functions local development server` y pinta un `<vite-error-overlay>` a pantalla
  completa con `z-index: 99999`. La página sigue corriendo por debajo —`fabrica.inspect()`
  responde con normalidad— pero ningún clic ni arrastre llega al canvas: un trazo de
  Playwright dejó `paredes 0` sin ningún error. Cura antes de medir nada con el ratón:
  `document.querySelectorAll('vite-error-overlay').forEach(o => o.remove())`.
- **Una captura de elemento de Playwright sobre algo que se mueve solo cuelga el servidor MCP
  entero, no solo esa llamada.** Pasó con `#dock`, que se autooculta y al que le había puesto un
  `MutationObserver` para quitarle la clase `reposo`: nunca llegó a estar "quieto", la captura se
  colgó y con ella toda la sesión de navegador —`browser_close` y `browser_navigate` empezaron a
  dar timeout—. Para ver el dock, fuérzale `style.opacity` sin observador y captura la página
  entera.
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
- **Para medir el chorro hay que hacer `clear()` primero y medir en el primer segundo.**
  Con la escena llena, el cono llega hasta la boquilla y las filas de abajo miden el
  montón, no el chorro: salieron anchos de 12 y 18 celdas que eran del cono y me hicieron
  creer que un cambio funcionaba mucho mejor de lo que funcionaba. Y el ancho **mín-máx de
  una fila no sirve** — lo fijan dos granos sueltos y sale plano pase lo que pase. Lo que
  se ve es la desviación típica de la x de los granos de esa fila.
- **Una medida con la bola dentro es ruidosa: su trayectoria es aleatoria.** El mismo
  cuenco, la misma bola y los mismos 12 s dieron 46, 61 y 42 celdas de pared destruidas.
  Hacen falta tres pasadas para que la media signifique algo, y aun así no da para afinar
  un porcentaje.
- **La física de cintas no mueve una carga compacta.** `slideLateral` exige la celda de destino
  vacía, así que en una bandeja llena solo puede moverse el grano de delante de cada capa, y ése
  está contra el costado. Lo descubrió la plataforma —que ya no existe—: salía con 124 granos y
  llegaba con 22, y los 102 que faltaban no se caían por ningún sitio, nunca se movieron. El
  `BELT_L`/`BELT_R` de `physics.ts` sigue ahí y volverá a tentar: si algo tiene que viajar en bloque,
  hay que trasladarlo a mano.
- **`inspect().piezas` no cuenta la fuente principal, pero `donde` sí la lista.** Es la pieza de
  serie (`permanent`) y no ocupa hueco del tope: con el lienzo lleno, `piezas` dice 10 y `donde`
  trae 11. `donde` da además el `r` de cada pieza.
- **La fuente de serie ya no es indestructible: se vuela, se tira y `clear()` la repone.** Un lienzo
  sin ninguna fuente es un estado válido y no cae arena; si al medir no crece `sand`, mira primero
  si hay fuente antes de sospechar de la física.
- **El tamaño de la bola sale del ancho del lienzo, no de un número de celdas** (10 celdas de radio
  en escritorio, 5 en vertical). Un número absoluto medido en un perfil no vale en el otro.
- **`inspect().perdidos` es acumulado de toda la sesión y `clear()` no lo reinicia.** Vale para ver
  si algo sangra arena, pero solo mirando el delta en una ventana: leerlo en seco y ver 95 no acusa
  a lo que acabas de tocar.
- **Una pieza que se mueve dentro de un montón se come la arena si no se le da salida.**
  `displaceSand()` destruye el grano que no cabe en ningún hueco. Sin `Grid.overflow`, una
  sola cruz bajo el chorro se comía 337 granos en 5 s (15% del caudal). Para medirlo hay
  que comparar la ganancia con y sin la pieza en la misma ventana, nunca mirar `sand` a
  secas: la fuente y el drenaje enmascaran la fuga. `inspect().perdidos` no debe subir mientras
  la pieza está puesta.
- **La tolva de una fuente se pinta por encima de su fila de siembra** (`NOZZLE_H`, en
  `world.ts`). Una fuente colocada más arriba que eso se queda con la tolva recortada por el borde
  superior; por eso la de serie no vive en la fila 0.
- **El dock tiene tres piezas: fuente, bola y bomba.** Hubo una cruz giratoria y una plataforma, y
  se quitaron enteras aunque funcionaban (commit `b52c517`, con lo último que llegaron a hacer:
  colocación en dos tiempos y trayecto inclinado). No las reintroduzcas por tu cuenta.

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
  **Las dos `movePlacement` tienen que separarse más de 12 px entre sí**, o el gesto cuenta como
  toque y la pieza aterriza en el centro de la escena en vez de donde la pediste — se mide muy
  bien una pieza que no está donde crees.
- **Sobre `#fx`, en cambio, los `PointerEvent` sintéticos sí funcionan**: dibujar, borrar, agarrar
  una pieza, arrastrarla y soltarla se prueban con `fx.dispatchEvent(new PointerEvent(...))` y
  `{clientX, clientY, pointerId: 1, buttons: 1}`. Entre paso y paso hay que dejar correr dos
  `requestAnimationFrame`: el estado del señalado (la × de quitar) lo fija el pintado, no el evento.

Parámetros de URL: `?debug=1` (overlay), `?mock=1` (canción fija, sin API key),
`?fill=0.2` (baja el nivel de disparo del drenaje; sin esto, probar la descarga son varios
minutos por ciclo).

## Rendimiento

El coste va con la arena **en movimiento**, no con la total: los granos asentados se
duermen. Medido: 90.000 granos → 1,4 ms de simulación por frame de un presupuesto de 16,7.
Si algo va lento, el sospechoso no es el número de granos.

Las piezas tampoco lo son: cuatro a la vez subían la simulación a 2,4 ms, y una explosión
con 1.300 granos en vuelo la deja en 1,4. Los sospechosos serían el número de partículas de
ejecta o el borrado de cuerpos, nunca la cantidad de arena.

La caída libre lleva desde el commit `8cf5cdc` una deriva lateral (`DRIFT_P` en
`physics.ts`) — la única rama que se le ha añadido al bucle caliente. Cuesta un `rand()`
por grano **en vuelo** y por frame, no por grano: 1,07 → 1,13 ms con la escena cargada. Es
una perilla de gusto con un margen útil estrecho; los números de la calibración están en el
README.

`inspect().despiertas` sale disparado después de un `clear()` y no significa nada:
`clearWorld` marca todas las celdas como despiertas y las vacías nunca se vuelven a dormir,
porque el autómata solo recorre las que tienen arena. Es previo a las piezas.

## Historia

El primer commit (`253dbfc`) es una versión distinta del proyecto: una fábrica generativa
con línea de ensamblaje, cintas, balancines y cuenca. Se descartó porque solo se podía
mirar. La física de cintas y rampas sigue en `physics.ts` aunque no se use.
