<?php
/**
 * Equivalente de src/pages/api/art.ts para un hosting cPanel.
 *
 * Proxea la portada por el propio dominio para que el canvas no quede
 * "contaminado" y se puedan leer sus pixeles al sacar la paleta.
 *
 * Solo acepta la ruta relativa, nunca una URL: el host es constante, asi que
 * esto no puede usarse para pedir nada fuera del CDN de portadas.
 */

declare(strict_types=1);

const CDN = 'https://lastfm.freetls.fastly.net/i/u/';

$path = $_GET['p'] ?? '';

if (!is_string($path)
    || !preg_match('#^[A-Za-z0-9][A-Za-z0-9/_.\-]{0,119}$#', $path)
    || str_contains($path, '..')
) {
    http_response_code(400);
    echo 'ruta no permitida';
    exit;
}

$ch = curl_init(CDN . $path);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_USERAGENT      => 'fabrica-de-arena/0.1',
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$type   = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false || $status !== 200 || !str_starts_with($type, 'image/')) {
    http_response_code(404);
    echo 'no disponible';
    exit;
}

header('Content-Type: ' . $type);
header('Cache-Control: public, max-age=86400, immutable');
echo $body;
