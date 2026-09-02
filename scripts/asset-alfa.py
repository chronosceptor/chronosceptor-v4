#!/usr/bin/env python3
"""Quita el fondo blanco de un asset generado y lo deja recortado y con alfa.

    python3 scripts/asset-alfa.py entrada.png public/piezas/bola.png 120

El alfa sale de la region EXTERIOR por inundacion desde las cuatro esquinas, no
de un color. Es la unica forma que funciona aqui: las piezas van tramadas en
semitono, o sea puntos negros sobre blanco, y un "quitar el blanco" global
agujerearia la pieza entera y se veria el fondo por dentro de la bola.

Se inunda desde las cuatro esquinas y no desde una porque la figura suele llegar
a tocar el borde del lienzo, y entonces el exterior queda partido en trozos
inconexos que un solo punto de partida no alcanza.
"""

import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

MARCA = (255, 0, 255)
#: Tolerancia del relleno. Sube si queda un halo claro alrededor de la figura;
#: baja si el relleno se cuela dentro y se come parte del dibujo.
UMBRAL = 90


def recorta(origen: str, destino: str, lado: int | None) -> None:
    entrada = Image.open(origen)
    w, h = entrada.size

    # Algunos modelos si devuelven alfa. Si ya viene hecho hay que respetarlo y
    # no inundar: al pasar a RGB el fondo transparente se vuelve negro, y desde
    # una esquina negra la inundacion se cuela por los contornos de la figura y
    # se come el dibujo.
    if entrada.mode == 'RGBA' and entrada.getchannel('A').getextrema()[0] == 0:
        print('ya trae alfa, no toco el fondo')
        exporta(entrada, entrada.getchannel('A'), destino, lado)
        return

    im = entrada.convert('RGB')
    sonda = im.copy()
    for esquina in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(sonda, esquina, MARCA, thresh=UMBRAL)

    # El original es gris, o sea R == G en toda la imagen; la marca es magenta.
    # Esa diferencia entre canales senala lo inundado sin recorrer pixel a pixel.
    r, g, _ = sonda.split()
    fuera = ImageChops.difference(r, g).point(lambda v: 255 if v > 200 else 0)

    cubierto = 100 * fuera.histogram()[255] / (w * h)
    if cubierto > 60:
        print(f'CUIDADO: el relleno cubre el {cubierto:.0f}% — se ha colado dentro.')
        print('Baja UMBRAL y vuelve a mirar el resultado antes de usarlo.')

    alfa = fuera.point(lambda v: 255 - v).filter(ImageFilter.GaussianBlur(0.6))
    salida = im.copy()
    salida.putalpha(alfa)
    exporta(salida, alfa, destino, lado)


def exporta(im: Image.Image, alfa: Image.Image, destino: str, lado: int | None) -> None:
    """Recorta al contenido, escala al ancho pedido y guarda."""
    caja = alfa.point(lambda v: 255 if v > 8 else 0).getbbox()
    salida = im.crop(caja)

    if lado:
        # El lado pedido es el ancho; el alto sale de la proporcion recortada.
        alto = round(salida.height * lado / salida.width)
        salida = salida.resize((lado, alto), Image.LANCZOS)

    salida.save(destino)
    print(f'{destino}  {salida.size[0]}x{salida.size[1]}')


def perfil(origen: str) -> None:
    """Ancho de la figura a distintas alturas, en % de su ancho total.

    La fuente se escala en el lienzo por lo que mide su cano, no por su boca
    (`SPOUT_FRAC` en `render.ts`), asi que al regenerar el dibujo hay que volver
    a medirlo aqui y llevar el numero al codigo.
    """
    im = Image.open(origen)
    mascara = (
        im.getchannel('A') if im.mode == 'RGBA' else im.convert('L').point(lambda v: 255 - v)
    ).point(lambda v: 255 if v > 8 else 0)
    mascara = mascara.crop(mascara.getbbox())
    w, h = mascara.size
    px = mascara.load()
    print(f'{origen}: contenido {w}x{h}, alto/ancho {h / w:.2f}')
    for frac in (0.02, 0.15, 0.40, 0.60, 0.75, 0.90, 0.98):
        fila = min(h - 1, int(h * frac))
        xs = [x for x in range(w) if px[x, fila]]
        ancho = (max(xs) - min(xs) + 1) if xs else 0
        print(f'  {int(frac * 100):3d}% de altura: {ancho:4d} px = {100 * ancho / w:3.0f}% del ancho')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--perfil':
        perfil(sys.argv[2])
    elif len(sys.argv) >= 3:
        recorta(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
    else:
        sys.exit(__doc__)
