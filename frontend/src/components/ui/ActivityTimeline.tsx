import {useNavigate} from 'react-router-dom';
import {Flex, Tag, Timeline, Typography} from 'antd';
import {formatMoney, parseAmount} from '@/lib/formatMoney';
import {EmptyState} from './EmptyState';

export type ActivityItem = {
  id: number;
  description: string;
  amount: string | number;
  paid: number;
  created_at?: string;
  party_id: number;
  party_name: string;
  currency_symbol: string;
  type: 'initiated' | 'assigned';
  counterparty_name: string;
};

type ActivityTimelineProps = {
  items: ActivityItem[];
};

export function ActivityTimeline({items}: ActivityTimelineProps) {
  const nav = useNavigate();

  if (items.length === 0) {
    return <EmptyState description="暂无账目动态"/>;
  }

  return (
    <Timeline
      className="bbs-activity-timeline"
      items={items.map((it) => {
        const sym = it.currency_symbol || '¥';
        const amt = formatMoney(sym, parseAmount(it.amount));
        const paid = Number(it.paid) === 1;
        const href =
          it.type === 'initiated'
            ? `/items/party/${it.party_id}`
            : `/payment/party/${it.party_id}`;

        const title =
          it.type === 'initiated' ? (
            <>
              向 <Typography.Text strong>{it.counterparty_name}</Typography.Text> 收款
            </>
          ) : (
            <>
              <Typography.Text strong>{it.counterparty_name}</Typography.Text> 向你收款
            </>
          );

        return {
          key: it.id,
          color: it.type === 'initiated' ? 'green' : 'blue',
          children: (
            <button
              type="button"
              className="bbs-activity-timeline__row"
              onClick={() => nav(href)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Flex justify="space-between" align="flex-start" wrap="wrap" gap={8}>
                <div style={{minWidth: 0, flex: 1}}>
                  <Typography.Text strong style={{display: 'block'}}>
                    {it.description || '（无描述）'}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{fontSize: 13}}>
                    {title} · {it.party_name}
                    {it.created_at ? ` · ${it.created_at}` : ''}
                  </Typography.Text>
                </div>
                <Flex align="center" gap={8} wrap="wrap">
                  <Typography.Text strong>{amt}</Typography.Text>
                  <Tag color={paid ? 'success' : 'warning'}>{paid ? '已付' : '未付'}</Tag>
                </Flex>
              </Flex>
            </button>
          ),
        };
      })}
    />
  );
}
