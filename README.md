# Sandbox

Un lienzo de física a pantalla completa. El mundo arranca vacío, cae arena desde el centro superior,
y con el ratón o el dedo se dibujan paredes que la desvían — como un MS Paint donde el trazo *es* la
física. Una rampa la hace bajar, una U la atrapa, un embudo la concentra.

No hay herramientas que elegir: hay una sola materia sólida y todo el comportamiento sale de la
forma que dibujes.

Además, del dock de abajo se arrastran **piezas** que participan de la física de verdad — una cruz
que gira y avienta, una plataforma que patrulla llevándose su carga entera, una bola que rebota y
desportilla, una bomba y una fuente extra de arena. No son adornos pintados sobre el lienzo: su
cuerpo se estampa en el grid como material sólido y la arena choca con él. La fuente principal es
una más: se coge y se pone donde quieras.

El color de la arena sale de la portada del disco que estés escuchando, vía Last.fm. Como la fuente
rota el color por lotes, los montones que atrapes quedan estratificados: al cambiar de canción, el
color nuevo va sepultando al anterior.

## Arranque

Requiere Node ≥ 22.12 (hay un `.nvmrc`; con nvm basta `nvm use`).

```sh
npm install
npm run dev      # http://localhost:4321
```

Para que reaccione a la música, copia `.env.example` a `.env` y rellena:

```sh
LASTFM_API_KEY=   # gratis en https://www.last.fm/api/account/create
LASTFM_USER=      # tu usuario de Last.fm
```

Sin esas variables funciona igual, con la paleta ocre por defecto.

## Cómo se usa

- **Arrastrar sobre vacío** dibuja una pared.
- **Arrastrar empezando sobre una pared tuya** la borra. El modo se decide al empezar el gesto y se
  mantiene hasta soltar, así que no alterna solo a media línea.
- **Clic derecho arrastrando** fuerza el borrado esté donde esté.
- **Clear** vacía el lienzo entero.

El mismo gesto funciona con dedo y con ratón: no hace falta ningún selector de herramienta ni gestos
que haya que aprender.

### Las piezas

Del dock de abajo se arrastra una ficha al lienzo y ahí se queda. Tres gestos en total:

- **Arrastrar una ficha del dock** coloca la pieza. Tocarla sin arrastrar la deja en el centro de la
  escena, que es donde se ve lo que hace.
- **Arrastrar una pieza colocada** la mueve. Mientras la llevas, el dock se convierte en papelera.
- **Quitarla**: la **×** que aparece al señalarla, o soltarla encima del dock.

Y una excepción, solo para la bomba: **tocarla la detona** sin esperar a la mecha.

| Pieza | Qué hace |
|---|---|
| **Cruz giratoria** | Cuatro aspas que giran y avientan la arena hacia el lado del giro |
| **Plataforma** | Bandeja con costados: patrulla de izquierda a derecha **llevándose la carga entera** |
| **Bomba** | Mecha de 2 s con un anillo que se vacía; revienta un radio de 42 celdas —arena, **paredes** y **cualquier pieza que pille dentro**— y se consume |
| **Fuente** | Un segundo chorro, con su propio color dominante de la paleta |
| **Bola** | Rebota en los bordes, en tus paredes y contra las otras bolas, y se come la arena que toca. Cada golpe **desportilla la pared** |

Las piezas van con tamaño y velocidad fijos: no hay ajustes ni panel, igual que no hay selector de
brocha. Caben diez a la vez; al llegar al tope las fichas del dock se atenúan **menos la de la
bomba**, que tiene su propio hueco reservado por encima del tope y está siempre disponible: es la
que sirve para hacer sitio.

**La fuente principal también es una pieza** y se arrastra igual que las demás. No ocupa hueco del
tope, no se puede tirar a la papelera y no se la lleva una bomba — sin ella el lienzo se queda sin
arena y sin forma de recuperarla.

**Cualquier pieza que pille dentro una explosión se enciende**, arde dos segundos con su aro de
alcance y su arco de cuenta atrás, y revienta a su vez. Una bola encendida sigue rebotando mientras
arde, así que la explosión no se propaga en el sitio: se va corriendo. Y una fila de bombas cae en
cascada rápida, porque a lo que ya era una bomba no hay que convencerlo con dos segundos de mecha.
De paso, volar una pieza es la otra forma de quitarla del lienzo — bastante mejor que arrastrarla
hasta la papelera.

La bomba **sí se lleva por delante tus paredes**: abre un boquete en el trazo y lo que estuviera
aguantando encima se desploma por él. Lo único intocable es el suelo del mundo —la última fila, que
lleva el sumidero— y los cuerpos de las demás piezas. El aro punteado que se ve durante la mecha
marca exactamente hasta dónde va a llegar.

El fondo tiene un **drenaje con nivel de guarda**: no drena nada hasta que el lienzo se llena casi
del todo, y entonces abre una boca ancha en el centro y descarga hasta la mitad. Así el ciclo es un
suceso —llenarse, descargar, volver a llenarse— y cada vuelta trae los colores de otra canción, que
es lo que hace que se vayan combinando en capas.

Sí puede inundarse si dibujas una presa que cruce toda la pantalla — es física honesta, y para eso
está `Clear`. Las dos últimas filas están reservadas: no se puede dibujar sobre el drenaje.

El dibujo no se guarda: cada visita empieza en blanco.

## Parámetros de URL

| Parámetro | Para qué |
|---|---|
| `?debug=1` | Superpone fps, conteo de arena y paredes, tamaño de grid y modo de brocha |
| `?mock=1` | Sirve una canción fija con portada local: permite afinar la extracción de color sin API key |
| `?fill=0.2` | Baja el nivel al que dispara el drenaje. Sin esto, probar la descarga son varios minutos por ciclo |

Desde la consola: `fabrica.inspect()` (arena, paredes, fps, grid, **piezas**, **dónde** está cada
una, **ejecta** en vuelo y **perdidos**), `fabrica.dump(x, y, w, h)` (vuelca los materiales de una
región como texto) y `fabrica.clear()`.

`donde` hace falta porque `dump()` ya no lo ve todo: la bola y la fuente no escriben nada en el
grid, así que en un volcado de materiales son invisibles.

`perdidos` es el contador que importa cuando se toca una pieza: son granos que salieron del grid y
no encontraron dónde volver. Debe quedarse en cero. Si sube sin parar, algo está perdiendo masa.

## Estructura

```
src/
  pages/index.astro        pagina + cableado entre la musica y la simulacion
  pages/api/now-playing.ts proxy de Last.fm (la API key nunca llega al browser)
  pages/api/art.ts         proxy de portadas (same-origin => canvas legible)
  components/              isla de canvas y dock de piezas
  sand/
    world.ts               mundo vacio, fuente y drenaje del fondo
    draw.ts                brocha, interpolacion de trazo, dibujar y borrar
    input.ts               gestos
    index.ts               bucle principal
    physics.ts             el automata celular
    ejecta.ts              arena en vuelo balistico (explosiones y aventado)
    dock.ts                dock de piezas: arrastrar, mover, tirar
    gadgets/               piezas: cruz, plataforma, bomba, fuente, bola, y la explosión
    grid.ts, materials.ts, palette.ts, render.ts, rng.ts, color/extract.ts
  lib/nowPlaying.ts        poller cliente
php/                       los dos endpoints en PHP, por si va a un VPS/cPanel
```

`src/sand/` no importa nada de Astro: expone `boot({ sandCanvas, fxCanvas })` y se puede mover a
cualquier otro sitio tal cual.

## Despliegue

Por defecto sale a Netlify (`@astrojs/netlify`): el sitio es estático salvo los dos endpoints de
`/api`, que llevan `prerender = false` y se vuelven functions. Las variables de entorno se ponen en
el panel de Netlify.

Si acaba en un VPS con cPanel, el build estático es el mismo y solo hay que servir
`php/now-playing.php` y `php/art.php` en `/api/now-playing` y `/api/art`.

## Decisiones no obvias

Cosas que parecen arbitrarias en el código y no lo son:

- **El trazo se interpola y se aplica en el evento, no en el bucle de simulación.** Los eventos de
  puntero llegan espaciados y a 120 Hz un movimiento rápido salta decenas de celdas entre uno y
  otro. Estampando solo donde cae el evento, la línea sale punteada y la arena se cuela por los
  huecos. Además se leen los eventos agrupados (`getCoalescedEvents`), que traen las posiciones
  intermedias que el navegador juntó.
- **`setPointerCapture` va envuelto en try/catch.** Lanza `NotFoundError` si el puntero ya no está
  activo, y esa excepción abortaría el resto del handler: se perderían la primera marca del trazo y
  la señal de primer trazo, con el gesto empezando cojo y sin nada que lo indicara.
- **Una brocha de una sola celda ya retiene la arena.** La regla diagonal de la física exige que la
  celda lateral también esté libre, así que un trazo fino no gotea y no hay razón para engordarlo.
- **El color de cada grano se guarda ya resuelto (`Uint32Array`), no como índice de paleta.** Al
  cambiar de canción los granos viejos conservan su color en vez de remaparse, y por eso los
  montones quedan estratificados.
- **Los granos asentados se duermen** y solo los revive un cambio en su vecindario 3x3. Es lo que
  hace que un montón grande y quieto cueste casi nada.
- **`/api/art` recibe la ruta relativa del CDN, nunca una URL.** El host es una constante del
  servidor, así que el endpoint no puede convertirse en proxy abierto.
- **Las credenciales se declaran como secretos de `astro:env`, no se leen con `import.meta.env`.**
  Vite sustituye `import.meta.env.X` por su valor literal al compilar, así que la API key acababa
  escrita dentro del artefacto de la función. Declaradas como secretos de servidor se leen del
  entorno en tiempo de ejecución y nunca se incrustan en el build.
- **El desplazamiento de un grano barrido sigue la dirección de la pieza que lo empuja.** Una lista
  fija de huecos que mire a la izquierda antes que a la derecha haría que toda pieza en movimiento
  expulsara el material siempre hacia el mismo lado.
- **El drenaje solo actúa por encima de un nivel de guarda.** Con la fila entera consumiendo
  siempre, lo que no atrapa el dibujo desaparece al tocar el fondo y la pantalla se queda
  perpetuamente vacía: no da tiempo a ver mezclarse los colores de dos canciones.
- **El sumidero va solo en la última fila, nunca repartido en altura.** Se probó estampándolo en V
  sobre varias filas para forzar la forma de embudo: el material se consume en el aire, a la altura
  a la que toca el borde, y aparecen huecos negros de la nada sin que nada llegue a caer hasta
  abajo. Lo que se ve tiene que salir por el borde del mundo, no evaporarse a media altura.
- **El techo real del caudal es el ancho de la boquilla, no `rate`.** La fuente solo puede sembrar
  en las celdas libres de las dos primeras filas, así que una boquilla estrecha rechaza todo lo que
  no cabe: con tres celdas el máximo eran ~180 granos/s aunque se pidieran 520.
- **El drenaje también abre si la fuente queda sepultada.** Sin esa salida, si el montón crece hasta
  tapar la boquilla antes de alcanzar el nivel de disparo, deja de emitir, el nivel no vuelve a
  subir y el drenaje no abre nunca: el lienzo se queda lleno para siempre.
- **Llenar la pantalla no es un problema de rendimiento.** Medido: con 90.000 granos la simulación
  cuesta 1,4 ms por frame de un presupuesto de 16,7. Las celdas despiertas se mantienen planas sin
  importar cuánta arena haya, porque los granos asentados se duermen: el coste va con la arena en
  movimiento, no con la total.
- **Vale el último scrobble reciente, no solo la señal "now playing".** Muchos reproductores nunca
  mandan esa señal y solo scrobblean la canción al terminarla; mirando únicamente `nowplaying` la
  página se queda en la paleta por defecto aunque haya música sonando, que es indistinguible de
  estar rota. Se acepta el último scrobble de los últimos 25 minutos.
- **La canción no se muestra en ninguna parte.** Hubo una tarjeta con portada, título, artista y
  estado de escucha, y se quitó: lo interesante es que el color venga de lo que suena, no leer un
  nombre. Enseñarlo convierte el lienzo en el widget de un reproductor. El sondeo sigue vivo porque
  hace falta saber qué suena para pedir su portada, pero el título y el artista no llegan a
  pintarse — sólo entran en la clave de caché de la extracción de color.

### De las piezas

- **Todas las piezas borran su cuerpo antes de que ninguna lo estampe.** Son dos pasadas separadas
  sobre la lista, y no es estilo: en un solo recorrido, una pieza borraría el cuerpo recién escrito
  de la que va detrás, y dos piezas que se tocan parpadearían y dejarían pasar la arena por la
  junta.
- **`physics.ts` no se tocó.** Las piezas no añaden ni una rama al bucle caliente del autómata: la
  cruz funciona por el desplazamiento que ya hacía `Grid.stamp()`, y la plataforma traslada su carga
  por su cuenta.
- **La plataforma traslada su carga a mano, y hubo que llegar hasta ahí por descarte.** Primero fue
  una barra sólida y se escurría por debajo del montón: el suelo se retira de la celda que abandona
  y lo que había encima se cuela por el hueco. Después fue material de cinta (`BELT_L`/`BELT_R`),
  aprovechando el arrastre por rozamiento que `physics.ts` llevaba escrito y sin usar desde la
  fábrica original. Parecía la respuesta y no lo era: **la cinta no puede mover una carga compacta**.
  El arrastre es un paso lateral y `slideLateral` exige la celda de destino vacía, así que en una
  bandeja llena el único grano que puede moverse es el de delante de cada capa — y ése está contra
  el costado. Medido: salía de debajo del chorro con 124 granos y llegaba al otro extremo con 22.
  Los otros 102 no se caían por ningún sitio; nunca se movieron, y la bandeja se fue de debajo.
  Trasladando la carga en bloque cada vez que avanza una celda, llega entera: 200 de 200.
- **Los costados son media pieza, no un adorno.** Un montón tiene su ángulo de reposo, así que en
  cuanto es más alto que media barra su falda sobresale por los dos extremos y se descuelga por
  ellos. Sin costados, lo que le cae encima acaba al lado de donde cayó y la plataforma no aleja el
  material de su origen, que es justamente para lo que se pone.
- **El hueco de la bomba va por encima del tope, no reservando uno de los diez.** Con el lienzo lleno,
  la única forma de quitar algo era arrastrarlo hasta la papelera de una en una. Guardar un hueco
  para la bomba convierte volarlo todo en una opción siempre disponible, y quitarle un sitio a las
  demás piezas para conseguirlo saldría igual de caro que no poder poner la bomba. El hueco se
  devuelve solo: la bomba se consume al estallar.
- **La fuente principal se homologó a pieza en vez de dársele un arrastre propio.** Envolviéndola en
  el mismo `Emitter` que las colocables —adoptando la `Source` que ya vivía en el mundo, porque el
  drenaje y los cambios de canción le hablan a ésa— salieron gratis el arrastre, el hit-test, el
  estorbar a las demás y el dibujo, y desapareció su camino aparte en el bucle y en el render. Lo
  único que conserva de excepción es que no cuenta para el tope, no se tira y no se la lleva una
  bomba.
- **Al reescalar tras un redimensionado hay que avisar a las piezas igual que al arrastrarlas.**
  `rescale()` movía `cx`/`cy` sin llamar a `onMoved()`, así que un emisor colocado acababa
  pintándose en el sitio nuevo y sembrando en el viejo. Se ve en cuanto la fuente fija pasa a ser una
  pieza, pero llevaba ahí desde que hay emisores.
- **Se arrastra la plataforma para descargarla.** No hace falta un punto de volcado: al recolocarla
  el cuerpo se estampa en el sitio nuevo y la carga se queda donde estaba, en el aire, y cae. Que la
  única forma de vaciarla sea cogerla y llevarla es coherente con el resto — aquí todo se hace con
  el dedo encima del lienzo.
- **El grano que una pieza no consigue apartar sale volando, no se destruye.** `displaceSand()` lo
  eliminaba cuando no había hueco donde meterlo, y eso vacía la escena poco a poco: medido, una sola
  cruz bajo el chorro se comía 337 granos en 5 s, un 15% del caudal, y el lienzo dejaba de llenarse
  sin que nada lo explicara. Ahora hay un `Grid.overflow` que lo lanza. Además de conservar la masa
  es lo correcto: una rueda de paletas avienta lo que no puede apartar.
- **La arena en vuelo vive fuera del autómata.** `Grid.vel` es un `Uint8Array` de caída vertical y
  no sabe representar un grano disparado en diagonal. Meter velocidad vectorial en el grid
  engordaría el bucle caliente —que despacha 90.000 granos en 1,4 ms— a cambio de un efecto que dura
  un segundo, así que la ejecta son arrays paralelos aparte que vuelven a ser granos normales al
  chocar.
- **La explosión vacía la esfera entera antes de lanzar nada.** Sacando cada grano y lanzándolo acto
  seguido, los primeros salen mientras el resto sigue compacto: vuelan una celda, chocan contra
  arena que aún no se ha retirado y no encuentran dónde aterrizar. Así se perdían 236 granos por
  explosión.
- **Al aterrizar se busca hueco en anillos, y en último recurso subiendo por la columna.** Casi toda
  la ejecta nace dentro de un montón compacto, así que su celda de origen y todo lo que la rodea
  están ocupados; mirando solo el vecindario inmediato se perdían 432 granos en diez segundos. La
  subida por la columna cubre a los que una explosión lanza contra el fondo: en un montón siempre
  hay aire por encima, y un grano que reaparece en la superficie se nota muchísimo menos que un
  grano que desaparece.
- **La cruz se dibuja sin aro exterior.** La rueda original lo llevaba, pero aquí mentía: el aro
  sugiere una llanta sólida y lo único sólido son las aspas, así que se veía la arena atravesar
  limpiamente una circunferencia dibujada. Lo que se pinta tiene que ser lo que para la arena.
- **El sentido en que la cruz avienta se calcula celda a celda.** La rueda original estampaba sin
  `pushDir`, así que el grano barrido salía hacia donde dictase la paridad de su celda y la rueda
  escupía siempre al mismo lado girase como girase. El sentido correcto es el de la velocidad
  tangencial: arriba del eje se barre hacia un lado y abajo hacia el contrario.
- **`onMoved()` también se llama al colocar, no solo al arrastrar.** El fantasma se instancia fuera
  de la pantalla y luego se le asigna el sitio de golpe; sin avisarlo, la plataforma seguía
  centrando su patrulla en la esquina imposible donde nació y se iba a rebotar fuera del mundo.
- **El aviso al dock se deduce de comparar el contador.** La bomba se consume sola dentro del bucle
  de simulación, donde no hay ningún gesto del usuario del que colgar la notificación: acordándose
  de avisar en cada sitio que añade o quita, su hueco se quedaba sin liberar y el dock seguía
  anunciándose lleno con una plaza libre.
- **Hay una × para quitar una pieza, además de la papelera del dock.** La papelera funciona, pero
  solo se descubre después de haber arrastrado una pieza hasta allí, es decir, después de haber
  adivinado que existe. La primera persona que lo probó preguntó justo eso: cómo se borra algo que
  no sea una bomba.
- **La posición de esa × se fija al señalar la pieza y no se recalcula.** La plataforma patrulla,
  así que un botón atado a su centro se aparta mientras vas a pulsarlo: el ratón llega a donde
  estaba y la pieza ya no. Un botón no puede huir del cursor.
- **A la papelera se le pregunta antes de soltarla.** `isTrash` exige que el dock esté en modo
  papelera y `onRelease` es justo lo que le quita ese modo, así que llamándolo primero la pregunta
  salía siempre que no y tirar una pieza al dock no borraba nada.
- **El borde del boquete que abre la bomba se deshilacha.** Dentro del 72% del radio la pared se va
  siempre; a partir de ahí la probabilidad cae hasta cero justo en el borde. Con un corte limpio a
  radio fijo, lo que aparece en medio de un trazo hecho a mano se lee como un recorte de compás y no
  como una explosión.
- **La bomba destruye paredes en el mismo radio en que lanza la arena.** Se pensó en hacer el radio
  de la estructura más corto —las paredes son más recias—, pero entonces el aro punteado del alcance
  estaría mintiendo, que es exactamente por lo que la cruz perdió su llanta dibujada. El aro
  significa "todo lo de aquí dentro se va", y tiene que ser verdad.
- **La bola rebota también contra el dibujo, y encerrarla es parte del juego.** Nació
  atravesándolo, con el argumento de que si no acabaría atrapada en el primer cuenco y dejaría de
  limpiar. Era tratarla sólo como una escoba: pudiendo chocar, el trazo pasa a ser la mesa de un
  pinball —una rampa la desvía, un cuenco la encierra a ricochetear dentro, una pared la manda de
  vuelta— y dirigirla es la mitad de la gracia. Si se queda encerrada, se saca arrastrándola.
- **La normal del rebote se calcula sumando de dónde viene la pared, no invirtiendo un eje.**
  Casi nadie dibuja líneas rectas horizontales o verticales, y contra un trazo inclinado esa
  simplificación devuelve la bola por donde vino en vez de desviarla, que es justo lo que se busca
  al poner una rampa. La normal sale de sumar el vector que va de cada celda de pared a su centro.
- **Sólo se refleja si va hacia dentro** (`v·n < 0`). Sin esa condición, una bola que ya se está
  separando del muro se refleja otra vez y se queda pegada a él temblando.
- **Los choques entre bolas se resuelven en la capa, no dentro de la bola.** Un choque es de la
  pareja, no de ninguna de las dos: si cada una resolviera el suyo por su cuenta, el par se trataría
  dos veces y el intercambio de velocidades se anularía solo.
- **La dirección del choque sale de la física, pero la rapidez se devuelve a su valor nominal.** Un
  choque de refilón reparte la energía de forma desigual y puede dejar una bola casi parada, que ya
  no limpia nada. Además el rebote contra los bordes y contra el dibujo conserva la rapidez, así que
  una bola que frenara al chocar con otra sería de otro material.
- **La bola no tiene cuerpo sólido en el grid.** Podría estamparse como `DYN` para que la arena
  chocara con ella, pero sería trabajo tirado: lo que hay dentro de su radio deja de existir en el
  mismo paso, así que nunca habría nada contra lo que chocar.
- **El radio de agarre y el sitio que ocupa una pieza son dos números distintos** (`radius` y
  `footprint`). La bola infla su agarre a 18 celdas para poder cogerse en marcha —a 145 celdas/s
  cruza el cursor en una décima de segundo—, y mientras fueron el mismo número esa holgura se colaba
  en las reglas de colocación: exigía 36 celdas entre dos bolas y se negaba a soltar la quinta,
  justo cuando echar varias es como se usa.
- **Al rebotar se refleja la posición, no solo se invierte la velocidad.** Cambiando únicamente el
  signo, un paso largo puede terminar más allá del borde y la bola se queda vibrando pegada a él.
- **Cada golpe arranca un mordisco de pared, y muy por debajo de lo que la bola toca.** Llevarse de
  un tajo todas las celdas del contacto sale solo —ya están contadas para calcular la normal— y es
  justo lo que no se puede hacer: cualquier trazo fino se parte al primer golpe, la bola lo atraviesa
  y se acabó el pinball. El mordisco es un disco pequeño alrededor del punto de contacto, con la
  probabilidad cayendo hacia el borde, igual que el boquete de la bomba y por la misma razón: una
  mella de compás en mitad de un trazo hecho a mano se lee como un recorte.
- **La fuerza del mordisco es la componente normal de la velocidad, no la rapidez.** Un golpe de
  refilón apenas raya la pared y uno de frente saca un bocado. Es lo que permite dirigir el desgaste
  con el trazo: una rampa tendida aguanta y un muro puesto de frente se gasta.
- **El punto donde muerde es el centro de las celdas que la tocan, no su superficie en dirección de
  la normal.** Contra una esquina o un trazo casi tangente los dos no coinciden, y la mella tiene
  que quedar donde se ha visto el impacto.
- **Una bola sepultada muerde a plena fuerza.** Es el caso de dibujarle encima: sin eso se quedaría
  dentro rebotando para siempre, y así se abre una cavidad y sale.
- **La mecha va por composición y no por herencia, y la lleva cualquier pieza.** Empezó siendo cosa
  de la bola y acabó siendo de las cinco: todas se encienden igual, arden igual y revientan igual, y
  lo único distinto es el cuerpo que dejan de estampar mientras arden. Con una clase `Wick` aparte,
  añadírsela a una pieza son tres líneas; repitiéndolo en cada clase estaría condenado a que se
  fueran separando a la primera corrección. La bomba no tiene mecha propia: lleva la misma, sólo que
  nace encendida, y ésa es toda la diferencia entre una bomba y una cruz a la que le ha estallado
  algo al lado.
- **Lo que se enciende arde los mismos dos segundos, aunque sea más rápido.** Una bola encendida
  recorre en ese tiempo media pantalla rebotando, y esa carrera —con el aro del alcance por delante
  avisando de lo que se va a llevar— es lo que la hace divertida. Acortarla la convertiría en un
  petardo que estalla donde lo encendieron.
- **A lo que ya estaba ardiendo, la onda lo precipita en vez de reiniciarlo.** Sin esa distinción,
  dos piezas encendidas a la vez se irían reencendiendo la una a la otra y ninguna llegaría a
  estallar nunca. Y de paso sale gratis lo que se quería para las bombas: a lo que ya era una bomba
  no hay que convencerlo con dos segundos de mecha, así que una fila cae en cascada rápida.
- **Mientras arde el anillo de choque, la pieza no vuelve a estampar su cuerpo.** El cráter tiene que
  quedar abierto: unas aspas intactas en medio de la explosión que acaba de llevárselas serían justo
  lo contrario de lo que ha pasado. A la plataforma eso le tira la carga, que es exactamente lo que
  le pasa a un carro al que le vuelan el suelo.
- **El contagio lo reparte la capa al terminar la ronda, no la bomba al estallar.** Por lo mismo que
  el choque entre bolas: prender a otro es cosa de la pareja. Y repartiéndolo después, una cadena
  tarda un paso por eslabón en vez de resolverse entera en un solo fotograma, que es lo que la hace
  verse.
- **El alcance para encenderse se mide contra el cuerpo de la pieza, no contra su centro.** Basta con
  que la onda la roce; midiendo por el centro, una pieza a la que la explosión le ha arrancado media
  esfera de arena de debajo se quedaría tan tranquila.

## Historia

Antes de esto el proyecto fue una **fábrica generativa**: una línea de ensamblaje en serpentina con
cintas transportadoras, balancines, ruedas de paletas y una cuenca con palanca de vaciado, todo
colocado por un generador con semilla. Funcionaba, pero solo se podía mirar.

Está guardada en el primer commit del repositorio (`git log`), por si algún día se quiere recuperar
el generador o el vocabulario de máquinas. La física de cintas y rampas sigue viva en `physics.ts`
aunque ahora no se use — la plataforma llegó a apoyarse en ella y acabó no pudiendo, ver arriba. Es
la base si alguna vez se quiere una segunda materia dibujable.
