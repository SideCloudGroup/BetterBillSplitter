import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button, Col, Row, Space, Table, Tag} from 'antd';
import {LoginOutlined, PlusOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

type P = { id: number; name: string; description?: string; archived_at?: string | null };

export function PartyListPage() {
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState<P[]>([]);
  const [joined, setJoined] = useState<P[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{
        ret: number;
        data?: { ownedParties?: P[]; joinedParties?: P[] };
      }>('/user/party');
      if (data.ret === 1) {
        setOwned(data.data?.ownedParties || []);
        setJoined(data.data?.joinedParties || []);
      }
      setLoading(false);
    })();
  }, []);

  const cols = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (t: string, r: P) => (
        <Space>
          <Link to={`/parties/${r.id}`}>{t}</Link>
          {r.archived_at ? <Tag color="default">已归档</Tag> : null}
        </Space>
      ),
    },
    {title: '说明', dataIndex: 'description', render: (t: string) => t || '—'},
  ];

  return (
    <PageShell
      title="派对"
      subtitle="管理你创建或加入的分账派对"
      loading={loading}
      centered
      extra={
        <Space wrap>
          <Link to="/parties/create">
            <Button type="primary" icon={<PlusOutlined/>}>
              创建派对
            </Button>
          </Link>
          <Link to="/parties/join">
            <Button color="cyan" variant="solid" icon={<LoginOutlined/>}>
              加入派对
            </Button>
          </Link>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <SurfaceCard title="我创建的">
            <Table<P> rowKey="id" pagination={false} dataSource={owned} columns={cols} locale={{emptyText: '暂无'}}/>
          </SurfaceCard>
        </Col>
        <Col xs={24} lg={12}>
          <SurfaceCard title="我加入的">
            <Table<P> rowKey="id" pagination={false} dataSource={joined} columns={cols} locale={{emptyText: '暂无'}}/>
          </SurfaceCard>
        </Col>
      </Row>
    </PageShell>
  );
}
