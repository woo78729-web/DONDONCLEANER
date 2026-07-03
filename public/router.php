<?php

$publicPath = __DIR__;

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

$staticFile = $publicPath.$uri;

if ($uri !== '/' && is_file($staticFile)) {
    $extension = strtolower(pathinfo($staticFile, PATHINFO_EXTENSION));
    $mimeTypes = [
        'css' => 'text/css; charset=UTF-8',
        'gif' => 'image/gif',
        'html' => 'text/html; charset=UTF-8',
        'ico' => 'image/x-icon',
        'jpeg' => 'image/jpeg',
        'jpg' => 'image/jpeg',
        'js' => 'application/javascript; charset=UTF-8',
        'json' => 'application/json; charset=UTF-8',
        'map' => 'application/json; charset=UTF-8',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
    ];

    $mime = $mimeTypes[$extension]
        ?? ((function_exists('mime_content_type') ? mime_content_type($staticFile) : null) ?: 'application/octet-stream');

    header('Content-Type: '.$mime);
    header('Content-Length: '.(string) filesize($staticFile));
    readfile($staticFile);

    return true;
}

$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $publicPath.'/index.php';
$_SERVER['PHP_SELF'] = '/index.php';

require_once $publicPath.'/index.php';
