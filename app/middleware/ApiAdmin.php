<?php

declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;

class ApiAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = app('userService')->getUser();
        if ($user === null || ! $user->is_admin) {
            return json(['ok' => false, 'error' => '需要管理员权限'], 403);
        }

        return $next($request);
    }
}
