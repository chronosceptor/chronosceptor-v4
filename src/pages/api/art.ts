import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Proxy de portadas.
 *
 * Existe por dos razones: al servirse desde el propio dominio el canvas no
 * queda "contaminado" y se pueden leer sus píxeles para sacar la paleta, y de
 * paso evita depender de que el CDN de Last.fm mande cabeceras CORS.
 *
 * Solo acepta la ruta relativa, nunca una URL. El host es constante, así que
 * este endpoint no puede usarse para pedir nada fuera del CDN de portadas.
 */
const CDN = 'https://lastfm.freetls.fastly.net/i/u/';
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,119}$/;

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.has('mock')) return placeholder();

  const path = url.searchParams.get('p') ?? '';
  if (!SAFE_PATH.test(path) || path.includes('..')) {
    return new Response('ruta no permitida', { status: 400 });
  }

  try {
    const res = await fetch(CDN + path, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'fabrica-de-arena/0.1' },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) {
      return new Response('no disponible', { status: 404 });
    }
    return new Response(res.body, {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new Response('no disponible', { status: 504 });
  }
};

/** Portada de prueba para `?mock=1`: permite afinar la extracción sin API key. */
function placeholder(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <rect width="300" height="300" fill="#1d2b3a"/>
    <circle cx="110" cy="120" r="78" fill="#e8543f"/>
    <circle cx="200" cy="190" r="64" fill="#f2b134"/>
    <rect x="0" y="248" width="300" height="52" fill="#5bc0a8"/>
  </svg>`;
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' },
  });
}
