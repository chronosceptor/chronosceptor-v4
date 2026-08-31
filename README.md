# Sandbox

Un lienzo de física a pantalla completa. El mundo arranca vacío, cae arena desde el centro superior,
y con el ratón o el dedo se dibujan paredes que la desvían — como un MS Paint donde el trazo *es* la
física. Una rampa la hace bajar, una U la atrapa, un embudo la concentra.

No hay herramientas que elegir: hay una sola materia sólida y todo el comportamiento sale de la
forma que dibujes.

Además, del dock de abajo se arrastran **piezas** que participan de la física de verdad — una cruz
que gira y avienta, una plataforma que patrulla llevándose el montón encima, una bomba y una fuente
extra de arena. No son adornos pintados sobre el lienzo: su cuerpo se estampa en el grid como
material sólido y la arena choca con él.

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
| **Plataforma** | Patrulla de izquierda a derecha **llevándose encima** lo que le caiga |
| **Bomba** | Mecha de 2 s con un anillo que se vacía; revienta un radio de 42 celdas —arena **y paredes**— y se consume |
| **Fuente** | Un segundo chorro, con su propio color dominante de la paleta |

Las piezas van con tamaño y velocidad fijos: no hay ajustes ni panel, igual que no hay selector de
brocha. Caben diez a la vez; al llegar al tope las fichas del dock se atenúan.

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

Desde la consola: `fabrica.inspect()` (arena, paredes, fps, grid, **piezas**, **ejecta** en vuelo y
**perdidos**), `fabrica.dump(x, y, w, h)` (vuelca los materiales de una región como texto) y
`fabrica.clear()`.

`perdidos` es el contador que importa cuando se toca una pieza: son granos que salieron del grid y
no encontraron dónde volver. Debe quedarse en cero. Si sube sin parar, algo está perdiendo masa.

## Estructura

```
src/
  pages/index.astro        pagina + cableado entre la musica y la simulacion
  pages/api/now-playing.ts proxy de Last.fm (la API key nunca llega al browser)
  pages/api/art.ts         proxy de portadas (same-origin => canvas legible)
  components/              isla de canvas y tarjeta de "sonando ahora"
  sand/
    world.ts               mundo vacio, fuente y drenaje del fondo
    draw.ts                brocha, interpolacion de trazo, dibujar y borrar
    input.ts               gestos
    index.ts               bucle principal
    physics.ts             el automata celular
    ejecta.ts              arena en vuelo balistico (explosiones y aventado)
    dock.ts                dock de piezas: arrastrar, mover, tirar
    gadgets/               piezas: cruz, plataforma, bomba, fuente
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
  estar rota. Se acepta el último scrobble de los últimos 25 minutos, y la tarjeta etiqueta siempre
  el estado —`NOW PLAYING` o `13 MIN AGO`— para no dar por "sonando" algo que quizá ya terminó.
- **La antigüedad se recalcula sola cada medio minuto.** El sondeo solo avisa cuando cambia la
  canción, así que sin un temporizador propio la etiqueta se congela en el valor que tuviera al
  aparecer y diría "just now" una hora después.

### De las piezas

- **Todas las piezas borran su cuerpo antes de que ninguna lo estampe.** Son dos pasadas separadas
  sobre la lista, y no es estilo: en un solo recorrido, una pieza borraría el cuerpo recién escrito
  de la que va detrás, y dos piezas que se tocan parpadearían y dejarían pasar la arena por la
  junta.
- **`physics.ts` no se tocó.** Las piezas no añaden ni una rama al bucle caliente del autómata: la
  cruz funciona por el desplazamiento que ya hacía `Grid.stamp()`, y la plataforma reutiliza la
  física de cintas que llevaba escrita y sin usar desde la fábrica original.
- **La plataforma no es una pared que se mueve, es material de cinta.** Una barra sólida que se
  desplaza se escurre por debajo del montón y lo deja caer en el sitio. Estampándola como
  `BELT_L`/`BELT_R` con su `beltSpeed`, el arrastre por rozamiento de `physics.ts` alcanza cinco
  capas hacia arriba y se lleva el montón entero, que es lo que se espera de una plataforma.
- **`beltSpeed` se deriva de `dt`, no es una constante.** Es una probabilidad por paso de
  simulación, no una velocidad: si el equipo baja la simulación a 30 Hz, cada paso vale el doble de
  tiempo y el agarre tiene que doblarse, o la arena se queda atrás respecto a la barra que la lleva.
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

## Historia

Antes de esto el proyecto fue una **fábrica generativa**: una línea de ensamblaje en serpentina con
cintas transportadoras, balancines, ruedas de paletas y una cuenca con palanca de vaciado, todo
colocado por un generador con semilla. Funcionaba, pero solo se podía mirar.

Está guardada en el primer commit del repositorio (`git log`), por si algún día se quiere recuperar
el generador o el vocabulario de máquinas. La física de cintas y rampas sigue viva en `physics.ts`
aunque ahora no se use: es la base si alguna vez se quiere una segunda materia dibujable.
