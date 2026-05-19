<?php

declare(strict_types=1);

namespace app\controller\api;

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
use think\Request;
use think\response\Json;
use Throwable;
use voku\helper\AntiXSS;

class AuthController extends BaseController
{
    /**
     * 登录/注册页所需：验证码驱动与前端公钥等（不含 secret）
     */
    public function bootstrap(): Json
    {
        $driver = (string)getSetting('captcha_driver', 'none');
        $data = [
            'driver' => $driver,
            'general_name' => (string)getSetting('general_name', 'BetterBillSplitter'),
        ];
        if (in_array($driver, ['turnstile', 'hcaptcha', 'cap'], true)) {
            $data['site_key'] = (string)getSetting('captcha_siteKey', '');
        }
        if ($driver === 'cap') {
            $data['cap_custom_url'] = (string)getSetting('captcha_customUrl', '');
        }
        if ($driver === 'numeric') {
            $data['captcha_image_url'] = '/captcha';
        }

        return json(['ret' => 1, 'data' => $data]);
    }

    public function login(Request $request): Json
    {
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
        if (! app('userService')->verifyCaptcha($request)) {
            return json([
                'ret' => 0,
                'msg' => '验证码错误或已过期，请刷新页面后重试',
            ]);
        }
        $user = (new User())->where('username', $data['username'])->findOrEmpty();
        if ($user->isEmpty()) {
            return json(['ret' => 0, 'msg' => '用户不存在']);
        }
        if (! password_verify($data['password'], $user->password)) {
            return json(['ret' => 0, 'msg' => '密码错误']);
        }
        if ($user->enable === false) {
            return json(['ret' => 0, 'msg' => '用户已被禁用，请联系管理员']);
        }
        $mfaCredential = (new MFACredential())->where('userid', $user->id)->whereIn('type', ['totp', 'fido']
        )->findOrEmpty();
        if ($mfaCredential->isEmpty()) {
            try {
                return $this->tokensJsonResponse($request, $user);
            } catch (Throwable $e) {
                return json(['ret' => 0, 'msg' => '登录令牌配置错误：' . $e->getMessage()], 503);
            }
        }
        $mfaTicket = bin2hex(random_bytes(24));
        Cache::set(
            'mfa_login:' . $mfaTicket,
            json_encode(['userid' => $user->id, 'method' => $user->checkMfaStatus()]),
            300
        );

        return json([
            'ret' => 1,
            'msg' => '请完成二步认证',
            'mfa_required' => true,
            'mfa_ticket' => $mfaTicket,
            'method' => $user->checkMfaStatus(),
        ]);
    }

    private function tokensJsonResponse(Request $request, User $user, array $extra = []): Json
    {
        $access = app('jwtTokenService')->issueAccessToken($user->id);
        $refresh = app('jwtTokenService')->createRefreshToken($request, $user->id);
        $resp = json(array_merge([
            'ret' => 1,
            'msg' => '登录成功',
            'access_token' => $access,
            'expires_in' => (int)config('jwt.access_ttl'),
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'is_admin' => (bool)$user->is_admin,
            ],
        ], $extra));

        return app('jwtTokenService')->attachRefreshCookie($resp, $refresh['plain']);
    }

    public function register(Request $request): Json
    {
        $antixss = new AntiXSS();
        $data = [
            'username' => $antixss->xss_clean($request->param('username')),
            'password' => $antixss->xss_clean($request->param('password')),
            'confirm_password' => $antixss->xss_clean($request->param('confirm_password')),
        ];
        if (! app('userService')->verifyCaptcha($request)) {
            return json([
                'ret' => 0,
                'msg' => '验证码错误或已过期，请刷新页面后重试',
            ]);
        }
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

        return json(['ret' => 1, 'msg' => '注册成功']);
    }

    public function refresh(Request $request): Json
    {
        try {
            $out = app('jwtTokenService')->refreshFromCookieOnly($request);
        } catch (Throwable $e) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 503);
        }
        if ($out === null) {
            return json(['ret' => 0, 'msg' => '刷新失败'], 401);
        }
        $user = $out['user'];
        $resp = json([
            'ret' => 1,
            'access_token' => $out['access_token'],
            'expires_in' => (int)config('jwt.access_ttl'),
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'is_admin' => (bool)$user->is_admin,
            ],
        ]);

        return app('jwtTokenService')->attachRefreshCookie($resp, $out['refresh_plain']);
    }

    public function logout(Request $request): Json
    {
        app('userService')->logout();

        return json(['ret' => 1, 'msg' => '登出成功']);
    }

    public function webauthnChallenge(Request $request): Json
    {
        try {
            return json(array_merge(['ret' => 1], WebAuthn::challengeRequest()));
        } catch (Throwable $e) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 500);
        }
    }

    public function webauthnVerify(Request $request): Json
    {
        $antixss = new AntiXSS();
        $params = $antixss->xss_clean($request->param());
        $challengeId = (string)($params['challenge_id'] ?? '');
        if ($challengeId === '') {
            return json(['ret' => 0, 'msg' => '缺少 challenge_id']);
        }
        $result = WebAuthn::challengeHandle($params, $challengeId);
        if (($result['ret'] ?? 0) !== 1) {
            return json($result);
        }
        /** @var User $user */
        $user = $result['user'];

        try {
            return $this->tokensJsonResponse($request, $user);
        } catch (Throwable $e) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 503);
        }
    }

    public function mfaTotp(Request $request): Json
    {
        $ticket = (string)$request->param('mfa_ticket', '');
        $loginSession = Cache::get('mfa_login:' . $ticket);
        if ($loginSession === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期']);
        }
        $loginSession = json_decode((string)$loginSession, true);
        $user = (new User())->where('id', $loginSession['userid'])->findOrEmpty();
        $antixss = new AntiXSS();
        $result = TOTP::totpVerifyHandle($user, $antixss->xss_clean($request->param('code')));
        if ($result['ret'] !== 1) {
            return json($result);
        }
        Cache::delete('mfa_login:' . $ticket);
        try {
            return $this->tokensJsonResponse($request, $user);
        } catch (Throwable $e) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 503);
        }
    }

    public function mfaFidoChallenge(Request $request): Json
    {
        $ticket = (string)$request->param('mfa_ticket', '');
        $loginSession = Cache::get('mfa_login:' . $ticket);
        if ($loginSession === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期']);
        }
        $loginSession = json_decode((string)$loginSession, true);
        $user = (new User())->where('id', $loginSession['userid'])->findOrEmpty();
        if ($user->isEmpty()) {
            return json(['ret' => 0, 'msg' => '用户不存在']);
        }

        return json(array_merge(['ret' => 1], FIDO::fidoAssertRequest($user, $ticket)));
    }

    public function mfaFidoVerify(Request $request): Json
    {
        $ticket = (string)$request->param('mfa_ticket', '');
        $challengeId = (string)$request->param('challenge_id', '');
        $loginSession = Cache::get('mfa_login:' . $ticket);
        if ($loginSession === null) {
            return json(['ret' => 0, 'msg' => '登录会话已过期']);
        }
        $loginSession = json_decode((string)$loginSession, true);
        $user = (new User())->where('id', $loginSession['userid'])->findOrEmpty();
        if ($challengeId === '') {
            return json(['ret' => 0, 'msg' => '缺少 challenge_id']);
        }
        $antixss = new AntiXSS();
        $result = FIDO::fidoAssertHandle($user, $antixss->xss_clean($request->param()), $ticket, $challengeId);
        if ($result['ret'] !== 1) {
            return json($result);
        }
        Cache::delete('mfa_login:' . $ticket);
        try {
            return $this->tokensJsonResponse($request, $user);
        } catch (Throwable $e) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 503);
        }
    }
}
