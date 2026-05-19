import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Table} from 'antd';
import {apiFetch} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

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
    <PageShell title="派对成员" back={{to: `/parties/${partyId}`}} loading={loading} error={err} layout="narrow"
               maxWidth={560}>
      <SurfaceCard>
        <Table
          rowKey={(r) => String(r.id ?? r.username)}
          pagination={false}
          dataSource={users}
          locale={{emptyText: '暂无成员'}}
          columns={[
            {title: 'ID', dataIndex: 'id', render: (t) => t ?? '—'},
            {title: '用户名', dataIndex: 'username', render: (t) => t ?? '—'},
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}
