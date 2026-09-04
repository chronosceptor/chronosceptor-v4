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
- **`*.png` está en `.gitignore`, con una sola excepción: `docs/`.** Ya no hay ningún dibujo de
  pieza: la bola se dibuja y la fuente no se dibuja en absoluto. Si algún día vuelve a haber uno,
  hay que volver a añadir su excepción **y comprobar que entra de verdad** —`git check-ignore -v
  ruta.png`—, porque un `git status` limpio no distingue «no hay cambios» de «está ignorado». Ya
  pasó: producción salía con la fuente a trazo vectorial mientras en local se veía el dibujo, y el
  respaldo funcionaba tan bien que el fallo no parecía un fallo.

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
  disco. No se cuelga nunca y da el recorte ya ampliado. Dos detalles: el archivo aterriza en la
  **raíz del repo**, no en `.playwright-mcp/`, y lo que guarda es **JSON**, así que `base64 -d` a
  secas falla — hay que quitarle las comillas (`json.load`) antes de decodificar. Devolviendo un
  objeto con varios `toDataURL` se sacan varios recortes de una sola llamada.
- **Para medir sin `dump()`: `getImageData` sobre `#arena`.** El canvas es del tamaño del grid —un
  píxel por celda— y alfa > 0 marca celda ocupada. Una fila entera cuesta
  `ctx.getImageData(0, y, gw, 1)` y sale directa la lista de x del chorro.
- **Un fotograma suelto del chorro engaña: parece granos sueltos.** A 1.575 granos/s cada fila del
  chorro tiene un puñado de granos en un instante dado, y el ojo no ve eso, ve la estela. Para
  juzgar la forma hay que componer ~24 fotogramas seguidos en un canvas auxiliar con
  `globalAlpha = 0.5` dentro de un bucle de `requestAnimationFrame`: eso da la envolvente, que es
  lo que se ve de verdad. Con el fotograma suelto estuve a punto de dar por malo un cono que en
  pantalla se lee perfectamente.
- **El navegador del MCP no siempre corre a la misma velocidad** (`inspect().fps` lo dice). Una vez
  iba a ~5 fps y la arena se acumulaba cinco veces más despacio que en pantalla: 349 granos tras
  11 s me hicieron sospechar del emisor cuando no pasaba nada. Otra sesión entera fue a 120. Mira
  `fps` antes de interpretar cualquier serie temporal, y no des por buena ninguna de las dos cifras.
- **Una medida de varios minutos se hace con un `setInterval` dentro de la página, no esperando en
  la llamada.** Un `browser_evaluate` largo tumba el navegador (ver arriba), así que la serie se
  acumula sola en un global —`window.__m = {s: []}` y un `setInterval` que apunta `inspect()` cada
  15 s— y se recoge después con llamadas de un par de segundos. Para dejar pasar el tiempo entre
  recogidas, un `sleep` en Bash **en segundo plano**; en primer plano está bloqueado. Así se midió
  un llenado de 7 minutos sin una sola llamada larga. Y no edites ningún archivo mientras corre: el
  HMR reinicia la escena y la serie deja de significar nada.
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
  se ve es la desviación típica de la x de los granos de esa fila. Y esa σ hay que **acumularla
  sobre ~90 fotogramas**: en uno solo la fila trae 4-11 granos y el número salta entre 5,8 y 12,3 px
  sin que haya cambiado nada.
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
  trae 11. El `r` que da `donde` es el de **agarre**, no el del cuerpo: la bola le suma `GRAB_EXTRA`,
  así que un `r` de 25 es una bola de 17.
- **La fuente de serie ya no es indestructible: se vuela, se tira y `clear()` la repone.** Un lienzo
  sin ninguna fuente es un estado válido y no cae arena; si al medir no crece `sand`, mira primero
  si hay fuente antes de sospechar de la física.
- **Arrastrar la fuente muta su origen, y `clear()` la repone donde la dejaste, no en el centro.**
  `onMoved()` escribe en `source.x/y`, que es de donde `Emitter.main` la vuelve a crear. Invalidó
  dos medidas seguidas: un barrido de sondas que agarra la pieza la va arrastrando, y yo seguía
  calculando los puntos desde el centro original. Si sondeas agarres, lee `donde` **antes de cada
  sonda** y calcula relativo a eso, o recarga la página entre una y otra.
- **El tamaño de la bola sale del ancho del lienzo** (`R_FRAC`), pero con el grano fino **mandan los
  topes**: las 17 celdas de radio en escritorio y 8 en vertical son `R_MAX`/`R_MIN`, no la fracción,
  que se pasa de largo en los dos perfiles. Un número absoluto medido en un perfil no vale en el otro.
- **`inspect().perdidos` es acumulado de toda la sesión y `clear()` no lo reinicia.** Vale para ver
  si algo sangra arena, pero solo mirando el delta en una ventana: leerlo en seco y ver 95 no acusa
  a lo que acabas de tocar.
- **Una pieza que se mueve dentro de un montón se come la arena si no se le da salida.**
  `displaceSand()` destruye el grano que no cabe en ningún hueco. Sin `Grid.overflow`, una
  sola cruz bajo el chorro se comía 337 granos en 5 s (15% del caudal). Para medirlo hay
  que comparar la ganancia con y sin la pieza en la misma ventana, nunca mirar `sand` a
  secas: la fuente y el drenaje enmascaran la fuga. `inspect().perdidos` no debe subir mientras
  la pieza está puesta.
- **El grano es de 2 px en escritorio y 3 en vertical, y bajarlo NO es cambiar `cell`.** Todo lo
  calibrado en celdas encoge en pantalla en la misma proporción, así que bajar `cell` a secas no da
  una versión fina de esta escena: da otra escena. La regla del reescalado es que **lo que va por
  longitud sube con la finura y lo que llena área sube con su cuadrado** —brocha, boquilla, boca del
  drenaje y cono por `k`; caudal por `k²`—. El tope de arena ya no está en esa tabla: es una
  fracción de las celdas del lienzo (`SAND_CAP`, en `world.ts`), así que sube solo con la finura y
  con el tamaño de la pantalla. Cuando era un número absoluto —304.000, justo el lienzo entero de
  este portátil— en un 4K o un ultrapanorámico dejaba de ser una red de seguridad y pasaba a ser el
  tope de verdad: el emisor se cortaba ahí y el drenaje no llegaba a dispararse nunca.
- **Para llenar el lienzo deprisa, fuentes repartidas a lo ancho — apiladas en el mismo eje se
  ahogan entre ellas.** Cada una solo puede sembrar en las celdas libres de su cono, y dos conos en
  la misma columna se pelean por las mismas: cinco en fila vertical daban 680 granos/s, menos que
  la de serie sola. Seis repartidas a lo ancho dan 8.200/s y llenan hasta el disparo del drenaje en
  40 s en vez de en varios minutos.
- **El techo de arena de la escena no lo pone ningún parámetro: lo pone el cono.** Con la fuente de
  serie —una sola, central— la arena se asienta en un talud que acaba tocando la boquilla, y ahí la
  fuente se ahoga en su propio montón. Medido: a los 7 minutos, 140.000 granos (el 46% del lienzo),
  el pico en la fila 57 contra la boquilla en la 51, y el caudal caído de 1.575 a 128 granos/s. El
  disparo del drenaje está en 219.000, así que **con una sola fuente no se alcanza nunca** y el
  ciclo de descarga no llega a ocurrir. Con siete fuentes repartidas arriba sí: 219.000 en 40 s y el
  drenaje abriendo por nivel. Si mides el llenado, cuenta con eso antes de sospechar del emisor.
- **`regrain` (`world.ts`) solo alcanza a la tabla del perfil, no a las constantes en celdas de los
  demás módulos.** `MAX_VEL`, `CHUTE_STEPS` y `AVALANCHE_STEPS` en `physics`, la gravedad y el tope
  de la `ejecta`, `BLAST_R`, el cuerpo y el agarre de la bomba, el radio de la bola, `TAP_CELLS`,
  `BADGE_R`: todas están escritas para el grano de serie y hubo que rehacerlas **a mano** al pasar
  de 3 a 2. Si vuelves a mover `cell` de verdad, hay que rehacer los dos grupos.
- **`?cell=N` sirve para juzgar la ARENA, no las piezas.** Reescala el perfil al vuelo para comparar
  granos en la misma sesión (`?cell=3` es a ojo el grano grueso de antes), pero por lo anterior deja
  la bola, la explosión y los agarres al tamaño de serie. Una comparación de piezas hecha con
  `?cell=` no vale.
- **La fuente no se dibuja, y no es que se le haya olvidado.** No hay tolva, ni PNG, ni trazo: en
  reposo `Emitter.draw` no pinta nada y lo único que se ve es la arena saliendo. Tuvo un dibujo con
  `SPOUT_FRAC`, `SOLAPE` y `NOZZLE_SPRITE_ROWS` detrás, y está entero en el historial. No lo
  reintroduzcas por tu cuenta; el porqué está en el README.
- **El chorro nace en un vértice de una celda y se abre en `SPREAD_ROWS` filas** (51, en `world.ts`).
  Cada grano sortea una fila del cono y **baja hasta encontrar hueco**: sin ese descenso el vértice
  sale punteado —es de una celda, se satura, y lo que no cabe se pierde— y además cae el caudal. Si
  tocas la siembra, mide las dos cosas: el ancho por fila y los granos/s de verdad.
- **La forma del cono la manda `Source.halfAt`, y la usan dos sitios.** La siembra y el contorno que
  se pinta al arrastrar la fuente salen los dos de ahí. Si calculas la forma aparte en el render,
  acabarás prometiendo un cono por donde la arena no sale.
- **`SPREAD_ROWS` no es solo estética: es también la altura de la caja de agarre.** Alargar el cono
  se come sitio de dibujo alrededor del chorro. Se probó con 22 —llega a su ancho en el primer
  tercio de la caída y el resto baja recto— y con 34, ambas medidas con el grano grueso de
  entonces; las 51 de ahora son ese mismo cono con el grano fino. Se abre casi todo el rato
  que se ve, que es lo que se lee como que crece.
- **La fuente se agarra por una caja (`grabBox`), no por un radio.** Es la única pieza que no tiene
  cuerpo dibujado y que cuelga entera por debajo de su centro —su `cy` es el vértice del que cae la
  arena—, así que un círculo centrado ahí prometería un objetivo que no es el que se ve. El aro de
  señalado y la × de quitar salen de la misma caja; si añades otra pieza descentrada, hazlo igual o
  las tres cosas dejarán de coincidir.
- **La pista que se ve al arrastrar una fuente va en `inkBright` y sólida, no en el tono de la
  maquinaria.** Es diagonal, así que el antialias ya la reparte a medio tono entre dos píxeles, y el
  fantasma del dock encima va al 55% de opacidad: en `structureLine`, a un píxel y a rayas, quedaba
  en un gris casi igual al fondo. Y las rayas las pone quien llama —el fantasma se pinta a rayas
  cuando la pieza **no** cabe—, así que `drawJetHint` no debe tocar el `setLineDash`.
- **Una pieza colocada desde el dock hay que desmarcarla (`held = false`) en `endPlacement`.** El
  fantasma nace `held` para que la fuente enseñe su cono mientras lo llevas, y nada más lo apaga: el
  `held` de una pieza agarrada lo quita el soltarla, y el fantasma no pasa por ahí. Se quedaba con
  el cono pintado para siempre.
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
- **Pero ese `pkill` no siempre tiene a quién matar: a veces el candado lo sostiene el Chrome del
  usuario.** Si `ps aux | grep Chrome` no enseña el id del perfil en la línea, el que lo tiene es su
  navegador de verdad y matarlo le cierra sus pestañas: ahí no hay cura, se acabó la sesión de
  navegador y hay que rematar la verificación por otro lado. Y **no cierres pestañas por índice**
  (`browser_tabs close`) — los índices se mueven entre llamadas y te llevas una del usuario.
- **Un `browser_evaluate` largo tumba el navegador entero.** Uno con 12 s de espera dentro dejó
  «Target crashed» y se llevó también pestañas ajenas — es del navegador, no de la app. Parte las
  medidas en llamadas de pocos segundos.
- **Para saber si un punto agarra una pieza, mira si la pieza se movió** — nunca si apareció pared.
  Cerca del borde superior no se puede dibujar, así que «no hay pared nueva» sale igual cuando el
  gesto agarró que cuando no llegó a hacer nada, y da un mapa del área activa que es pura ficción.
- **Para juzgar cómo se ve una pieza, recórtala del `#fx` ampliada**: `s = fx.width / grid.w` son
  px de canvas por celda, con el dpr ya dentro. A tamaño real una pieza mide unos 60 px y ahí se
  pierde casi todo el detalle — mirarla ampliada es lo que evita decidir sobre lo que no se ve.

Parámetros de URL: `?debug=1` (overlay), `?fill=0.2` (baja el nivel de disparo del
drenaje; sin esto, probar la descarga son varios minutos por ciclo) y `?cell=N` (píxeles por
celda, de 2 a 8: el tamaño del grano, con el perfil reescalado — ver arriba lo que no alcanza).

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
