<?php

declare(strict_types=1);

return [
    'secret' => env('JWT_SECRET', ''),
    'access_ttl' => (int) env('JWT_ACCESS_TTL', 900),
    'refresh_ttl' => (int) env('JWT_REFRESH_TTL', 2592000),
    'issuer' => env('JWT_ISS', ''),
    'refresh_cookie_name' => 'refresh_token',
    'refresh_cookie_path' => '/api',
];
