# Sandbox

Un lienzo de física a pantalla completa. El mundo arranca vacío, cae arena desde el centro superior,
y con el ratón o el dedo se dibujan paredes que la desvían — como un MS Paint donde el trazo *es* la
física. Una rampa la hace bajar, una U la atrapa, un embudo la concentra.

No hay herramientas que elegir: el trazo es siempre el mismo y todo el comportamiento sale de la
forma que dibujes.

Lo que cae puede ser **arena o agua**, y lo decide un interruptor del dock. El agua se atrapa con el
lápiz igual que la arena, sólo que con su física: no hace talud, busca nivel, y se escapa por
cualquier hueco por el que la arena se habría quedado. Y donde se juntan sale **lodo** — que no es un
tercer material sino arena mojada: se apelmaza, aguanta paredes verticales que la arena seca no
aguanta, y se va secando hasta volver a desmoronarse sola.

Además, del dock de abajo se arrastran **piezas** que participan de la física de verdad — una bola
que rebota y desportilla, una bomba y una fuente extra de arena. No son adornos pintados sobre el
lienzo: su cuerpo se estampa en el grid como material sólido y la arena choca con él. La fuente
principal es una más: se coge, se pone donde quieras y se puede volar.

El color lo eliges tú: el botón del extremo del dock despliega ocho paletas y la que
marques queda guardada para la próxima visita. Como la fuente rota el color por lotes, los montones
que atrapes quedan estratificados, y como cada grano guarda su color ya resuelto, al cambiar de
paleta el color nuevo va sepultando al anterior en vez de repintarlo.

## Arranque

Requiere Node ≥ 22.12 (hay un `.nvmrc`; con nvm basta `nvm use`).

```sh
npm install
npm run dev      # http://localhost:4321
```

No hay nada que configurar: no lee nada de fuera y no tiene servidor.

## Cómo se usa

- **Arrastrar sobre vacío** dibuja una pared.
- **Arrastrar empezando sobre una pared tuya** la borra. El modo se decide al empezar el gesto y se
  mantiene hasta soltar, así que no alterna solo a media línea.
- **Clic derecho arrastrando** fuerza el borrado esté donde esté.
- **Clear** vacía el lienzo entero.
- **El interruptor del dock**, junto al de color, cambia entre arena y agua. Afecta a todas las
  fuentes a la vez y desde el fotograma siguiente; lo que ya cayó se queda como está.

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
| **Bomba** | Mecha de 2 s con un anillo que se vacía; revienta un radio de 63 celdas (unos 126 px) —arena, **paredes** y **cualquier pieza que pille dentro**— y se consume |
| **Fuente** | Un segundo chorro, con su propio color dominante de la paleta |
| **Bola** | Rebota en los bordes, en tus paredes y contra las otras bolas, y se come la arena que toca. Cada golpe **desportilla la pared** |

Hubo dos piezas más: una **cruz giratoria** de cuatro aspas que aventaba la arena y una
**plataforma** —bandeja con costados que paseaba su carga entera por un trayecto, y que llegó a
poder subirla por una rampa inclinada—. Se quitaron enteras, y no por fallar: las tres que quedan se
explican solas y se combinan entre ellas, y las otras dos pedían entenderlas antes de que hicieran
gracia. Están completas en el commit `b52c517`.

Las piezas van con velocidad fija y sin ajustes, igual que no hay selector de brocha; el tamaño de
la bola sí sale del ancho del lienzo, ver abajo. Caben diez a la vez; al llegar al tope las fichas del dock se atenúan **menos la de la
bomba**, que tiene su propio hueco reservado por encima del tope y está siempre disponible: es la
que sirve para hacer sitio.

**La fuente principal también es una pieza** y se arrastra, se vuela y se tira a la papelera igual
que las demás. Lo único que le queda de excepción es que no ocupa hueco del tope y que vaciar el
lienzo la repone. Llegó a ser indestructible, con el argumento de que sin ella no hay arena; era el
argumento equivocado, porque quien la vuela sabe lo que hace y del dock salen fuentes nuevas. Ser la
única pieza a la que una bomba no le hacía nada se notaba, y mal. Volada, revienta como cualquiera y
se rehace a los dos segundos y medio.

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
suceso —llenarse, descargar, volver a llenarse— y si de una vuelta a otra cambias de paleta, los
colores se van combinando en capas.

Sí puede inundarse si dibujas una presa que cruce toda la pantalla — es física honesta, y para eso
está `Clear`. Las dos últimas filas están reservadas: no se puede dibujar sobre el drenaje.

El dibujo no se guarda: cada visita empieza en blanco.

## Parámetros de URL

| Parámetro | Para qué |
|---|---|
| `?debug=1` | Superpone fps, conteo de arena y paredes, tamaño de grid y modo de brocha |
| `?fill=0.2` | Baja el nivel al que dispara el drenaje. Sin esto, probar la descarga son varios minutos por ciclo |
| `?cell=N` | Píxeles por celda, de 2 a 8: el tamaño del grano, con el perfil reescalado. Sirve para juzgar la arena, no las piezas |

Desde la consola: `fabrica.inspect()` (arena, **agua**, **mojada**, paredes, fps, grid, **piezas**,
**dónde** está cada una, **ejecta** en vuelo y **perdidos**), `fabrica.dump(x, y, w, h)` (vuelca los materiales de una
región como texto) y `fabrica.clear()`.

`donde` hace falta porque `dump()` ya no lo ve todo: la bola y la fuente no escriben nada en el
grid, así que en un volcado de materiales son invisibles.

`mojada` son las celdas de arena con algo de humedad: es el tamaño del lodo. Sube al mojar y no
vuelve a cero hasta que se ha secado todo — salvo la franja que toca un charco quieto, que se queda
mojada mientras el charco siga ahí.

`perdidos` es el contador que importa cuando se toca una pieza: son granos que salieron del grid y
no encontraron dónde volver. Debe quedarse en cero. Si sube sin parar, algo está perdiendo masa.

## Estructura

```
src/
  pages/index.astro        pagina + arranque de la simulacion
  components/              isla de canvas y dock de piezas (fichas y paletas)
  sand/
    world.ts               mundo vacio, fuente y drenaje del fondo
    draw.ts                brocha, interpolacion de trazo, dibujar y borrar
    input.ts               gestos
    index.ts               bucle principal
    physics.ts             el automata celular
    moisture.ts            filtrado y secado de la humedad (el lodo)
    ejecta.ts              arena en vuelo balistico (explosiones y aventado)
    dock.ts                dock: arrastrar piezas, tirarlas, y elegir paleta
    gadgets/               piezas: bomba, fuente, bola, y la explosión
    palette.ts             las ocho paletas y la mezcla de un grano
    grid.ts, materials.ts, render.ts, rng.ts
```

`src/sand/` no importa nada de Astro: expone `boot({ sandCanvas, fxCanvas })` y se puede mover a
cualquier otro sitio tal cual.

## Despliegue

Sale a Netlify (`@astrojs/netlify`), pero el build es **enteramente estático**: no queda ni un
endpoint ni una variable de entorno. Sirviendo `dist/` en cualquier sitio funciona igual.

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
  cambiar de paleta los granos viejos conservan su color en vez de remaparse, y por eso los montones
  quedan estratificados. Es lo que hace que elegir un color sea un suceso con historia y no un
  repintado: lo que ya cayó se queda como estaba y lo nuevo lo va sepultando.
- **Los granos asentados se duermen** y solo los revive un cambio en su vecindario 3x3. Es lo que
  hace que un montón grande y quieto cueste casi nada.
- **Un grano en caída libre puede irse una celda de lado.** Sin eso el chorro no se abre nunca: los
  granos nacen con velocidad horizontal cero y `Grid.vel` sólo sabe de caída vertical, así que la
  columna mide abajo exactamente lo mismo que en la boquilla. Medido: 7,9 / 8,6 / 8,3 / 8,5 / 8,1
  celdas de ancho en las filas 30 a 150 — plano, sin la menor tendencia. Se lee como una cortina
  rígida bajando, no como un vertido. La deriva va en la caída y no en la fuente a propósito: que un
  grano cayendo pueda desviarse es de la caída, no de quien lo suelta. Cuesta un `rand()` por grano
  **en vuelo** y por frame —los asentados duermen—: 1,07 → 1,13 ms de simulación con la escena
  cargada, de un presupuesto de 16,7.
- **El margen útil de esa deriva es estrecho, y se mide por dispersión y no por ancho.** El ancho
  mín-máx de una fila lo fijan dos granos sueltos; la desviación típica de la x dice lo que se ve.
  Arranca en 2,6 celdas por el ancho de la boquilla: con 0,25 apenas se despega de ahí y no se nota,
  y con 0,6 llega a 6,8 en la fila 150 pero deja de leerse como un chorro y parece rociado disperso.
- **El desplazamiento de un grano barrido sigue la dirección de la pieza que lo empuja.** Una lista
  fija de huecos que mire a la izquierda antes que a la derecha haría que toda pieza en movimiento
  expulsara el material siempre hacia el mismo lado.
- **El drenaje solo actúa por encima de un nivel de guarda.** Con la fila entera consumiendo
  siempre, lo que no atrapa el dibujo desaparece al tocar el fondo y la pantalla se queda
  perpetuamente vacía: no da tiempo a ver mezclarse los colores de dos paletas.
- **El sumidero va solo en la última fila, nunca repartido en altura.** Se probó estampándolo en V
  sobre varias filas para forzar la forma de embudo: el material se consume en el aire, a la altura
  a la que toca el borde, y aparecen huecos negros de la nada sin que nada llegue a caer hasta
  abajo. Lo que se ve tiene que salir por el borde del mundo, no evaporarse a media altura.
- **El techo real del caudal es el ancho de la boquilla, no `rate`.** La fuente solo puede sembrar
  en las celdas libres del cono, así que una boquilla estrecha rechaza todo lo que no cabe: con tres
  celdas el máximo eran ~180 granos/s aunque se pidieran 520.
- **La fuente no se dibuja: lo único que se ve de ella es la arena saliendo.** Tuvo una tolva
  ilustrada, y esa tolva estaba resolviendo un problema en vez de no tenerlo. El chorro nacía ya con
  su ancho final, así que había un punto exacto en el que aparecía una línea de nueve celdas de la
  nada, y el dibujo se pintaba tres filas por debajo de la siembra justo para taparlo — la arena
  tenía que salir *de* la pieza y no *debajo* de la pieza. Sembrando en cono desde un vértice de una
  sola celda no hay costura que tapar: el punto donde la arena aparece deja de ser el fallo y pasa a
  ser el efecto. El PNG, su cargador y las tres constantes que lo escalaban (`SPOUT_FRAC`, `SOLAPE`,
  `NOZZLE_SPRITE_ROWS`) están en el historial.
- **El cono se siembra, no se deja que lo abra la deriva.** Subir `DRIFT_P` era la vía barata y no
  vale: esa apertura va con la raíz de la distancia, así que no tiene vértice y no se detiene nunca
  en un ancho, y por encima de 0,4 deja de leerse como un chorro (ver arriba). Sembrar en cono es
  exacto, se para donde se le dice y no añade una sola rama al bucle caliente.
- **Cada grano nace en una fila cualquiera del cono y baja hasta encontrar hueco.** Sorteando fila y
  soltándolo ahí sin más, el vértice sale punteado: es de una celda y se satura, y todo lo que no
  cabe se pierde. Bajando, lo rechazado rellena las filas anchas — el vértice queda tan macizo como
  puede estar y el caudal no baja. Medido: 700 granos/s pedidos, 700 puestos.
- **Abrirse en todo lo que se ve y no en el primer tercio.** Con 22 filas el chorro llega a su
  ancho enseguida y el resto baja recto; con 34 se está abriendo casi todo el rato que se ve, que es
  lo que se lee como que crece. Esas dos medidas son del grano grueso de entonces: las 51 filas de
  `SPREAD_ROWS` son ese mismo cono con el grano de serie de ahora. Es una perilla de gusto: lo único
  que la ata por abajo es que la caja de
  agarre de la fuente mide justo el cono, y una más larga se come más sitio de dibujo.
- **El drenaje también abre si la fuente queda sepultada.** Sin esa salida, si el montón crece hasta
  tapar la boquilla antes de alcanzar el nivel de disparo, deja de emitir, el nivel no vuelve a
  subir y el drenaje no abre nunca: el lienzo se queda lleno para siempre.
- **Llenar la pantalla no es un problema de rendimiento.** Medido: con 90.000 granos la simulación
  cuesta 1,4 ms por frame de un presupuesto de 16,7. Las celdas despiertas se mantienen planas sin
  importar cuánta arena haya, porque los granos asentados se duermen: el coste va con la arena en
  movimiento, no con la total. Vuelto a medir con el lienzo mucho más lleno: 200.000 granos y siete
  fuentes a la vez cuestan 2,6 ms, y a 120 fps.
- **Cuánta arena cabe no lo decide ningún tope, lo decide el talud.** Con la fuente de serie —una
  sola y central— el montón se asienta en un cono cuyo vértice acaba tocando la boquilla, y a partir
  de ahí la fuente se ahoga en su propio montón: medido, 140.000 granos a los 7 minutos, el pico a
  seis filas de la boquilla y el caudal caído de 1.575 a 128 granos/s. El disparo del drenaje está
  en 219.000, así que con una sola fuente **no se alcanza nunca** y el ciclo de descarga no llega a
  ocurrir; con siete fuentes repartidas arriba se alcanza en 40 s. Subir el nivel de disparo no
  arregla nada, y de hecho no tiene adónde subir: al 72% la superficie plana queda en la fila 113 y
  el cono del chorro acaba en la 102, o sea que ya está a once filas de empezar a taponar la
  boquilla. Quien quiera más arena, más chorros.
- **Lo que sí tiende el talud es hasta dónde mira el arrastre (`CREEP_REACH`).** Un grano se aparta
  hacia un escalón si lo tiene a su alcance, así que ese alcance es la pendiente en la que el montón
  deja de tener razones para moverse. Estuvo clavado en dos celdas, que es lo que dejaba el talud a
  poco menos de 45°; con cinco, la escena lleva un 11% más de arena en cada instante (135.400 granos
  a los 6 minutos contra 121.000) y cubre el ancho del lienzo treinta filas más arriba, sin que la
  simulación se mueva de sus 2-3,6 ms. No es la diferencia entre un cono y una llanura: el cono
  sigue siendo un cono, porque la arena llega al vértice más deprisa de lo que el arrastre la
  reparte. Es una perilla de grado, no un cambio de forma.
- **El tope de arena es una fracción del lienzo, no un número de granos.** Es una red de seguridad
  de rendimiento —por debajo manda siempre el drenaje— y como número absoluto sólo era una red en la
  pantalla en la que se midió: 304.000 granos es el lienzo entero de un portátil, pero un 4K pasa de
  400.000 celdas y un ultrapanorámico de 550.000, y ahí el emisor se cortaba por el tope antes de
  que el drenaje llegara a abrir. Como fracción sube sola con la pantalla y con la finura del grano,
  y de paso deja de ser una de las cosas que había que acordarse de reescalar a mano.
- **Las ocho paletas están escritas a mano, no sacadas de un generador.** El fondo es `#0B0B0C` y un
  color por debajo de ~0,45 de luminancia deja de leerse como arena: pasa a ser ruido oscuro. Las
  paletas «trending» de cualquier generador están pensadas sobre blanco y la mitad de sus colores
  cae ahí. Las de aquí van de 0,49 a 0,96 y están ordenadas por tono, para que la fila del dock se
  lea como una rueda y no como una lista.
- **Los cuatro pesos de una paleta (`3, 3, 2, 1`) no son decoración.** Con los cuatro colores igual
  de probables la cuenca sale confeti: hacen falta dos tonos de masa, un realce claro y un acento
  suelto para que un montón tenga un color reconocible y los estratos se distingan entre sí. Por eso
  la muestra del dock es un disco con las cuñas del tamaño de su peso — a cuartos iguales mentiría.
### Del agua y del lodo

- **El lodo no es un material: es un byte de humedad en la arena.** Un `MUD` propio obligaría a
  duplicar las ocho ramas del autómata y, peor, a decidir en qué se convierte al secarse. Como byte
  (`Grid.wet`) es un gradiente: la cohesión sube con él, así que existe todo el camino entre arena
  suelta y barro que se sostiene de pie, y el secado lo recorre hacia atrás sin que nada tenga que
  cambiar de material. Cuesta un byte por celda, unos 475 KB sobre los 4,3 MB que ya ocupaba el
  mundo.
- **La cohesión es un umbral, no una probabilidad.** Escrita sólo como «se aparta con probabilidad
  1 − humedad», una cara vertical de barro saturado se venía abajo igual que la arena seca: la
  probabilidad frena un fotograma, pero llegan cientos, y basta con que la humedad baje un punto por
  debajo del tope para que la cara tenga sesenta oportunidades por segundo de desmoronarse. Medido:
  con el montón entero a 255 y sin umbral, la cara aguantaba el 60% de su altura contra el 55% de la
  arena seca — o sea nada. Con umbral (`WET_HOLD`) aguanta el 100% y no derrama una celda. Por
  debajo del umbral sí es probabilidad, y ahí está el gradiente del desmoronamiento.
- **El agua se filtra por la arena intercambiándose con ella; no se «absorbe».** La primera versión
  hacía desaparecer la celda de agua y saturaba el grano que tocaba. No vale, y no es cuestión de
  ajustar el ritmo: un montón de arena es macizo y el agua no tiene por dónde entrar, así que sólo
  moja la costra. Medido sobre 20.000 granos, absorbiendo se mojaban 1.573 y ningún valor de los
  parámetros lo movía de ahí. Filtrándose sí entra — baja por el montón como baja de verdad, moja lo
  que atraviesa y sale por abajo a encharcarse.
- **Tocar agua satura el grano ANTES de que decida moverse, no al llegar.** Un grano seco que se
  desliza y se moja al aterrizar ya ha dado el paso, y con la ladera entera haciendo eso una vez por
  fotograma el montón se derrite. Medido antes de corregirlo: un cono al que se le echa agua encima
  quedaba **más plano** que la arena seca, que es exactamente lo contrario del barro.
- **El agua cuenta como hueco para las diagonales de la arena.** Si no, un montón sumergido no puede
  avalanchar y se apila en columnas de 90°. Lo que impide que eso licúe la ladera no es la geometría
  sino la cohesión: la geometría deja pasar, y la humedad decide.
- **El agua no se retiene en un hueco diagonal, y la arena sí.** La regla diagonal de la arena exige
  que la celda lateral también esté libre, y es lo que hace que una brocha de una sola celda retenga
  un montón. El agua no la lleva: se cuela por donde quepa. Un cuenco con un agujero de una celda se
  vacía, y eso es lo correcto, no un fallo.
- **La humedad se evapora; no vuelve a salir como agua.** La masa no se conserva y está bien: la
  alternativa es que el lodo rezume agua, esa agua vuelva a mojar arena, y el ciclo no se pare nunca.
- **El secado va en un barrido aparte, amortizado y que despierta celdas.** El autómata sólo mira
  celdas despiertas y la arena mojada asentada duerme: si el secado viviera ahí, un montón de lodo se
  dormiría entero y no volvería a secarse jamás. `moisture.ts` recorre una franja de filas por
  fotograma —la rejilla entera una vez por segundo— y llama a `wake` en cuanto la humedad de una
  celda cambia. Es el único sitio del proyecto que toca celdas dormidas. Sobre un lienzo seco cuesta
  0,03 ms; el caso peor de verdad es un lienzo entero de lodo secándose, que sube la simulación de
  1,7 a 4,2 ms de los 16,7 de presupuesto.
- **El guardia del bucle son dos comparaciones contra literales, no una tabla.** Lo natural, con
  `SOLID` e `IS_MASS` delante, era un `IS_MOBILE[m]`, y sale entre un 20 y un 40% más caro: mete una
  segunda lectura de array en la única línea que se ejecuta para las 326.000 celdas del lienzo estén
  como estén. Medido con el lienzo lleno y asentado: 1,72 ms el bucle de una sola comparación de
  siempre, 1,75 con las dos comparaciones, 2,11 con la tabla. Lo mismo en el bucle de pintado: 0,36 /
  0,54 / 0,76 ms. Si algún día hay un tercer material que caiga, hay que volver a medirlo.
- **El agua no sale en cono: sale en chorro.** El cono largo de la arena es lo que hace que un
  vertido se lea como que crece, y funciona porque los granos van sueltos — lo que se ve es una nube
  abriéndose. El agua va pegada, así que ese mismo cono no se lee como un chorro sino como un
  triángulo macizo colgando de un punto: una forma, no un flujo. El agua se abre en la octava parte
  de las filas y **sólo se siembra en esa boca**; lo de más abajo es agua que cae, con su densidad de
  caída, así que el chorro no tiene borde. Sembrando en las 51 filas aparecía una losa densa cortada
  en seco justo donde acababa el cono, y ese borde recto a media caída es lo que se veía raro.
- **La boca del chorro de agua es la mitad más ancha que la de la arena, y es caudal, no gusto.** El
  techo real de una fuente es el número de celdas en las que puede sembrar, y la boca corta del agua
  tiene ocho veces menos filas que el cono. Medido a 1.575 granos/s pedidos: con el semiancho de la
  arena salen 830 celdas/s —la mitad que la arena— y ensanchándola a una vez y media, 1.097, contra
  las 1.509 de la arena.
- **El agua cuenta para el disparo del drenaje y para el tope de celdas.** Si sólo contara la arena,
  un chorro de agua llenaría el lienzo sin que nada lo frenara.
- **La explosión no toca el agua, y el desplazamiento de piezas la destruye en vez de lanzarla.** La
  ejecta es balística y aterriza llamando a `addSand`, así que una gota lanzada volvería convertida
  en grano. Además queda mejor sin tocarla: la bomba cava el hoyo en la arena y el agua se mete
  dentro sola en los fotogramas siguientes.
- **El agua es lo único translúcido de la escena (alfa 210).** El canvas de arena va sobre el fondo
  de `#escena`, así que por debajo del charco se lee la trama del fondo. Sin eso el agua queda como
  una plancha de plástico opaca; con eso se lee como líquido sin pintarle encima ningún brillo ni
  reflejo.
- **El color del agua sale de la paleta pero pesa más el azul de referencia que el acento.** Un lerp
  suave hacia el azul deja un agua roja en Brasa, cuyo acento es un coral. Con la referencia al 72%
  las ocho aguas caen entre 0,266 y 0,294 de luminancia —el fondo está en 0,043 y la arena entre 0,49
  y 0,96—, así que el agua se separa siempre de las dos y conserva un rastro del tono de su paleta.
- **El lodo se oscurece al pintar, no al mojarse.** Guardar el color ya oscurecido en `col` sería más
  barato, pero el secado no tendría cómo devolver el original y no hay sitio para dos colores por
  celda. Se queda en el 65% de brillo a saturación completa: más oscuro se confunde con el agua, y
  menos no se nota que está mojado.
- **La memoria de dirección del agua (`Grid.flow`) no es un adorno.** Sin ella un charco no se
  nivela, hierve: cada celda sortea un lado, se mueve, y al fotograma siguiente sortea el contrario,
  y no se duerme ninguna. Con ella un charco a nivel se duerme entero y sólo quedan despiertas las
  dos celdas del borde, que avanzan hasta topar con algo. Medido: 88.500 celdas de agua sueltas en el
  lienzo se asientan en una superficie de 308 a 317 contra un nivel ideal de 314.

### Del resto

- **Elegir paleta entra al instante; el cambio de canción no lo hacía.** Cuando el color venía de
  Last.fm, `setPalette` paraba la siembra 1,2 s para que el corte se leyera como un suceso ajeno.
  Elegido a mano eso es latencia: se toca un color y no cae hasta pasado más de un segundo. Ahora el
  lote nuevo arranca en el mismo fotograma, y la estratificación sale igual porque la da el color
  guardado en cada grano, no la pausa.

### De las piezas

- **Todas las piezas borran su cuerpo antes de que ninguna lo estampe.** Son dos pasadas separadas
  sobre la lista, y no es estilo: en un solo recorrido, una pieza borraría el cuerpo recién escrito
  de la que va detrás, y dos piezas que se tocan parpadearían y dejarían pasar la arena por la
  junta.
- **Ninguna pieza toca `physics.ts`.** Todas se apoyan en lo que el autómata ya hacía —el
  desplazamiento de `Grid.stamp()`, la caída normal— o se lo montan por su cuenta fuera del bucle.
  La única rama que se le ha añadido nunca al bucle caliente es la deriva lateral de la caída libre,
  que no es de ninguna pieza sino de la caída misma (ver abajo).
- **La física de cintas no mueve una carga compacta.** Lo descubrió la plataforma, que ya no está,
  pero el `BELT_L`/`BELT_R` de `physics.ts` sigue ahí y volverá a tentar a quien quiera transportar
  algo. El arrastre por rozamiento es un paso lateral y `slideLateral` exige la celda de destino
  vacía, así que en una bandeja llena el único grano que puede moverse es el de delante de cada capa
  — y ése está contra el costado. Medido: salía de debajo del chorro con 124 granos y llegaba al
  otro extremo con 22, y los 102 que faltaban no se caían por ningún sitio: nunca se movieron. Lo
  que viaja en bloque hay que trasladarlo a mano.
- **El hueco de la bomba va por encima del tope, no reservando uno de los diez.** Con el lienzo lleno,
  la única forma de quitar algo era arrastrarlo hasta la papelera de una en una. Guardar un hueco
  para la bomba convierte volarlo todo en una opción siempre disponible, y quitarle un sitio a las
  demás piezas para conseguirlo saldría igual de caro que no poder poner la bomba. El hueco se
  devuelve solo: la bomba se consume al estallar.
- **La fuente principal se homologó a pieza en vez de dársele un arrastre propio.** Envolviéndola en
  el mismo `Emitter` que las colocables —adoptando la `Source` que ya vivía en el mundo, porque el
  drenaje y los cambios de paleta le hablan a ésa— salieron gratis el arrastre, el hit-test, el
  estorbar a las demás y el dibujo, y desapareció su camino aparte en el bucle y en el render. Lo
  único que conserva de excepción es que no cuenta para el tope, no se tira y no se la lleva una
  bomba.
- **Al reescalar tras un redimensionado hay que avisar a las piezas igual que al arrastrarlas.**
  `rescale()` movía `cx`/`cy` sin llamar a `onMoved()`, así que un emisor colocado acababa
  pintándose en el sitio nuevo y sembrando en el viejo. Se ve en cuanto la fuente fija pasa a ser una
  pieza, pero llevaba ahí desde que hay emisores.
- **El grano que una pieza no consigue apartar sale volando, no se destruye.** `displaceSand()` lo
  eliminaba cuando no había hueco donde meterlo, y eso vacía la escena poco a poco: medido con la
  cruz giratoria que hubo, una sola bajo el chorro se comía 337 granos en 5 s, un 15% del caudal, y
  el lienzo dejaba de llenarse sin que nada lo explicara. Ahora hay un `Grid.overflow` que lo lanza.
  Además de conservar la masa es lo correcto: lo que una pieza no puede apartar, lo avienta.
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
- **Lo que se pinta tiene que ser lo que para la arena.** La cruz giratoria que hubo llevaba al
  principio un aro exterior, heredado de la rueda de paletas de la fábrica original, y mentía: el
  aro sugiere una llanta sólida y lo único sólido eran las aspas, así que se veía la arena atravesar
  limpiamente una circunferencia dibujada. La regla sigue mandando en el aro de alcance de la bomba.
- **`onMoved()` también se llama al colocar, no solo al arrastrar.** El fantasma se instancia fuera
  de la pantalla y luego se le asigna el sitio de golpe; sin avisarlo, una pieza que ate estado a su
  posición —la fuente guarda su boquilla aparte— se queda pintándose donde toca y actuando donde
  estaba.
- **El aviso al dock se deduce de comparar el contador.** La bomba se consume sola dentro del bucle
  de simulación, donde no hay ningún gesto del usuario del que colgar la notificación: acordándose
  de avisar en cada sitio que añade o quita, su hueco se quedaba sin liberar y el dock seguía
  anunciándose lleno con una plaza libre.
- **Hay una × para quitar una pieza, además de la papelera del dock.** La papelera funciona, pero
  solo se descubre después de haber arrastrado una pieza hasta allí, es decir, después de haber
  adivinado que existe. La primera persona que lo probó preguntó justo eso: cómo se borra algo que
  no sea una bomba.
- **La posición de esa × se fija al señalar la pieza y no se recalcula mientras siga señalada.** Un
  botón atado al centro de una pieza que se mueve sola se aparta mientras vas a pulsarlo: el ratón
  llega a donde estaba y la pieza ya no. Un botón no puede huir del cursor. Pero sí hay que soltar la
  marca al terminar un arrastre, y no hacerlo era un fallo que costó entender: el botón se quedaba en
  el punto donde la pieza estaba antes de moverla, así que pulsar donde se veía la × dibujaba una
  pared. Se leía como "esta pieza no se puede quitar".
- **Y donde no se pueda pulsar, no vale.** La × de una fuente va por encima de su vértice, así que
  en una puesta cerca del borde de arriba caía fuera de la pantalla: invisible e imposible de
  acertar, justo en la pieza de la que más gente quiere deshacerse. Si arriba no cabe, se pone
  debajo.
- **A una pieza invisible se la señala por lo que se ve de ella, que es su chorro.** La fuente no
  tiene cuerpo dibujado y cuelga entera por debajo de su centro —el centro es el vértice, donde
  nace el primer grano—, así que se agarra por una caja con la forma del cono y no por un círculo
  centrado ahí. Antes esa caja la daba el tamaño del PNG de la tolva y medía unas 39×39 celdas: se
  comía los gestos de dibujar en toda esa zona. La del cono es bastante más estrecha y ahora se
  puede dibujar cerca del chorro.
- **Y mientras la llevas sí se dibuja: el contorno del cono.** Colocar a ciegas una pieza que no se
  ve es colocarla al azar, y el fantasma que arrastras desde el dock se pinta llamando al `draw()`
  de una pieza de verdad. La misma línea aparece durante los dos segundos y medio que la fuente de
  serie tarda en rehacerse tras una bomba: sin ninguna señal de que va a volver, ese rato sin arena
  se lee como que la has roto para siempre.
- **La bola se dibuja, no es una foto.** Hubo un PNG de una esfera y a los 60 px a los que se pinta
  de verdad no quedaba nada de él: el semitono desaparecía en el remuestreo y el borde salía blando,
  cuando todo lo demás en esta escena tiene el canto duro. Dibujada sale de cuatro degradados, es
  nítida a cualquier tamaño y en cualquier pantalla, y no cuesta ni un byte de red ni el parpadeo de
  la pieza que aparece tarde. Pero la razón que decide es otra: **una foto de esfera trae la luz
  pintada dentro**, y la luz es de la escena, no de la pieza.
- **Y no lleva ninguna marca en la superficie, aunque llegó a llevarla.** Se le montó el giro entero
  y medido —angular constante en vuelo, todo el giro naciendo en los contactos, rodadura sin patinar
  al tocar: la rapidez angular igual a la componente tangencial de la velocidad partida por el
  radio, con lo que un golpe de frente le *para* el giro y un roce de refilón es el que más se lo
  acelera— y se quitó, porque sobre una esfera pulida no hay nada que lo enseñe. Se probaron dos
  aros cruzados (se leen como el símbolo del átomo, sin remedio), una franja en forma de lente
  (acaba en punta contra la silueta y parece una hoja), una banda recta (plana, como una pegatina),
  unos hoyuelos (los más legibles, pero ruido puro a ese tamaño) y una veta difusa (invisible). Y la
  foto tampoco puede girar: su brillo gira con ella y pelea con el reflejo fijo, así que la bola
  parece llevar una lámpara suelta dentro. Cruzando la pantalla en un segundo, lo único que da
  tiempo a leer es la silueta y el reflejo — que es exactamente lo que queda. Si alguna vez vuelve
  el giro, tendrá que venir con una textura *plana y sin luz*, nunca con una esfera fotografiada.
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
- **El tamaño de la bola es una fracción del ancho del lienzo, no un número de celdas.** En celdas
  fijas, la misma bola medía 13 en todas partes: el 6% del ancho en escritorio y el 27% en un móvil,
  que tiene 97 celdas de ancho contra 400. La misma pieza se comía media pantalla sólo por cambiar
  de aparato. Atada al ancho, ocupa la misma porción de escena en los dos sitios, y lo que barre por
  segundo —en fracción de lienzo— deja de depender del dispositivo.
- **El radio de agarre y el sitio que ocupa una pieza son dos números distintos** (`radius` y
  `footprint`). La bola infla su agarre cinco celdas por encima de la bola para poder cogerse en marcha —a 145 celdas/s
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
  nace encendida, y ésa es toda la diferencia entre una bomba y una fuente a la que le ha estallado
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
  quedar abierto: una pieza intacta en medio de la explosión que acaba de llevársela sería justo lo
  contrario de lo que ha pasado. A la fuente eso le corta el chorro, que es lo que tiene que pasarle
  a una boquilla reventada.
- **La fuente de serie también arde, pero vuelve.** Era la única pieza inmune a una bomba, con el
  argumento de que sin ella el lienzo se queda sin arena; el argumento era malo, porque quien la
  vuela sabe lo que hace y del dock salen fuentes nuevas. Ahora revienta como cualquiera, deja el
  lienzo sin chorro dos segundos y medio —que es la gracia— y se rehace. También se puede tirar a la
  papelera, y vaciar el lienzo la repone.
- **El contagio lo reparte la capa al terminar la ronda, no la bomba al estallar.** Por lo mismo que
  el choque entre bolas: prender a otro es cosa de la pareja. Y repartiéndolo después, una cadena
  tarda un paso por eslabón en vez de resolverse entera en un solo fotograma, que es lo que la hace
  verse.
- **El alcance para encenderse se mide contra el cuerpo de la pieza, no contra su centro.** Basta con
  que la onda la roce; midiendo por el centro, una pieza a la que la explosión le ha arrancado media
  esfera de arena de debajo se quedaría tan tranquila.

## Historia

**El color venía de la música.** Durante casi todo el proyecto la paleta salía de la portada del
disco que sonara, vía Last.fm: dos endpoints serverless —uno de proxy de la API con la clave a
salvo en el servidor, otro de proxy de portadas para que el canvas se pudiera leer—, un poller en
cliente y un median-cut que sacaba cinco colores de la carátula y descartaba los que no se leían
sobre el fondo. Funcionaba y era la idea que definía la página, pero el color era de quien la
publicaba, no de quien la miraba: el visitante veía lo que a otro le apetecía escuchar y no tenía
manera de tocarlo. Se cambió por ocho paletas y un botón. Está entero en el historial, endpoints
PHP equivalentes incluidos, por si algún día se quiere recuperar el enlace con la música — el
extractor de color es lo que más costó y sigue ahí.

Antes de esto el proyecto fue una **fábrica generativa**: una línea de ensamblaje en serpentina con
cintas transportadoras, balancines, ruedas de paletas y una cuenca con palanca de vaciado, todo
colocado por un generador con semilla. Funcionaba, pero solo se podía mirar.

Está guardada en el primer commit del repositorio (`git log`), por si algún día se quiere recuperar
el generador o el vocabulario de máquinas. La física de cintas y rampas sigue viva en `physics.ts`
aunque ahora no se use — la plataforma llegó a apoyarse en ella y acabó no pudiendo, ver arriba. Es
la base si alguna vez se quiere una segunda materia dibujable.

De este proyecto también se han caído dos piezas por el camino, la **cruz giratoria** y la
**plataforma**, y por una razón distinta a la de la fábrica: funcionaban. Se quitaron porque las
tres que quedan se explican solas y se combinan entre ellas, y las otras dos pedían entenderlas
antes de que hicieran gracia. Están enteras en el commit `b52c517`, con lo último que llegaron a
hacer: colocarse en dos tiempos —un punto para situarlas y otro para darles su medida— y, en el caso
de la plataforma, pasear su carga por un trayecto inclinado a modo de rampa.
