import type { APIRoute } from 'astro';

export const prerender = false;

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
/** Prefijo del CDN de portadas de Last.fm. */
const ART_PREFIX = '/i/u/';

export interface NowPlaying {
  playing: boolean;
  /** false cuando faltan las variables de entorno: la UI puede avisar en dev. */
  configured: boolean;
  artist?: string;
  title?: string;
  album?: string;
  /** Ruta ya proxeada por este dominio, o null si el scrobble no trae portada. */
  art?: string | null;
  url?: string;
}

const json = (body: NowPlaying, maxAge = 20): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Cache de CDN corto: la página consulta cada 20s y Last.fm no necesita
      // enterarse de cada visita.
      'cache-control': `public, max-age=0, s-maxage=${maxAge}`,
    },
  });

const MOCK: NowPlaying = {
  playing: true,
  configured: true,
  artist: 'Khruangbin',
  title: 'María También',
  album: 'Con Todo El Mundo',
  art: '/api/art?mock=1',
};

/**
 * De la URL del CDN se queda solo con la ruta relativa. El host lo pone el
 * proxy, así que ningún dato de Last.fm puede redirigir la petición a otro
 * sitio: no hay forma de convertir /api/art en un proxy abierto.
 */
function artPath(images: Array<{ size?: string; '#text'?: string }> | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const order = ['extralarge', 'large', 'medium'];
  const bySize = new Map(images.map((i) => [i.size ?? '', i['#text'] ?? '']));
  for (const size of order) {
    const raw = bySize.get(size);
    if (!raw) continue;
    const at = raw.indexOf(ART_PREFIX);
    if (at < 0) continue;
    const path = raw.slice(at + ART_PREFIX.length);
    if (path) return `/api/art?p=${encodeURIComponent(path)}`;
  }
  return null;
}

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.has('mock')) return json(MOCK, 0);

  const key = import.meta.env.LASTFM_API_KEY ?? process.env.LASTFM_API_KEY;
  const user = import.meta.env.LASTFM_USER ?? process.env.LASTFM_USER;
  if (!key || !user) return json({ playing: false, configured: false }, 0);

  const query = new URLSearchParams({
    method: 'user.getrecenttracks',
    user,
    api_key: key,
    format: 'json',
    limit: '1',
  });

  try {
    const res = await fetch(`${LASTFM}?${query}`, {
      signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'fabrica-de-arena/0.1' },
    });
    if (!res.ok) return json({ playing: false, configured: true });

    const data = (await res.json()) as any;
    const raw = data?.recenttracks?.track;
    // Con limit=1 Last.fm devuelve a veces objeto y a veces array.
    const track = Array.isArray(raw) ? raw[0] : raw;
    if (!track) return json({ playing: false, configured: true });

    const playing = track['@attr']?.nowplaying === 'true';
    if (!playing) return json({ playing: false, configured: true });

    return json({
      playing: true,
      configured: true,
      artist: track.artist?.['#text'] ?? track.artist?.name ?? '',
      title: track.name ?? '',
      album: track.album?.['#text'] ?? '',
      art: artPath(track.image),
      url: typeof track.url === 'string' ? track.url : undefined,
    });
  } catch {
    // Last.fm caído o lento: la página se queda en la paleta ocre.
    return json({ playing: false, configured: true }, 0);
  }
};
