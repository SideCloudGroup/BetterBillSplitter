<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * @mixin Model
 * @property string $id 密钥ID
 * @property int $userid 用户ID
 * @property string $name 密钥名称
 * @property string $rawid 密钥设备ID
 * @property string $body 内容
 * @property string $created_at 创建时间
 * @property string $used_at 上次使用时间
 * @property string $type 类型
 */
class MFACredential extends Model
{
    protected $table = 'mfa_credential';
    protected $pk = 'id';
}
