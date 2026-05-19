<?php

declare (strict_types=1);

namespace app\model;

use think\helper\Str;
use think\Model;

/**
 * @mixin Model
 * @property int $id
 * @property string $name
 * @property string $description
 * @property string $invite_code
 * @property int $owner_id
 * @property string $timezone
 * @property string $base_currency
 * @property string $supported_currencies
 * @property string|null $archived_at
 * @property string $created_at
 * @property string $updated_at
 */
class Party extends Model
{
    protected $table = 'party';
    protected $pk = 'id';

    // 自动时间戳
    protected $autoWriteTimestamp = true;
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 关联用户（所有者）
    public static function generateInviteCode(): string
    {
        do {
            $code = Str::random(8);
            $data = self::where('invite_code', $code)->findOrEmpty();
        } while (! $data->isEmpty());

        return $code;
    }

    // 关联成员
    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    // 关联账目
    public function items()
    {
        return $this->hasMany(Item::class, 'party_id');
    }

    // 生成邀请码
    public function isMember(int $userId): bool
    {
        return $this->members()->where('user_id', $userId)->count() > 0;
    }

    // 检查用户是否为成员
    public function members()
    {
        return $this->belongsToMany(User::class, 'party_member', 'user_id', 'party_id');
    }

    // 检查用户是否有权限管理
    public function isOwner(int $userId): bool
    {
        return $this->owner_id === $userId;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null && $this->archived_at !== '';
    }
}
