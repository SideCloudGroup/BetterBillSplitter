import {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Button, Table, Tag, Typography} from 'antd';
import {PlusOutlined} from '@ant-design/icons';
import {apiJson, apiPostForm} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

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
      centered
      extra={
        <Link to="/items/add">
          <Button type="primary" icon={<PlusOutlined/>}>
            添加收款
          </Button>
        </Link>
      }
    >
      <SurfaceCard>
        <Table<PartyRow>
          rowKey="id"
          pagination={false}
          dataSource={rows}
          locale={{emptyText: '暂无收款记录'}}
          columns={[
            {
              title: '派对',
              dataIndex: 'name',
              render: (t, r) => <Link to={`/items/party/${r.id}`}>{t}</Link>,
            },
            {title: '说明', dataIndex: 'description', render: (t) => t || '—'},
            {
              title: '未收回款',
              align: 'right',
              render: (_, r) => (
                <strong style={{color: '#15803d'}}>
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
    is_archived?: boolean
  } | null>(
    null,
  );
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
    await load();
  };

  const sym = party?.currency_symbol || '¥';
  const archived = party?.is_archived === true;

  return (
    <PageShell
      title={`收款 — ${party?.name || ''}`}
      subtitle={party?.description || undefined}
      back={{to: '/items'}}
      loading={loading}
      error={err}
    >
      {archived ?
        <Alert type="warning" message="该派对已归档，无法修改支付状态。" showIcon style={{marginBottom: 16}}/> : null}
      <Typography.Paragraph>
        未收回款：
        <Typography.Text strong style={{fontSize: 18, color: '#15803d', marginLeft: 8}}>
          {sym}
          {unpaid}
        </Typography.Text>
      </Typography.Paragraph>
      <SurfaceCard>
        <Table<Item>
          rowKey="id"
          pagination={false}
          dataSource={items}
          locale={{emptyText: '无条目'}}
          columns={[
            {title: '支付人', dataIndex: 'username'},
            {title: '描述', dataIndex: 'description'},
            {
              title: '金额',
              dataIndex: 'amount',
              align: 'right',
              render: (a) => `${sym}${a}`,
            },
            {
              title: '状态',
              dataIndex: 'paid',
              render: (p) => (Number(p) === 1 ? <Tag color="success">已付</Tag> : <Tag color="warning">未付</Tag>),
            },
            {
              title: '操作',
              render: (_, r) => {
                const paid = Number(r.paid) === 1;
                if (archived) return null;
                if (!paid)
                  return (
                    <Button type="primary" size="small" onClick={() => void mark(r.id, '1')}>
                      标记已付
                    </Button>
                  );
                return (
                  <Button size="small" onClick={() => void mark(r.id, '0')}>
                    标记未付
                  </Button>
                );
              },
            },
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}
