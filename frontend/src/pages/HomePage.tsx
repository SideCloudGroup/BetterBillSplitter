import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button, Col, Flex, Row, Space, Typography} from 'antd';
import {AccountBookOutlined, LoginOutlined, PlusOutlined, TeamOutlined, UnorderedListOutlined} from '@ant-design/icons';
import {apiJson} from '@/api/client';
import {PartyJoinModal} from '@/components/PartyJoinModal';
import {
  type ActivityItem,
  ActivityTimeline,
  EmptyState,
  EntityCard,
  PageShell,
  SectionTitle,
  StatCard,
  SurfaceCard,
} from '@/components/ui';
import homeMascotLeft from '@/assets/imgs/taffynya_agadgqyaaofp2fq.png';
import homeMascotRight from '@/assets/imgs/taffynya_agadvgmaauwawfq.png';

type Row = { id: number; name: string; description?: string };

const homeTitle = (
  <Flex align="center" justify="center" wrap="wrap" gap={16} className="bbs-home-hero">
    <img src={homeMascotLeft} alt="" className="bbs-home-mascot" width={64} height={64}/>
    <Typography.Title level={3} style={{margin: 0}}>
      概览
    </Typography.Title>
    <img src={homeMascotRight} alt="" className="bbs-home-mascot" width={64} height={64}/>
  </Flex>
);

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, string | number>>({});
  const [recent, setRecent] = useState<Row[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [sym, setSym] = useState('¥');
  const [code, setCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{
          ret: number;
          data?: {
            stats?: Record<string, string | number>;
            recentParties?: Row[];
            recentActivity?: ActivityItem[];
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
        setActivity(data.data?.recentActivity || []);
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
      title={homeTitle}
      subtitle="查看派对与账目汇总，快速进入常用操作"
      loading={loading}
      error={err}
      maxWidth={1040}
      extra={
        <Space wrap>
          <Button icon={<LoginOutlined/>} onClick={() => setJoinOpen(true)}>
            加入派对
          </Button>
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
      <PartyJoinModal open={joinOpen} onClose={() => setJoinOpen(false)}/>

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

      <SurfaceCard
        style={{marginTop: 24}}
        title={<SectionTitle icon={<UnorderedListOutlined/>}>最近动态</SectionTitle>}
      >
        <ActivityTimeline items={activity}/>
      </SurfaceCard>

      <SurfaceCard
        style={{marginTop: 24}}
        title={<SectionTitle icon={<TeamOutlined/>}>最近派对</SectionTitle>}
        extra={
          <Link to="/parties">
            <Button type="link" size="small">
              全部派对
            </Button>
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            description="暂无派对，创建一个或加入已有派对开始分账"
            action={
              <Space wrap>
                <Button type="primary" size="small" icon={<PlusOutlined/>} onClick={() => setJoinOpen(true)}>
                  加入派对
                </Button>
                <Link to="/parties/create">
                  <Button size="small" icon={<PlusOutlined/>}>
                    创建派对
                  </Button>
                </Link>
              </Space>
            }
          />
        ) : (
          <div className="bbs-entity-list">
            {recent.map((r) => (
              <EntityCard
                key={r.id}
                to={`/parties/${r.id}`}
                title={r.name}
                description={r.description}
                icon={<TeamOutlined/>}
              />
            ))}
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
