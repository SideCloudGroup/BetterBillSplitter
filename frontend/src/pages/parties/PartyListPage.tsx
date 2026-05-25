import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button, Segmented, Space, Tag} from 'antd';
import {LoginOutlined, PlusOutlined, TeamOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {EmptyState, EntityCard, PageShell, SectionTitle, SurfaceCard} from '@/components/ui';

type P = { id: number; name: string; description?: string; archived_at?: string | null };
type PartyFilter = 'all' | 'owned' | 'joined';

export function PartyListPage() {
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState<P[]>([]);
  const [joined, setJoined] = useState<P[]>([]);
  const [filter, setFilter] = useState<PartyFilter>('all');

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

  const counts = useMemo(
    () => ({
      all: owned.length + joined.length,
      owned: owned.length,
      joined: joined.length,
    }),
    [owned, joined],
  );

  const parties = useMemo(() => {
    if (filter === 'owned') return owned;
    if (filter === 'joined') return joined;
    return [...owned, ...joined];
  }, [filter, owned, joined]);

  return (
    <PageShell
      title="派对"
      subtitle="管理你创建或加入的分账派对"
      loading={loading}
      maxWidth={720}
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
      <SurfaceCard title={<SectionTitle icon={<TeamOutlined/>}>我的派对</SectionTitle>}>
        <Segmented
          block
          className="bbs-party-filter"
          value={filter}
          onChange={(v) => setFilter(v as PartyFilter)}
          options={[
            {label: `全部 (${counts.all})`, value: 'all'},
            {label: `我创建的 (${counts.owned})`, value: 'owned'},
            {label: `我加入的 (${counts.joined})`, value: 'joined'},
          ]}
        />
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
    </PageShell>
  );
}
