import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import type {MenuProps} from 'antd';
import {Alert, Avatar, Button, Card, Col, Dropdown, Flex, message, Modal, Row, Tag, Typography,} from 'antd';
import {
  AccountBookOutlined,
  CrownOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  LogoutOutlined,
  MoreOutlined,
  PlusOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {apiDelete, apiFetch, apiJson, downloadAuthenticated} from '@/api/client';
import {formatMoney, parseAmount} from '@/lib/formatMoney';
import {EmptyState, LedgerList, PageShell, StatCard, SurfaceCard} from '@/components/ui';

type PartyItem = {
  id: number;
  description?: string;
  amount?: string | number;
  paid?: number;
  payer_name?: string;
  initiator_name?: string;
};

type PartyData = {
  party?: {
    name?: string;
    description?: string;
    invite_code?: string;
    archived_at?: string | null;
    timezone?: string;
    base_currency?: string;
    created_at?: string;
  };
  isOwner?: boolean;
  members?: { id: number; username: string; joined_at?: string }[];
  items?: PartyItem[];
  currencySymbol?: string;
};

type QuickActionProps = {
  to?: string;
  icon: ReactNode;
  label: string;
  accent?: string;
  onClick?: () => void;
  disabled?: boolean;
};

function QuickAction({to, icon, label, accent = '#0d9488', onClick, disabled}: QuickActionProps) {
  const inner = (
    <div
      className={`bbs-party-action${disabled ? ' bbs-party-action--disabled' : ''}`}
      style={{'--bbs-party-action-accent': accent} as React.CSSProperties}
    >
      <span className="bbs-party-action__icon">{icon}</span>
      <span className="bbs-party-action__label">{label}</span>
    </div>
  );
  if (disabled) return inner;
  if (to) return <Link to={to}>{inner}</Link>;
  return (
    <button type="button" className="bbs-party-action-wrap" onClick={onClick}>
      {inner}
    </button>
  );
}

export function PartyShowPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<PartyData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<{ ret: number; msg?: string; data?: PartyData }>(`/user/party/${partyId}`);
      if (res.ret !== 1) {
        setErr(res.msg || '无法加载');
        setData(null);
        return;
      }
      setData(res.data || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const party = data?.party;
  const archived = !!party?.archived_at;
  const sym = data?.currencySymbol || '¥';
  const isOwner = data?.isOwner === true;
  const members = data?.members || [];
  const items = data?.items || [];

  const stats = useMemo(() => {
    let total = 0;
    let unpaid = 0;
    let unpaidCount = 0;
    for (const it of items) {
      const amt = parseAmount(it.amount);
      total += amt;
      if (Number(it.paid) !== 1) {
        unpaid += amt;
        unpaidCount += 1;
      }
    }
    return {total, unpaid, unpaidCount, itemCount: items.length};
  }, [items]);

  const leave = () => {
    Modal.confirm({
      title: '确定退出该派对？',
      content: '需无未支付项目',
      onOk: async () => {
        const r = await apiFetch(`/user/party/${partyId}/leave`, {method: 'POST'});
        const out = (await r.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) {
          message.error(out.msg || '失败');
          return;
        }
        message.success(out.msg || '已退出');
        nav('/parties');
      },
    });
  };

  const del = () => {
    Modal.confirm({
      title: '确定删除派对？',
      content: '不可恢复。',
      okType: 'danger',
      onOk: async () => {
        const r = await apiDelete(`/user/party/${partyId}`);
        const out = (await r.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) {
          message.error(out.msg || '删除失败');
          return;
        }
        nav('/parties');
      },
    });
  };

  const deleteItem = (item: PartyItem) => {
    Modal.confirm({
      title: '确认删除该账目？',
      okType: 'danger',
      okText: '确认删除',
      cancelText: '取消',
      content: (
        <div>
          <Typography.Paragraph style={{marginBottom: 8}}>
            将删除账目
            {item.description ? (
              <>
                {' '}
                <Typography.Text strong>{item.description}</Typography.Text>
              </>
            ) : null}
            ，此操作不可恢复。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{marginBottom: 0}}>
            支付人 {item.payer_name || '—'} · 发起人 {item.initiator_name || '—'}
          </Typography.Paragraph>
        </div>
      ),
      onOk: async () => {
        const r = await apiDelete(`/user/item/${item.id}`);
        const out = (await r.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) {
          message.error(out.msg || '删除失败');
          return;
        }
        message.success(out.msg || '账目已删除');
        await load();
      },
    });
  };

  const archive = () => {
    Modal.confirm({
      title: '归档派对',
      content: '归档前将自动下载快照 JSON（含账目与最优支付方案），随后把所有未付项标为已付并锁定派对。继续？',
      onOk: async () => {
        const r = await apiFetch(`/user/party/${partyId}/archive`, {method: 'POST'});
        const out = (await r.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) {
          message.error(out.msg || '归档失败');
          return;
        }
        try {
          await downloadAuthenticated(`/user/party/${partyId}/archive/download`, `party_archive_${partyId}.json`);
        } catch (e) {
          message.warning(`归档成功但下载失败：${e instanceof Error ? e.message : String(e)}`);
        }
        await load();
      },
    });
  };

  const dlArch = async () => {
    try {
      await downloadAuthenticated(`/user/party/${partyId}/archive/download`, `party_archive_${partyId}.json`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const moreMenuItems: MenuProps['items'] = [
    isOwner && !archived
      ? {key: 'archive', icon: <InboxOutlined/>, label: '归档派对', onClick: archive}
      : null,
    archived ? {key: 'download', icon: <DownloadOutlined/>, label: '下载归档快照', onClick: () => void dlArch()} : null,
    isOwner && !archived
      ? {key: 'delete', icon: <DeleteOutlined/>, label: '删除派对', danger: true, onClick: del}
      : null,
    !isOwner && !archived
      ? {key: 'leave', icon: <LogoutOutlined/>, label: '退出派对', danger: true, onClick: leave}
      : null,
  ].filter(Boolean) as MenuProps['items'];

  const initial = party?.name?.charAt(0)?.toUpperCase() || 'P';

  return (
    <PageShell
      title={party?.name || '派对详情'}
      subtitle="查看成员、账目与快捷操作"
      back={{to: '/parties'}}
      loading={loading}
      error={err}
      maxWidth={1040}
      extra={
        moreMenuItems.length > 0 ? (
          <Dropdown menu={{items: moreMenuItems}} trigger={['click']}>
            <Button icon={<MoreOutlined/>}>更多</Button>
          </Dropdown>
        ) : null
      }
    >
      <Card className="bbs-party-hero" variant="borderless">
        <Flex align="flex-start" justify="space-between" wrap="wrap" gap={20}>
          <Flex align="flex-start" gap={16} style={{flex: 1, minWidth: 0}}>
            <Avatar size={56} className="bbs-party-hero__avatar">
              {initial}
            </Avatar>
            <div style={{minWidth: 0}}>
              <Flex align="center" gap={8} wrap="wrap" style={{marginBottom: 6}}>
                <Typography.Title level={4} style={{margin: 0}} ellipsis>
                  {party?.name || '—'}
                </Typography.Title>
                {archived ? <Tag color="default">已归档</Tag> : null}
                {isOwner ? (
                  <Tag icon={<CrownOutlined/>} color="gold">
                    创建者
                  </Tag>
                ) : (
                  <Tag color="processing">成员</Tag>
                )}
              </Flex>
              {party?.description ? (
                <Typography.Paragraph type="secondary" style={{marginBottom: 8}}>
                  {party.description}
                </Typography.Paragraph>
              ) : null}
              <Flex gap={8} wrap="wrap" align="center">
                {party?.invite_code ? (
                  <span className="bbs-party-invite">
                    邀请码
                    <Typography.Text code copyable={{text: party.invite_code}}>
                      {party.invite_code}
                    </Typography.Text>
                  </span>
                ) : null}
                {party?.base_currency ? (
                  <Tag bordered={false}>基准货币 {String(party.base_currency).toUpperCase()}</Tag>
                ) : null}
                {party?.timezone ? <Tag bordered={false}>{party.timezone}</Tag> : null}
              </Flex>
            </div>
          </Flex>
        </Flex>
      </Card>

      {archived ? (
        <Alert
          type="warning"
          message="该派对已归档"
          description="账目已锁定，仅可查看或下载归档快照。"
          showIcon
          style={{marginBottom: 20}}
        />
      ) : null}

      <Row gutter={[16, 16]} style={{marginBottom: 24}}>
        <Col xs={12} sm={6}>
          <StatCard title="成员" value={members.length} accent="primary"/>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="账目笔数" value={stats.itemCount} accent="info"/>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="未付笔数" value={stats.unpaidCount} accent="warning"/>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="账目总额" value={formatMoney(sym, stats.total)} accent="success"/>
        </Col>
      </Row>

      <div className="bbs-party-actions">
        <QuickAction to={`/parties/${partyId}/members`} icon={<TeamOutlined/>} label="成员" accent="#0284c7"/>
        <QuickAction
          to={`/parties/${partyId}/bestpay`}
          icon={<DollarOutlined/>}
          label="最优支付"
          accent="#d97706"
        />
        <QuickAction
          to={`/items/party/${partyId}`}
          icon={<WalletOutlined/>}
          label="收款管理"
          accent="#0d9488"
        />
        {!archived ? (
          <QuickAction
            to={`/items/add?party_id=${partyId}`}
            icon={<PlusOutlined/>}
            label="添加收款"
            accent="#16a34a"
          />
        ) : (
          <QuickAction icon={<PlusOutlined/>} label="添加收款" disabled/>
        )}
        {!archived ? (
          <QuickAction
            to={`/payment/party/${partyId}`}
            icon={<AccountBookOutlined/>}
            label="我的待付"
            accent="#7c3aed"
          />
        ) : null}
        {isOwner && !archived ? (
          <QuickAction
            to={`/parties/${partyId}/edit`}
            icon={<EditOutlined/>}
            label="编辑派对"
            accent="#64748b"
          />
        ) : null}
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <SurfaceCard
            title="账目列表"
            extra={
              <Link to={`/items/party/${partyId}`}>
                <Typography.Link>查看全部</Typography.Link>
              </Link>
            }
          >
            <LedgerList
              rows={items.map((it) => {
                const paid = Number(it.paid) === 1;
                return {
                  id: it.id,
                  title: it.description || '（无描述）',
                  meta: `支付人 ${it.payer_name || '—'} · 发起人 ${it.initiator_name || '—'}`,
                  amount: formatMoney(sym, parseAmount(it.amount)),
                  paid,
                  action:
                    isOwner && !archived ? (
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined/>}
                        onClick={() => deleteItem(it)}
                      >
                        删除
                      </Button>
                    ) : undefined,
                };
              })}
              empty={
                <EmptyState
                  description="暂无账目"
                  action={
                    !archived ? (
                      <Link to={`/items/add?party_id=${partyId}`}>
                        <Button type="primary" size="small" icon={<PlusOutlined/>}>
                          添加第一笔收款
                        </Button>
                      </Link>
                    ) : undefined
                  }
                />
              }
            />
            {stats.unpaidCount > 0 ? (
              <Typography.Text type="secondary" style={{display: 'block', marginTop: 12, fontSize: 13}}>
                未付合计 {formatMoney(sym, stats.unpaid)}
              </Typography.Text>
            ) : null}
          </SurfaceCard>
        </Col>

        <Col xs={24} lg={8}>
          <SurfaceCard
            title="成员"
            extra={
              <Link to={`/parties/${partyId}/members`}>
                <Typography.Link>全部</Typography.Link>
              </Link>
            }
          >
            {members.length === 0 ? (
              <Typography.Text type="secondary">暂无成员</Typography.Text>
            ) : (
              <ul className="bbs-party-member-list">
                {members.map((m) => (
                  <li key={m.id} className="bbs-party-member">
                    <Avatar size={36} style={{background: '#e0f2fe', color: '#0369a1', flexShrink: 0}}>
                      {m.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="bbs-party-member__info">
                      <Typography.Text strong>{m.username}</Typography.Text>
                      {m.joined_at ? (
                        <Typography.Text type="secondary" style={{fontSize: 12, display: 'block'}}>
                          {m.joined_at}
                        </Typography.Text>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>
        </Col>
      </Row>
    </PageShell>
  );
}
