# Sandbox

Un lienzo de física a pantalla completa. El mundo arranca vacío, cae arena desde el centro superior,
y con el ratón o el dedo se dibujan paredes que la desvían — como un MS Paint donde el trazo *es* la
física. Una rampa la hace bajar, una U la atrapa, un embudo la concentra.

No hay herramientas que elegir: hay una sola materia sólida y todo el comportamiento sale de la
forma que dibujes.

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

Desde la consola: `fabrica.inspect()` (arena, paredes, fps, grid), `fabrica.dump(x, y, w, h)`
(vuelca los materiales de una región como texto) y `fabrica.clear()`.

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
  estar rota. Se acepta el último scrobble de los últimos 25 minutos, y la tarjeta dice cuánto hace
  para no dar por "sonando" algo que quizá ya terminó.

## Historia

Antes de esto el proyecto fue una **fábrica generativa**: una línea de ensamblaje en serpentina con
cintas transportadoras, balancines, ruedas de paletas y una cuenca con palanca de vaciado, todo
colocado por un generador con semilla. Funcionaba, pero solo se podía mirar.

Está guardada en el primer commit del repositorio (`git log`), por si algún día se quiere recuperar
el generador o el vocabulario de máquinas. La física de cintas y rampas sigue viva en `physics.ts`
aunque ahora no se use: es la base si alguna vez se quiere una segunda materia dibujable.
