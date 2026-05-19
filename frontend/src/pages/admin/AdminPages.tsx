import {Fragment, useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import {DollarOutlined, SettingOutlined, TeamOutlined, UserOutlined} from '@ant-design/icons';
import {apiFetch, apiJson, apiPostJson} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

export function AdminHomePage() {
  const [rows, setRows] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{ ret: number; data?: Record<string, string | number> }>('/admin');
      if (data.ret !== 1) {
        message.error('无权限');
        nav('/');
        return;
      }
      setRows(data.data || {});
      setLoading(false);
    })();
  }, [nav]);

  const keys = Object.keys(rows);

  return (
    <PageShell
      title="管理概览"
      subtitle="系统统计与后台入口"
      loading={loading}
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
      <SurfaceCard>
        <Table
          rowKey="k"
          pagination={false}
          dataSource={keys.map((k) => ({k, v: rows[k]}))}
          locale={{emptyText: '暂无数据'}}
          columns={[
            {title: '键', dataIndex: 'k'},
            {title: '值', dataIndex: 'v', align: 'right', render: (x) => String(x)},
          ]}
        />
      </SurfaceCard>
    </PageShell>
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
    <PageShell title="用户管理" back={{to: '/admin'}} loading={loading}>
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

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{ ret: number; data?: { parties?: typeof rows } }>('/admin/party');
      if (data.ret === 1) setRows(data.data?.parties || []);
      setLoading(false);
    })();
  }, []);

  return (
    <PageShell title="派对管理" back={{to: '/admin'}} loading={loading}>
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
      <SurfaceCard title="统计" style={{marginBottom: 16}}>
        <pre style={{margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: '#475569'}}>
          {JSON.stringify(stats, null, 2)}
        </pre>
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

function SettingControl({field}: { field: SettingFieldDef }) {
  if (field.type === 'switch') {
    return <Switch checkedChildren="开" unCheckedChildren="关"/>;
  }
  if (field.type === 'select' && field.options) {
    return (
      <Select
        options={Object.entries(field.options).map(([value, label]) => ({value, label}))}
        placeholder="请选择"
      />
    );
  }
  return <Input/>;
}

export function AdminSettingsPage() {
  const [schema, setSchema] = useState<SettingsSchema>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{
        ret: number;
        data?: {
          settings?: SettingsSchema;
          settingData?: Record<string, string | number | boolean | null>;
          categories?: string[];
        };
      }>('/admin/setting');
      if (data.ret === 1 && data.data?.settings) {
        const s = data.data.settings;
        setSchema(s);
        setCategories(data.data.categories ?? Object.keys(s));
        form.setFieldsValue(formValuesFromSettingData(s, data.data.settingData || {}));
      }
      setLoading(false);
    })();
  }, [form]);

  const onFinish = async (vals: Record<string, string | boolean>) => {
    const res = await apiPostJson('/admin/setting', payloadFromFormValues(schema, vals));
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret === 1) message.success(out.msg || '已保存');
    else message.error(out.msg || '失败');
  };

  return (
    <PageShell title="系统设置" back={{to: '/admin'}} loading={loading} layout="narrow" maxWidth={640}>
      <SurfaceCard>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {categories.map((cat, idx) => {
            const group = schema[cat];
            if (!group) return null;
            const fields = Object.values(group);
            return (
              <Fragment key={cat}>
                <Typography.Title level={5} style={{marginTop: idx === 0 ? 0 : 8, marginBottom: 16}}>
                  {SETTING_CATEGORY_TITLES[cat] ?? cat}
                </Typography.Title>
                {fields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={field.key}
                    label={field.name}
                    extra={field.description?.trim() || undefined}
                    valuePropName={field.type === 'switch' ? 'checked' : 'value'}
                  >
                    <SettingControl field={field}/>
                  </Form.Item>
                ))}
                {idx < categories.length - 1 ? <Divider style={{margin: '8px 0 24px'}}/> : null}
              </Fragment>
            );
          })}
          <Button type="primary" htmlType="submit" style={{marginTop: 8}}>
            保存
          </Button>
        </Form>
      </SurfaceCard>
    </PageShell>
  );
}
