<?php

declare(strict_types=1);

namespace tests\Unit;

use app\service\PaymentSettlementService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PaymentSettlementServiceTest extends TestCase
{
    private PaymentSettlementService $service;

    protected function setUp(): void
    {
        $this->service = new PaymentSettlementService();
    }

    public function testAggregateUnpaidSumsByUserAndInitiator(): void
    {
        $items = [
            ['userid' => 1, 'initiator' => 2, 'amount' => '10.50'],
            ['userid' => 1, 'initiator' => 2, 'amount' => 5],
            ['userid' => 2, 'initiator' => 1, 'amount' => 3.25],
        ];

        $result = $this->service->aggregateUnpaid($items);

        $this->assertSame('15.50', $result[1][2]);
        $this->assertSame('3.25', $result[2][1]);
    }

    public function testComputeReturnsEmptyWhenNoUsers(): void
    {
        $this->assertSame([[], []], $this->service->compute([], []));
    }

    public function testComputeSimpleDebtBetweenTwoUsers(): void
    {
        // Alice(1) owes Bob(2) 100
        $userUnpaid = [1 => [2 => '100.00']];
        $users = [1 => 'alice', 2 => 'bob'];

        [$optimized, $stage1] = $this->service->compute($userUnpaid, $users);

        $this->assertSame(['bob' => '100.00'], $optimized['alice']);
        $this->assertSame(['bob' => '100.00'], $stage1['alice']);
        $this->assertCount(1, $optimized);
    }

    public function testComputeOffsetsMutualDebts(): void
    {
        // alice owes bob 50, bob owes alice 30 => alice owes bob 20
        $userUnpaid = [
            1 => [2 => '50.00'],
            2 => [1 => '30.00'],
        ];
        $users = [1 => 'alice', 2 => 'bob'];

        [$optimized, $stage1] = $this->service->compute($userUnpaid, $users);

        $this->assertSame(['bob' => '20.00'], $optimized['alice']);
        $this->assertSame(['bob' => '20.00'], $stage1['alice']);
    }

    public function testComputeThreeUsersMinimizesTransferCount(): void
    {
        $userUnpaid = [
            2 => [1 => '30.00'],
            3 => [1 => '20.00'],
            3 => [2 => '10.00'],
        ];
        $users = [1 => 'alice', 2 => 'bob', 3 => 'carol'];

        [$optimized, $stage1] = $this->service->compute($userUnpaid, $users);

        $this->assertSame(
            ['bob' => ['alice' => '20.00'], 'carol' => ['alice' => '10.00']],
            $optimized
        );
        $this->assertLessThanOrEqual(2, $this->countTransfers($optimized));
    }

    public function testOptimizedMatchesStage1NetBalances(): void
    {
        $userUnpaid = [
            1 => [2 => '100.00', 3 => '25.50'],
            2 => [1 => '40.00', 3 => '10.00'],
            3 => [1 => '5.00'],
        ];
        $users = [1 => 'u1', 2 => 'u2', 3 => 'u3'];

        [$optimized, $stage1] = $this->service->compute($userUnpaid, $users);

        $this->assertSame($this->netBalances($stage1), $this->netBalances($optimized));
    }

    public function testOptimizeTransfersGreedySettlement(): void
    {
        $debts = [
            'alice' => ['bob' => '30.00'],
            'bob' => ['carol' => '10.00'],
        ];

        $optimized = $this->service->optimizeTransfers($debts);

        $this->assertArrayHasKey('alice', $optimized);
        $total = '0';
        foreach ($optimized as $creditors) {
            foreach ($creditors as $amount) {
                $total = bcadd($total, $amount, 2);
            }
        }
        $this->assertSame('30.00', $total);
    }

    #[DataProvider('endToEndItemsProvider')]
    public function testEndToEndFromItems(array $items, array $users, array $expectedOptimized): void
    {
        $userUnpaid = $this->service->aggregateUnpaid($items);
        [$optimized] = $this->service->compute($userUnpaid, $users);

        $this->assertSame($expectedOptimized, $optimized);
    }

    public static function endToEndItemsProvider(): array
    {
        return [
            'balanced pair' => [
                'items' => [
                    ['userid' => 1, 'initiator' => 2, 'amount' => '75.25'],
                ],
                'users' => [1 => 'payer', 2 => 'payee'],
                'expectedOptimized' => ['payer' => ['payee' => '75.25']],
            ],
            'fully offset mutual' => [
                'items' => [
                    ['userid' => 1, 'initiator' => 2, 'amount' => '100.00'],
                    ['userid' => 2, 'initiator' => 1, 'amount' => '100.00'],
                ],
                'users' => [1 => 'a', 2 => 'b'],
                'expectedOptimized' => [],
            ],
        ];
    }

    /**
     * @param array<string, array<string, string|int|float>> $debts
     * @return array<string, string>
     */
    private function netBalances(array $debts): array
    {
        $net = [];
        foreach ($debts as $debtor => $creditors) {
            foreach ($creditors as $creditor => $amount) {
                $net[$debtor] = bcsub($net[$debtor] ?? '0', (string) $amount, 2);
                $net[$creditor] = bcadd($net[$creditor] ?? '0', (string) $amount, 2);
            }
        }

        return $net;
    }

        /**
     * @param array<string, array<string, string>> $optimized
     */
    private function countTransfers(array $optimized): int
    {
        $count = 0;
        foreach ($optimized as $creditors) {
            $count += count($creditors);
        }

        return $count;
    }
}
