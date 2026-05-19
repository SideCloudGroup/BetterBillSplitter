<?php

declare(strict_types=1);

namespace tests\Unit;

use app\support\Money;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class MoneyTest extends TestCase
{
    #[DataProvider('convertProvider')]
    public function testConvertToBaseCurrency(string $amount, string $rate, string $expected): void
    {
        $this->assertSame($expected, Money::convertToBaseCurrency($amount, $rate));
    }

    public static function convertProvider(): array
    {
        return [
            'same currency rate 1' => ['100', '1', '100.00'],
            'usd to cny' => ['100', '7.25', '13.79'],
            'rounding half up at 2 decimals' => ['10', '3', '3.33'],
        ];
    }

    public function testSumAmounts(): void
    {
        $this->assertSame('123.45', Money::sum(['100', '20.45', 3]));
    }

    public function testSumEmpty(): void
    {
        $this->assertSame('0', Money::sum([]));
    }
}
