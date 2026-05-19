import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Table, Typography} from 'antd';
import {apiJson} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

type Item = { id: number; username: string; description: string; amount: string | number; created_at?: string };

export function PaymentPartyPage() {
  const {partyId: partyIdParam} = useParams();
  const partyId = Number(partyIdParam);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [party, setParty] = useState<{ name?: string; description?: string; currency_symbol?: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{
          ret: number;
          msg?: string;
          data?: {
            party?: Record<string, unknown>;
            items?: Item[];
            totalAmount?: string;
          };
        }>(`/user/payment/party/${partyId}`);
        if (data.ret !== 1) {
          setErr(data.msg || '加载失败');
          return;
        }
        setParty(data.data?.party as typeof party);
        setItems(data.data?.items || []);
        setTotal(String(data.data?.totalAmount ?? ''));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [partyId]);

  const sym = party?.currency_symbol || '¥';

  return (
    <PageShell
      title={`支付 — ${party?.name || ''}`}
      subtitle={party?.description || undefined}
      back={{to: '/payment'}}
      loading={loading}
      error={err}
    >
      <Typography.Paragraph style={{marginBottom: 16}}>
        合计待付：
        <Typography.Text strong style={{fontSize: 18, color: '#b45309', marginLeft: 8}}>
          {sym}
          {total}
        </Typography.Text>
      </Typography.Paragraph>
      <SurfaceCard>
        <Table<Item>
          rowKey="id"
          pagination={false}
          dataSource={items}
          locale={{emptyText: '无待付条目'}}
          columns={[
            {title: '发起人', dataIndex: 'username'},
            {title: '描述', dataIndex: 'description'},
            {
              title: '金额',
              dataIndex: 'amount',
              align: 'right',
              render: (a) => (
                <strong>
                  {sym}
                  {a}
                </strong>
              ),
            },
            {title: '时间', dataIndex: 'created_at', align: 'right', render: (t) => t || '—'},
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}
