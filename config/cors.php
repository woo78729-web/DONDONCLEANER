<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | 前端 Web App 跨域呼叫 API 時，請在 .env 設定 CORS_ALLOWED_ORIGINS。
    | 例：CORS_ALLOWED_ORIGINS=https://your-frontend.zeabur.app
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => env('APP_ENV') === 'production'
        ? array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', ''))))
        : array_filter(array_map(
            'trim',
            explode(',', env('CORS_ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173'))
        )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
