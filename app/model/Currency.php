<?php

declare (strict_types=1);

namespace app\model;

use think\Model;

/**
 * 货币模型
 * @property int $id
 * @property string $code
 * @property string $name
 * @property string $name_en
 * @property string $symbol
 * @property int $decimal_places
 * @property bool $is_default
 * @property bool $is_active
 * @property string $created_at
 * @property string $updated_at
 */
class Currency extends Model
{
    protected $table = 'currencies';

    // 自动时间戳
    protected $autoWriteTimestamp = true;
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 类型转换
    protected $type = [
        'is_default' => 'boolean',
        'is_active' => 'boolean',
        'decimal_places' => 'integer',
    ];

    /**
     * 获取所有启用的货币
     */
    public static function getActiveCurrencies()
    {
        return self::where('is_active', true)
            ->order('is_default', 'desc')
            ->order('code', 'asc')
            ->select();
    }

    /**
     * 获取默认货币
     */
    public static function getDefaultCurrency()
    {
        return self::where('is_default', true)
            ->where('is_active', true)
            ->find();
    }

    /**
     * 根据代码获取货币
     */
    public static function getByCode(string $code)
    {
        return self::where('code', strtolower($code))
            ->where('is_active', true)
            ->find();
    }

    /**
     * 检查货币代码是否存在
     */
    public static function codeExists(string $code): bool
    {
        return self::where('code', strtolower($code))->count() > 0;
    }
}
