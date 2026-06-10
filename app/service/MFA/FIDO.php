<?php

declare (strict_types=1);

namespace app\service\MFA;

use app\model\MFACredential;
use app\model\User;
use Exception;
use think\facade\Cache;
use think\facade\Request;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialRequestOptions;

class FIDO
{
    /**
     * @return array{challenge_id: string, publicKey: mixed}
     */
    public static function fidoRegisterRequest(User $user): array
    {
        $rpEntity = WebAuthn::generateRPEntity();
        $userEntity = WebAuthn::generateUserEntity($user);
        $authenticatorSelectionCriteria = AuthenticatorSelectionCriteria::create();
        $publicKeyCredentialCreationOptions =
            PublicKeyCredentialCreationOptions::create(
                $rpEntity,
                $userEntity,
                random_bytes(32),
                pubKeyCredParams: WebAuthn::getPublicKeyCredentialParametersList(),
                authenticatorSelection: $authenticatorSelectionCriteria,
                attestation: PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
                timeout: WebAuthn::$timeout,
            );
        $serializer = WebAuthn::getSerializer();
        $jsonObject = $serializer->serialize($publicKeyCredentialCreationOptions, 'json');
        $challengeId = bin2hex(random_bytes(16));
        Cache::set('fido_register:' . $challengeId, $jsonObject, 300);

        return [
            'challenge_id' => $challengeId,
            'publicKey' => json_decode($jsonObject, true),
        ];
    }

    public static function fidoRegisterHandle(User $user, array $data, string $challengeId): array
    {
        $deviceName = trim((string)($data['name'] ?? ''));
        $credentialPayload = $data;
        unset($credentialPayload['challenge_id'], $credentialPayload['name']);

        $serializer = WebAuthn::getSerializer();

        try {
            $publicKeyCredential = $serializer->deserialize(
                json_encode($credentialPayload),
                PublicKeyCredential::class,
                'json'
            );
        } catch (Exception $e) {
            return ['ret' => 0, 'msg' => $e->getMessage()];
        }
        if (! isset($publicKeyCredential->response) || ! $publicKeyCredential->response instanceof AuthenticatorAttestationResponse) {
            return ['ret' => 0, 'msg' => '密钥类型错误'];
        }

        $cached = Cache::get('fido_register:' . $challengeId);
        if ($cached === null || $cached === false) {
            return ['ret' => 0, 'msg' => '注册会话已过期，请重试'];
        }

        $publicKeyCredentialCreationOptions = $serializer->deserialize(
            $cached,
            PublicKeyCredentialCreationOptions::class,
            'json'
        );

        try {
            $authenticatorAttestationResponseValidator = WebAuthn::getAuthenticatorAttestationResponseValidator();
            $publicKeyCredentialSource = $authenticatorAttestationResponseValidator->check(
                $publicKeyCredential->response,
                $publicKeyCredentialCreationOptions,
                Request::host()
            );
        } catch (Exception) {
            return ['ret' => 0, 'msg' => '验证失败'];
        }
        $jsonStr = WebAuthn::getSerializer()->serialize($publicKeyCredentialSource, 'json');
        $jsonObject = json_decode($jsonStr);
        $mfaCredential = new MFACredential();
        $mfaCredential->userid = $user->id;
        $mfaCredential->rawid = $jsonObject->publicKeyCredentialId;
        $mfaCredential->body = $jsonStr;
        $mfaCredential->created_at = date('Y-m-d H:i:s');
        $mfaCredential->used_at = null;
        $mfaCredential->name = $deviceName === '' ? null : $deviceName;
        $mfaCredential->type = 'fido';
        $mfaCredential->save();
        Cache::delete('fido_register:' . $challengeId);

        return ['ret' => 1, 'msg' => '注册成功'];
    }

    /**
     * @return array{challenge_id: string, publicKey: mixed}
     */
    public static function fidoAssertRequest(User $user, string $assertionCacheKey): array
    {
        $serializer = WebAuthn::getSerializer();
        $userCredentials = (new MFACredential())
            ->where('userid', $user->id)
            ->where('type', 'fido')
            ->field('body')
            ->select();
        $credentials = [];
        foreach ($userCredentials as $credential) {
            $credentials[] = $serializer->deserialize($credential->body, CredentialRecord::class, 'json');
        }
        $allowedCredentials = array_map(
            static function (CredentialRecord $credential): PublicKeyCredentialDescriptor {
                return $credential->getPublicKeyCredentialDescriptor();
            },
            $credentials
        );
        $publicKeyCredentialRequestOptions = PublicKeyCredentialRequestOptions::create(
            random_bytes(32),
            rpId: Request::host(),
            allowCredentials: $allowedCredentials,
            userVerification: 'discouraged',
            timeout: WebAuthn::$timeout,
        );
        $jsonObject = $serializer->serialize($publicKeyCredentialRequestOptions, 'json');
        $challengeId = bin2hex(random_bytes(16));
        Cache::set('fido_assertion:' . $assertionCacheKey . ':' . $challengeId, $jsonObject, 300);

        return [
            'challenge_id' => $challengeId,
            'publicKey' => json_decode($jsonObject, true),
        ];
    }

    public static function fidoAssertHandle(
        User $user,
        array $data,
        string $assertionCacheKey,
        string $challengeId
    ): array {
        $serializer = WebAuthn::getSerializer();
        $publicKeyCredential = $serializer->deserialize(json_encode($data), PublicKeyCredential::class, 'json');
        if (! $publicKeyCredential->response instanceof AuthenticatorAssertionResponse) {
            return ['ret' => 0, 'msg' => '验证失败'];
        }
        $publicKeyCredentialSource = (new MFACredential())
            ->where('rawid', $data['id'])
            ->where('userid', $user->id)
            ->where('type', 'fido')
            ->findOrEmpty();
        if ($publicKeyCredentialSource->isEmpty()) {
            return ['ret' => 0, 'msg' => '设备未注册'];
        }
        $cached = Cache::get('fido_assertion:' . $assertionCacheKey . ':' . $challengeId);
        if ($cached === null || $cached === false) {
            return ['ret' => 0, 'msg' => '会话已过期，请重试'];
        }
        try {
            $publicKeyCredentialRequestOptions = $serializer->deserialize(
                $cached,
                PublicKeyCredentialRequestOptions::class,
                'json'
            );
            $authenticatorAssertionResponseValidator = WebAuthn::getAuthenticatorAssertionResponseValidator();
            $credentialRecord = $serializer->deserialize(
                $publicKeyCredentialSource->body,
                CredentialRecord::class,
                'json'
            );
            $result = $authenticatorAssertionResponseValidator->check(
                $credentialRecord,
                $publicKeyCredential->response,
                $publicKeyCredentialRequestOptions,
                Request::host(),
                $user->uuid,
            );
        } catch (Exception $e) {
            return ['ret' => 0, 'msg' => $e->getMessage()];
        }
        $publicKeyCredentialSource->body = $serializer->serialize($result, 'json');
        $publicKeyCredentialSource->used_at = date('Y-m-d H:i:s');
        $publicKeyCredentialSource->save();
        Cache::delete('fido_assertion:' . $assertionCacheKey . ':' . $challengeId);

        return ['ret' => 1, 'msg' => '验证成功', 'userid' => $user->id];
    }
}
