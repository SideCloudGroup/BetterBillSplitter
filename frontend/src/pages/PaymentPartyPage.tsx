import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {WalletOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {formatMoney} from '@/lib/formatMoney';
import {EmptyState, LedgerList, PageShell, SectionTitle, SummaryStrip, SurfaceCard} from '@/components/ui';

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
      subtitle={party?.description || '你在本派对的应付款项明细'}
      back={{to: '/payment'}}
      loading={loading}
      error={err}
      maxWidth={800}
    >
      <SummaryStrip label="合计待付" value={`${sym}${total}`} tone="warning"/>
      <SurfaceCard title={<SectionTitle icon={<WalletOutlined/>}>待付条目</SectionTitle>}>
        <LedgerList
          rows={items.map((it) => ({
            id: it.id,
            title: it.description || '（无描述）',
            meta: `发起方：${it.username}${it.created_at ? ` · ${it.created_at}` : ''}`,
            amount: formatMoney(sym, it.amount),
          }))}
          empty={<EmptyState description="无待付条目"/>}
        />
      </SurfaceCard>
    </PageShell>
  );
}
