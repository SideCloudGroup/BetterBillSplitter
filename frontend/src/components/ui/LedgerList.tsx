import type {ReactNode} from 'react';
import {Flex, Tag, Typography} from 'antd';

export type LedgerRow = {
  id: number | string;
  title: string;
  meta?: string;
  amount: string;
  paid?: boolean;
  action?: ReactNode;
};

type LedgerListProps = {
  rows: LedgerRow[];
  empty?: ReactNode;
};

export function LedgerList({rows, empty}: LedgerListProps) {
  if (rows.length === 0) {
    return empty ? <>{empty}</> : null;
  }
  return (
    <ul className="bbs-ledger-list">
      {rows.map((r) => {
        const paid = r.paid === true;
        return (
          <li key={r.id} className={`bbs-ledger-row${paid ? ' bbs-ledger-row--paid' : ''}`}>
            <div className="bbs-ledger-row__main">
              <Typography.Text strong className="bbs-ledger-row__title">
                {r.title}
              </Typography.Text>
              {r.meta ? (
                <Typography.Text type="secondary" className="bbs-ledger-row__meta">
                  {r.meta}
                </Typography.Text>
              ) : null}
            </div>
            <Flex align="center" gap={10} className="bbs-ledger-row__side" wrap="wrap" justify="flex-end">
              <Typography.Text strong className="bbs-ledger-row__amount">
                {r.amount}
              </Typography.Text>
              {r.paid !== undefined ? (
                <Tag color={paid ? 'success' : 'warning'}>{paid ? '已付' : '未付'}</Tag>
              ) : null}
              {r.action}
            </Flex>
          </li>
        );
      })}
    </ul>
  );
}
