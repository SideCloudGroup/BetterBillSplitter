<?php

namespace app\service\MFA;

use app\model\MFACredential;
use app\model\User;
use Cose\Algorithm\Manager;
use Cose\Algorithm\Signature\ECDSA;
use Cose\Algorithm\Signature\RSA;
use Cose\Algorithms;
use Exception;
use Symfony\Component\Clock\NativeClock;
use Symfony\Component\Serializer\SerializerInterface;
use think\facade\Cache;
use think\facade\Request;
use Webauthn\AttestationStatement\AndroidKeyAttestationStatementSupport;
use Webauthn\AttestationStatement\AppleAttestationStatementSupport;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\FidoU2FAttestationStatementSupport;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AttestationStatement\PackedAttestationStatementSupport;
use Webauthn\AttestationStatement\TPMAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;


class WebAuthn
{
    public static int $timeout = 30_000;

    /**
     * @return array{challenge_id: string, publicKey: mixed}
     */
    public static function registerRequest(User $user): array
    {
        $rpEntity = self::generateRPEntity();
        $userEntity = self::generateUserEntity($user);
        $authenticatorSelectionCriteria = AuthenticatorSelectionCriteria::create(
            userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
            residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED
        );
        $publicKeyCredentialCreationOptions =
            PublicKeyCredentialCreationOptions::create(
                $rpEntity,
                $userEntity,
                random_bytes(32),
                pubKeyCredParams: self::getPublicKeyCredentialParametersList(),
                authenticatorSelection: $authenticatorSelectionCriteria,
                attestation: PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
                timeout: self::$timeout,
            );
        $serializer = self::getSerializer();
        $jsonObject = $serializer->serialize($publicKeyCredentialCreationOptions, 'json');
        $challengeId = bin2hex(random_bytes(16));
        Cache::set('webauthn_register:' . $challengeId, $jsonObject, 300);

        return [
            'challenge_id' => $challengeId,
            'publicKey' => json_decode($jsonObject, true),
        ];
    }

    public static function generateRPEntity(): PublicKeyCredentialRpEntity
    {
        return PublicKeyCredentialRpEntity::create(getSetting('general_name'), Request::host());
    }

    public static function generateUserEntity(User $user): PublicKeyCredentialUserEntity
    {
        return PublicKeyCredentialUserEntity::create(
            $user->username,
            $user->uuid,
            $user->username
        );
    }

    public static function getPublicKeyCredentialParametersList(): array
    {
        return [
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ES256K),
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ES256),
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_RS256),
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_PS256),
            PublicKeyCredentialParameters::create('public-key', Algorithms::COSE_ALGORITHM_ED256),
        ];
    }

    public static function getSerializer(): SerializerInterface
    {
        $clock = new NativeClock();
        $coseAlgorithmManager = Manager::create();
        $coseAlgorithmManager->add(ECDSA\ES256::create());
        $coseAlgorithmManager->add(RSA\RS256::create());
        $attestationStatementSupportManager = AttestationStatementSupportManager::create();
        $attestationStatementSupportManager->add(NoneAttestationStatementSupport::create());
        $attestationStatementSupportManager->add(FidoU2FAttestationStatementSupport::create());
        $attestationStatementSupportManager->add(AppleAttestationStatementSupport::create());
        $attestationStatementSupportManager->add(AndroidKeyAttestationStatementSupport::create());
        $attestationStatementSupportManager->add(TPMAttestationStatementSupport::create($clock));
        $attestationStatementSupportManager->add(PackedAttestationStatementSupport::create($coseAlgorithmManager));
        $factory = new WebauthnSerializerFactory($attestationStatementSupportManager);
        return $factory->create();
    }

    public static function registerHandle(User $user, array $data, string $challengeId): array
    {
        $deviceName = trim((string)($data['name'] ?? ''));
        $credentialPayload = $data;
        unset($credentialPayload['challenge_id'], $credentialPayload['name']);

        $serializer = self::getSerializer();
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

        $cached = Cache::get('webauthn_register:' . $challengeId);
        if ($cached === null || $cached === false) {
            return ['ret' => 0, 'msg' => '注册会话已过期，请重试'];
        }

        $publicKeyCredentialCreationOptions = $serializer->deserialize(
            $cached,
            PublicKeyCredentialCreationOptions::class,
            'json'
        );

        try {
            $authenticatorAttestationResponseValidator = self::getAuthenticatorAttestationResponseValidator();
            $publicKeyCredentialSource = $authenticatorAttestationResponseValidator->check(
                $publicKeyCredential->response,
                $publicKeyCredentialCreationOptions,
                Request::host(),
            );
        } catch (Exception) {
            return ['ret' => 0, 'msg' => '验证失败'];
        }
        // save public key credential source
        $jsonStr = self::getSerializer()->serialize($publicKeyCredentialSource, 'json');
        $jsonObject = json_decode($jsonStr);
        $webauthn = new MFACredential();
        $webauthn->userid = $user->id;
        $webauthn->rawid = $jsonObject->publicKeyCredentialId;
        $webauthn->body = $jsonStr;
        $webauthn->created_at = date('Y-m-d H:i:s');
        $webauthn->used_at = null;
        $webauthn->name = $deviceName === '' ? null : $deviceName;
        $webauthn->type = 'passkey';
        $webauthn->save();
        Cache::delete('webauthn_register:' . $challengeId);

        return ['ret' => 1, 'msg' => '注册成功'];
    }

    public static function getAuthenticatorAttestationResponseValidator(): AuthenticatorAttestationResponseValidator
    {
        $csmFactory = new CeremonyStepManagerFactory();
        $creationCSM = $csmFactory->creationCeremony();
        return AuthenticatorAttestationResponseValidator::create(
            ceremonyStepManager: $creationCSM
        );
    }

    /**
     * @return array{challenge_id: string, publicKey: mixed}
     */
    public static function challengeRequest(): array
    {
        $publicKeyCredentialRequestOptions = self::getPublicKeyCredentialRequestOptions();
        $serializer = self::getSerializer();
        $jsonObject = $serializer->serialize($publicKeyCredentialRequestOptions, 'json');
        $challengeId = bin2hex(random_bytes(16));
        Cache::set('webauthn_assertion:' . $challengeId, $jsonObject, 300);

        return [
            'challenge_id' => $challengeId,
            'publicKey' => json_decode($jsonObject, true),
        ];
    }

    public static function getPublicKeyCredentialRequestOptions(): PublicKeyCredentialRequestOptions
    {
        return PublicKeyCredentialRequestOptions::create(
            random_bytes(32),
            rpId: Request::host(),
            userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED,
            timeout: self::$timeout,
        );
    }

    public static function challengeHandle(array $data, string $challengeId): array
    {
        $credentialPayload = $data;
        unset($credentialPayload['challenge_id']);

        $serializer = self::getSerializer();
        $publicKeyCredential = $serializer->deserialize(
            json_encode($credentialPayload),
            PublicKeyCredential::class,
            'json'
        );
        if (! $publicKeyCredential->response instanceof AuthenticatorAssertionResponse) {
            return ['ret' => 0, 'msg' => '验证失败'];
        }
        $publicKeyCredentialSource = (new MFACredential())
            ->where('rawid', $data['id'])
            ->where('type', 'passkey')
            ->findOrEmpty();
        if ($publicKeyCredentialSource->isEmpty()) {
            return ['ret' => 0, 'msg' => '设备未注册'];
        }
        $user = (new User())->where('id', $publicKeyCredentialSource->userid)->findOrEmpty();
        if ($user->isEmpty()) {
            return ['ret' => 0, 'msg' => '用户不存在'];
        }
        $cached = Cache::get('webauthn_assertion:' . $challengeId);
        if ($cached === null || $cached === false) {
            return ['ret' => 0, 'msg' => '登录会话已过期，请重试'];
        }
        try {
            $publicKeyCredentialRequestOptions = $serializer->deserialize(
                $cached,
                PublicKeyCredentialRequestOptions::class,
                'json'
            );
            $authenticatorAssertionResponseValidator = self::getAuthenticatorAssertionResponseValidator();
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
        Cache::delete('webauthn_assertion:' . $challengeId);

        return ['ret' => 1, 'msg' => '验证成功', 'user' => $user];
    }

    public static function getAuthenticatorAssertionResponseValidator(): AuthenticatorAssertionResponseValidator
    {
        $csmFactory = new CeremonyStepManagerFactory();
        $requestCSM = $csmFactory->requestCeremony();
        return AuthenticatorAssertionResponseValidator::create(
            ceremonyStepManager: $requestCSM
        );
    }
}