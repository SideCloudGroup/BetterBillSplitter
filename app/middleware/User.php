<?php
declare (strict_types=1);

namespace app\middleware;

use Closure;
use think\facade\Session;
use think\Request;
use think\Response;
use function redirect;

class User
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
        if (Session::has('userid') && Session::get('auth') === true) {
            return $next($request);
        }

        if (app()->cookieService->checkCookie()) {
            return $next($request);
        }

        return redirect("/auth/login");
    }
}
