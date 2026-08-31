<?php
/**
 * Equivalente de src/pages/api/now-playing.ts para un hosting cPanel.
 *
 * Mismo contrato JSON que la version de Netlify, asi que el front no cambia:
 * basta con servir el build estatico y mapear /api/now-playing aqui.
 *
 * Las credenciales se leen del entorno. En cPanel se ponen en el .htaccess
 * (SetEnv LASTFM_API_KEY ...) o en un php.ini del directorio.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=0, s-maxage=20');

const ART_PREFIX = '/i/u/';

/**
 * Minutos desde el ultimo scrobble a partir de los cuales se considera que ya
 * no se esta escuchando. Hace falta porque no todos los reproductores mandan
 * la senal "now playing": varios solo scrobblean la cancion al terminarla.
 */
const STALE_MINUTES = 25;

function respond(array $body): void
{
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Se queda solo con la ruta relativa de la portada. El host lo pone art.php,
 * de modo que ningun dato devuelto por Last.fm puede redirigir la peticion.
 */
function art_path(?array $images): ?string
{
    if (!is_array($images)) {
        return null;
    }
    $bySize = [];
    foreach ($images as $img) {
        if (isset($img['size'], $img['#text'])) {
            $bySize[$img['size']] = $img['#text'];
        }
    }
    foreach (['extralarge', 'large', 'medium'] as $size) {
        $raw = $bySize[$size] ?? '';
        if ($raw === '') {
            continue;
        }
        $at = strpos($raw, ART_PREFIX);
        if ($at === false) {
            continue;
        }
        $path = substr($raw, $at + strlen(ART_PREFIX));
        if ($path !== '') {
            return '/api/art?p=' . rawurlencode($path);
        }
    }
    return null;
}

$key  = getenv('LASTFM_API_KEY') ?: '';
$user = getenv('LASTFM_USER') ?: '';
if ($key === '' || $user === '') {
    respond(['playing' => false, 'configured' => false]);
}

$url = 'https://ws.audioscrobbler.com/2.0/?' . http_build_query([
    'method'  => 'user.getrecenttracks',
    'user'    => $user,
    'api_key' => $key,
    'format'  => 'json',
    'limit'   => '1',
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 6,
    CURLOPT_USERAGENT      => 'fabrica-de-arena/0.1',
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body === false || $status !== 200) {
    respond(['playing' => false, 'configured' => true]);
}

$data = json_decode($body, true);
$raw  = $data['recenttracks']['track'] ?? null;
// Con limit=1 Last.fm devuelve a veces objeto y a veces array.
$track = (is_array($raw) && array_key_exists(0, $raw)) ? $raw[0] : $raw;

if (!is_array($track)) {
    respond(['playing' => false, 'configured' => true]);
}

$playing  = ($track['@attr']['nowplaying'] ?? '') === 'true';
$playedAt = (int) ($track['date']['uts'] ?? 0);
// Si no viene marcada en curso, vale el ultimo scrobble mientras sea reciente.
$ageMin = $playedAt ? (time() - $playedAt) / 60 : PHP_INT_MAX;
$stale  = !$playing && $ageMin > STALE_MINUTES;

respond([
    'playing'    => $playing,
    'configured' => true,
    'stale'      => $stale,
    'playedAt'   => $playing ? null : ($playedAt ?: null),
    'artist'     => $track['artist']['#text'] ?? ($track['artist']['name'] ?? ''),
    'title'      => $track['name'] ?? '',
    'album'      => $track['album']['#text'] ?? '',
    'art'        => art_path($track['image'] ?? null),
    'url'        => is_string($track['url'] ?? null) ? $track['url'] : null,
]);
