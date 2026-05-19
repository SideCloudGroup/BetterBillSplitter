import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {Alert, Button, Col, message, Modal, Row, Space, Table, Tag, Typography} from 'antd';
import {
  DeleteOutlined,
  DollarOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {apiDelete, apiFetch, apiJson, downloadAuthenticated} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

export function PartyShowPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    party?: { name?: string; description?: string; invite_code?: string; archived_at?: string | null };
    isOwner?: boolean;
    members?: { id: number; username: string; joined_at?: string }[];
    items?: {
      id: number;
      description?: string;
      amount?: string | number;
      paid?: number;
      payer_name?: string;
      initiator_name?: string;
    }[];
    currencySymbol?: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<{
        ret: number;
        msg?: string;
        data?: typeof data;
      }>(`/user/party/${partyId}`);
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
  };

  useEffect(() => {
    void load();
  }, [partyId]);

  const party = data?.party;
  const archived = !!party?.archived_at;
  const sym = data?.currencySymbol || '¥';
  const isOwner = data?.isOwner === true;

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

  const archive = () => {
    Modal.confirm({
      title: '归档派对',
      content: '归档将把所有未支付项标记为已付并锁定派对，继续？',
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

  return (
    <PageShell
      centered
      title={party?.name || '派对'}
      subtitle={
        <>
          {party?.description || null}
          {party?.invite_code ? (
            <Typography.Paragraph style={{marginTop: 8, marginBottom: 0}}>
              邀请码：<Typography.Text code copyable>{party.invite_code}</Typography.Text>
            </Typography.Paragraph>
          ) : null}
        </>
      }
      back={{to: '/parties'}}
      loading={loading}
      error={err}
      extra={
        <Space wrap>
          <Link to={`/parties/${partyId}/members`}>
            <Button icon={<TeamOutlined/>}>成员</Button>
          </Link>
          {isOwner && !archived ? (
            <Link to={`/parties/${partyId}/edit`}>
              <Button type="primary" icon={<EditOutlined/>}>
                编辑
              </Button>
            </Link>
          ) : null}
          <Link to={`/parties/${partyId}/bestpay`}>
            <Button color="gold" variant="solid" icon={<DollarOutlined/>}>
              最优支付
            </Button>
          </Link>
          {isOwner && !archived ? (
            <Button icon={<InboxOutlined/>} onClick={archive}>
              归档
            </Button>
          ) : null}
          {archived ? (
            <Button icon={<DownloadOutlined/>} onClick={() => void dlArch()}>
              下载快照
            </Button>
          ) : null}
          {isOwner && !archived ? (
            <Button danger icon={<DeleteOutlined/>} onClick={del}>
              删除
            </Button>
          ) : null}
          {!isOwner && !archived ? (
            <Button icon={<LogoutOutlined/>} onClick={leave}>
              退出
            </Button>
          ) : null}
        </Space>
      }
    >
      {archived ? <Alert type="warning" message="该派对已归档。" showIcon style={{marginBottom: 16}}/> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <SurfaceCard title="成员">
            <Table
              rowKey={(r) => String(r.username)}
              pagination={false}
              dataSource={data?.members || []}
              locale={{emptyText: '无'}}
              columns={[
                {title: '用户', dataIndex: 'username'},
                {title: '加入时间', dataIndex: 'joined_at', render: (t) => t || '—'},
              ]}
            />
          </SurfaceCard>
        </Col>
        <Col xs={24}>
          <SurfaceCard title="账目">
            <Table
              rowKey="id"
              pagination={false}
              dataSource={data?.items || []}
              locale={{emptyText: '暂无'}}
              columns={[
                {title: '支付人', dataIndex: 'payer_name', render: (t) => t || ''},
                {title: '发起人', dataIndex: 'initiator_name', render: (t) => t || ''},
                {title: '描述', dataIndex: 'description', render: (t) => t || ''},
                {
                  title: '金额',
                  dataIndex: 'amount',
                  align: 'right',
                  render: (a) => `${sym}${a ?? ''}`,
                },
                {
                  title: '状态',
                  dataIndex: 'paid',
                  render: (p) => (Number(p) === 1 ? <Tag color="success">已付</Tag> : <Tag color="warning">未付</Tag>),
                },
              ]}
            />
          </SurfaceCard>
        </Col>
      </Row>
    </PageShell>
  );
}
