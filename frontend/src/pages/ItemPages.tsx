import {useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Badge, Button, message, Popconfirm, Space, Tabs} from 'antd';
import {AccountBookOutlined, DeleteOutlined, PlusOutlined} from '@ant-design/icons';
import {apiDelete, apiJson, apiPostForm} from '@/api/client';
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

type FilterKey = 'all' | 'unpaid' | 'my_initiated' | 'my_payment';

type PartyItemStats = {
  total: number;
  unpaid: number;
  my_initiated: number;
  my_payment: number;
  total_amount: string;
  unpaid_amount: string;
  my_initiated_amount: string;
  my_initiated_unpaid: string;
  my_payment_amount: string;
};

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
  const [isOwner, setIsOwner] = useState(false);
  const [items, setItems] = useState<PartyItem[]>([]);
  const [stats, setStats] = useState<PartyItemStats | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{
        ret: number;
        msg?: string;
        data?: {
          party?: typeof party;
          isOwner?: boolean;
          items?: PartyItem[];
          stats?: PartyItemStats;
        };
      }>(`/user/party/${id}/items`);
      if (data.ret !== 1) {
        setErr(data.msg || '加载失败');
        return;
      }
      setParty(data.data?.party || null);
      setIsOwner(data.data?.isOwner ?? false);
      setItems(data.data?.items || []);
      setStats(data.data?.stats || null);
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

  const doDelete = async (itemId: number) => {
    await apiDelete(`/user/item/${itemId}`);
    message.success('已删除');
    await load();
  };

  const sym = party?.currency_symbol || '¥';
  const archived = party?.is_archived === true;

  // 非派对主只能看到与自己相关的账目
  const baseItems = useMemo(
    () => (isOwner ? items : items.filter((it) => it.is_my_initiation || it.is_my_payment)),
    [items, isOwner],
  );

  const filteredItems = useMemo(() => {
    switch (filter) {
      case 'unpaid':
        return baseItems.filter((it) => Number(it.paid) === 0);
      case 'my_initiated':
        return baseItems.filter((it) => it.is_my_initiation);
      case 'my_payment':
        return baseItems.filter((it) => it.is_my_payment);
      default:
        return baseItems;
    }
  }, [baseItems, filter]);

  const tabItems = [
    {
      key: 'all' as FilterKey,
      label: (
        <span>
          {isOwner ? '全部' : '我的相关'}
          &nbsp;
          <Badge count={baseItems.length} size="small" showZero color="#8c8c8c"/>
        </span>
      ),
    },
    {
      key: 'unpaid' as FilterKey,
      label: <span>未支付&nbsp;<Badge count={stats?.unpaid ?? 0} size="small" showZero color="#faad14"/></span>,
    },
    {
      key: 'my_initiated' as FilterKey,
      label: <span>我发起的&nbsp;<Badge count={stats?.my_initiated ?? 0} size="small" showZero color="#1677ff"/></span>,
    },
    {
      key: 'my_payment' as FilterKey,
      label: <span>我需支付&nbsp;<Badge count={stats?.my_payment ?? 0} size="small" showZero color="#7c3aed"/></span>,
    },
  ];

  const summaryStrips = (() => {
    if (!stats) return null;
    switch (filter) {
      case 'all':
        if (isOwner) {
          return (
            <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16}}>
              <div style={{flex: 1, minWidth: 140}}>
                <SummaryStrip label="账目总额" value={formatMoney(sym, stats.total_amount)} tone="primary"/>
              </div>
              <div style={{flex: 1, minWidth: 140}}>
                <SummaryStrip label="其中未付" value={formatMoney(sym, stats.unpaid_amount)} tone="warning"/>
              </div>
            </div>
          );
        }
        // 非派对主：展示个人相关的汇总
        return (
          <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16}}>
            <div style={{flex: 1, minWidth: 140}}>
              <SummaryStrip label="我发起未收回" value={formatMoney(sym, stats.my_initiated_unpaid)} tone="success"/>
            </div>
            <div style={{flex: 1, minWidth: 140}}>
              <SummaryStrip label="我待付合计" value={formatMoney(sym, stats.my_payment_amount)} tone="warning"/>
            </div>
          </div>
        );
      case 'unpaid':
        return (
          <div style={{marginBottom: 16}}>
            <SummaryStrip label={isOwner ? '未付总额' : '我待付合计'} value={formatMoney(sym, stats.unpaid_amount)}
                          tone="warning"/>
          </div>
        );
      case 'my_initiated':
        return (
          <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16}}>
            <div style={{flex: 1, minWidth: 140}}>
              <SummaryStrip label="发起总额" value={formatMoney(sym, stats.my_initiated_amount)} tone="primary"/>
            </div>
            <div style={{flex: 1, minWidth: 140}}>
              <SummaryStrip label="未收回" value={formatMoney(sym, stats.my_initiated_unpaid)} tone="success"/>
            </div>
          </div>
        );
      case 'my_payment':
        return (
          <div style={{marginBottom: 16}}>
            <SummaryStrip label="我待付合计" value={formatMoney(sym, stats.my_payment_amount)} tone="warning"/>
          </div>
        );
    }
  })();

  return (
    <PageShell
      title={`账目 — ${party?.name || ''}`}
      subtitle={party?.description || '查看本派对全部账目'}
      back={{to: `/parties/${id}`}}
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

      <Tabs
        activeKey={filter}
        onChange={(key) => setFilter(key as FilterKey)}
        items={tabItems}
        style={{marginBottom: 0}}
        tabBarStyle={{marginBottom: 0}}
      />

      <SurfaceCard style={{borderTopLeftRadius: 0, borderTopRightRadius: 0}}>
        {summaryStrips}
        <LedgerList
          rows={filteredItems.map((it) => {
            const paid = Number(it.paid) === 1;
            const metaText = filter === 'my_initiated'
              ? `支付人 ${it.payer_name}`
              : filter === 'my_payment'
                ? `发起人 ${it.initiator_name}`
                : `支付人 ${it.payer_name} · 发起人 ${it.initiator_name}`;

            const markBtn = it.is_my_initiation && !archived ? (
              paid ? (
                <Button size="small" onClick={() => void mark(it.id, '0')}>标为未付</Button>
              ) : (
                <Button type="primary" size="small" onClick={() => void mark(it.id, '1')}>标为已付</Button>
              )
            ) : null;

            const deleteBtn = isOwner && !archived ? (
              <Popconfirm
                title="确认删除此条账目？"
                okText="删除"
                cancelText="取消"
                okButtonProps={{danger: true}}
                onConfirm={() => void doDelete(it.id)}
              >
                <Button danger size="small" icon={<DeleteOutlined/>}/>
              </Popconfirm>
            ) : null;

            const action = (markBtn || deleteBtn) ? (
              <Space size={6}>
                {markBtn}
                {deleteBtn}
              </Space>
            ) : undefined;

            return {
              id: it.id,
              title: it.description || '（无描述）',
              meta: `${metaText}${it.created_at ? ` · ${it.created_at}` : ''}`,
              amount: formatMoney(sym, it.amount),
              paid,
              action,
            };
          })}
          empty={<EmptyState description="暂无符合条件的账目"/>}
        />
      </SurfaceCard>
    </PageShell>
  );
}
