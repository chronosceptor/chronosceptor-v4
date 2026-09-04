# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado según [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

- **Agua**, el segundo material que cae. Cae con la misma velocidad y la misma deriva que la arena,
  pero al posarse busca nivel en vez de hacer talud: corre de lado hasta ocho celdas por fotograma
  en la dirección que recuerda, y esa memoria de dirección no es un adorno — sin ella un charco no
  se nivela, hierve, y no se duerme ni una celda. Se atrapa con el lápiz igual que la arena, pero
  con su física: no la retiene un hueco diagonal, así que un cuenco con un agujero de una celda se
  vacía. Medido: 88.500 celdas sueltas en el lienzo se asientan en una superficie de 308 a 317
  contra un nivel ideal de 314.
- **Lodo, que no es un material sino un byte de humedad en la arena** (`Grid.wet`). El agua se
  filtra por el montón intercambiándose con los granos y moja lo que atraviesa; la arena mojada se
  apelmaza y aguanta paredes verticales que la arena seca no aguanta. Medido apoyando un montón
  contra una pared dibujada y quitándola: la arena seca conserva el 55% de la cara vertical y
  derrama 66 celdas, la mojada conserva el 100% y derrama 4. Se seca sola en unos 30 segundos,
  pasando por una franja en la que se va desmoronando cada vez más deprisa hasta volver a ser arena
  suelta. El secado vive en `moisture.ts`, un barrido amortizado que recorre la rejilla entera una
  vez por segundo: es el único sitio del proyecto que toca celdas dormidas, porque si el secado
  viviera en el autómata un montón de lodo se dormiría entero y no volvería a secarse jamás.
- **Un interruptor en el dock, junto al del color, para cambiar entre arena y agua.** Afecta a todas
  las fuentes a la vez y entra en el fotograma siguiente, sin repintar nada de lo ya caído — igual
  que la paleta, y por la misma razón: lo que se ve en el lienzo es historia y no estado. No se
  guarda entre visitas; abrir la página y que caiga agua sin haberlo pedido se leería como un fallo.
- **`inspect()` trae `agua` y `mojada`**, y `dump()` saca `~` para el agua y la arena mojada en
  mayúscula. Sin esa mayúscula no hay forma de ver por dónde va el frente de mojado, que es lo
  primero que hace falta mirar cuando el lodo no se comporta.

### Changed

- **El chorro de agua no sale en cono.** El cono largo funciona con la arena porque los granos van
  sueltos y lo que se ve es una nube abriéndose; el agua va pegada y ese mismo cono se lee como un
  triángulo macizo colgando de un punto — una forma, no un flujo. Ahora el agua se abre en la octava
  parte de las filas y **solo se siembra en esa boca**: lo de más abajo es agua que cae, con su
  densidad de caída, así que el chorro no tiene borde. La boca va la mitad más ancha que la de la
  arena, y eso es caudal y no gusto: con el semiancho de la arena salían 830 celdas/s y con el
  ensanche 1.097, contra las 1.509 de la arena.
- **El drenaje y el tope de celdas cuentan la suma de arena y agua** (`Grid.ocupadas`). Contando
  solo arena, un chorro de agua llenaría el lienzo sin que nada lo frenara.
- **La bola se come también el agua.** Mirando solo la arena dejaba dentro de sí misma un disco de
  agua intacto, flotando y visible a través de ella.
- **El guardia del bucle caliente son dos comparaciones contra literales.** Lo natural al añadir un
  segundo material móvil era una tabla `IS_MOBILE[m]`, con `SOLID` e `IS_MASS` de precedente, y sale
  entre un 20 y un 40% más caro: mete una segunda lectura de array en la única línea que se ejecuta
  para las 326.000 celdas del lienzo estén como estén. Medido con el lienzo lleno y asentado: 1,72
  ms el bucle de una sola comparación de siempre, 1,75 con las dos comparaciones, 2,11 con la tabla.
  Lo mismo en el bucle de pintado: 0,36 / 0,54 / 0,76 ms. El caso peor de toda la función es un
  lienzo entero de lodo secándose, que sube la simulación a 4,2 ms de los 16,7 de presupuesto.

### Fixed

### Removed

### Security

## [0.5.0] - 2026-09-04

### Added

- **`?cell=N` cambia el tamaño del grano sin recompilar**, para poder comparar granos en la misma
  sesión. No es solo el tamaño: reescala el perfil entero con él —lo que va por longitud con `k`,
  lo que llena área con `k²`—, porque bajar `cell` a secas no da una versión fina de la escena, da
  otra escena. No alcanza a las constantes en celdas de la bola, la explosión o la ejecta, así que
  sirve para juzgar la arena y no las piezas.

### Changed

- **La fuente ya no se dibuja: lo único que se ve de ella es la arena saliendo.** Tenía una tolva
  ilustrada que estaba resolviendo un problema en vez de no tenerlo — el chorro nacía ya con su
  ancho final, así que había un punto en el que aparecía una línea de nueve celdas de la nada, y el
  dibujo bajaba tres filas por debajo de la siembra justo para taparlo. Ahora se siembra en cono
  desde un vértice de una sola celda: no hay costura que tapar, y el punto donde la arena aparece
  deja de ser el fallo y pasa a ser el efecto. Solo se pinta el contorno del cono en los cuatro
  momentos en que hace falta — mientras la llevas, justo después de soltarla, mientras está
  reventada y mientras vuelve.
- **La caja de agarre de la fuente es la del cono y no la del dibujo.** Medía unas 39×39 celdas y se
  comía los gestos de dibujar en toda esa zona; la del cono es bastante más estrecha, así que ahora
  se puede dibujar cerca del chorro.
- **Grano más fino: 2 px en escritorio y 3 en vertical**, con toda la tabla de perfiles
  recalibrada — no multiplicada. Los números están llevados a que en pantalla todo mida lo que
  medía: lo que va por longitud sube con la finura y lo que llena área con su cuadrado. Con ellos
  van las constantes en celdas de `physics`, `ejecta`, `ball`, `blast`, `bomb` y `render`, que no
  salen del perfil.
- **La caída libre pasa de 3 a 5 celdas por frame** (`MAX_VEL`). Es la única del lote que no es un
  cambio de escala sino de comportamiento: son celdas por frame, así que con el grano de 2 px la
  arena cae 10 px por frame contra los 9 de antes. El margen de guiones se ensancha en vez de
  estrecharse, porque el caudal subió con el cuadrado de la finura y la velocidad solo con la
  finura: la columna va a 5,2 granos por fila contra los 3,9 de antes.
- **La ficha de la fuente en el dock es el chorro, no una tolva.** Prometía una pieza que en el
  lienzo ya no existe.
- **Otra ilustración de fondo.** Misma ruta (`public/background.webp`) y mismo tratamiento —velo y
  rayas por debajo de los canvas—, imagen distinta. El `?v=` de la `url()` sube a `2`: el archivo
  cambia de contenido sin cambiar de nombre, así que sin bumpearlo el navegador y la CDN siguen
  sirviendo la anterior. Por el camino hubo un sorteo entre varios fondos leyendo `public/` al
  compilar; se quitó antes de publicarse, y el fondo vuelve a estar escrito a pelo en el CSS.
- **Colocar una fuente de un toque ahora se ve.** Tocar su ficha del dock ya la ponía en el centro
  de la escena, igual que la bola y la bomba, pero la fuente no tiene cuerpo dibujado y ese centro
  cae justo debajo del chorro de la de serie: la escena quedaba idéntica antes y después, y el
  gesto parecía perdido. Ahora la pieza recién soltada sigue enseñando su cono un segundo largo,
  desvaneciéndose — es la continuación del que ya se veía mientras la llevabas, así que soltarla
  dejó de ser un corte. Vale para los dos caminos, el toque y el arrastre; tirarla a la papelera no
  lo dispara.
- **El talud del montón queda más tendido** (`CREEP_REACH`, en `physics.ts`). Un grano se aparta
  hacia un escalón si lo tiene a su alcance, y ese alcance —hasta dónde mira— es lo que decide la
  pendiente en la que el montón deja de tener razones para moverse; estaba clavado en dos celdas.
  Con cinco, la escena lleva un 11% más de arena en cada instante (135.400 granos a los 6 minutos
  contra 121.000) y cubre el ancho del lienzo treinta filas más arriba, con la simulación en los
  mismos 2-3,6 ms. No cambia la forma: el cono sigue siendo un cono, porque la arena llega al
  vértice más deprisa de lo que el arrastre la reparte.

### Fixed

- **El tope de arena viva ya no corta el llenado en pantallas grandes.** Era un número absoluto de
  granos —304.000, que es justo el lienzo entero del portátil donde se midió—, así que en un 4K
  (más de 400.000 celdas) o en un ultrapanorámico (más de 550.000) dejaba de ser la red de
  seguridad que pretendía ser y pasaba a ser el tope de verdad: el emisor se cortaba ahí y el
  drenaje no llegaba a abrir nunca. Ahora es una fracción del lienzo, así que sube sola con la
  pantalla y con la finura del grano, y deja de ser una de las cosas que había que acordarse de
  reescalar a mano.

### Removed

- **El PNG de la fuente, su cargador (`sprites.ts`) y las tres constantes que lo escalaban**
  (`SPOUT_FRAC`, `SOLAPE`, `NOZZLE_SPRITE_ROWS`). Con ellos se va la excepción
  `!public/piezas/*.png` del `.gitignore`: ya no hay ningún dibujo de pieza.

## [0.4.0] - 2026-09-02

### Added

- **Selector de color en el dock: ocho paletas y la elegida se recuerda.** Un botón en el extremo,
  separado de las fichas, con la paleta actual pintada como disco de cuatro cuñas; al tocarlo
  despliega la fila de muestras encima del dock. Las paletas están escritas a mano y no sacadas de
  un generador: el fondo es `#0B0B0C` y por debajo de ~0,45 de luminancia un grano deja de leerse
  como arena, que es donde cae la mitad de los colores de cualquier paleta «trending» —pensadas
  todas sobre blanco—. Las ocho van de 0,49 a 0,96 y están ordenadas por tono, para que la fila se
  lea como una rueda. Las cuñas del disco van del tamaño de su peso (`3, 3, 2, 1`): a cuartos
  iguales la muestra mentiría, porque el cuarto color apenas aparece en la arena. La elección se
  guarda en `localStorage`.
- **Fondo de la escena: una ilustración, con velo y rayas de pantalla.** Van en la pila de fondo de
  `#escena`, por debajo de los dos canvas. Es deliberado: el color de la arena es lo único saturado
  del cuadro y cualquier capa por encima lo apaga — unas rayas sobre el canvas volvían el amarillo
  un verde sucio. Así la arena es lo único nítido de todo el cuadro.
- **La fuente se pinta con un dibujo, y se coge por toda la tolva.** El área de agarre, el aro de
  señalado y la posición de la × salen ahora de una caja (`nozzleBox`) y no de un radio: es la única
  pieza que se dibuja casi entera *por encima* de su centro, así que un círculo centrado en la boca
  dejaba fuera la tolva entera y solo se podía coger por un trocito del caño.
- **`scripts/asset-alfa.py`**, que mide el perfil de alfa de un dibujo. De ahí sale `SPOUT_FRAC`, la
  fracción que ocupa el caño y que decide la escala de la pieza entera.
- **`docs/prompts-piezas.md`**: los prompts de las tres piezas del dock, con el bloque de estilo
  repetido a propósito en los tres para que salgan como una familia.
- **Los dibujos de las piezas se cargan sobre su trazo vectorial, que sigue ahí** (`sprites.ts`).
  La imagen tarda varios frames en llegar por red, y sin el vectorial debajo la pieza recién soltada
  no está durante un instante — se lee como que el gesto no ha funcionado y se suelta otra. Vale
  igual si el PNG falta o da 404, así que el trazo es red de seguridad y no plan B temporal.
- **`public/piezas/*.png` sí entra al repo**, como excepción al `*.png` del `.gitignore`. Sin eso,
  producción salía con las piezas a trazo vectorial mientras en local se veían dibujadas: el
  respaldo funcionaba tan bien que el fallo no parecía un fallo.

### Changed

- **`setPalette` entra en el mismo fotograma; se ha quitado el `SHIFT_PAUSE` de 1,2 s.** Esa pausa
  paraba la siembra para que el cambio de canción se leyera como un corte ajeno; elegido a mano es
  latencia pura — se toca un color y no cae hasta pasado más de un segundo. La estratificación no
  dependía de la pausa sino del color que cada grano lleva ya resuelto, así que sigue igual: se ve
  el estrato nuevo sepultando al anterior con la frontera limpia.
- **La capa de arena se pinta con alfa y el hueco vacío queda transparente**, para que se vea el
  fondo de la escena por debajo.
- **La bola se dibuja en vez de traerse en un PNG**: cuerpo con degradado, sombreado, reflejo fijo y
  filete. A los 60 px a los que se pinta de verdad, una foto de esfera pierde el semitono en el
  remuestreo y deja el borde blando; y sobre todo trae la luz pintada dentro, cuando la luz es de la
  escena y no de la pieza.
- **El dibujo de la fuente baja tres celdas por debajo de su fila de siembra** (`SOLAPE`). Sin ese
  solape se veía el punto exacto en el que aparece cada grano: la arena salía *debajo* de la pieza
  en vez de *de* la pieza.
- **La fuente reserva 41 filas por encima de su boca** (`NOZZLE_SPRITE_ROWS`) y no las 17 del trazo:
  el dibujo es casi cuadrado y se escala por su caño, así que ocupa casi el triple. Con las de antes
  la tolva salía recortada por arriba y solo asomaba la punta.

### Fixed

- **El tope de arena viva ya no corta el llenado en pantallas grandes.** Era un número absoluto de
  granos —304.000, que es justo el lienzo entero del portátil donde se midió—, así que en un 4K
  (más de 400.000 celdas) o en un ultrapanorámico (más de 550.000) dejaba de ser la red de
  seguridad que pretendía ser y pasaba a ser el tope de verdad: el emisor se cortaba ahí y el
  drenaje no llegaba a abrir nunca. Ahora es una fracción del lienzo, así que sube sola con la
  pantalla y con la finura del grano, y deja de ser una de las cosas que había que acordarse de
  reescalar a mano.

### Removed

- **El enlace con Last.fm, entero.** Se van `/api/now-playing` y `/api/art` con sus gemelos en PHP,
  el poller `lib/nowPlaying.ts`, el median-cut de `sand/color/extract.ts`, las variables
  `LASTFM_API_KEY` / `LASTFM_USER` del esquema de `astro:env`, el `.env.example` y el parámetro
  `?mock=1`. Funcionaba y era la idea que definía la página, pero el color era de quien la publicaba
  y no de quien la mira: el visitante veía lo que a otro le apetecía escuchar y no tenía manera de
  tocarlo. El build queda **enteramente estático**, sin una sola función ni variable de entorno.
  Está todo en el historial por si algún día se quiere recuperar el enlace.
- **El giro de la bola, que llegó a estar entero y medido.** Rapidez angular constante en vuelo,
  todo el giro naciendo en los contactos y rodadura sin patinar al tocar — con lo que un golpe de
  frente le paraba el giro y un roce de refilón era el que más se lo aceleraba. Se quitó porque
  sobre una esfera pulida no hay nada que lo enseñe: de las cinco texturas probadas, dos aros
  cruzados se leían como el símbolo del átomo, la lente como una hoja, la banda recta como una
  pegatina, los hoyuelos metían ruido puro a ese tamaño y la veta difusa era invisible. Cruzando la
  pantalla en un segundo, lo único que da tiempo a leer es la silueta y el reflejo.

### Security

## [0.3.0] - 2026-09-01

### Added

- **La fuente principal se puede volar y quitar como cualquier otra pieza.** Era la única inmune a
  una bomba, con el argumento de que sin ella el lienzo se queda sin arena; el argumento era malo,
  porque quien la vuela sabe lo que hace y del dock salen fuentes nuevas. Revienta, deja el lienzo
  sin chorro dos segundos y medio y se rehace. También se tira a la papelera, y vaciar el lienzo la
  repone.

### Changed

- **La fuente se pinta como una tolva de verdad, y la arena sale por su garganta.** El dibujo
  estaba del revés: la boca ancha del embudo caía en la fila donde siembra, así que los granos
  aparecían dentro de la tolva, en su parte ancha. Ahora el cuerpo va entero por encima y la
  garganta —que mide exactamente lo que mide el chorro— justo en la fila de siembra.
- **El tamaño de la bola es una fracción del ancho del lienzo y no un número de celdas.** En celdas
  fijas medía 13 en todas partes: el 6% del ancho en escritorio y el 27% en un móvil, que tiene 97
  celdas de ancho contra 400. Ahora ocupa el 10% en los dos sitios.
- El dock queda en orden fuente, bola, bomba. La ficha de la bola pierde las líneas de movimiento:
  prometían un efecto que no existe.
- **El chorro se abre al caer.** Un grano en caída libre puede desplazarse una celda de lado con
  una probabilidad pequeña. Sin eso la columna medía abajo exactamente lo mismo que en la boquilla
  —medido: 7,9 / 8,6 / 8,3 / 8,5 / 8,1 celdas en las filas 30 a 150, plano y sin tendencia— porque
  los granos nacen con velocidad horizontal cero y `Grid.vel` sólo sabe de caída vertical. Se leía
  como una cortina rígida bajando y no como un vertido. Es la única rama que se le ha añadido nunca
  al bucle caliente de `physics.ts`, y cuesta un `rand()` por grano en vuelo y por frame: la
  simulación pasa de 1,07 a 1,13 ms con la escena cargada, de un presupuesto de 16,7.
- La bola muerde algo más fuerte: a plena fuerza el núcleo del mordisco se va entero, que es la
  diferencia entre mellar una pared y romperla. Antes quedaban celdas sueltas en el centro que
  volvían a hacer de pared. Medido sobre el mismo cuenco, 12 s: ~50 celdas de media (46, 61 y 42 en
  tres pasadas) frente a 39.

### Fixed

- **La × de quitar una pieza no respondía después de mover esa pieza.** Su posición se fija al
  señalarla y no se recalculaba al soltarla en otro punto, así que el botón se quedaba donde la
  pieza estaba antes y pulsar donde se veía la × dibujaba una pared. Se leía como "esta pieza no se
  puede quitar".
- **La × de la fuente de serie caía fuera del lienzo.** Vive en la fila 0 y su botón se dibujaba por
  encima del borde superior: invisible e imposible de acertar. Si arriba no cabe, ahora se pone
  debajo.

### Removed

- **Fuera la cruz giratoria y la plataforma.** Las dos funcionaban —la bandeja llegó a subir su
  carga entera por un trayecto inclinado, y ambas se colocaban en dos tiempos, con un punto para
  situarlas y otro para darles su medida— y aun así se van: las tres piezas que quedan se explican
  solas y se combinan entre ellas, y las otras dos pedían entenderlas antes de que hicieran gracia.
  Quedan enteras en el commit `b52c517`.

## [0.2.0] - 2026-09-01

### Added

- **Piezas arrastrables.** Un dock en el borde inferior del que se arrastran piezas al lienzo.
  Participan de la física de verdad: su cuerpo se estampa en el grid como material sólido y
  la arena choca con él, no son adornos pintados encima.
  - **Cruz giratoria** — cuatro aspas que giran y avientan la arena hacia el lado del giro.
  - **Plataforma** — bandeja con costados que patrulla de izquierda a derecha llevándose la
    carga entera.
  - **Bomba** — mecha de 2 s con un anillo que se vacía, o se detona tocándola; revienta un
    radio de 42 celdas y se consume. Se lleva por delante tanto la arena como las paredes
    dibujadas: abre un boquete en el trazo y lo que aguantaba encima se desploma por él. El
    borde del agujero sale deshilachado, no recortado a compás. Intocables el suelo del
    mundo —que lleva el sumidero— y los cuerpos de las demás piezas.
  - **Fuente** — un segundo chorro de arena colocable, con su propio color dominante, de modo
    que la cuenca sale estratificada por chorros y no como una papilla uniforme.
  - **Bola** — rebota en los bordes del lienzo, en las paredes dibujadas y contra las otras
    bolas, y se come la arena que toca. Se pinta del color de las paredes del usuario.
    Rebotando en el dibujo, el trazo pasa a ser la mesa de un pinball: una rampa la desvía y
    un cuenco la encierra a ricochetear dentro. La normal del rebote se calcula sumando de
    dónde viene la pared, no invirtiendo un eje, para que un trazo inclinado la desvíe en vez
    de devolverla por donde vino. Entre bolas hay choque elástico de masas iguales, con la
    rapidez devuelta a su valor nominal para que ninguna se quede parada. Medido: una frena
    el 39% de lo que suelta la fuente y seis vacían una pantalla llena —de 7.012 a 2.454
    granos en 18 s— mientras la fuente sigue soltando arena.
- `fabrica.inspect().donde` lista qué piezas hay y en qué celda. Hace falta porque `dump()`
  ya no lo ve todo: la bola y la fuente no escriben nada en el grid.
- Tres gestos y ninguno más: arrastrar una ficha coloca, arrastrar una pieza la mueve, y se
  quita con la × que aparece al señalarla o soltándola sobre el dock, que se vuelve papelera.
- Arena en vuelo balístico (`src/sand/ejecta.ts`): partículas con gravedad que viven fuera del
  autómata celular y vuelven a ser granos normales al chocar. Es lo que hace posible la
  explosión sin engordar el bucle caliente de `physics.ts`.
- `fabrica.inspect()` añade `piezas`, `ejecta` y `perdidos`. `perdidos` es el contador que
  importa al tocar una pieza: son granos que salieron del grid y no encontraron dónde volver.
  Es acumulado de toda la sesión y `clear()` no lo reinicia, así que lo que dice si algo
  sangra arena es su delta en una ventana, no su valor absoluto.
- `fabrica.beginPlacement()` / `movePlacement()` / `endPlacement()` para colocar piezas sin
  gestos, imprescindible para automatizar pruebas con Playwright.
- **La bola desportilla la pared en la que rebota.** Cada golpe arranca un mordisco alrededor
  del punto de contacto, con la probabilidad cayendo hacia el borde para que la mella salga
  deshilachada y no recortada a compás. La fuerza es la componente normal de la velocidad, no
  la rapidez: un golpe de refilón apenas raya y uno de frente saca un bocado, así que el
  desgaste se dirige con el trazo. Una bola sepultada —le has dibujado encima— muerde a plena
  fuerza y se abre paso. Medido: un cuenco pasa de 1.203 a 1.164 celdas de pared en 12 s, y
  la bola acaba agujereando el suelo y escapándose.
- **Cadena de explosiones.** Cualquier pieza que pille dentro una explosión se enciende, arde
  dos segundos con el aro del alcance y el arco de cuenta atrás, y revienta a su vez
  prendiendo a las que le pillen dentro a ella. Una bola encendida sigue rebotando mientras
  arde, así que la explosión no se propaga en el sitio: se va corriendo. A lo que ya ardía la
  onda lo precipita en vez de reiniciarlo, de modo que una fila de bombas cae en cascada
  rápida y dos piezas encendidas a la vez no se reencienden en bucle. Probado: una bomba se
  lleva por delante diez cruces a 60 fps.
- **Hueco de bomba siempre disponible**, por encima del tope de diez y sin quitarle sitio a
  las demás piezas. Con el lienzo lleno, el dock apaga todas las fichas menos la de la bomba.
  El hueco se devuelve solo, porque la bomba se consume al estallar. Volar una pieza pasa a
  ser la forma rápida de hacer sitio, en vez de arrastrarlas a la papelera de una en una.
- **La fuente principal se arrastra**, homologada a pieza: es el mismo `Emitter` que las
  colocables, adoptando la `Source` que ya vivía en el mundo. No ocupa hueco del tope, no se
  tira a la papelera y no se la lleva una bomba.

### Changed

- La cruz giratoria se dibuja **sin aro exterior**. La rueda de paletas original lo llevaba,
  pero aquí mentía: el aro sugiere una llanta sólida y lo único sólido son las aspas, así que
  se veía la arena atravesar limpiamente una circunferencia dibujada.
- `Source` acepta la fila donde siembra, para que pueda colocarse en cualquier punto del
  lienzo y no sólo en el borde superior. La fuente fija de la escena no cambia de
  comportamiento.
- `physics.ts` no se ha modificado: ninguna pieza le añade una rama al bucle caliente.

- **La plataforma pasa a ser una bandeja que traslada su carga en bloque.** Llegó a estar
  hecha de material de cinta, aprovechando el arrastre por rozamiento que `physics.ts`
  llevaba escrito y sin usar desde la fábrica original. Parecía la respuesta y no lo era: la
  cinta no puede mover una carga compacta, porque el arrastre es un paso lateral y
  `slideLateral` exige la celda de destino vacía, así que en una bandeja llena el único grano
  que puede moverse es el de delante de cada capa — y ése está contra el costado. Medido:
  salía de debajo del chorro con 124 granos y llegaba al otro extremo con 22, y los 102 que
  faltaban no se caían por ningún sitio, nunca se movieron. Ahora tiene costados —sin ellos
  el montón derrama por los dos extremos en cuanto es más alto que media barra— y traslada su
  contenido una celda cada vez que avanza una celda: llega entera, 200 de 200. Para
  descargarla se arrastra, y la carga se queda donde estaba.
- La explosión y la mecha salen de `bomb.ts` a `src/sand/gadgets/blast.ts`. La mecha es una
  clase `Wick` por composición que cualquier pieza puede llevar; la bomba no tiene una
  propia, lleva la misma sólo que nace encendida.

### Fixed

- **Al reescalar tras un redimensionado no se avisaba a las piezas.** `GadgetLayer.rescale()`
  movía `cx`/`cy` sin llamar a `onMoved()`, así que una pieza con estado atado a su sitio
  acababa pintándose donde toca y actuando donde estaba: un emisor colocado se dibujaba en la
  posición nueva y sembraba en la vieja. Llevaba ahí desde que hay emisores colocables.
- **Una pieza en movimiento se comía la arena.** `Grid.displaceSand()` destruía el grano que
  no encontraba hueco donde apartarse; medido, una sola cruz bajo el chorro se llevaba 337
  granos en 5 s —un 15% del caudal— y el lienzo dejaba de llenarse sin que nada lo explicara.
  Ahora hay un `Grid.overflow` que lo lanza en vez de destruirlo: además de conservar la masa
  es lo correcto, porque una rueda de paletas avienta lo que no puede apartar.

### Removed

- La tarjeta de "sonando ahora" (portada, título, artista y estado de escucha). El color
  sigue saliendo de la portada del disco; lo que se va es enseñar de qué disco se trata.
  Leer un nombre convertía el lienzo en el widget de un reproductor. Se sigue sondeando
  Last.fm porque hace falta saber qué suena para pedir la portada, pero el título y el
  artista ya no se pintan: sólo entran en la clave de caché de la extracción de color.
  Con ella se van `src/components/NowPlaying.astro`, la etiqueta de antigüedad que se
  recalculaba cada medio minuto y las muestras de paleta.

## [0.1.0] - 2026-08-31

### Added

- Lienzo de física a pantalla completa: cae arena desde el centro superior y se dibujan
  paredes con el ratón o el dedo para desviarla. Una sola materia sólida; la mecánica
  emerge de la forma que se dibuja.
- El color de la arena se extrae por median-cut de la portada del disco que suena, vía
  Last.fm, con dos endpoints de servidor (`/api/now-playing` y `/api/art`).
- Ciclo de llenado y descarga: el lienzo se llena hasta el 72% de su superficie y entonces
  abre una boca central que descarga hasta la mitad. Cada vuelta trae los colores de otra
  canción y se van combinando en capas.
- Tarjeta de "sonando ahora" con portada, título, artista y estado de escucha
  (`NOW PLAYING` / `13 MIN AGO`), que se recalcula sola cada medio minuto.
- Herramientas de depuración: `fabrica.dump()`, `fabrica.inspect()`, `fabrica.clear()` y
  los parámetros `?debug=1`, `?mock=1`, `?fill=`.
- `php/now-playing.php` y `php/art.php` como equivalentes de los endpoints para un hosting
  cPanel. **Sin verificar: nunca se han ejecutado.**
- Favicon SVG, `site` en la configuración y metadatos `og:` para la vista previa al
  compartir el enlace.

### Changed

- Reemplazada la versión anterior del proyecto —una fábrica generativa con línea de
  ensamblaje, cintas transportadoras, balancines y cuenca con palanca— por el lienzo de
  dibujo. La anterior funcionaba pero solo se podía mirar. Queda en el commit `253dbfc`.
- El drenaje del fondo pasa de consumir cada grano al tocarlo a actuar solo por encima de
  un nivel de guarda; antes nada llegaba a acumularse y no daba tiempo a ver mezclarse los
  colores de dos canciones.
- Se acepta el último scrobble reciente y no solo la señal `nowplaying`: muchos
  reproductores nunca la mandan y la página se quedaba en la paleta por defecto aunque
  hubiera música sonando.
- Retirados el texto de ayuda y el botón de limpiar, para que el dibujo se descubra solo.
- Talud más tendido y boquilla más ancha, para que el montón se extienda y llene la
  pantalla.

### Fixed

- Interbloqueo de la simulación: un grano que no lograba moverse se dormía y dejaba de
  procesarse, incluido el arrastre de las cintas. Un montón compacto se dormía entero a la
  vez y nada podía revivirlo.
- La arena se derramaba por el lateral y no bajaba entre tramos, por tres causas
  distintas: las cintas solo arrastraban la capa que las tocaba, las rampas de
  transferencia se trazaban desde la altura nominal del tramo y cortaban la cinta final, y
  el borde del balancín quedaba al mismo nivel que el material.
- El material salía del balancín por el lado contrario al de descarga: la lista de huecos
  del desplazamiento probaba siempre la izquierda antes que la derecha, así que toda pieza
  en movimiento expulsaba el material hacia el mismo lado.
- La arena desaparecía en el aire dejando huecos negros, por estampar el sumidero en forma
  de V repartido en varias filas.
- `setPointerCapture` lanzaba `NotFoundError` y abortaba el resto del manejador, perdiendo
  la primera marca del trazo.

### Security

- La API key de Last.fm dejaba de incrustarse en el artefacto compilado. Se leía con
  `import.meta.env`, que Vite sustituye por el valor literal al compilar; ahora se declara
  como secreto de servidor de `astro:env` y se lee del entorno en ejecución.
- `/api/art` acepta únicamente la ruta relativa del CDN, nunca una URL: el host es una
  constante del servidor, así que el endpoint no puede convertirse en proxy abierto.
