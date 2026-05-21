import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Button, Col, Form, Input, message, Modal, Row, Space, Table, Typography} from 'antd';
import {PlusOutlined, SafetyCertificateOutlined} from '@ant-design/icons';
import {startRegistration} from '@simplewebauthn/browser';
import {apiDelete, apiFetch, apiJson, apiPostForm, apiPostJson} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {PageShell, SurfaceCard} from '@/components/ui';

export function ProfilePage() {
  const nav = useNavigate();
  const {setUser} = useAuth();
  const [loading, setLoading] = useState(true);
  const [user, setLocalUser] = useState<{ id: number; username: string } | null>(null);
  const [wn, setWn] = useState<{ id: number; name?: string }[]>([]);
  const [totp, setTotp] = useState<{ id: number }[]>([]);
  const [fido, setFido] = useState<{ id: number; name?: string }[]>([]);
  const [totpModal, setTotpModal] = useState<{
    challenge_id: string;
    url?: string;
    token?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiJson<{
      ret: number;
      data?: {
        user?: { id: number; username: string };
        webauthn_devices?: { id: number; name?: string }[];
        totp_devices?: { id: number }[];
        fido_devices?: { id: number; name?: string }[];
      };
    }>('/user/profile');
    if (data.ret !== 1) {
      message.error('无法加载');
      nav('/login');
      return;
    }
    setLocalUser(data.data?.user || null);
    setWn(data.data?.webauthn_devices || []);
    setTotp(data.data?.totp_devices || []);
    setFido(data.data?.fido_devices || []);
    setLoading(false);
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (v: { username: string }) => {
    const res = await apiPostForm('/user/profile', {username: v.username.trim()});
    const out = (await res.json()) as {
      ret: number;
      msg?: string;
      user?: { id: number; username: string; is_admin: boolean }
    };
    if (out.ret !== 1) {
      message.error(out.msg || '保存失败');
      return;
    }
    if (out.user) setUser(out.user);
    message.success('已保存');
    await load();
  };

  const delTotp = () => {
    Modal.confirm({
      title: '删除 TOTP？',
      okType: 'danger',
      onOk: async () => {
        const res = await apiDelete('/user/totp_reg');
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) message.error(out.msg || '失败');
        else {
          message.success('已删除');
          window.location.reload();
        }
      },
    });
  };

  const startTotp = async () => {
    const d = await apiJson<{
      ret?: number;
      msg?: string;
      challenge_id?: string;
      url?: string;
      token?: string
    }>('/user/totp_reg');
    if (d.ret !== 1 || !d.challenge_id) {
      message.error(d.msg || '无法开始');
      return;
    }
    setTotpModal({challenge_id: d.challenge_id, url: d.url, token: d.token});
  };

  const finishTotp = async (v: { code: string }) => {
    if (!totpModal) return;
    const res = await apiPostForm('/user/totp_reg', {
      challenge_id: totpModal.challenge_id,
      code: v.code.trim(),
    });
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      message.error(out.msg || '验证失败');
      return;
    }
    setTotpModal(null);
    message.success('绑定成功');
    window.location.reload();
  };

  const regWebauthn = async (pathPrefix: '/user/webauthn_reg' | '/user/fido_reg', extra?: Record<string, unknown>) => {
    const res = await apiFetch(pathPrefix);
    const d = (await res.json()) as { ret?: number; challenge_id?: string; publicKey?: unknown; msg?: string };
    if (!d.challenge_id || !d.publicKey) {
      message.error(d.msg || '无法获取注册参数');
      return;
    }
    const att = await startRegistration({optionsJSON: JSON.stringify(d.publicKey)});
    const verifyRes = await apiPostJson(pathPrefix, {...att, challenge_id: d.challenge_id, ...extra});
    const out = (await verifyRes.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      message.error(out.msg || '注册失败');
      return;
    }
    message.success('注册成功');
    window.location.reload();
  };

  const delWn = (id: number) => {
    Modal.confirm({
      title: '删除该通行密钥？',
      okType: 'danger',
      onOk: async () => {
        const res = await apiDelete(`/user/webauthn_reg/${id}`);
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) message.error(out.msg || '失败');
        else window.location.reload();
      },
    });
  };

  const delFido = (id: number) => {
    Modal.confirm({
      title: '删除该 FIDO 设备？',
      okType: 'danger',
      onOk: async () => {
        const res = await apiDelete(`/user/fido_reg/${id}`);
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) message.error(out.msg || '失败');
        else window.location.reload();
      },
    });
  };

  return (
    <PageShell title="账户与安全" subtitle="管理个人资料与多因素认证" loading={loading} centered maxWidth={960}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <SurfaceCard title="资料">
            <Form
              key={user ? `profile-${user.id}` : 'profile-loading'}
              layout="vertical"
              onFinish={saveProfile}
              initialValues={{username: user?.username || ''}}
            >
              <Form.Item name="username" label="用户名" rules={[{required: true}]}>
                <Input/>
              </Form.Item>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Form>
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12}>
          <SurfaceCard title="TOTP">
            {totp.length ? (
              <Space direction="vertical">
                <Typography.Text type="success">已启用</Typography.Text>
                <Button danger onClick={delTotp}>
                  删除 TOTP
                </Button>
              </Space>
            ) : (
              <Button type="primary" icon={<SafetyCertificateOutlined/>} onClick={() => void startTotp()}>
                绑定 TOTP
              </Button>
            )}
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12}>
          <SurfaceCard title="通行密钥 (Passkey)">
            <Button
              type="primary"
              icon={<PlusOutlined/>}
              style={{marginBottom: 12}}
              onClick={() => void regWebauthn('/user/webauthn_reg').catch((e) => message.error(String(e)))}
            >
              注册新密钥
            </Button>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={wn}
              locale={{emptyText: '无'}}
              columns={[
                {title: '名称', dataIndex: 'name', render: (t) => t || 'Passkey'},
                {
                  title: '操作',
                  render: (_, r) => (
                    <Button size="small" danger onClick={() => delWn(r.id)}>
                      删除
                    </Button>
                  ),
                },
              ]}
            />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12}>
          <SurfaceCard title="FIDO2 安全密钥">
            <Form layout="vertical"
                  onFinish={(v) => void regWebauthn('/user/fido_reg', {name: v.name || ''}).catch((e) => message.error(String(e)))}>
              <Form.Item name="name" label="设备名称（可选）">
                <Input placeholder="例如：YubiKey"/>
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined/>}>
                注册
              </Button>
            </Form>
            <Table
              size="small"
              style={{marginTop: 12}}
              rowKey="id"
              pagination={false}
              dataSource={fido}
              locale={{emptyText: '无'}}
              columns={[
                {title: '名称', dataIndex: 'name', render: (t) => t || 'FIDO'},
                {
                  title: '操作',
                  render: (_, r) => (
                    <Button size="small" danger onClick={() => delFido(r.id)}>
                      删除
                    </Button>
                  ),
                },
              ]}
            />
          </SurfaceCard>
        </Col>
      </Row>
      <Modal title="绑定 TOTP" open={!!totpModal} onCancel={() => setTotpModal(null)} footer={null} destroyOnClose>
        {totpModal?.url ? (
          <Typography.Link href={totpModal.url} target="_blank" rel="noopener noreferrer">
            在验证器中添加
          </Typography.Link>
        ) : null}
        <Typography.Paragraph type="secondary" copyable={{ text: totpModal?.token ?? '' }}>
          密钥：{totpModal?.token || ''}
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={finishTotp}>
          <Form.Item name="code" label="6 位验证码" rules={[{required: true}]}>
            <Input placeholder="000000"/>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            确认绑定
          </Button>
        </Form>
      </Modal>
    </PageShell>
  );
}
