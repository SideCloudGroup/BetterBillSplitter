<?php

declare (strict_types=1);

namespace app\service\MFA;

use app\model\MFACredential;
use app\model\User;
use Exception;
use think\facade\Cache;
use Vectorface\GoogleAuthenticator;

class TOTP
{
    public static function totpRegisterRequest(User $user): array
    {
        try {
            $mfaCredential = (new MFACredential())->where('userid', $user->id)->where('type', 'totp')->findOrEmpty();
            if (! $mfaCredential->isEmpty()) {
                return ['ret' => 0, 'msg' => '您已经注册过TOTP'];
            }
            $ga = new GoogleAuthenticator();
            $token = $ga->createSecret(32);
            $challengeId = bin2hex(random_bytes(16));
            Cache::set('totp_register:' . $challengeId, $token, 300);

            return [
                'ret' => 1,
                'msg' => '请求成功',
                'challenge_id' => $challengeId,
                'url' => self::getGaUrl($user, $token),
                'token' => $token
            ];
        } catch (Exception $e) {
            return ['ret' => 0, 'msg' => $e->getMessage()];
        }
    }

    public static function getGaUrl(User $user, string $token): string
    {
        return 'otpauth://totp/' . rawurlencode(getSetting('general_name')) . ':' . rawurlencode(
                $user->username
            ) . '?secret=' . $token . '&issuer=' . rawurlencode(getSetting('general_name'));
    }

    public static function totpRegisterHandle(User $user, string $code, string $challengeId): array
    {
        $token = Cache::get('totp_register:' . $challengeId);
        if ($token === false || $token === null) {
            return ['ret' => 0, 'msg' => '验证码已过期，请刷新页面重试'];
        }
        $ga = new GoogleAuthenticator();
        if (! $ga->verifyCode((string)$token, $code)) {
            return ['ret' => 0, 'msg' => '验证码错误'];
        }
        $mfaCredential = new MFACredential();
        $mfaCredential->userid = $user->id;
        $mfaCredential->name = 'TOTP';
        $mfaCredential->body = json_encode(['token' => $token]);
        $mfaCredential->type = 'totp';
        $mfaCredential->created_at = date('Y-m-d H:i:s');
        $mfaCredential->save();
        Cache::delete('totp_register:' . $challengeId);

        return ['ret' => 1, 'msg' => '注册成功'];
    }

    public static function totpVerifyHandle(User $user, string $code): array
    {
        if ($user->isEmpty()) {
            return ['ret' => 0, 'msg' => '用户不存在'];
        }
        $ga = new GoogleAuthenticator();
        $mfaCredential = (new MFACredential())->where('userid', $user->id)->where('type', 'totp')->findOrEmpty();
        if ($mfaCredential->isEmpty()) {
            return ['ret' => 0, 'msg' => '您还没有注册TOTP'];
        }
        $secret = json_decode($mfaCredential->body, true)['token'] ?? '';

        return $ga->verifyCode($secret, $code) ? ['ret' => 1, 'msg' => '验证成功'] : ['ret' => 0, 'msg' => '验证失败'];
    }
}
