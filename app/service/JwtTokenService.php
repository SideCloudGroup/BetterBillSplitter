<?php

declare(strict_types=1);

namespace app\service;

use app\model\RefreshToken;
use app\model\User;
use DateTimeImmutable;
use Exception;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Ramsey\Uuid\Uuid;
use think\facade\Cookie;
use think\Request;
use think\Response;
use think\Service;

class JwtTokenService extends Service
{
    public function register(): void
    {
        $this->app->bind('jwtTokenService', JwtTokenService::class);
    }

    /**
     * @return array{user_id:int, jti:string}|null
     */
    public function verifyAccessToken(string $jwt): ?array
    {
        $secret = $this->requireSecret();
        try {
            $decoded = JWT::decode($jwt, new Key($secret, 'HS256'));
            $arr = (array)$decoded;
            if (($arr['typ'] ?? '') !== 'access') {
                return null;
            }
            $iss = config('jwt.issuer');
            if ($iss !== '' && $iss !== null && ($arr['iss'] ?? '') !== $iss) {
                return null;
            }

            return [
                'user_id' => (int)$arr['sub'],
                'jti' => (string)($arr['jti'] ?? ''),
            ];
        } catch (Exception) {
            return null;
        }
    }

    private function requireSecret(): string
    {
        $secret = (string)config('jwt.secret');
        if ($secret === '') {
            throw new Exception('JWT_SECRET is not configured');
        }

        return $secret;
    }

    public function attachRefreshCookie(Response $response, string $plainToken): Response
    {
        $name = (string)config('jwt.refresh_cookie_name');
        $path = (string)config('jwt.refresh_cookie_path');
        $ttl = (int)config('jwt.refresh_ttl');
        $secure = (bool)env('JWT_REFRESH_COOKIE_SECURE', true);

        Cookie::set($name, $plainToken, [
            'expire' => time() + $ttl,
            'path' => $path,
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Lax',
        ]);

        return $response;
    }

    /**
     * 使用 Cookie 中的 refresh 换发新 access（不依赖 access JWT）。
     */
    public function refreshFromCookieOnly(Request $request): ?array
    {
        $name = (string)config('jwt.refresh_cookie_name');
        $plain = (string)Cookie::get($name);
        if ($plain === '') {
            return null;
        }
        $hash = hash('sha256', $plain);
        $row = RefreshToken::where('token_hash', $hash)->findOrEmpty();
        if ($row->isEmpty() || $row->revoked_at !== null) {
            return null;
        }
        if (strtotime((string)$row->expires_at) < time()) {
            return null;
        }

        $user = User::find($row->user_id);
        if (! $user || ! $user->enable) {
            return null;
        }

        $new = $this->createRefreshToken($request, (int)$row->user_id);
        $row->revoked_at = date('Y-m-d H:i:s');
        $row->replaced_by = $new['token_row']->id;
        $row->save();

        $access = $this->issueAccessToken((int)$row->user_id);

        return ['access_token' => $access, 'refresh_plain' => $new['plain'], 'user' => $user];
    }

    /**
     * @return array{plain:string, token_row:RefreshToken}
     */
    public function createRefreshToken(Request $request, int $userId): array
    {
        $plain = bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);
        $ttl = (int)config('jwt.refresh_ttl');
        $expires = (new DateTimeImmutable())->modify('+' . $ttl . ' seconds')->format('Y-m-d H:i:s');

        $row = new RefreshToken();
        $row->user_id = $userId;
        $row->token_hash = $hash;
        $row->expires_at = $expires;
        $row->revoked_at = null;
        $row->replaced_by = null;
        $row->created_ip = $request->ip();
        $row->user_agent = mb_substr((string)$request->header('User-Agent', ''), 0, 512);
        $row->save();

        return ['plain' => $plain, 'token_row' => $row];
    }

    public function issueAccessToken(int $userId): string
    {
        $secret = $this->requireSecret();
        $ttl = (int)config('jwt.access_ttl');
        $now = time();
        $payload = [
            'iss' => config('jwt.issuer') ? : null,
            'sub' => (string)$userId,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttl,
            'jti' => Uuid::uuid4()->toString(),
            'typ' => 'access',
        ];
        if (empty($payload['iss'])) {
            unset($payload['iss']);
        }

        return JWT::encode($payload, $secret, 'HS256');
    }

    public function revokeRefreshFromCookie(): void
    {
        $name = (string)config('jwt.refresh_cookie_name');
        $plain = (string)Cookie::get($name);
        if ($plain === '') {
            return;
        }
        $hash = hash('sha256', $plain);
        $row = RefreshToken::where('token_hash', $hash)->findOrEmpty();
        if (! $row->isEmpty() && $row->revoked_at === null) {
            $row->revoked_at = date('Y-m-d H:i:s');
            $row->save();
        }
        $this->clearRefreshCookie();
    }

    public function clearRefreshCookie(): void
    {
        $name = (string)config('jwt.refresh_cookie_name');
        $path = (string)config('jwt.refresh_cookie_path');
        Cookie::delete($name, $path);
    }
}
