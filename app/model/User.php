<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * @mixin Model
 * @property int $id
 * @property string $username
 * @property string $password
 * @property string $uuid
 * @property bool $mfa_enable
 * @property bool $enable
 * @property bool $is_admin
 */
class User extends Model
{
    protected $table = 'user';
    protected $pk = 'id';

    public function checkMfaStatus(): array
    {
        $fido = (new MFACredential())->where('userid', $this->id)->where('type', 'fido')->findOrEmpty();
        $totp = (new MFACredential())->where('userid', $this->id)->where('type', 'totp')->findOrEmpty();
        if ($fido->isEmpty() && $totp->isEmpty()) {
            return ['require' => false];
        } else {
            return ['require' => true, 'fido' => ! $fido->isEmpty(), 'totp' => ! $totp->isEmpty()];
        }
    }
}
