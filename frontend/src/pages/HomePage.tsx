import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button, Col, Row, Space, Table} from 'antd';
import {AccountBookOutlined, PlusOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {PageShell, StatCard, SurfaceCard} from '@/components/ui';

type Row = { id: number; name: string; description?: string };

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, string | number>>({});
  const [recent, setRecent] = useState<Row[]>([]);
  const [sym, setSym] = useState('¥');
  const [code, setCode] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{
          ret: number;
          data?: {
            stats?: Record<string, string | number>;
            recentParties?: Row[];
            currencySymbol?: string;
            currencyCode?: string;
          };
        }>('/user');
        if (data.ret !== 1) {
          setErr('无法加载');
          return;
        }
        setStats(data.data?.stats || {});
        setRecent(data.data?.recentParties || []);
        setSym(data.data?.currencySymbol || '¥');
        setCode(String(data.data?.currencyCode || ''));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageShell
      title="概览"
      subtitle="查看派对与账目汇总，快速进入常用操作"
      loading={loading}
      error={err}
      centered
      extra={
        <Space wrap>
          <Link to="/parties/create">
            <Button type="primary" icon={<PlusOutlined/>}>
              创建派对
            </Button>
          </Link>
          <Link to="/items/add">
            <Button color="cyan" variant="solid" icon={<AccountBookOutlined/>}>
              添加收款
            </Button>
          </Link>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="派对数" value={stats.total_parties ?? '—'} accent="primary"/>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={`待付（${code || '—'}）`}
            value={`${sym}${stats.total_unpaid_amount ?? '—'}`}
            accent="warning"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="待收" value={`${sym}${stats.total_receivable_amount ?? '—'}`} accent="success"/>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="账目条目" value={stats.total_items ?? '—'} accent="info"/>
        </Col>
      </Row>
      <SurfaceCard title="最近派对" style={{marginTop: 24}}>
        <Table<Row>
          rowKey="id"
          pagination={false}
          dataSource={recent}
          locale={{emptyText: '暂无派对，创建一个开始分账吧'}}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (t, r) => <Link to={`/parties/${r.id}`}>{t}</Link>,
            },
            {title: '说明', dataIndex: 'description', render: (t) => t || '—'},
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}
