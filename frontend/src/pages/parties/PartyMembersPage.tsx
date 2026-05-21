import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Avatar, Typography} from 'antd';
import {TeamOutlined} from '@ant-design/icons';
import {apiFetch} from '@/api/client';
import {EmptyState, PageShell, SectionTitle, SurfaceCard} from '@/components/ui';

type MemberRow = { id?: number; username?: string };

export function PartyMembersPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<MemberRow[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch(`/user/party/${partyId}/users`);
      const res = (await r.json()) as { ret: number; msg?: string; users?: MemberRow[] };
      if (res.ret !== 1) {
        setErr(res.msg || '无法加载成员');
        setUsers([]);
      } else {
        setUsers(res.users || []);
      }
      setLoading(false);
    })();
  }, [partyId]);

  return (
    <PageShell
      title="派对成员"
      subtitle={`共 ${users.length} 人`}
      back={{to: `/parties/${partyId}`}}
      loading={loading}
      error={err}
      maxWidth={560}
    >
      <SurfaceCard title={<SectionTitle icon={<TeamOutlined/>}>成员列表</SectionTitle>}>
        {users.length === 0 ? (
          <EmptyState description="暂无成员"/>
        ) : (
          <ul className="bbs-party-member-list">
            {users.map((m) => (
              <li key={m.id ?? m.username} className="bbs-party-member">
                <Avatar size={40} style={{background: '#e0f2fe', color: '#0369a1', flexShrink: 0}}>
                  {(m.username || '?').charAt(0).toUpperCase()}
                </Avatar>
                <div className="bbs-party-member__info">
                  <Typography.Text strong>{m.username || '—'}</Typography.Text>
                  {m.id != null ? (
                    <Typography.Text type="secondary" style={{fontSize: 12, display: 'block'}}>
                      ID {m.id}
                    </Typography.Text>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
