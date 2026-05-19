<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * @mixin Model
 */
class Setting extends Model
{
    protected $table = 'setting';
    protected $pk = 'id';
}
