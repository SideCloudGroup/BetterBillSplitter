<?php

namespace app\service\MFA;

use app\model\MFACredential;
use app\model\User;
use Cose\Algorithm\Manager;
use Cose\Algorithms;
use Symfony\Component\Clock\NativeClock;
use Exception;
use Symfony\Component\Serializer\SerializerInterface;
use think\facade\Cache;
use think\facade\Request;
use Webauthn\AttestationStatement\AndroidKeyAttestationStatementSupport;
use Webauthn\AttestationStatement\AppleAttestationStatementSupport;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\FidoU2FAttestationStatementSupport;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AttestationStatement\PackedAttestationStatementSupport;

;

use Cose\Algorithm\Signature\ECDSA;
use Cose\Algorithm\Signature\RSA;
use Webauthn\AttestationStatement\TPMAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialUserEntity;


class WebAuthn
{
    public static int $timeout = 30_000;

    public static function registerRequest(User $user): string
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
        Cache::set('webauthn_register:' . session_id(), $jsonObject, 300);
        return $jsonObject;
    }

    public static function generateRPEntity(): PublicKeyCredentialRpEntity
    {
        return PublicKeyCredentialRpEntity::create(env('APP.NAME'), Request::host());
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

    public static function registerHandle(User $user, array $data): array
    {
        $serializer = self::getSerializer();
        try {
            $publicKeyCredential = $serializer->deserialize(
                json_encode($data),
                PublicKeyCredential::class,
                'json'
            );
        } catch (Exception $e) {
            return ['ret' => 0, 'msg' => $e->getMessage()];
        }
        if (!isset($publicKeyCredential->response) || !$publicKeyCredential->response instanceof AuthenticatorAttestationResponse) {
            return ['ret' => 0, 'msg' => '密钥类型错误'];
        }

        $publicKeyCredentialCreationOptions = $serializer->deserialize(
            Cache::get('webauthn_register:' . session_id()),
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
        $webauthn->name = $data['name'] === '' ? null : $data['name'];
        $webauthn->type = 'passkey';
        $webauthn->save();
        return ['ret' => 1, 'msg' => '注册成功'];
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

    public static function getAuthenticatorAttestationResponseValidator(): AuthenticatorAttestationResponseValidator
    {
        $csmFactory = new CeremonyStepManagerFactory();
        $creationCSM = $csmFactory->creationCeremony();
        return AuthenticatorAttestationResponseValidator::create(
            ceremonyStepManager: $creationCSM
        );
    }

    public static function challengeRequest(): string
    {
        $publicKeyCredentialRequestOptions = self::getPublicKeyCredentialRequestOptions();
        $serializer = self::getSerializer();
        $jsonObject = $serializer->serialize($publicKeyCredentialRequestOptions, 'json');
        Cache::set('webauthn_assertion:' . session_id(), $jsonObject, 300);
        return $jsonObject;
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

    public static function challengeHandle(array $data): array
    {
        $serializer = self::getSerializer();
        $publicKeyCredential = $serializer->deserialize(json_encode($data), PublicKeyCredential::class, 'json');
        if (!$publicKeyCredential->response instanceof AuthenticatorAssertionResponse) {
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
        try {
            $publicKeyCredentialRequestOptions = $serializer->deserialize(
                Cache::get('webauthn_assertion:' . session_id()),
                PublicKeyCredentialRequestOptions::class,
                'json'
            );
            $authenticatorAssertionResponseValidator = self::getAuthenticatorAssertionResponseValidator();
            $publicKeyCredentialSource_body = $serializer->deserialize($publicKeyCredentialSource->body, PublicKeyCredentialSource::class, 'json');
            $result = $authenticatorAssertionResponseValidator->check(
                $publicKeyCredentialSource_body,
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