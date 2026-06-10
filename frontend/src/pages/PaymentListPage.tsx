import {useEffect, useState} from 'react';
import {WalletOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {formatMoney} from '@/lib/formatMoney';
import {EmptyState, EntityCard, PageShell, SectionTitle, SurfaceCard} from '@/components/ui';

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
    <PageShell title="应付账单" subtitle="查看各派对中你的应付款项" loading={loading} error={err} maxWidth={720}>
      <SurfaceCard title={<SectionTitle icon={<WalletOutlined/>}>待付派对</SectionTitle>}>
        {rows.length === 0 ? (
          <EmptyState description="暂无待付项目，太好了！"/>
        ) : (
          <div className="bbs-entity-list">
            {rows.map((r) => {
              const sym = r.currency_symbol ?? '¥';
              return (
                <EntityCard
                  key={r.id}
                  to={`/payment/party/${r.id}`}
                  title={r.name}
                  description={r.description}
                  amount={formatMoney(sym, r.total_amount ?? 0)}
                  amountLabel="待付"
                  amountTone="warning"
                  icon={<WalletOutlined/>}
                />
              );
            })}
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
