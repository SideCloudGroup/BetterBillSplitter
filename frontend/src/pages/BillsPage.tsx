import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Alert, Badge, Button, Skeleton, Tabs} from 'antd';
import {AccountBookOutlined, PlusOutlined, WalletOutlined} from '@ant-design/icons';
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

function PaymentTabContent({rows, loading, err}: { rows: PartyRow[]; loading: boolean; err: string | null }) {
  if (err) return <Alert type="error" message={err} showIcon/>;
  if (loading) return <Skeleton active paragraph={{rows: 3}}/>;
  if (rows.length === 0) return <EmptyState description="暂无待付项目，所有款项已结清！"/>;
  return (
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
  );
}

function ItemsTabContent({rows, loading, err}: { rows: PartyRow[]; loading: boolean; err: string | null }) {
  if (err) return <Alert type="error" message={err} showIcon/>;
  if (loading) return <Skeleton active paragraph={{rows: 3}}/>;
  if (rows.length === 0) {
    return (
      <EmptyState
        description="暂无待收款记录"
        action={
          <Link to="/items/add">
            <Button type="primary" size="small" icon={<PlusOutlined/>}>
              发起收款
            </Button>
          </Link>
        }
      />
    );
  }
  return (
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
  );
}

export function BillsPage() {
  const [loading, setLoading] = useState(true);
  const [payRows, setPayRows] = useState<PartyRow[]>([]);
  const [itemRows, setItemRows] = useState<PartyRow[]>([]);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [itemErr, setItemErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [payData, itemData] = await Promise.all([
          apiJson<{ ret: number; data?: { parties?: PartyRow[] } }>('/user/payment'),
          apiJson<{ ret: number; data?: { parties?: PartyRow[] } }>('/user/item'),
        ]);
        if (payData.ret === 1) setPayRows(payData.data?.parties || []);
        else setPayErr('加载失败');
        if (itemData.ret === 1) setItemRows(itemData.data?.parties || []);
        else setItemErr('加载失败');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPayErr(msg);
        setItemErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tabItems = [
    {
      key: 'payment',
      label: (
        <span>
          待付给他人
          {payRows.length > 0 ? (
            <Badge count={payRows.length} size="small" style={{marginLeft: 6, verticalAlign: 'middle'}}/>
          ) : null}
        </span>
      ),
      children: (
        <SurfaceCard
          title={<SectionTitle icon={<WalletOutlined/>}>需要支付的款项</SectionTitle>}
          style={{borderTopLeftRadius: 0, borderTopRightRadius: 0}}
        >
          <PaymentTabContent rows={payRows} loading={loading} err={payErr}/>
        </SurfaceCard>
      ),
    },
    {
      key: 'items',
      label: (
        <span>
          他人欠我的
          {itemRows.length > 0 ? (
            <Badge count={itemRows.length} size="small" color="#52c41a"
                   style={{marginLeft: 6, verticalAlign: 'middle'}}/>
          ) : null}
        </span>
      ),
      children: (
        <SurfaceCard
          title={<SectionTitle icon={<AccountBookOutlined/>}>待收回款项</SectionTitle>}
          extra={
            <Link to="/items/add">
              <Button type="primary" size="small" icon={<PlusOutlined/>}>
                发起收款
              </Button>
            </Link>
          }
          style={{borderTopLeftRadius: 0, borderTopRightRadius: 0}}
        >
          <ItemsTabContent rows={itemRows} loading={loading} err={itemErr}/>
        </SurfaceCard>
      ),
    },
  ];

  return (
    <PageShell
      title="账单"
      subtitle="管理你需要支付给他人的款项，以及他人欠你的款项"
      maxWidth={720}
    >
      <Tabs
        defaultActiveKey="payment"
        items={tabItems}
        style={{marginBottom: 0}}
        tabBarStyle={{marginBottom: 0}}
      />
    </PageShell>
  );
}
