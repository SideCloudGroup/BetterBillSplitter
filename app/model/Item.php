<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * @mixin Model
 * @property int $id
 * @property int userid
 * @property string $description
 * @property string $created_at
 * @property double $amount
 * @property bool $paid
 * @property int $initiator
 * @property int $party_id
 */
class Item extends Model
{
    protected $table = 'item';
    protected $pk = 'id';

    // 关联Party
    public function party()
    {
        return $this->belongsTo(Party::class, 'party_id');
    }

    // 关联用户（付款人）
    public function user()
    {
        return $this->belongsTo(User::class, 'userid');
    }

    // 关联发起人
    public function initiator()
    {
        return $this->belongsTo(User::class, 'initiator');
    }
}
