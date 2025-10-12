<?php
declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use app\model\MFACredential;
use app\model\User;
use app\service\MFA\FIDO;
use app\service\MFA\TOTP;
use app\service\MFA\WebAuthn;
use app\validate\UserLogin;
use app\validate\UserRegister;
use Ramsey\Uuid\Uuid;
use think\exception\ValidateException;
use think\facade\Cache;
use think\facade\Session;
use think\Request;
use think\response\Json;
use think\response\Redirect;
use think\response\View;
use voku\helper\AntiXSS;

class AuthController extends BaseController
{
    public function login(Request $request): Json
    {
        // 检查是否已经登录
        if (app()->cookieService->checkCookie() || app()->userService->getUser() !== null) {
            return json(['ret' => 0, 'msg' => '已经登录'])->header(['HX-Redirect' => '/']);
        }
        $antixss = new AntiXSS();
        $data = [
            'username' => $antixss->xss_clean($request->param('username')),
            'password' => $antixss->xss_clean($request->param('password')),
        ];
        try {
            validate(UserLogin::class)->check($data);
        } catch (ValidateException $e) {
            return json(['ret' => 0, 'msg' => $e->getError()]);
        }
        if (! app()->userService->verifyCaptcha($request)) {
            return json([
                'ret' => 0,
                'msg' => '验证码错误或已过期，请刷新页面后重试',
            ]);
        }
        $user = (new User())->where('username', $data['username'])->findOrEmpty();
        if ($user->isEmpty()) {
            return json(['ret' => 0, 'msg' => '用户不存在']);
        } else {
            if (password_verify($data['password'], $user->password)) {
                if ($user->enable === false) {
                    return json(['ret' => 0, 'msg' => '用户已被禁用，请联系管理员']);
                }
                # 检查二步验证
                $mfaCredential = (new MFACredential())->where('userid', $user->id)->whereIn('type', ['totp', 'fido'])->findOrEmpty();
                if ($mfaCredential->isEmpty()) {
                    Session::set('auth', true);
                    Session::set('userid', $user->id);
                    app()->cookieService->setCookie($user);
                    return json(['ret' => 1, 'msg' => '登录成功'])->header(['HX-Redirect' => '/']);
                } else {
                    Cache::set('mfa_login:' . Session::getId(), json_encode(['userid' => $user->id, 'method' => $user->checkMfaStatus()]), 300);
                    return json(['ret' => 1, 'msg' => '请完成二步认证'])->header(['HX-Redirect' => '/auth/2fa']);
                }
            } else {
                return json(['ret' => 0, 'msg' => '密码错误']);
            }
        }
    }

    public function MfaPage(): View|Redirect
    {
        $login_session = Cache::get('mfa_login:' . Session::getId());
        if ($login_session === null) {
            return redirect('/auth/login');
        }
        $login_session = json_decode($login_session, true);
        return view('/auth/2fa', ['method' => $login_session['method']]);
    }

    public function loginPage(): View|Redirect
    {
        if (app()->cookieService->checkCookie()) {
            return redirect('/');
        }
        if (app()->userService->getUser() !== null) {
            return redirect('/');
        }
        return view('/auth/login');
    }

    public function registerPage(): View
    {
        return view('/auth/register');
    }

    public function register(Request $request): Json
    {
        $antixss = new AntiXSS();
        $data = [
            'username' => $antixss->xss_clean($request->param('username')),
            'password' => $antixss->xss_clean($request->param('password')),
            'confirm_password' => $antixss->xss_clean($request->param('confirm_password')),
        ];
        if (! app()->userService->verifyCaptcha($request)) {
            return json([
                'ret' => 0,
                'msg' => '验证码错误或已过期，请刷新页面后重试',
            ]);
        }
        # 密码
        if ($data['password'] !== $data['confirm_password']) {
            return json(['ret' => 0, 'msg' => '两次密码不一致']);
        }
        try {
            validate(UserRegister::class)->check($data);
        } catch (ValidateException $e) {
            return json(['ret' => 0, 'msg' => $e->getError()]);
        }
        $user = (new User())->where('username', $data['username'])->findOrEmpty();
        if (! $user->isEmpty()) {
            return json(['ret' => 0, 'msg' => '用户已存在']);
        }
        $user = new User();
        $user->username = $data['username'];
        $user->password = password_hash($data['password'], PASSWORD_ARGON2ID);
        $user->uuid = Uuid::uuid4()->toString();
        $user->save();
        return json(['ret' => 1, 'msg' => '注册成功'])->header(['HX-Redirect' => '/auth/login']);
    }

    public function webauthnRequest(Request $request): Json
    {
        return json(json_decode(WebAuthn::challengeRequest()));
    }

    public function webauthnHandler(Request $request): Json
    {
        $antixss = new AntiXSS();
        $result = WebAuthn::challengeHandle($antixss->xss_clean($request->param()));
        if ($result['ret'] === 1) {
            // remember me
            $user = $result['user'];
            Session::set('userid', $user->id);
            app()->cookieService->setCookie($user);
            return json(['ret' => 1, 'msg' => '登录成功', 'redir' => '/']);
        }
        return json($result);
    }

    public function mfaTotpHandler(Request $request): Json
    {
        $login_session = Cache::get('mfa_login:' . Session::getId());
        if ($login_session === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期'])->header(['HX-Redirect' => '/auth/login']);
        }
        $login_session = json_decode($login_session, true);
        $user = (new User())->where('id', $login_session['userid'])->findOrEmpty();
        $antixss = new AntiXSS();
        $result = TOTP::totpVerifyHandle($user, $antixss->xss_clean($request->param('code')));
        if ($result['ret'] === 1) {
            Cache::delete('mfa_login:' . Session::getId());
            Session::set('auth', true);
            Session::set('userid', $user->id);
            app()->cookieService->setCookie($user);
            return json(['ret' => 1, 'msg' => '登录成功'])->header(['HX-Redirect' => '/']);
        }
        return json($result);
    }

    public function mfaFidoRequest(Request $request): Json
    {
        $login_session = Cache::get('mfa_login:' . Session::getId());
        if ($login_session === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期'])->header(['HX-Redirect' => '/auth/login']);
        }
        $login_session = json_decode($login_session, true);
        $user = (new User())->where('id', $login_session['userid'])->findOrEmpty();
        return json(json_decode(FIDO::fidoAssertRequest($user)));
    }

    public function mfaFidoAssert(Request $request): Json
    {
        $login_session = Cache::get('mfa_login:' . Session::getId());
        if ($login_session === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期'])->header(['HX-Redirect' => '/auth/login']);
        }
        $antixss = new AntiXSS();
        $login_session = json_decode($login_session, true);
        $user = (new User())->where('id', $login_session['userid'])->findOrEmpty();
        $result = FIDO::fidoAssertHandle($user, $antixss->xss_clean($request->param()));
        if ($result['ret'] === 1) {
            Cache::delete('mfa_login:' . Session::getId());
            Session::set('auth', true);
            Session::set('userid', $login_session['userid']);
            app()->cookieService->setCookie($user);
            return json(['ret' => 1, 'msg' => '登录成功', 'redir' => '/']);
        }
        return json($result);
    }
}
