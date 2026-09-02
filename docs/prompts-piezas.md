# Prompts de las piezas

Assets para las tres piezas del dock — **fuente, bola y bomba** — en el estilo del fondo
(`public/background.webp`): manga en blanco y negro con trama de semitono.

Cada prompt de abajo está completo y es autónomo: se copia entero de una vez, no hay que
juntar trozos. El bloque de estilo va repetido a propósito dentro de los tres — es lo que
hace que salgan como una familia y no como tres dibujos sueltos.

## Antes de generar

**Los tres van en gris, sin una gota de color.** El color del proyecto sale de la portada
del disco y vive en la arena. Una pieza con tinte propio compite con lo único que debería
tener color; por eso el tema las pinta en `#31313A` / `#4E4E59`. Es la misma razón por la
que las scanlines del fondo van por debajo del canvas y no por encima.

**Tamaño real en pantalla** (celda = 3 px en escritorio, rejilla de 400 de ancho):

| Pieza | Geometría en el código | En pantalla |
| --- | --- | --- |
| Fuente | tolva trapezoidal + caño (`NOZZLE_H` = 14, semiancho 4) | ~86 × 42 px |
| Bola | círculo macizo, radio 10 celdas | 60 px de diámetro |
| Bomba | círculo hueco, `BODY_R` = 3 celdas | 18 px de diámetro |

**La bomba a 18 px no aguanta una ilustración.** Es un tercio de la bola: a ese tamaño
cualquier dibujo es un borrón y no se distingue de un grano grande. Subir `BODY_R`
(`src/sand/gadgets/bomb.ts:10`) a 6–7 celdas la deja en 36–42 px, que ya es suficiente.

---

## Fuente

Es una tolva: embudo ancho arriba que se estrecha en un caño corto. **La arena nace en la
boca de abajo**, así que ahí no puede haber nada dibujado ni nada cayendo, o se verá el
dibujo de un chorro superpuesto al chorro de verdad.

```
Black and white manga illustration, clean ink linework with halftone screentone shading,
printed-manga look, absolutely no color anywhere — pure greyscale. Orthographic front
view, perfectly centered, no perspective, no cast shadow, no ground plane. Heavy confident
outer contour, minimal interior detail: the object must stay readable when scaled down to
60 pixels wide. The form must read as a clear silhouette first and detail second. Isolated
on a flat pure white background, object fully inside the frame with generous margin.
Square image, 1024x1024.

Subject: a small industrial hopper for pouring grain. A wide trapezoidal funnel, open at
the top, its two slanted walls narrowing down into a short straight vertical spout at the
bottom center. Clearly wider than it is tall, roughly 2:1. Riveted sheet-metal plates with
a few bolts along the top rim. The spout mouth at the bottom is open, dark and empty —
nothing is pouring out of it and there is nothing below it. The top opening is empty too.
```

## Bola

Rueda y rebota en cualquier dirección, así que **no puede tener arriba ni abajo**:
cualquier detalle orientado se verá mal en cuanto se mueva.

```
Black and white manga illustration, clean ink linework with halftone screentone shading,
printed-manga look, absolutely no color anywhere — pure greyscale. Orthographic front
view, perfectly centered, no perspective, no cast shadow, no ground plane. Heavy confident
outer contour, minimal interior detail: the object must stay readable when scaled down to
60 pixels wide. The form must read as a clear silhouette first and detail second. Isolated
on a flat pure white background, object fully inside the frame with generous margin.
Square image, 1024x1024.

Subject: a heavy solid iron ball. A perfect circle, completely uniform and rotationally
symmetric — no top, no bottom, no orientation of any kind. Dark smooth surface with one
soft round screentone highlight near the center. No wick, no fuse, no motion lines, no
reflections of a room.
```

## Bomba

El código ya le pinta encima el aro de cuenta atrás (`wick.drawFuse`), así que **la mecha
encendida no va en el asset** o saldrá duplicada. Un cabo apagado sí ayuda a distinguirla
de la bola de un vistazo.

```
Black and white manga illustration, clean ink linework with halftone screentone shading,
printed-manga look, absolutely no color anywhere — pure greyscale. Orthographic front
view, perfectly centered, no perspective, no cast shadow, no ground plane. Heavy confident
outer contour, minimal interior detail: the object must stay readable when scaled down to
60 pixels wide. The form must read as a clear silhouette first and detail second. Isolated
on a flat pure white background, object fully inside the frame with generous margin.
Square image, 1024x1024.

Subject: a classic round bomb. A dark hollow-looking sphere with a short thick unlit wick
stub poking out of a small collar at the top right. No flame, no spark, no burning fuse,
no lit trail. Extremely simple, almost pure silhouette — the wick stub is the only
protrusion.
```

## Negativo

Para los modelos que admiten prompt negativo:

```
color, colour, drop shadow, background scenery, perspective, 3D render, photorealistic,
gradient background, text, watermark, signature, lit fuse, sparks, flames, motion lines
```

---

## Notas para higgsfield

**Genera los tres con el mismo modelo y en la misma tanda.** Cambiar de modelo entre
piezas es lo que rompe la coherencia, más que el prompt.

**Encadena por referencia.** Genera primero la bola (la más simple, la que menos falla),
y si el modelo acepta imagen de referencia — Nano Banana Pro la aprovecha bien — pásale
ese resultado como referencia de estilo para la fuente y la bomba. Sale una familia mucho
más consistente que tres tiradas independientes.

También puedes pasarle `public/background.png` como referencia de estilo para que la trama
de semitono case con la del fondo.

**El fondo blanco lo quitamos nosotros.** higgsfield no devuelve alfa, así que el paso de
recorte no es opcional — ver abajo. Por eso el prompt insiste en fondo blanco plano y
contorno grueso: es lo que hace el recorte limpio.

**GPT Image 2** tiende a añadir contexto y ambientación si le dejas hueco; el
`isolated on a flat pure white background` del prompt es lo que se lo impide, no lo quites.
Si aun así te mete escenario, repite la frase al final del prompt.

## Post-proceso

Un comando por pieza. Quita el fondo, recorta al contenido y exporta al ancho pedido:

```sh
python3 scripts/asset-alfa.py descarga.png public/piezas/bola.png 120
python3 scripts/asset-alfa.py descarga.png public/piezas/fuente.png 172
python3 scripts/asset-alfa.py descarga.png public/piezas/bomba.png 80
```

El ancho es **el doble** del tamaño final, para pantallas Retina.

**Por qué un script y no un "quitar el blanco" del editor.** Las piezas van tramadas en
semitono: puntos negros sobre blanco. Un borrado por color se lleva también el blanco de
entre los puntos —que está *dentro* de la pieza— y la bola queda agujereada, con el fondo
viéndose por dentro. El script saca el alfa de la región exterior por inundación desde las
cuatro esquinas, así que el interior no se toca. Avisa si el relleno se cuela.

Prueba de fuego al acabar: mira el asset a su tamaño real, al 100 %. Si a 60 px no sabes
qué es, el problema es el diseño y no la resolución — vuelve al prompt y quítale detalle
interior.

## Lo que manda el tamaño de la fuente es el caño

No la boca. La pieza se escala en el lienzo hasta que su caño mide lo que mide el chorro,
porque un caño más estrecho que su propio chorro es la misma mentira que un aro que no
para nada. O sea que **un caño fino no sale fino: sale enorme**.

La primera tolva tenía un caño del 12 % de su ancho y pedía 275 px de pieza — un cuarto del
lienzo. La segunda lo subió al 30 % y se quedó en 110 px, que es lo que hay ahora.

Al regenerar el dibujo hay que volver a medirlo y llevar el número a `SPOUT_FRAC`, en
`render.ts`:

```sh
python3 scripts/asset-alfa.py --perfil dibujo.png
```

Si la pieza no cabe por encima de su fila de siembra, `drawNozzle` no la pinta y cae al
trazo vectorial. Es lo que pasaba con la primera: solo asomaba la punta del caño por el
borde de arriba.

## Estado

| Pieza | Prompt | Asset |
| --- | --- | --- |
| Bola | listo | `public/piezas/bola.png` (120 × 120) |
| Fuente | listo | `public/piezas/fuente.png` (220 × 242), caño al 30 % |
| Bomba | listo | pendiente, y antes hay que subir `BODY_R` |
