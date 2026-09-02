/**
 * Sprites de las piezas.
 *
 * Cada pieza sigue teniendo su dibujo vectorial y este modulo solo lo sustituye
 * cuando hay imagen. No es cinturon y tirantes: la imagen carga por red y tarda
 * varios frames, asi que sin el vectorial debajo la pieza que acabas de soltar
 * no esta durante un instante, y una pieza que aparece tarde se lee como que el
 * gesto no ha funcionado y se suelta otra. Lo mismo si el PNG falta o falla.
 *
 * `new Image()` va dentro de la funcion a proposito: este modulo lo carga
 * tambien el render del servidor, donde `Image` no existe.
 */

const cache = new Map<string, HTMLImageElement>();

/** La imagen de la pieza, o `null` mientras no este lista para pintarse. */
export function sprite(nombre: string): HTMLImageElement | null {
  let img = cache.get(nombre);
  if (!img) {
    img = new Image();
    img.src = `/piezas/${nombre}.png`;
    cache.set(nombre, img);
  }
  // `complete` tambien es true cuando la carga ha fallado; el ancho natural es
  // lo que distingue una imagen que existe de un 404.
  return img.complete && img.naturalWidth > 0 ? img : null;
}
