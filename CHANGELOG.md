# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado según [SemVer](https://semver.org/lang/es/).

## [Unreleased]

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

### Security

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
