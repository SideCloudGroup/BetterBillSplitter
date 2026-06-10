import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
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
      subtitle="管理各派对中成员应付给你的款项"
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

type ManageFilterKey = 'all' | 'unpaid';

type PartyItemStats = {
  total: number;
  unpaid: number;
  my_initiated: number;
  total_amount: string;
  unpaid_amount: string;
  my_initiated_amount: string;
  my_initiated_unpaid: string;
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

/**
 * 派对账目管理页（仅派对所有者可访问）
 * 非所有者访问时自动跳转至个人账目页 /parties/:id/my-items
 */
export function ItemPartyPage() {
  const {partyId} = useParams();
  const id = Number(partyId);
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [party, setParty] = useState<{
    name?: string;
    currency_symbol?: string;
    is_archived?: boolean;
  } | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [items, setItems] = useState<PartyItem[]>([]);
  const [stats, setStats] = useState<PartyItemStats | null>(null);
  const [filter, setFilter] = useState<ManageFilterKey>('all');

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

  // 非所有者跳转至个人账目页
  useEffect(() => {
    if (!loading && !err && !isOwner) {
      nav(`/parties/${id}/my-items`, {replace: true});
    }
  }, [loading, err, isOwner, id, nav]);

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

  const filteredItems = useMemo(() => {
    if (filter === 'unpaid') return items.filter((it) => Number(it.paid) === 0);
    return items;
  }, [items, filter]);

  const tabItems = [
    {
      key: 'all' as ManageFilterKey,
      label: (
        <span>
          全部账目&nbsp;
          <Badge count={items.length} size="small" showZero color="#8c8c8c"/>
        </span>
      ),
    },
    {
      key: 'unpaid' as ManageFilterKey,
      label: (
        <span>
          未结清&nbsp;
          <Badge count={stats?.unpaid ?? 0} size="small" showZero color="#faad14"/>
        </span>
      ),
    },
  ];

  const summaryRow = stats ? (
    <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16}}>
      <div style={{flex: 1, minWidth: 140}}>
        <SummaryStrip
          label={filter === 'unpaid' ? '未结清总额' : '账目总额'}
          value={formatMoney(sym, filter === 'unpaid' ? stats.unpaid_amount : stats.total_amount)}
          tone={filter === 'unpaid' ? 'warning' : 'primary'}
        />
      </div>
      {filter === 'all' ? (
        <div style={{flex: 1, minWidth: 140}}>
          <SummaryStrip label="其中未结清" value={formatMoney(sym, stats.unpaid_amount)} tone="warning"/>
        </div>
      ) : null}
    </div>
  ) : null;

  // 加载中或准备跳转时保持 loading 状态
  const redirectPending = !loading && !err && !isOwner;

  return (
    <PageShell
      title={`账目管理 — ${party?.name || ''}`}
      subtitle="查看与管理本派对的全部收付款账目"
      back={{to: `/parties/${id}`}}
      loading={loading || redirectPending}
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
        onChange={(key) => setFilter(key as ManageFilterKey)}
        items={tabItems}
        style={{marginBottom: 0}}
        tabBarStyle={{marginBottom: 0}}
      />

      <SurfaceCard style={{borderTopLeftRadius: 0, borderTopRightRadius: 0}}>
        {summaryRow}
        <LedgerList
          rows={filteredItems.map((it) => {
            const paid = Number(it.paid) === 1;

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

            const deleteBtn = !archived ? (
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

            return {
              id: it.id,
              title: it.description || '（无描述）',
              meta: `付款方：${it.payer_name} · 发起方：${it.initiator_name}${it.created_at ? ` · ${it.created_at}` : ''}`,
              amount: formatMoney(sym, it.amount),
              paid,
              action:
                markBtn || deleteBtn ? (
                  <Space size={6}>
                    {markBtn}
                    {deleteBtn}
                  </Space>
                ) : undefined,
            };
          })}
          empty={
            <EmptyState
              description="暂无账目"
              action={
                !archived ? (
                  <Link to={`/items/add?party_id=${id}`}>
                    <Button type="primary" size="small" icon={<PlusOutlined/>}>
                      添加第一笔收款
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </SurfaceCard>
    </PageShell>
  );
}
