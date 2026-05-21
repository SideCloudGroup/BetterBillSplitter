<?php

declare(strict_types=1);

namespace app\validate;

use think\Validate;

class Item extends Validate
{
    protected $rule = [
        'description' => 'require',
        'amount' => 'require|float|gt:0',
        'users' => 'require|array',
        'unit' => 'require|string',
        'party_id' => 'require|integer',
    ];

    protected $message = [
        'description.require' => '描述不能为空',
        'amount.require' => '金额不能为空',
        'amount.float' => '金额必须为数字',
        'amount.gt' => '金额必须大于 0',
        'users.require' => '用户不能为空',
        'users.array' => '用户必须为数组',
        'unit.require' => '单位不能为空',
        'unit.string' => '单位必须为字符串',
        'party_id.require' => '请选择派对',
        'party_id.integer' => '派对ID无效',
    ];
}
