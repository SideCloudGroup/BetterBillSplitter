import {Fragment, useCallback, useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  App,
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Typography,
} from 'antd';
import {DollarOutlined, SettingOutlined, TeamOutlined, UserAddOutlined, UserOutlined} from '@ant-design/icons';
import {apiFetch, apiJson, apiPostJson} from '@/api/client';
import {PageShell, StatCard, SurfaceCard} from '@/components/ui';

type AdminMetrics = {
  totalUsers?: number;
  adminUsers?: number;
  regularUsers?: number;
  activeUsers?: number;
  userActivityRate?: number;
  totalParties?: number;
  activeParties?: number;
  partyActivityRate?: number;
  totalItems?: number;
  paidItems?: number;
  unpaidItems?: number;
  paymentCompletionRate?: number;
};

export function AdminHomePage() {
  const {message: messageApi} = App.useApp();
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{ ret: number; data?: AdminMetrics }>('/admin');
      if (data.ret !== 1) {
        messageApi.error('无权限');
        nav('/');
        return;
      }
      setMetrics(data.data || {});
      setLoading(false);
    })();
  }, [messageApi, nav]);

  return (
    <PageShell
      title="管理概览"
      subtitle="系统统计与后台入口"
      loading={loading}
      maxWidth={1040}
      extra={
        <Space wrap>
          <Link to="/admin/users">
            <Button color="purple" variant="solid" icon={<UserOutlined/>}>
              用户
            </Button>
          </Link>
          <Link to="/admin/parties">
            <Button color="cyan" variant="solid" icon={<TeamOutlined/>}>
              派对
            </Button>
          </Link>
          <Link to="/admin/currencies">
            <Button color="gold" variant="solid" icon={<DollarOutlined/>}>
              货币
            </Button>
          </Link>
          <Link to="/admin/settings">
            <Button icon={<SettingOutlined/>}>设置</Button>
          </Link>
        </Space>
      }
    >
      <SurfaceCard title="用户" style={{marginBottom: 16}}>
        <Typography.Paragraph type="secondary">
          活跃用户指最近 30 天内作为发起人或付款人参与过账目的用户；活跃率为活跃用户占全部用户的比例。
        </Typography.Paragraph>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}><StatCard title="用户总数" value={metrics.totalUsers ?? 0} suffix="人"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="普通用户" value={metrics.regularUsers ?? 0} suffix="人" accent="info"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="管理员" value={metrics.adminUsers ?? 0} suffix="人" accent="warning"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="近 30 天活跃用户" value={metrics.activeUsers ?? 0} suffix={`人 · ${metrics.userActivityRate ?? 0}%`}/></Col>
        </Row>
      </SurfaceCard>

      <SurfaceCard title="派对" style={{marginBottom: 16}}>
        <Typography.Paragraph type="secondary">
          活跃派对指未归档且至少有 2 名成员的派对；活跃率为活跃派对占全部派对的比例。
        </Typography.Paragraph>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12}><StatCard title="派对总数" value={metrics.totalParties ?? 0} suffix="个" accent="info"/></Col>
          <Col xs={24} sm={12}><StatCard title="活跃派对" value={metrics.activeParties ?? 0} suffix={`个 · ${metrics.partyActivityRate ?? 0}%`} accent="success"/></Col>
        </Row>
      </SurfaceCard>

      <SurfaceCard title="账目">
        <Typography.Paragraph type="secondary">
          支付完成率按已支付账目笔数计算，不代表金额比例。
        </Typography.Paragraph>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}><StatCard title="账目总数" value={metrics.totalItems ?? 0} suffix="笔" accent="info"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="已支付账目" value={metrics.paidItems ?? 0} suffix="笔" accent="success"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="待支付账目" value={metrics.unpaidItems ?? 0} suffix="笔" accent="warning"/></Col>
          <Col xs={24} sm={12} lg={6}><StatCard title="支付完成率" value={metrics.paymentCompletionRate ?? 0} suffix="%"/></Col>
        </Row>
      </SurfaceCard>
    </PageShell>
  );
}

type AdminUserOption = { id: number; username: string; is_admin?: boolean };
type AdminPartyOption = {
  id: number;
  name: string;
  owner_name?: string;
  member_count?: number;
  archived_at?: string | null;
};

function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function AdminForceJoinCard({onJoined}: { onJoined: () => Promise<void> }) {
  const {message: messageApi, modal} = App.useApp();
  const [userQuery, setUserQuery] = useState('');
  const [partyQuery, setPartyQuery] = useState('');
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [parties, setParties] = useState<AdminPartyOption[]>([]);
  const [userId, setUserId] = useState<number>();
  const [partyId, setPartyId] = useState<number>();
  const [userLoading, setUserLoading] = useState(false);
  const [partyLoading, setPartyLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debouncedUserQuery = useDebouncedValue(userQuery.trim());
  const debouncedPartyQuery = useDebouncedValue(partyQuery.trim());
  const userSearching = userLoading || userQuery.trim() !== debouncedUserQuery;
  const partySearching = partyLoading || partyQuery.trim() !== debouncedPartyQuery;

  useEffect(() => {
    const query = debouncedUserQuery;
    if (!query) {
      setUsers([]);
      setUserLoading(false);
      return;
    }
    const controller = new AbortController();
    setUserLoading(true);
    void (async () => {
      try {
        const data = await apiJson<{ ret: number; data?: { users?: AdminUserOption[] } }>(
          `/admin/user/search?q=${encodeURIComponent(query)}`,
          {signal: controller.signal},
        );
        if (!controller.signal.aborted) setUsers(data.ret === 1 ? data.data?.users || [] : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setUsers([]);
          messageApi.error(error instanceof Error ? error.message : '搜索用户失败');
        }
      } finally {
        if (!controller.signal.aborted) setUserLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [debouncedUserQuery]);

  useEffect(() => {
    const query = debouncedPartyQuery;
    if (!query) {
      setParties([]);
      setPartyLoading(false);
      return;
    }
    const controller = new AbortController();
    setPartyLoading(true);
    void (async () => {
      try {
        const data = await apiJson<{ ret: number; data?: { parties?: AdminPartyOption[] } }>(
          `/admin/party/search?q=${encodeURIComponent(query)}`,
          {signal: controller.signal},
        );
        if (!controller.signal.aborted) setParties(data.ret === 1 ? data.data?.parties || [] : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setParties([]);
          messageApi.error(error instanceof Error ? error.message : '搜索派对失败');
        }
      } finally {
        if (!controller.signal.aborted) setPartyLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [debouncedPartyQuery]);

  const forceJoin = async () => {
    if (userId == null || partyId == null) {
      messageApi.warning('请先搜索并选择用户和派对');
      return;
    }
    const user = users.find((item) => item.id === userId);
    const party = parties.find((item) => item.id === partyId);
    modal.confirm({
      title: '确认强制添加成员？',
      content: `将用户“${user?.username || userId}”加入派对“${party?.name || partyId}”。`,
      okText: '确认加入',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true);
        try {
          const response = await apiPostJson('/admin/party/force-join', {user_id: userId, party_id: partyId});
          const result = (await response.json()) as { ret: number; msg?: string };
          if (result.ret !== 1) {
            messageApi.error(result.msg || '添加失败');
            return;
          }
          messageApi.success(result.msg || '成员已添加');
          setUserId(undefined);
          setUserQuery('');
          await onJoined();
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  return (
    <SurfaceCard title="强制添加派对成员" style={{marginBottom: 16}}>
      <Typography.Paragraph type="secondary">
        分别输入用户名或用户 ID、派对名称或派对 ID，搜索并选择后添加。已归档派对不可修改。
      </Typography.Paragraph>
      <Row gutter={[12, 12]} align="bottom">
        <Col xs={24} md={9}>
          <Typography.Text strong>用户</Typography.Text>
          <Select<number>
            showSearch
            allowClear
            value={userId}
            searchValue={userQuery}
            placeholder="搜索用户名或用户 ID"
            filterOption={false}
            loading={userSearching}
            notFoundContent={userSearching ? <Spin size="small"/> : userQuery.trim() ? '没有匹配用户' : '请先输入搜索内容'}
            options={users.map((user) => ({
              value: user.id,
              label: `${user.username}（ID ${user.id}${user.is_admin ? '，管理员' : ''}）`,
            }))}
            onSearch={(value) => {
              setUserQuery(value);
              if (value.trim() !== debouncedUserQuery) setUsers([]);
            }}
            onClear={() => {
              setUserQuery('');
              setUsers([]);
            }}
            onChange={(value) => setUserId(value)}
            style={{display: 'block', marginTop: 8}}
          />
        </Col>
        <Col xs={24} md={9}>
          <Typography.Text strong>派对</Typography.Text>
          <Select<number>
            showSearch
            allowClear
            value={partyId}
            searchValue={partyQuery}
            placeholder="搜索派对名称或派对 ID"
            filterOption={false}
            loading={partySearching}
            notFoundContent={partySearching ? <Spin size="small"/> : partyQuery.trim() ? '没有匹配派对' : '请先输入搜索内容'}
            options={parties.map((party) => ({
              value: party.id,
              disabled: party.archived_at != null,
              label: `${party.name}（ID ${party.id}，${party.member_count ?? 0} 人${party.archived_at ? '，已归档' : ''}）`,
            }))}
            onSearch={(value) => {
              setPartyQuery(value);
              if (value.trim() !== debouncedPartyQuery) setParties([]);
            }}
            onClear={() => {
              setPartyQuery('');
              setParties([]);
            }}
            onChange={(value) => setPartyId(value)}
            style={{display: 'block', marginTop: 8}}
          />
        </Col>
        <Col xs={24} md={6}>
          <Button type="primary" icon={<UserAddOutlined/>} loading={submitting} block onClick={() => void forceJoin()}>
            添加成员
          </Button>
        </Col>
      </Row>
    </SurfaceCard>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<{ id: number; username: string; is_admin: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pwds, setPwds] = useState<Record<number, string>>({});

  const load = async () => {
    const data = await apiJson<{ ret: number; data?: { users?: typeof users } }>('/admin/user');
    if (data.ret === 1) setUsers(data.data?.users || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const changePwd = async (uid: number, np: string) => {
    const res = await apiPostJson('/admin/user/change-password', {user_id: uid, new_password: np});
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret === 1) message.success(out.msg || '成功');
    else message.error(out.msg || '失败');
  };

  const toggle = async (uid: number, cur: boolean) => {
    const res = await apiPostJson('/admin/user/toggle-admin', {user_id: uid, set_as_admin: !cur});
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret === 1) {
      message.success(out.msg || '成功');
      await load();
    } else message.error(out.msg || '失败');
  };

  return (
    <PageShell title="用户管理" back={{to: '/admin'}} loading={loading} maxWidth={1200}>
      <SurfaceCard>
        <Table
          rowKey="id"
          dataSource={users}
          pagination={{pageSize: 10, showSizeChanger: false}}
          columns={[
            {title: 'ID', dataIndex: 'id', width: 72},
            {title: '用户名', dataIndex: 'username'},
            {
              title: '角色',
              dataIndex: 'is_admin',
              render: (a: boolean) => (a ? <Typography.Text strong>管理员</Typography.Text> : '用户'),
            },
            {
              title: '操作',
              render: (_, u) => (
                <Space wrap>
                  <Input.Password
                    placeholder="新密码"
                    style={{width: 160}}
                    value={pwds[u.id] || ''}
                    onChange={(e) => setPwds((p) => ({...p, [u.id]: e.target.value}))}
                  />
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      const np = pwds[u.id]?.trim();
                      if (!np) {
                        message.warning('请输入新密码');
                        return;
                      }
                      void changePwd(u.id, np);
                    }}
                  >
                    改密
                  </Button>
                  <Button
                    size="small"
                    color={u.is_admin ? 'default' : 'purple'}
                    variant={u.is_admin ? 'outlined' : 'solid'}
                    onClick={() => void toggle(u.id, u.is_admin)}
                  >
                    {u.is_admin ? '取消管理员' : '设为管理员'}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}

export function AdminPartiesPage() {
  const [rows, setRows] = useState<{ id: number; name: string; member_count?: number; base_currency?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiJson<{ ret: number; data?: { parties?: typeof rows } }>('/admin/party');
    if (data.ret === 1) setRows(data.data?.parties || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="派对管理" back={{to: '/admin'}} loading={loading} maxWidth={1200}>
      <AdminForceJoinCard onJoined={load}/>
      <SurfaceCard>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{pageSize: 10}}
          columns={[
            {title: 'ID', dataIndex: 'id', width: 72},
            {title: '名称', dataIndex: 'name'},
            {title: '成员数', dataIndex: 'member_count'},
            {title: '基础货币', dataIndex: 'base_currency'},
            {
              title: '操作',
              render: (_, p) => (
                <Link to={`/admin/parties/${p.id}/members`}>
                  <Button size="small" type="link">
                    成员
                  </Button>
                </Link>
              ),
            },
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}

export function AdminPartyMembersPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const [party, setParty] = useState<{ name?: string } | null>(null);
  const [members, setMembers] = useState<{ username: string; is_owner?: number }[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{
        ret: number;
        data?: { party?: { name?: string }; members?: typeof members; stats?: Record<string, unknown> };
      }>(`/admin/party/${partyId}/members`);
      if (data.ret === 1) {
        setParty(data.data?.party || null);
        setMembers(data.data?.members || []);
        setStats(data.data?.stats || {});
      }
      setLoading(false);
    })();
  }, [partyId]);

  return (
    <PageShell title={`成员 — ${party?.name || ''}`} back={{to: '/admin/parties'}} loading={loading}>
      <SurfaceCard title="账目统计" style={{marginBottom: 16}}>
        <Typography.Paragraph type="secondary">完成率按已支付账目笔数计算。</Typography.Paragraph>
        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}><StatCard title="账目总数" value={Number(stats.total_items ?? 0)} accent="info"/></Col>
          <Col xs={12} md={6}><StatCard title="已支付" value={Number(stats.paid_items ?? 0)} accent="success"/></Col>
          <Col xs={12} md={6}><StatCard title="待支付" value={Number(stats.unpaid_items ?? 0)} accent="warning"/></Col>
          <Col xs={12} md={6}><StatCard title="支付完成率" value={Number(stats.payment_completion_rate ?? 0)} suffix="%"/></Col>
        </Row>
      </SurfaceCard>
      <SurfaceCard>
        <Table
          rowKey={(r) => r.username}
          dataSource={members}
          pagination={false}
          columns={[
            {title: '用户', dataIndex: 'username'},
            {title: '角色', dataIndex: 'is_owner', render: (o) => (o ? '所有者' : '成员')},
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}

export function AdminCurrenciesPage() {
  const [rows, setRows] = useState<{ code: string; name: string; symbol: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await apiJson<{
      ret: number;
      data?: { currencies?: Record<string, { name?: string; symbol?: string }> }
    }>(
      '/admin/currencies',
    );
    if (data.ret === 1) {
      const c = data.data?.currencies || {};
      setRows(
        Object.entries(c).map(([code, meta]) => ({
          code,
          name: meta.name || '',
          symbol: meta.symbol || '',
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async (v: { code: string; name: string; name_en?: string; symbol: string }) => {
    const res = await apiPostJson('/admin/currency/add', {
      code: v.code.trim(),
      name: v.name.trim(),
      name_en: (v.name_en || '').trim(),
      symbol: v.symbol.trim(),
      decimal_places: 2,
    });
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret === 1) {
      message.success(out.msg || '成功');
      await load();
    } else message.error(out.msg || '失败');
  };

  const del = (code: string) => {
    Modal.confirm({
      title: `删除货币 ${code}？`,
      okType: 'danger',
      onOk: async () => {
        const res = await apiFetch(`/admin/currency/delete?code=${encodeURIComponent(code)}`, {method: 'DELETE'});
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret === 1) {
          message.success(out.msg || '成功');
          await load();
        } else message.error(out.msg || '失败');
      },
    });
  };

  return (
    <PageShell title="货币管理" back={{to: '/admin'}} loading={loading}>
      <SurfaceCard title="新增货币" style={{marginBottom: 16}}>
        <Form layout="inline" className="bbs-admin-inline-form" onFinish={add} style={{gap: 8, flexWrap: 'wrap'}}>
          <Form.Item name="code" rules={[{required: true}]}>
            <Input placeholder="代码 cny"/>
          </Form.Item>
          <Form.Item name="name" rules={[{required: true}]}>
            <Input placeholder="名称"/>
          </Form.Item>
          <Form.Item name="name_en">
            <Input placeholder="英文名"/>
          </Form.Item>
          <Form.Item name="symbol" rules={[{required: true}]}>
            <Input placeholder="符号"/>
          </Form.Item>
          <Button type="primary" htmlType="submit">
            添加
          </Button>
        </Form>
      </SurfaceCard>
      <SurfaceCard>
        <Table
          rowKey="code"
          dataSource={rows}
          pagination={false}
          columns={[
            {title: '代码', dataIndex: 'code'},
            {title: '名称', dataIndex: 'name'},
            {title: '符号', dataIndex: 'symbol'},
            {
              title: '操作',
              render: (_, r) => (
                <Space>
                  <Link to={`/admin/currencies/edit/${encodeURIComponent(r.code)}`}>
                    <Button size="small">编辑</Button>
                  </Link>
                  <Button size="small" danger onClick={() => del(r.code)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </SurfaceCard>
    </PageShell>
  );
}

export function AdminCurrencyEditPage() {
  const {code} = useParams();
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [fatal, setFatal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch(`/admin/currency/edit-form?code=${encodeURIComponent(code || '')}`);
      const raw = (await res.json()) as { ret: number; msg?: string; data?: { currency?: Record<string, unknown> } };
      if (raw.ret !== 1 || !raw.data?.currency) {
        setFatal(raw.msg || '加载失败');
        setLoading(false);
        return;
      }
      const c = raw.data.currency as {
        code: string;
        name: string;
        name_en?: string;
        symbol: string;
        decimal_places?: number;
      };
      form.setFieldsValue({
        code: c.code,
        name: c.name,
        name_en: c.name_en || c.code,
        symbol: c.symbol,
        decimal_places: c.decimal_places ?? 2,
      });
      setLoading(false);
    })();
  }, [code, form]);

  const onFinish = async (v: {
    code: string;
    name: string;
    name_en: string;
    symbol: string;
    decimal_places: number
  }) => {
    const r = await apiPostJson('/admin/currency/edit', {
      code: v.code,
      name: v.name,
      name_en: v.name_en,
      symbol: v.symbol,
      decimal_places: Number(v.decimal_places),
    });
    const out = (await r.json()) as { ret: number; msg?: string };
    if (out.ret === 1) {
      message.success(out.msg || '成功');
      nav('/admin/currencies');
    } else message.error(out.msg || '失败');
  };

  return (
    <PageShell title={`编辑货币 — ${code}`} back={{to: '/admin/currencies'}} loading={loading} error={fatal}
               layout="narrow" maxWidth={520}>
      <SurfaceCard>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="代码">
            <Input value={code} disabled/>
          </Form.Item>
          <Form.Item name="code" hidden>
            <Input/>
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{required: true}]}>
            <Input/>
          </Form.Item>
          <Form.Item name="name_en" label="英文名">
            <Input/>
          </Form.Item>
          <Form.Item name="symbol" label="符号" rules={[{required: true}]}>
            <Input/>
          </Form.Item>
          <Form.Item name="decimal_places" label="小数位" rules={[{required: true}]}>
            <InputNumber min={0} max={8} style={{width: '100%'}}/>
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Form>
      </SurfaceCard>
    </PageShell>
  );
}

type SettingFieldDef = {
  type: 'text' | 'switch' | 'select';
  name: string;
  key: string;
  description?: string;
  options?: Record<string, string>;
};

type SettingsSchema = Record<string, Record<string, SettingFieldDef>>;

const SETTING_CATEGORY_TITLES: Record<string, string> = {
  general: '常规',
  captcha: '验证码',
};

function settingFieldsFromSchema(schema: SettingsSchema): SettingFieldDef[] {
  return Object.values(schema).flatMap((group) => Object.values(group));
}

function formValuesFromSettingData(
  schema: SettingsSchema,
  data: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of settingFieldsFromSchema(schema)) {
    const raw = data[field.key];
    if (field.type === 'switch') {
      out[field.key] = raw === true || raw === 1 || raw === '1' || raw === 'on';
    } else if (field.type === 'select') {
      const s = raw == null ? '' : String(raw);
      const valid = field.options && s !== '' && s in field.options;
      out[field.key] = valid ? s : (field.options ? Object.keys(field.options)[0] : s);
    } else {
      out[field.key] = raw == null ? '' : String(raw);
    }
  }
  return out;
}

function payloadFromFormValues(
  schema: SettingsSchema,
  vals: Record<string, string | boolean>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of settingFieldsFromSchema(schema)) {
    const v = vals[field.key];
    if (field.type === 'switch') {
      out[field.key] = v ? '1' : '0';
    } else {
      out[field.key] = v == null ? '' : String(v);
    }
  }
  return out;
}

function SettingFieldRow({
                           field,
                           value,
                           onChange,
                         }: {
  field: SettingFieldDef;
  value: string | boolean | undefined;
  onChange: (key: string, next: string | boolean) => void;
}) {
  const desc = field.description?.trim();
  return (
    <div className="bbs-setting-field">
      <Typography.Text strong>{field.name}</Typography.Text>
      {desc ? (
        <Typography.Paragraph type="secondary" style={{margin: '4px 0 8px', fontSize: 13}}>
          {desc}
        </Typography.Paragraph>
      ) : null}
      {field.type === 'switch' ? (
        <Switch
          checked={value === true || value === '1'}
          checkedChildren="开"
          unCheckedChildren="关"
          onChange={(checked) => onChange(field.key, checked)}
        />
      ) : field.type === 'select' && field.options ? (
        <Select
          style={{width: '100%'}}
          value={value == null || value === '' ? undefined : String(value)}
          options={Object.entries(field.options).map(([v, label]) => ({value: v, label}))}
          placeholder="请选择"
          onChange={(v) => onChange(field.key, v)}
        />
      ) : (
        <Input
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
    </div>
  );
}

function parseAdminSettingsResponse(raw: {
  ret?: number | string;
  msg?: string;
  data?: {
    settings?: SettingsSchema;
    settingData?: Record<string, string | number | boolean | null>;
    categories?: string[];
  };
}): { schema: SettingsSchema; categories: string[]; values: Record<string, string | boolean> } | null {
  if (Number(raw.ret) !== 1 || !raw.data) return null;

  const settings = raw.data.settings;
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') return null;

  const settingData = raw.data.settingData ?? {};
  const schemaKeys = Object.keys(settings);
  const fromApi = Array.isArray(raw.data.categories) ? raw.data.categories : [];
  const categories = (fromApi.length > 0 ? fromApi : schemaKeys).filter(
    (cat) => settings[cat] != null && !Array.isArray(settings[cat]),
  );

  return {
    schema: settings,
    categories: categories.length > 0 ? categories : schemaKeys,
    values: formValuesFromSettingData(settings, settingData),
  };
}

export function AdminSettingsPage() {
  const {message} = App.useApp();
  const [schema, setSchema] = useState<SettingsSchema>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldCount, setFieldCount] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<{
          ret: number | string;
          msg?: string;
          data?: {
            settings?: SettingsSchema;
            settingData?: Record<string, string | number | boolean | null>;
            categories?: string[];
          };
        }>('/admin/setting');

        const parsed = parseAdminSettingsResponse(data);
        if (!parsed) {
          const hint = data.data ? `data 键: ${Object.keys(data.data).join(', ')}` : '无 data 字段';
          setLoadError(data.msg || `解析设置失败（${hint}）`);
          return;
        }

        const count = settingFieldsFromSchema(parsed.schema).length;
        if (count === 0) {
          setLoadError('配置 schema 为空');
          return;
        }

        setSchema(parsed.schema);
        setCategories(parsed.categories);
        setValues(parsed.values);
        setFieldCount(count);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : '加载设置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patchValue = (key: string, next: string | boolean) => {
    setValues((prev) => ({...prev, [key]: next}));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiPostJson('/admin/setting', payloadFromFormValues(schema, values));
      const out = (await res.json()) as { ret: number | string; msg?: string; error?: string };
      if (!res.ok) {
        message.error(out.msg || out.error || `请求失败 (${res.status})`);
        return;
      }
      if (Number(out.ret) === 1) {
        message.success(out.msg || '已保存');
        setValues(formValuesFromSettingData(schema, payloadFromFormValues(schema, values)));
      } else {
        message.error(out.msg || '保存失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const allFields = settingFieldsFromSchema(schema);

  const fieldSections = categories
    .map((cat) => ({
      cat,
      fields: Object.values(schema[cat] ?? {}).filter(
        (f): f is SettingFieldDef =>
          f != null && typeof f === 'object' && typeof (f as SettingFieldDef).key === 'string',
      ),
    }))
    .filter((s) => s.fields.length > 0);

  const sections =
    fieldSections.length > 0
      ? fieldSections
      : [{cat: '_all', fields: allFields}];

  return (
    <PageShell
      title="系统设置"
      subtitle={fieldCount > 0 ? `共 ${fieldCount} 项配置` : undefined}
      back={{to: '/admin'}}
      error={loadError}
      layout="narrow"
      maxWidth={640}
    >
      <SurfaceCard>
        <Spin spinning={loading}>
          {allFields.length > 0 ? (
            <div className="bbs-settings-form">
              {sections.map((section, idx) => (
                <Fragment key={section.cat}>
                  {section.cat !== '_all' ? (
                    <Typography.Title level={5} style={{marginTop: idx === 0 ? 0 : 8, marginBottom: 16}}>
                      {SETTING_CATEGORY_TITLES[section.cat] ?? section.cat}
                    </Typography.Title>
                  ) : null}
                  {section.fields.map((field) => (
                    <SettingFieldRow
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      onChange={patchValue}
                    />
                  ))}
                  {idx < sections.length - 1 ? <Divider style={{margin: '8px 0 24px'}}/> : null}
                </Fragment>
              ))}
              <Button type="primary" loading={saving} style={{marginTop: 8}} onClick={() => void save()}>
                保存
              </Button>
            </div>
          ) : !loading && !loadError ? (
            <Typography.Text type="secondary">未获取到配置项</Typography.Text>
          ) : null}
        </Spin>
      </SurfaceCard>
    </PageShell>
  );
}
