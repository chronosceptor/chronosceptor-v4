# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado según [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

### Changed

### Fixed

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
