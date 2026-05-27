import {useCallback, useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Avatar, Button, message, Modal, Tag, Typography} from 'antd';
import {CrownOutlined, TeamOutlined, UserDeleteOutlined} from '@ant-design/icons';
import {apiDelete, apiFetch} from '@/api/client';
import {EmptyState, PageShell, SectionTitle, SurfaceCard} from '@/components/ui';

type MemberRow = { id?: number; username?: string };

type MembersResponse = {
  ret: number;
  msg?: string;
  users?: MemberRow[];
  is_owner?: boolean;
  owner_id?: number;
  is_archived?: boolean;
};

export function PartyMembersPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<MemberRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [archived, setArchived] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch(`/user/party/${partyId}/users`);
      const res = (await r.json()) as MembersResponse;
      if (res.ret !== 1) {
        setErr(res.msg || '无法加载成员');
        setUsers([]);
        return;
      }
      setUsers(res.users || []);
      setIsOwner(res.is_owner === true);
      setOwnerId(res.owner_id ?? null);
      setArchived(res.is_archived === true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeMember = (member: MemberRow) => {
    if (!member.id) return;
    const targetId = member.id;
    const targetName = member.username || `ID ${targetId}`;
    Modal.confirm({
      title: '确认移除该成员？',
      okType: 'danger',
      okText: '确认移除',
      cancelText: '取消',
      content: (
        <div>
          <Typography.Paragraph style={{marginBottom: 8}}>
            将把成员 <Typography.Text strong>{targetName}</Typography.Text> 从派对中移除，此操作不可撤销。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{marginBottom: 0}}>
            若该成员存在任何已发起或被指定支付/代付的账目（不论是否已付），后端将拒绝移除。
          </Typography.Paragraph>
        </div>
      ),
      onOk: async () => {
        setRemovingId(targetId);
        try {
          const r = await apiDelete(`/user/party/${partyId}/member/${targetId}`);
          const out = (await r.json()) as { ret: number; msg?: string };
          if (out.ret !== 1) {
            message.error(out.msg || '移除失败');
            return;
          }
          message.success(out.msg || '已移除成员');
          await load();
        } finally {
          setRemovingId(null);
        }
      },
    });
  };

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
            {users.map((m) => {
              const isMemberOwner = m.id != null && ownerId != null && m.id === ownerId;
              const canRemove =
                isOwner && !archived && !isMemberOwner && m.id != null;
              return (
                <li key={m.id ?? m.username} className="bbs-party-member">
                  <Avatar size={40} style={{background: '#e0f2fe', color: '#0369a1', flexShrink: 0}}>
                    {(m.username || '?').charAt(0).toUpperCase()}
                  </Avatar>
                  <div className="bbs-party-member__info" style={{flex: 1}}>
                    <Typography.Text strong>{m.username || '—'}</Typography.Text>
                    {isMemberOwner ? (
                      <Tag icon={<CrownOutlined/>} color="gold" style={{marginInlineStart: 8}}>
                        所有者
                      </Tag>
                    ) : null}
                    {m.id != null ? (
                      <Typography.Text type="secondary" style={{fontSize: 12, display: 'block'}}>
                        ID {m.id}
                      </Typography.Text>
                    ) : null}
                  </div>
                  {canRemove ? (
                    <Button
                      danger
                      size="small"
                      icon={<UserDeleteOutlined/>}
                      loading={removingId === m.id}
                      onClick={() => removeMember(m)}
                    >
                      移除
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
