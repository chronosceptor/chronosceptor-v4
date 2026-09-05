# CLAUDE.md

Lienzo de física: cae **arena o agua** —lo elige la ficha con la que se saca cada fuente—, el usuario
dibuja paredes que las desvían, y donde se juntan sale lodo, que es arena con humedad. Y hay una
**antorcha** que prende esas paredes: arden como una mecha, se consumen y encienden lo que tocan. El
color sale de la paleta que elija en el dock. Astro **enteramente estático**: ya no hay endpoints, ni
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
  entero, no solo esa llamada.** Pasó con `#dock`, que se autooculta: nunca llegó a estar "quieto"
  y se llevó por delante toda la sesión de navegador. Y la de página completa también se cuelga en
  «fonts loaded», porque el bucle de arena nunca deja un fotograma estable que esperar. Receta que
  sí funciona: `fabrica.destroy()` **antes** de capturar —corta el `rAF` y congela la escena—,
  `dock.style.opacity = '1'` sin observador, y captura de página entera. Si ya se colgó,
  `pkill -f mcp-chrome-` y volver a navegar.
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
  `import.meta.env` para un secreto**: van por `astro:env/server` con `access: 'secret'`.
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
  vacía, así que en una bandeja llena solo se mueve el grano de delante de cada capa. El
  `BELT_L`/`BELT_R` de `physics.ts` sigue ahí y volverá a tentar: si algo tiene que viajar en bloque,
  hay que trasladarlo a mano. Los números, en el README.
- **`inspect().piezas` no cuenta la fuente principal, pero `donde` sí la lista.** Es la pieza de
  serie (`permanent`) y no ocupa hueco del tope: con el lienzo lleno, `piezas` dice 10 y `donde`
  trae 11. El `r` que da `donde` es el de **agarre**, no el del cuerpo: la bola le suma `GRAB_EXTRA`,
  así que un `r` de 25 es una bola de 17.
- **La fuente de serie ya no es indestructible: se vuela, se tira y `clear()` la repone.** Un lienzo
  sin ninguna fuente es un estado válido y no cae arena; si al medir no crece `sand`, mira primero
  si hay fuente antes de sospechar de la física.
- **Arrastrar la fuente muta su origen, y `clear()` la repone donde la dejaste, no en el centro.**
  `onMoved()` escribe en `source.x/y`, que es de donde `Emitter.main` la vuelve a crear. Si sondeas
  agarres, lee `donde` **antes de cada sonda** y calcula relativo a eso, o recarga entre una y otra:
  un barrido de sondas va arrastrando la pieza e invalida la medida sin avisar.
- **El tamaño de la bola sale del ancho del lienzo** (`R_FRAC`), pero con el grano fino **mandan los
  topes**: las 17 celdas de radio en escritorio y 8 en vertical son `R_MAX`/`R_MIN`, no la fracción,
  que se pasa de largo en los dos perfiles. Un número absoluto medido en un perfil no vale en el otro.
- **`inspect().perdidos` es acumulado de toda la sesión y `clear()` no lo reinicia.** Vale para ver
  si algo sangra arena, pero solo mirando el delta en una ventana: leerlo en seco y ver 95 no acusa
  a lo que acabas de tocar.
- **Una pieza que se mueve dentro de un montón se come la arena si no se le da salida.**
  `displaceSand()` destruye el grano que no cabe; para eso está `Grid.overflow`. Para medirlo hay
  que comparar la ganancia con y sin la pieza en la misma ventana, nunca mirar `sand` a secas: la
  fuente y el drenaje enmascaran la fuga. `inspect().perdidos` no debe subir mientras está puesta.
- **El grano es de 2 px en escritorio y 3 en vertical, y bajarlo NO es cambiar `cell`.** Todo lo
  calibrado en celdas encoge en pantalla en la misma proporción, así que bajar `cell` a secas no da
  una versión fina de esta escena: da otra escena. La regla del reescalado es que **lo que va por
  longitud sube con la finura y lo que llena área sube con su cuadrado** —brocha, boquilla, boca del
  drenaje y cono por `k`; caudal por `k²`—. El tope de arena ya no está en esa tabla: es una
  fracción de las celdas del lienzo (`SAND_CAP`, en `world.ts`), y como número absoluto dejaba de
  ser una red de seguridad en cuanto la pantalla era grande. No lo vuelvas a fijar.
- **Para llenar el lienzo deprisa, fuentes repartidas a lo ancho — apiladas en el mismo eje se
  ahogan entre ellas.** Cada una solo puede sembrar en las celdas libres de su cono, y dos conos en
  la misma columna se pelean por las mismas: cinco en fila vertical daban 680 granos/s, menos que
  la de serie sola. Seis repartidas a lo ancho dan 8.200/s y llenan hasta el disparo del drenaje en
  40 s en vez de en varios minutos.
- **El techo de arena no lo pone ningún parámetro: lo pone el cono.** Con la fuente de serie —una
  sola y central— el montón acaba tapando la boquilla y el caudal se ahoga: 140.000 granos a los 7
  minutos y el drenaje, que dispara en 219.000, **no llega a abrir nunca**. Con siete fuentes
  repartidas sí, en 40 s. Si mides el llenado, cuenta con eso antes de sospechar del emisor. Los
  números están en el README.
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
  se come sitio de dibujo alrededor del chorro. Es una perilla de gusto y está calibrada: el cono
  tiene que abrirse casi todo el rato que se ve, que es lo que se lee como que crece.
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
- **El dock tiene cuatro fichas —fuente de arena, fuente de agua, bola y bomba— y un botón que no es
  ficha: la antorcha.** Hubo una cruz giratoria y una plataforma, y se quitaron enteras aunque
  funcionaban (commit `b52c517`, con lo último que llegaron a hacer: colocación en dos tiempos y
  trayecto inclinado). No las reintroduzcas por tu cuenta.
- **La antorcha va dentro de `#dock-fichas` pero SIN la clase `.ficha`, y no es un descuido.**
  `.ficha` es lo que atenúan `#dock.lleno` y `#dock.solo-bomba`, y el fuego no ocupa plaza: al
  contrario, es otra forma de hacer sitio. Está dentro del grupo porque los tres iconos que eligen
  qué le echas al lienzo tienen que verse juntos, y escrito en el orden en que se ve —con `order` de
  flex el tabulador iría por otro sitio—.
- **El material ya NO es global: lo lleva cada fuente y se fija al colocarla.** `TickCtx.material`
  ya no existe y `Emitter.tick` no lo pisa cada paso. `fabrica.setEmitMaterial` sigue ahí pero cambia
  sólo **la fuente de serie**; es una ayuda de consola para medir agua sin arrastrar una ficha.
  `build()` copia `source.material` del mundo anterior, o un redimensionado la devolvía a arena.
- **Una celda que arde sigue siendo `WALL`: no hay material nuevo.** El fuego es una lista aparte
  (`fire.ts`), como la ejecta. Un `EMBER` obligaría a pagar una comparación más en las 326.000 celdas
  del bucle caliente —ver más abajo lo del guardia— para algo que ocurre en doscientas. No lo
  conviertas en material.
- **El fuego se propaga en pasadas de UNA celda, nunca en un radio.** Un radio de dos iría al doble
  de deprisa y cruzaría los huecos de una celda; que no salte los cortes es media gracia. Y ocho
  vecinas, no cuatro: Bresenham deja los trazos inclinados conectados sólo en diagonal.
- **`Wick` distingue el fuego de una onda (`Blast.fire`), y hace falta.** Una onda precipita lo que
  ya ardía —la cascada de bombas— pero el fuego toca la misma pieza en cada fotograma: sin la
  bandera `porFuego`, rozar una bola con la antorcha la reventaba a los 0,75 s en vez de dejarla
  arder los dos segundos. A la bomba sí hay que precipitarla, y ese caso lo cubre la misma bandera
  (nace encendida por su cuenta, no por el fuego).
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
- **Si alguna vez vuelve a haber un asset dibujado, su fondo blanco NO se quita por color.** Las
  piezas iban tramadas en semitono y un borrado por color agujerea la figura. El porqué, el flujo y
  los prompts están en `docs/historia.md` y `docs/prompts-piezas.md`; la herramienta,
  en `scripts/asset-alfa.py`.
- **El fondo es un solo archivo fijo: `public/background.webp`, escrito a pelo en el CSS de
  `SandCanvas.astro`.** No hay rotación: soltar un archivo nuevo en `public/` no hace nada, hay que
  cambiar la `url()`.
- **Toda capa decorativa va DEBAJO de los canvas**, en la pila de `background` de `#escena`
  (`SandCanvas.astro`), nunca superpuesta. El color de la arena sale de la portada del disco y es lo
  único saturado del cuadro: cualquier velo o trama por encima lo apaga — unas rayas sobre el canvas
  volvían el amarillo un verde sucio. El velo y el semitono del fondo están puestos así a propósito,
  y superponerlos es la primera tentación al vestir la escena.
- **Hay DOS materiales que caen, `SAND` y `WATER`.** Cualquier código que mire `=== SAND` tiene que
  decir en qué caso está: la bola se come los dos, la explosión sólo la arena (a propósito: el agua
  se mete en el cráter), la brocha aparta los dos, y `addSand` acepta además una celda de agua —la
  sustituye y el grano nace empapado—. `Grid.sandCount` y `waterCount` van por separado y lo que
  miran el drenaje y el presupuesto del emisor es `Grid.ocupadas`, la suma.
- **El guardia del bucle caliente son dos comparaciones contra literales, y no una tabla.** Lo
  natural, con `SOLID` e `IS_MASS` delante, es un `IS_MOBILE[m]`, y sale un 20-40% más caro: la
  segunda lectura de array se paga en las 326.000 celdas del lienzo. Mismo caso en `paintSand`. Si
  añades un tercer material que caiga, mídelo antes de dar por buena la tabla o el `switch`.
- **Tres cosas del lodo que se probaron al revés y no funcionan** (los números, en el README): la
  cohesión tiene que ser un **umbral** (`WET_HOLD`) y no sólo una probabilidad; el `wet = 255` por
  contacto con agua va **antes** de la puerta de cohesión y no al aterrizar; y el agua **se filtra**
  por la arena intercambiándose con ella, nunca absorbiéndose.
- **Constantes en celdas nuevas, del grupo que `regrain` NO alcanza:** `FLOW_REACH`, `SOAK_P`,
  `WET_HOLD` en `physics.ts`, `SWEEP_FRAMES`, `DRY`, `SEEP` en `moisture.ts`, y `BURN_TIME` /
  `FRONT_SPEED` / `CAP` en `fire.ts`. Si vuelves a mover `cell` de verdad, van con las demás.
  (`FRONT_SPEED` sí se multiplica por `k` en tiempo de ejecución, porque va por longitud; `BURN_TIME`
  es un tiempo y no se toca.)
- **`moisture.ts` es el único sitio que toca celdas dormidas**, y tiene que llamar a `wake` cuando la
  humedad cambia o el lodo se seca en el array y sigue de pie en pantalla. Cuesta 0,03 ms sobre un
  lienzo seco y sube la simulación de 1,7 a 4,2 ms con el lienzo entero de lodo secándose.
- **`dump()` saca `~` para el agua, la arena mojada en MAYÚSCULA (`O` contra `o`) y `*` para la pared
  que arde.** Es lo único con lo que se ve por dónde va el frente de mojado o el del fuego — la
  pared ardiendo sigue siendo `WALL`, así que sin el glifo saldría como cualquier otra.
- **Para medir física, un banco en Node vale mucho más que el navegador.** La pestaña del MCP se
  estrangula sola —se han visto 4 fps— y entonces `msSim` mide hasta tres pasos por fotograma y no
  significa nada: con 550 granos marcaba 7,6 ms. Los módulos de `src/sand/` no importan nada de
  Astro, así que se empaquetan con `./node_modules/.bin/esbuild bench.ts --bundle --platform=node
  --format=esm --outfile=bench.mjs` y se corren con `node`. Así se midió el A/B contra `main` (con
  `git stash` en medio), el caudal de la fuente y el talud del lodo, todo determinista.
- **Antes de dar por malo un cambio de talud, corre el control sin tocar nada.** Un cono recién caído
  sigue asentándose durante casi un minuto: medía 378 de alto justo después de emitir y 136 un rato
  después **sin agua ninguna**. Estuve a punto de acusar al agua de derrumbarlo.
- **La cohesión no se ve en un montón que ya está en reposo.** Mojar un cono asentado no lo cambia
  —no tenía razones para moverse—; la prueba que sí lo enseña es apoyar el montón contra una pared
  dibujada, quitarla, y mirar cuánto queda de la cara vertical. Seca aguanta el 55%, mojada el 100%.

## Depuración

Todo desde la consola del navegador, sobre `window.fabrica`:

- `fabrica.dump(x, y, w, h)` — vuelca los materiales de una región como texto. **Es la que
  encontró todos los bugs de física**; sin ella no se ve por qué la arena no pasa.
- `fabrica.inspect()` — arena, **agua**, **mojada**, **fuego**, paredes, fps, coste real de
  simulación y pintado, celdas despiertas.
- `fabrica.setEmitMaterial('sand' | 'water')` — sólo la **fuente de serie**; las colocadas traen lo
  suyo de su ficha. Para poner una de agua sin gestos: `fabrica.beginPlacement('emitter', 'water')`.
- `fabrica.setTool('fire' | 'draw')` — la antorcha, sin gesto. `fabrica.tool` la lee.
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
- **Al probar el fuego contra el agua, un cuenco con costados se inunda ENTERO.** El agua se nivela y
  moja el trazo de punta a punta, así que no queda un solo sitio donde prender y `fire.light` devuelve
  `false` en todos: parece que la antorcha esté rota y lo que pasa es que está bien. Para ver el
  frente parándose contra el agua hace falta un trazo plano y sin costados, con la fuente de agua
  encima de un tramo — el agua se derrama por los extremos y deja seca la otra mitad.
- **Una lectura de `opacity` justo después de tocar una clase del dock no vale.** Las fichas llevan
  `transition: opacity 200ms`, así que `getComputedStyle` devuelve el valor de partida y `#dock.lleno`
  parece no aplicar. Hay que esperar 400 ms antes de leer; sin eso di por rota una regla de CSS que
  estaba perfecta.
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

El coste va con la arena **en movimiento**, no con la total: los granos asentados se duermen.
Medido: 90.000 granos → 1,4 ms de simulación de un presupuesto de 16,7; cuatro piezas a la vez,
2,4 ms; una explosión con 1.300 granos en vuelo, 1,4; un trazo largo ardiendo, 2-3 ms. Si algo va
lento, el sospechoso no es la cantidad de arena — serían las partículas de ejecta o el borrado de
cuerpos.

La deriva lateral de la caída libre (`DRIFT_P` en `physics.ts`) es **la única rama que se le ha
añadido nunca al bucle caliente**, y cuesta un `rand()` por grano en vuelo: 1,07 → 1,13 ms con la
escena cargada. Ni las piezas ni el fuego le han añadido ninguna otra, y hay que mantenerlo así.
Los números de la calibración están en el README.

`inspect().despiertas` sale disparado después de un `clear()` y no significa nada:
`clearWorld` marca todas las celdas como despiertas y las vacías nunca se vuelven a dormir,
porque el autómata solo recorre las que tienen arena. Es previo a las piezas.

## Historia

Lo que hubo y ya no está —el color por Last.fm y sus endpoints, la fábrica generativa del primer
commit, el flujo de assets tramados— vive en **`docs/historia.md`**. Nada de eso es contexto
operativo; se saca de aquí para que este archivo no se pague entero en cada sesión.
