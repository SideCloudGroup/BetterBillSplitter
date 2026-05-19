<?php

declare(strict_types=1);

namespace app\service;

/**
 * 债务结算与最优支付路径（纯计算，不依赖数据库）
 */
class PaymentSettlementService
{
    /**
     * 从未支付条目汇总 userid → initiator → 金额
     *
     * @param iterable<array{userid: int|string, initiator: int|string, amount: float|string}> $items
     * @return array<int, array<int, string>>
     */
    public function aggregateUnpaid(iterable $items): array
    {
        $userUnpaid = [];
        foreach ($items as $item) {
            $userid = (int) $item['userid'];
            $initiator = (int) $item['initiator'];
            if (! isset($userUnpaid[$userid][$initiator])) {
                $userUnpaid[$userid][$initiator] = '0';
            }
            $userUnpaid[$userid][$initiator] = bcadd(
                $userUnpaid[$userid][$initiator],
                (string) $item['amount'],
                2
            );
        }

        return $userUnpaid;
    }

    /**
     * 计算最优支付方案
     *
     * @param array<int, array<int, string>> $userUnpaid userid => initiator => amount
     * @param array<int, string> $users id => username
     * @return array{0: array<string, array<string, string>>, 1: array<string, array<string, string>>}
     *         [optimizedDict, stage1] 均为 debtor_username => creditor_username => amount
     */
    public function compute(array $userUnpaid, array $users): array
    {
        if ($users === []) {
            return [[], []];
        }

        $tmpResult = [];
        foreach ($users as $payer_id => $payer) {
            foreach ($users as $payee_id => $payee) {
                if ($payer_id === $payee_id) {
                    continue;
                }
                if (isset($tmpResult[$payer_id][$payee_id]) || isset($tmpResult[$payee_id][$payer_id])) {
                    continue;
                }
                $diff = bcsub(
                    $userUnpaid[$payer_id][$payee_id] ?? '0',
                    $userUnpaid[$payee_id][$payer_id] ?? '0',
                    2
                );
                match (true) {
                    bccomp($diff, '0', 2) < 0 => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = bcsub('0', $diff, 2),
                    ],
                    bccomp($diff, '0', 2) > 0 => [
                        $tmpResult[$payer_id][$payee_id] = $diff,
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                    default => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                };
            }
        }

        $result = [];
        foreach ($tmpResult as $payer_id => $payer) {
            foreach ($payer as $payee_id => $amount) {
                if ($amount !== 0 && bccomp((string) $amount, '0', 2) !== 0) {
                    $result[$users[$payer_id]][$users[$payee_id]] = $amount;
                }
            }
        }

        $stage1 = $result;
        $optimizedDict = $this->optimizeTransfers($result);

        return [$optimizedDict, $stage1];
    }

    /**
     * 将 pairwise 债务图压缩为最少笔数的转账方案
     *
     * @param array<string, array<string, string|int|float>> $debtsDict debtor => creditor => amount
     * @return array<string, array<string, string>>
     */
    public function optimizeTransfers(array $debtsDict): array
    {
        $balance = [];

        foreach ($debtsDict as $debtor => $creditors) {
            foreach ($creditors as $creditor => $amount) {
                if (! isset($balance[$debtor])) {
                    $balance[$debtor] = '0';
                }
                if (! isset($balance[$creditor])) {
                    $balance[$creditor] = '0';
                }
                $balance[$debtor] = bcsub($balance[$debtor], (string) $amount, 2);
                $balance[$creditor] = bcadd($balance[$creditor], (string) $amount, 2);
            }
        }

        $creditors = [];
        $debtors = [];
        foreach ($balance as $person => $bal) {
            if (bccomp($bal, '0', 2) > 0) {
                $creditors[] = [$person, $bal];
            } elseif (bccomp($bal, '0', 2) < 0) {
                $debtors[] = [$person, bcsub('0', $bal, 2)];
            }
        }

        $optimizedDebts = [];
        $i = 0;
        $j = 0;
        while ($i < count($creditors) && $j < count($debtors)) {
            [$creditor, $credAmount] = $creditors[$i];
            [$debtor, $debtAmount] = $debtors[$j];

            if (bccomp($credAmount, $debtAmount, 2) > 0) {
                $optimizedDebts[] = [$debtor, $creditor, $debtAmount];
                $creditors[$i][1] = bcsub($credAmount, $debtAmount, 2);
                $j++;
            } elseif (bccomp($credAmount, $debtAmount, 2) < 0) {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $debtors[$j][1] = bcsub($debtAmount, $credAmount, 2);
                $i++;
            } else {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $i++;
                $j++;
            }
        }

        $optimizedDict = [];
        foreach ($optimizedDebts as $debt) {
            [$debtor, $creditor, $amount] = $debt;
            if (! isset($optimizedDict[$debtor])) {
                $optimizedDict[$debtor] = [];
            }
            $optimizedDict[$debtor][$creditor] = (string) $amount;
        }

        return $optimizedDict;
    }
}
