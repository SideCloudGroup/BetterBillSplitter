import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button, Col, Row, Space, Tag} from 'antd';
import {LoginOutlined, PlusOutlined, TeamOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {EmptyState, EntityCard, PageShell, SectionTitle, SurfaceCard} from '@/components/ui';

type P = { id: number; name: string; description?: string; archived_at?: string | null };

function PartyGroup({title, parties}: { title: string; parties: P[] }) {
  return (
    <SurfaceCard title={<SectionTitle icon={<TeamOutlined/>}>{title}</SectionTitle>}>
      {parties.length === 0 ? (
        <EmptyState description="暂无派对"/>
      ) : (
        <div className="bbs-entity-list">
          {parties.map((p) => (
            <EntityCard
              key={p.id}
              to={`/parties/${p.id}`}
              title={p.name}
              description={p.description}
              badge={p.archived_at ? <Tag color="default">已归档</Tag> : null}
              icon={<TeamOutlined/>}
            />
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

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

  return (
    <PageShell
      title="派对"
      subtitle="管理你创建或加入的分账派对"
      loading={loading}
      maxWidth={1040}
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
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <PartyGroup title="我创建的" parties={owned}/>
        </Col>
        <Col xs={24} lg={12}>
          <PartyGroup title="我加入的" parties={joined}/>
        </Col>
      </Row>
    </PageShell>
  );
}
