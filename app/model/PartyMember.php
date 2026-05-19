<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * @mixin Model
 * @property int $id
 * @property int $party_id
 * @property int $user_id
 * @property string $joined_at
 */
class PartyMember extends Model
{
    protected $table = 'party_member';
    protected $pk = 'id';

    // 自动时间戳
    protected $autoWriteTimestamp = true;
    protected $createTime = 'joined_at';
    protected $updateTime = false;

    // 关联Party
    public function party()
    {
        return $this->belongsTo(Party::class, 'party_id');
    }

    // 关联用户
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
