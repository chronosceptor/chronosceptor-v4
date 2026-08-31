# Fábrica de arena

Una línea de ensamblaje a pantalla completa. Una sola tolva arriba suelta
material, que baja en serpentina por bandas transportadoras —de izquierda a
derecha, cae por una rampa de transferencia, de derecha a izquierda en el tramo
siguiente— pasando por escalones y balancines, hasta una cinta de reparto que
lo deposita en la cuenca de mezcla del fondo.

El recorrido es uno solo y se puede seguir con la vista de principio a fin, como
un circuito de canicas o una cinta de Factorio.

El color de la arena sale de la portada del disco que se esté escuchando en ese
momento, vía Last.fm. Como la cuenca no se vacía sola mientras quepa más, sus
estratos son la línea de tiempo de la sesión de escucha.

Reinterpretación del módulo de *After Dark* de los noventa que tenía las vigas y
las bandas (`docs/after-dark-referencia.png`), pero con la maquinaria reducida a
líneas finas para que el único color de la escena sea la arena.

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

Sin esas variables la página funciona igual, con la paleta ocre por defecto.

## Parámetros de URL

| Parámetro | Para qué |
|---|---|
| `?seed=123` | Reconstruye exactamente el mismo layout. Imprescindible para depurar la física |
| `?debug=1` | Superpone fps, conteo de arena, celdas despiertas, llenado de la cuenca y número de máquinas |
| `?mock=1` | Sirve una canción fija con portada local: permite afinar la extracción de color sin API key |

Desde la consola hay tres herramientas de diagnóstico:

- `fabrica.inspect()` — llenado, drenaje en curso, arena total, troneras
  abiertas, bandas de archivo.
- `fabrica.probe()` — histograma de arena por columnas y por filas. Sirve para
  ver de un vistazo si la línea fluye o dónde se está acumulando.
- `fabrica.dump(x, y, w, h)` — vuelca los materiales de una región como texto.
  Es lo que permite ver por qué algo no pasa por donde debería.

## Cómo se interactúa

- **Click o toque en el vacío** vierte arena en la paleta que esté corriendo.
- **Click o toque sobre un montón** excava en él. El modo se decide al empezar
  el gesto y se mantiene hasta soltar.
- **La palanca**, a la izquierda de la cuenca, abre las troneras del piso y
  vacía todo. Al 100% se vacía sola, pero el medidor pulsa desde el 90% para
  que dé tiempo a jalarla.
- Cada vaciado deja una banda en la franja permanente del borde inferior:
  a mano la deja de altura completa, automático de media altura. La franja
  se guarda en `localStorage`, así que sobrevive a recargas.

## Estructura

```
src/
  pages/index.astro        pagina + cableado entre la musica y la simulacion
  pages/api/now-playing.ts proxy de Last.fm (la API key nunca llega al browser)
  pages/api/art.ts         proxy de portadas (same-origin => canvas legible)
  components/              isla de canvas y tarjeta de "sonando ahora"
  sand/                    nucleo de simulacion, sin dependencias de Astro
  lib/nowPlaying.ts        poller cliente
php/                       los dos endpoints en PHP, por si va a un VPS/cPanel
```

`src/sand/` no importa nada de Astro: expone `boot(canvas, fx, opts)` y se puede
mover a cualquier otro sitio tal cual.

## Despliegue

Por defecto sale a Netlify (`@astrojs/netlify`): el sitio es estático salvo los
dos endpoints de `/api`, que llevan `prerender = false` y se vuelven functions.
Las variables de entorno se ponen en el panel de Netlify.

Si acaba en el VPS con cPanel, el build estático es el mismo y solo hay que
servir `php/now-playing.php` y `php/art.php` en `/api/now-playing` y `/api/art`.
Las credenciales van por `SetEnv` en el `.htaccess`.

## Decisiones no obvias del motor

Cosas que parecen arbitrarias en el código y no lo son:

- **El color de cada grano se guarda ya resuelto (`Uint32Array`), no como índice
  de paleta.** Es lo que permite que la cuenca sea una línea de tiempo: al
  cambiar de canción los granos viejos conservan su color en vez de remaparse a
  la paleta nueva. Cuesta 4 bytes por celda y los vale.
- **Una sola fuente, no varias.** Con una boquilla el recorrido se puede seguir
  entero y cada cambio de color viaja por la línea como un frente visible antes
  de llegar abajo. Con varias fuentes eso se pierde y solo se ve lluvia.
- **El caudal va muy por debajo del máximo de la cinta.** En un autómata de
  arena una cinta solo mueve un grano si la celda de delante está libre, así que
  su caudal máximo se da con la banda medio llena: si se compacta, el transporte
  se desploma a cero y la línea se atasca como un embotellamiento.
- **La cinta arrastra el montón entero, no solo la capa que la toca.** Sin eso
  transporta un grano de alto y el resto se apila en el punto de caída.
- **Un grano sostenido por una cinta nunca se duerme.** Es la excepción a la
  optimización de sueño, y no es opcional: un montón compacto sobre una banda se
  duerme entero a la vez y nada puede volver a despertarlo, así que la línea se
  queda congelada para siempre.
- **Las rampas de transferencia arrancan tres celdas por debajo de la cinta y
  desde el final REAL del tramo.** Pegadas a la banda, su primera diagonal choca
  contra la propia cinta; trazadas desde la altura nominal del tramo, atraviesan
  por el medio la última banda cuando un módulo bajó la línea.
- **El borde de un balancín va por debajo del nivel de la banda.** A la misma
  altura no recibe el material: lo frena, y el tramo entero se atasca detrás.
- **El último tramo muere en el centro, no en el borde**, para que la entrega
  caiga en mitad de la cinta de reparto y esta pueda barrer hacia los dos lados.
- **La diagonal exige que la celda lateral también esté libre.** Sin esa
  condición la arena se cuela por las juntas de las rampas y las atraviesa.
- **Las diagonales se encadenan hasta tres pasos por frame (avalancha).** Con un
  solo paso, un chorro intenso apila más rápido de lo que el montón reparte y
  crece una torre vertical imposible.
- **Rampas y embudos tienen dos celdas de grosor.** Una diagonal de una celda
  solo se toca por las esquinas y en pantalla se lee como puntos sueltos.
- **El llenado se mide por altura de superficie (percentil 90 de las columnas),
  no por volumen.** La arena se apila en conos: por volumen la cuenca marcaría
  55% justo cuando los picos ya se salen por arriba y sepultan las máquinas.
- **El drenaje abre cinco troneras, no el piso entero.** Con el piso completo la
  cuenca se vacía en dos segundos y no se ve nada; por ranuras los estratos se
  hunden en embudo durante varios segundos.
- **Los granos asentados se duermen** y solo los revive un cambio en su
  vecindario 3x3. Es lo que hace que una cuenca llena cueste casi nada.
- **`/api/art` recibe la ruta relativa del CDN, nunca una URL.** El host es una
  constante del servidor, así que el endpoint no puede convertirse en proxy
  abierto: no hay nada que validar porque no hay nada que el cliente controle.
- **Muros laterales y topes de entrada.** Los muros encierran la línea de arriba
  abajo y el tope retiene el montón que se forma en el punto de caída, que si no
  se extiende hacia atrás por su propio talud y se derrama por el extremo de la
  cinta. El tope solo se pone donde el extremo está muerto: si la banda recibe
  material de un módulo, un tope ahí taparía justo el punto de entrega.
