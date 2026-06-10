import {useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Badge, Button, Col, Row, Space, Tabs, message} from 'antd';
import {AccountBookOutlined, PlusOutlined, WalletOutlined} from '@ant-design/icons';
import {apiJson, apiPostForm} from '@/api/client';
import {formatMoney} from '@/lib/formatMoney';
import {EmptyState, LedgerList, PageShell, StatCard, SurfaceCard} from '@/components/ui';

type FilterKey = 'all' | 'my_initiated' | 'my_payment';

type PartyItem = {
  id: number;
  description: string;
  amount: string | number;
  paid: number;
  created_at?: string;
  payer_name: string;
  initiator_name: string;
  is_my_initiation: boolean;
  is_my_payment: boolean;
};

type PartyItemStats = {
  my_initiated: number;
  my_payment: number;
  my_initiated_amount: string;
  my_initiated_unpaid: string;
  my_payment_amount: string;
};

export function PartyMyItemsPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [party, setParty] = useState<{
    name?: string;
    currency_symbol?: string;
    is_archived?: boolean;
  } | null>(null);
  const [items, setItems] = useState<PartyItem[]>([]);
  const [stats, setStats] = useState<PartyItemStats | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{
        ret: number;
        msg?: string;
        data?: {
          party?: typeof party;
          items?: PartyItem[];
          stats?: PartyItemStats;
        };
      }>(`/user/party/${partyId}/items`);
      if (data.ret !== 1) {
        setErr(data.msg || '加载失败');
        return;
      }
      setParty(data.data?.party || null);
      const allItems = data.data?.items || [];
      setItems(allItems.filter((it) => it.is_my_initiation || it.is_my_payment));
      setStats(data.data?.stats || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (itemId: number, paid: '0' | '1') => {
    try {
      await apiPostForm(`/user/item/${itemId}`, {paid});
      message.success(paid === '1' ? '已标记为已付' : '已标记为未付');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const sym = party?.currency_symbol || '¥';
  const archived = party?.is_archived === true;

  const filteredItems = useMemo(() => {
    switch (filter) {
      case 'my_initiated':
        return items.filter((it) => it.is_my_initiation);
      case 'my_payment':
        return items.filter((it) => it.is_my_payment);
      default:
        return items;
    }
  }, [items, filter]);

  const tabItems = [
    {
      key: 'all' as FilterKey,
      label: (
        <span>
          全部相关&nbsp;
          <Badge count={items.length} size="small" showZero color="#8c8c8c"/>
        </span>
      ),
    },
    {
      key: 'my_initiated' as FilterKey,
      label: (
        <span>
          我发起的&nbsp;
          <Badge count={stats?.my_initiated ?? 0} size="small" showZero color="#16a34a"/>
        </span>
      ),
    },
    {
      key: 'my_payment' as FilterKey,
      label: (
        <span>
          我需支付&nbsp;
          <Badge count={stats?.my_payment ?? 0} size="small" showZero color="#d97706"/>
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title={`我的账目 — ${party?.name || ''}`}
      subtitle="查看本派对中与你相关的收款与付款记录"
      back={{to: `/parties/${partyId}`}}
      loading={loading}
      error={err}
      maxWidth={800}
      extra={
        !archived ? (
          <Link to={`/items/add?party_id=${partyId}`}>
            <Button type="primary" icon={<PlusOutlined/>} size="small">
              发起收款
            </Button>
          </Link>
        ) : null
      }
    >
      {archived ? (
        <Alert type="warning" message="该派对已归档，无法修改支付状态。" showIcon style={{marginBottom: 16}}/>
      ) : null}

      <Row gutter={[12, 12]} style={{marginBottom: 20}}>
        <Col xs={12}>
          <StatCard
            title="发起待收"
            value={stats ? formatMoney(sym, stats.my_initiated_unpaid) : '—'}
            accent="success"
          />
        </Col>
        <Col xs={12}>
          <StatCard
            title="我的待付"
            value={stats ? formatMoney(sym, stats.my_payment_amount) : '—'}
            accent="warning"
          />
        </Col>
      </Row>

      <Tabs
        activeKey={filter}
        onChange={(key) => setFilter(key as FilterKey)}
        items={tabItems}
        style={{marginBottom: 0}}
        tabBarStyle={{marginBottom: 0}}
      />

      <SurfaceCard style={{borderTopLeftRadius: 0, borderTopRightRadius: 0}}>
        <LedgerList
          rows={filteredItems.map((it) => {
            const paid = Number(it.paid) === 1;

            const roleLabel = it.is_my_initiation
              ? `收款方 · 付款人：${it.payer_name}`
              : `待付款 · 发起方：${it.initiator_name}`;

            const metaText = filter === 'all'
              ? roleLabel
              : filter === 'my_initiated'
                ? `付款人：${it.payer_name}`
                : `发起方：${it.initiator_name}`;

            const markBtn =
              it.is_my_initiation && !archived ? (
                paid ? (
                  <Button size="small" onClick={() => void mark(it.id, '0')}>
                    标为未付
                  </Button>
                ) : (
                  <Button type="primary" size="small" onClick={() => void mark(it.id, '1')}>
                    标为已付
                  </Button>
                )
              ) : null;

            return {
              id: it.id,
              title: it.description || '（无描述）',
              meta: `${metaText}${it.created_at ? ` · ${it.created_at}` : ''}`,
              amount: formatMoney(sym, it.amount),
              paid,
              action: markBtn
                ? (
                  <Space size={6}>
                    {markBtn}
                  </Space>
                )
                : undefined,
            };
          })}
          empty={
            <EmptyState
              description={filter === 'all' ? '暂无相关账目' : '暂无符合条件的账目'}
              action={
                filter === 'all' && !archived ? (
                  <Link to={`/items/add?party_id=${partyId}`}>
                    <Button type="primary" size="small" icon={<AccountBookOutlined/>}>
                      发起第一笔收款
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </SurfaceCard>

      <div style={{marginTop: 8, display: 'flex', justifyContent: 'flex-end'}}>
        <Link to={`/payment/party/${partyId}`}>
          <Button type="link" size="small" icon={<WalletOutlined/>}>
            查看未结清待付明细
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}
