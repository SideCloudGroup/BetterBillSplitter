<?php

declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * @property int $id
 * @property int $user_id
 * @property string $token_hash
 * @property string $expires_at
 * @property string|null $revoked_at
 * @property int|null $replaced_by
 * @property string|null $created_ip
 * @property string|null $user_agent
 */
class RefreshToken extends Model
{
    protected $name = 'refresh_tokens';

    protected $autoWriteTimestamp = false;
}
