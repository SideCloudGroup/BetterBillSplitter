<?php

declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;
use Throwable;

class JwtAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $auth = (string)$request->header('Authorization', '');
        if (! str_starts_with($auth, 'Bearer ')) {
            return json(['ok' => false, 'error' => '未授权'], 401);
        }
        $token = trim(substr($auth, 7));
        if ($token === '') {
            return json(['ok' => false, 'error' => '未授权'], 401);
        }
        try {
            $payload = app('jwtTokenService')->verifyAccessToken($token);
        } catch (Throwable) {
            return json(['ok' => false, 'error' => '服务配置错误'], 503);
        }
        if ($payload === null) {
            return json(['ok' => false, 'error' => '令牌无效或已过期'], 401);
        }
        app('userService')->setJwtUserId($payload['user_id']);
        if (app('userService')->getUser() === null) {
            return json(['ok' => false, 'error' => '用户不可用'], 403);
        }

        return $next($request);
    }
}
