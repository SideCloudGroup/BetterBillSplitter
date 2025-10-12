<?php
declare (strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;
use function redirect;

class Auth
{
    /**
     * 处理请求
     *
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 从Cookie恢复登录
        if (app()->cookieService->checkCookie()) {
            return redirect("/");
        }

        // 检查Session
        if (app()->userService->getUser() !== null) {
            return redirect("/");
        }

        return $next($request);
    }
}
