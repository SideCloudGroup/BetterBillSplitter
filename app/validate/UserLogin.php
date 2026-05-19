<?php

declare (strict_types=1);

namespace app\validate;

use think\Validate;

class UserLogin extends Validate
{
    protected $rule = [
        'username' => 'require|min:3',
        'password' => 'require|min:3',
    ];

    protected $message = [
        'username.require' => "用户名不能为空",
        'username.min' => "用户名长度不能少于3位",
        'password.require' => "密码不能为空",
        'password.min' => "密码长度不能少于3位",
    ];
}
