<?php

declare(strict_types=1);

namespace app\support;

/**
 * 金额相关的 bcmath 运算
 */
class Money
{
    /**
     * 将外币金额按汇率换算为本位币（与 UserController::processAddItem 一致）
     */
    public static function convertToBaseCurrency(string $amount, string $exchangeRate, int $scale = 2): string
    {
        return bcdiv($amount, $exchangeRate, $scale);
    }

    /**
     * 累加金额列表
     *
     * @param list<string|float|int> $amounts
     */
    public static function sum(array $amounts, int $scale = 2): string
    {
        $total = '0';
        foreach ($amounts as $amount) {
            $total = bcadd($total, (string) $amount, $scale);
        }

        return $total;
    }
}
