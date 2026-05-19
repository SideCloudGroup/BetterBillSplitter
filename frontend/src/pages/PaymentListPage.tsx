import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Table} from 'antd';
import {apiJson} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

type PartyRow = {
  id: number;
  name: string;
  description?: string;
  total_amount?: string | number;
  currency_symbol?: string;
};

export function PaymentListPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<PartyRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{ ret: number; data?: { parties?: PartyRow[] } }>('/user/payment');
        if (data.ret !== 1) {
          setErr('加载失败');
          return;
        }
        setRows(data.data?.parties || []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageShell title="支付" subtitle="查看各派对中你需要支付的款项" loading={loading} error={err} centered>
      <SurfaceCard>
        <Table<PartyRow>
          rowKey="id"
          pagination={false}
          dataSource={rows}
          locale={{emptyText: '暂无待付项目'}}
          columns={[
            {
              title: '派对',
              dataIndex: 'name',
              render: (t, r) => <Link to={`/payment/party/${r.id}`}>{t}</Link>,
            },
            {title: '说明', dataIndex: 'description', render: (t) => t || '—'},
            {
              title: '待付',
              dataIndex: 'total_amount',
              align: 'right',
              render: (_, r) => (
                <strong style={{color: '#b45309'}}>
                  {r.currency_symbol ?? ''}
                  {r.total_amount ?? ''}
                </strong>
              ),
            },
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}
