import {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Button, message} from 'antd';
import {AccountBookOutlined, PlusOutlined} from '@ant-design/icons';
import {apiJson, apiPostForm} from '@/api/client';
import {formatMoney} from '@/lib/formatMoney';
import {EmptyState, EntityCard, LedgerList, PageShell, SectionTitle, SummaryStrip, SurfaceCard,} from '@/components/ui';

type PartyRow = {
  id: number;
  name: string;
  description?: string;
  total_amount?: string | number;
  currency_symbol?: string;
};

export function ItemListPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<PartyRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{ ret: number; data?: { parties?: PartyRow[] } }>('/user/item');
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
    <PageShell
      title="收款"
      subtitle="管理各派对中他人应付给你的款项"
      loading={loading}
      error={err}
      maxWidth={720}
      extra={
        <Link to="/items/add">
          <Button type="primary" icon={<PlusOutlined/>}>
            添加收款
          </Button>
        </Link>
      }
    >
      <SurfaceCard title={<SectionTitle icon={<AccountBookOutlined/>}>按派对查看</SectionTitle>}>
        {rows.length === 0 ? (
          <EmptyState
            description="暂无收款记录"
            action={
              <Link to="/items/add">
                <Button type="primary" size="small" icon={<PlusOutlined/>}>
                  添加收款
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="bbs-entity-list">
            {rows.map((r) => {
              const sym = r.currency_symbol ?? '¥';
              return (
                <EntityCard
                  key={r.id}
                  to={`/items/party/${r.id}`}
                  title={r.name}
                  description={r.description}
                  amount={formatMoney(sym, r.total_amount ?? 0)}
                  amountLabel="未收回款"
                  amountTone="success"
                  icon={<AccountBookOutlined/>}
                />
              );
            })}
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  );
}

type Item = {
  id: number;
  username: string;
  description: string;
  amount: string | number;
  paid: number;
  created_at?: string;
};

export function ItemPartyPage() {
  const {partyId} = useParams();
  const id = Number(partyId);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [party, setParty] = useState<{
    name?: string;
    description?: string;
    currency_symbol?: string;
    is_archived?: boolean;
  } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [unpaid, setUnpaid] = useState('');

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{
        ret: number;
        msg?: string;
        data?: {
          party?: typeof party;
          items?: Item[];
          unpaidAmount?: string;
        };
      }>(`/user/item/party/${id}`);
      if (data.ret !== 1) {
        setErr(data.msg || '加载失败');
        return;
      }
      setParty(data.data?.party || null);
      setItems(data.data?.items || []);
      setUnpaid(String(data.data?.unpaidAmount ?? ''));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const mark = async (itemId: number, paid: '0' | '1') => {
    await apiPostForm(`/user/item/${itemId}`, {paid});
    message.success(paid === '1' ? '已标记为已付' : '已标记为未付');
    await load();
  };

  const sym = party?.currency_symbol || '¥';
  const archived = party?.is_archived === true;

  return (
    <PageShell
      title={`收款 — ${party?.name || ''}`}
      subtitle={party?.description || '管理本派对下的收款条目'}
      back={{to: '/items'}}
      loading={loading}
      error={err}
      maxWidth={800}
      extra={
        !archived ? (
          <Link to={`/items/add?party_id=${id}`}>
            <Button type="primary" icon={<PlusOutlined/>} size="small">
              添加收款
            </Button>
          </Link>
        ) : null
      }
    >
      {archived ? (
        <Alert type="warning" message="该派对已归档，无法修改支付状态。" showIcon style={{marginBottom: 16}}/>
      ) : null}
      <SummaryStrip label="未收回款合计" value={`${sym}${unpaid}`} tone="success"/>
      <SurfaceCard title={<SectionTitle icon={<AccountBookOutlined/>}>收款条目</SectionTitle>}>
        <LedgerList
          rows={items.map((it) => {
            const paid = Number(it.paid) === 1;
            return {
              id: it.id,
              title: it.description || '（无描述）',
              meta: `支付人 ${it.username}${it.created_at ? ` · ${it.created_at}` : ''}`,
              amount: formatMoney(sym, it.amount),
              paid,
              action: archived ? undefined : paid ? (
                <Button size="small" onClick={() => void mark(it.id, '0')}>
                  标为未付
                </Button>
              ) : (
                <Button type="primary" size="small" onClick={() => void mark(it.id, '1')}>
                  标为已付
                </Button>
              ),
            };
          })}
          empty={<EmptyState description="暂无收款条目"/>}
        />
      </SurfaceCard>
    </PageShell>
  );
}
