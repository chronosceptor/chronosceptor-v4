# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado según [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

- **Piezas arrastrables.** Un dock en el borde inferior del que se arrastran piezas al lienzo.
  Participan de la física de verdad: su cuerpo se estampa en el grid como material sólido y
  la arena choca con él, no son adornos pintados encima.
  - **Cruz giratoria** — cuatro aspas que giran y avientan la arena hacia el lado del giro.
  - **Plataforma** — patrulla de izquierda a derecha llevándose encima lo que le caiga.
  - **Bomba** — mecha de 2 s con un anillo que se vacía, o se detona tocándola; revienta un
    radio de 42 celdas y se consume. Se lleva por delante tanto la arena como las paredes
    dibujadas: abre un boquete en el trazo y lo que aguantaba encima se desploma por él. El
    borde del agujero sale deshilachado, no recortado a compás. Intocables el suelo del
    mundo —que lleva el sumidero— y los cuerpos de las demás piezas.
  - **Fuente** — un segundo chorro de arena colocable, con su propio color dominante, de modo
    que la cuenca sale estratificada por chorros y no como una papilla uniforme.
  - **Bola** — rebota en los cuatro bordes del lienzo y se come la arena que toca. Atraviesa
    las paredes dibujadas sin tocarlas: rebotar en ellas la dejaría encerrada en el primer
    cuenco que se encontrase. Se pinta del color de las paredes del usuario. Medido: una
    frena el 39% de lo que suelta la fuente y seis vacían una pantalla llena —de 7.012 a
    2.454 granos en 18 s— mientras la fuente sigue soltando arena.
- `fabrica.inspect().donde` lista qué piezas hay y en qué celda. Hace falta porque `dump()`
  ya no lo ve todo: la bola y la fuente no escriben nada en el grid.
- Tres gestos y ninguno más: arrastrar una ficha coloca, arrastrar una pieza la mueve, y se
  quita con la × que aparece al señalarla o soltándola sobre el dock, que se vuelve papelera.
- Arena en vuelo balístico (`src/sand/ejecta.ts`): partículas con gravedad que viven fuera del
  autómata celular y vuelven a ser granos normales al chocar. Es lo que hace posible la
  explosión sin engordar el bucle caliente de `physics.ts`.
- `fabrica.inspect()` añade `piezas`, `ejecta` y `perdidos`. `perdidos` es el contador que
  importa al tocar una pieza: son granos que salieron del grid y no encontraron dónde volver,
  y debe quedarse en cero.
- `fabrica.beginPlacement()` / `movePlacement()` / `endPlacement()` para colocar piezas sin
  gestos, imprescindible para automatizar pruebas con Playwright.

### Changed

- La cruz giratoria se dibuja **sin aro exterior**. La rueda de paletas original lo llevaba,
  pero aquí mentía: el aro sugiere una llanta sólida y lo único sólido son las aspas, así que
  se veía la arena atravesar limpiamente una circunferencia dibujada.
- `Source` acepta la fila donde siembra, para que pueda colocarse en cualquier punto del
  lienzo y no sólo en el borde superior. La fuente fija de la escena no cambia de
  comportamiento.
- La plataforma reutiliza la física de cintas de `physics.ts`, que estaba escrita desde la
  fábrica original y no la usaba nadie. `physics.ts` no se ha modificado.

### Fixed

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

### Security

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
