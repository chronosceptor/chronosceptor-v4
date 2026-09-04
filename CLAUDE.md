# CLAUDE.md

Lienzo de física: cae arena, el usuario dibuja paredes que la desvían, y el color sale de
la paleta que elija en el dock. Astro **enteramente estático**: ya no hay endpoints, ni
variables de entorno, ni nada que resolver en servidor.

La justificación de fondo de cada decisión de física está en el README, sección
**"Decisiones no obvias"**. Léela antes de tocar `src/sand/`.

## Entorno

- **Node 22 obligatorio** (Astro 7 exige ≥22.12). El `node` por defecto de esta máquina es
  20.19.6 y falla al arrancar. Hay `.nvmrc`: `nvm use`, o
  `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` en cada shell.
- `npx astro dev` queda **corriendo en segundo plano** entre invocaciones. `astro dev stop`
  para matarlo, `astro dev logs` para leerlo.
- **`*.png` está en `.gitignore`, con dos excepciones: `docs/` y `public/piezas/`.** Esa segunda
  hubo que añadirla porque producción salía con la fuente a trazo vectorial mientras en local se
  veía el dibujo: el respaldo funcionaba tan bien que el fallo no parecía un fallo. Si añades una
  pieza nueva, comprueba que su PNG entra de verdad — `git check-ignore -v public/piezas/x.png`—,
  porque un `git status` limpio no distingue «no hay cambios» de «está ignorado».

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
  entera. **Y aun así se cuelga**: la de página completa funcionó una vez tras navegar y luego
  empezó a dar timeout en «fonts loaded» una y otra vez, porque el bucle de arena nunca deja un
  fotograma estable que esperar. `browser_evaluate` sigue respondiendo con normalidad mientras
  tanto, así que no parece que el servidor esté tocado. Cura: `pkill -f mcp-chrome-`, volver a
  navegar y **`fabrica.destroy()` antes de capturar** — corta el `rAF` y deja la escena quieta.
- **Para mirar la arena, casi siempre es mejor sacar los píxeles que capturar la pantalla.**
  `browser_evaluate` con el parámetro `filename` guarda lo que devuelvas, así que un
  `canvas.toDataURL()` —recortado y ampliado con `drawImage` sobre un canvas auxiliar— baja a
  disco y se decodifica con `base64`. No se cuelga nunca y da el recorte ya ampliado.
- **El navegador del MCP corre a ~5 fps** (`inspect().fps` lo dice). La arena se acumula cinco
  veces más despacio que en pantalla: 349 granos tras 11 s me hizo sospechar del emisor cuando
  no pasaba nada. Mira `fps` antes de interpretar cualquier serie temporal.
- **`astro preview` no funciona con el adaptador de Netlify** (el proceso muere antes de
  escuchar), así que no hay forma fácil de medir contra un build de producción.
- **Verifica que una edición aterrizó antes de medir nada.** Dos reemplazos de texto con
  `python3 .replace()` no encontraron su objetivo y fallaron en silencio; estuve varios
  turnos midiendo código que nunca cambió y culpando a la caché. Usa la herramienta Edit
  (falla en alto) o confirma con `grep` después de escribir.
- **El color ya no viene de fuera: sale de `PALETTES`, en `palette.ts`.** Ocho paletas escritas a
  mano y no sacadas de un generador — el fondo es `#0B0B0C` y por debajo de ~0,45 de luminancia un
  grano deja de leerse como arena. Si añades una, mídele la luminancia antes
  (`0.2126r + 0.7152g + 0.0722b`, sobre 255) y respeta los pesos `3,3,2,1`: a partes iguales la
  cuenca sale confeti. Si algún día vuelve a haber un endpoint con credenciales, **nunca
  `import.meta.env` para un secreto** — Vite lo sustituye por el valor literal al compilar y la
  clave acaba dentro del artefacto; van por `astro:env/server` con `access: 'secret'`.
- **`setPalette` entra en el mismo fotograma, sin pausa.** Tuvo un `SHIFT_PAUSE` de 1,2 s que
  paraba la siembra para que el cambio de canción se leyera como un corte; elegido a mano eso es
  latencia. No lo reintroduzcas: la estratificación la da el color guardado en cada grano, no la
  pausa.
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
- **Arrastrar la fuente muta su origen, y `clear()` la repone donde la dejaste, no en el centro.**
  `onMoved()` escribe en `source.x/y`, que es de donde `Emitter.main` la vuelve a crear. Invalidó
  dos medidas seguidas: un barrido de sondas que agarra la pieza la va arrastrando, y yo seguía
  calculando los puntos desde el centro original. Si sondeas agarres, lee `donde` **antes de cada
  sonda** y calcula relativo a eso, o recarga la página entre una y otra.
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
- **La tolva de una fuente se pinta por encima de su fila de siembra**, y desde que es un dibujo
  eso lo manda `NOZZLE_SPRITE_ROWS` (41 filas), no `NOZZLE_H` (14, que es solo el alto del trazo
  vectorial). Por eso la de serie vive en la fila 44 y no en la 17. Si el dibujo no cabe por encima,
  `drawNozzle` no lo pinta y cae al trazo — una fuente que aparece como líneas en vez de como
  ilustración está demasiado arriba, no rota.
- **El tamaño de la fuente lo manda su caño, no su boca** (`SPOUT_FRAC`, en `render.ts`: cuánto mide
  el caño del PNG en fracción de su ancho). La pieza se escala hasta que el caño mide lo que mide el
  chorro, así que **un caño fino no sale fino, sale enorme**: con el 12% del primer dibujo pedía
  275 px de pieza, un cuarto del lienzo. Al cambiar el PNG hay que volver a medirlo con
  `python3 scripts/asset-alfa.py --perfil dibujo.png` y llevar el número al código.
- **El dibujo de la fuente baja `SOLAPE` celdas por debajo de la fila de siembra**, a propósito. La
  capa vectorial va encima de la arena, así que ese trozo de caño tapa las filas donde nacen los
  granos; sin él se ve el punto exacto en que aparecen y la arena no sale *de* la pieza, sale
  *debajo* de la pieza.
- **La fuente se agarra por una caja (`grabBox`), no por un radio.** Es la única pieza cuyo centro
  no es el centro de su dibujo —su `cy` es la boca por la que cae la arena, y la tolva está entera
  por encima—, así que un círculo centrado ahí dejaba fuera todo el dibujo: se cogía por 24 px
  alrededor del caño. El aro de señalado y la × de quitar salen de la misma caja; si añades otra
  pieza descentrada, hazlo igual o las tres cosas dejarán de coincidir.
- **El dock tiene tres piezas: fuente, bola y bomba.** Hubo una cruz giratoria y una plataforma, y
  se quitaron enteras aunque funcionaban (commit `b52c517`, con lo último que llegaron a hacer:
  colocación en dos tiempos y trayecto inclinado). No las reintroduzcas por tu cuenta.
- **El botón de color vive fuera de `#dock-fichas`, y es a propósito.** No se arrastra, y las reglas
  de `#dock.lleno` / `#dock.solo-bomba` apagan `.ficha`: dentro, se habría apagado con el lienzo al
  tope. El panel de paletas se posiciona contra `#dock`, que es bloque contenedor de sus hijos
  absolutos por su `transform` aunque él mismo esté desplazado.
- **Para comprobar tipos sin disparar el HMR: `npx tsc --noEmit -p tsconfig.json`.** `astro check`
  regenera `.astro/types.d.ts` y eso recarga la página (ver arriba); `tsc` a secas no toca nada.
- **Editar un archivo mientras se mide deja módulos a medias en el servidor.** Sale un
  `ReferenceError: X is not defined` sobre un símbolo que sí existe en el disco, y parece un bug
  del código: es HMR sirviendo una versión anterior. Se cura recargando la página, no editando.
- **La bola no gira ni lleva marca en la superficie.** El giro se montó entero, medido y correcto,
  y se quitó junto con las cinco texturas que se probaron para enseñarlo. El porqué está en el
  README. No lo reintroduzcas por tu cuenta.
- **El fondo blanco de un asset generado no se quita por color.** Las piezas van tramadas en
  semitono —puntos negros sobre blanco— y un borrado por color se lleva también el blanco de entre
  los puntos, que está *dentro* de la pieza, y la deja agujereada. `scripts/asset-alfa.py` saca el
  alfa de la región exterior por inundación desde las cuatro esquinas (cuatro, porque la figura
  suele tocar el borde y parte el exterior en trozos) y respeta el alfa que ya venga hecho. Los
  prompts y el flujo entero están en `docs/prompts-piezas.md`.
- **El fondo es un solo archivo fijo: `public/background.webp`, escrito a pelo en el CSS de
  `SandCanvas.astro`.** Hubo un sorteo entre los `backgroundNN.webp` que hubiera en `public/`,
  leídos con `readdirSync` en el frontmatter; se quitó entero. Soltar un archivo nuevo en
  `public/` ya no lo mete en la rotación —no hay rotación—: hay que cambiar la `url()`.
- **Toda capa decorativa va DEBAJO de los canvas**, en la pila de `background` de `#escena`
  (`SandCanvas.astro`), nunca superpuesta. El color de la arena sale de la portada del disco y es lo
  único saturado del cuadro: cualquier velo o trama por encima lo apaga — unas rayas sobre el canvas
  volvían el amarillo un verde sucio. El velo y el semitono del fondo están puestos así a propósito,
  y superponerlos es la primera tentación al vestir la escena.

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
- **El MCP de Playwright deja el perfil bloqueado entre llamadas** («Browser is already in use»).
  `pkill -f mcp-chrome-<id>` y volver a navegar. Pasó tres veces en una sola sesión.
- **Para saber si un punto agarra una pieza, mira si la pieza se movió** — nunca si apareció pared.
  Cerca del borde superior no se puede dibujar, así que «no hay pared nueva» sale igual cuando el
  gesto agarró que cuando no llegó a hacer nada, y da un mapa del área activa que es pura ficción.
- **Para juzgar cómo se ve una pieza, recórtala del `#fx` ampliada**: `s = fx.width / grid.w` son
  px de canvas por celda, con el dpr ya dentro. A tamaño real una pieza mide unos 60 px y ahí se
  pierde casi todo el detalle — mirarla ampliada es lo que evita decidir sobre lo que no se ve.

Parámetros de URL: `?debug=1` (overlay) y `?fill=0.2` (baja el nivel de disparo del
drenaje; sin esto, probar la descarga son varios minutos por ciclo).

La paleta elegida vive en `localStorage['chronosceptor:paleta']`. Al medir color, bórralo o
fíjalo a mano: una sesión anterior deja la página arrancando en un color que no es el de
serie, y una medida hecha sobre la paleta equivocada no lo parece.

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

El color salía de la portada del disco que sonara, vía Last.fm: dos endpoints (`/api/now-playing`,
`/api/art`), sus gemelos en PHP, un poller y un median-cut en `color/extract.ts`. Se quitó entero
—no está desconectado, está borrado— porque el color era de quien publicaba la página y no de quien
la mira. Está en el historial si hace falta recuperarlo.

El primer commit (`253dbfc`) es una versión distinta del proyecto: una fábrica generativa
con línea de ensamblaje, cintas, balancines y cuenca. Se descartó porque solo se podía
mirar. La física de cintas y rampas sigue en `physics.ts` aunque no se use.
