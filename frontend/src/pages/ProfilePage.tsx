import {type ReactNode, useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Avatar, Button, Card, Col, Flex, Form, Input, message, Modal, QRCode, Row, Tag, Typography,} from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  LockOutlined,
  MobileOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SecurityScanOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {type PublicKeyCredentialCreationOptionsJSON, startRegistration} from '@simplewebauthn/browser';
import {apiDelete, apiFetch, apiJson, apiPostForm, apiPostJson} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {PageShell, SurfaceCard} from '@/components/ui';

type Device = { id: number; name?: string };

type SecurityBlockProps = {
  icon: ReactNode;
  iconClass: string;
  title: string;
  desc: string;
  enabled: boolean;
  action: ReactNode;
  devices?: Device[];
  defaultName: string;
  onDelete?: (id: number) => void;
};

function SecurityBlock({
                         icon,
                         iconClass,
                         title,
                         desc,
                         enabled,
                         action,
                         devices = [],
                         defaultName,
                         onDelete,
                       }: SecurityBlockProps) {
  return (
    <div className={`bbs-security-item${enabled ? ' bbs-security-item--on' : ''}`}>
      <div className={`bbs-security-item__icon ${iconClass}`}>{icon}</div>
      <div className="bbs-security-item__body">
        <div className="bbs-security-item__head">
          <Typography.Title level={5} className="bbs-security-item__title">
            {title}
          </Typography.Title>
          <Tag color={enabled ? 'success' : 'default'}>{enabled ? '已启用' : '未启用'}</Tag>
        </div>
        <Typography.Text type="secondary" className="bbs-security-item__desc">
          {desc}
        </Typography.Text>
        {action}
        {devices.length > 0 ? (
          <ul className="bbs-security-device-list">
            {devices.map((d) => (
              <li key={d.id}>
                <span>{d.name || defaultName}</span>
                {onDelete ? (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined/>}
                    onClick={() => onDelete(d.id)}
                  >
                    删除
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const nav = useNavigate();
  const {setUser} = useAuth();
  const [loading, setLoading] = useState(true);
  const [user, setLocalUser] = useState<{ id: number; username: string } | null>(null);
  const [wn, setWn] = useState<Device[]>([]);
  const [totp, setTotp] = useState<Device[]>([]);
  const [fido, setFido] = useState<Device[]>([]);
  const [totpModal, setTotpModal] = useState<{
    challenge_id: string;
    url?: string;
    token?: string;
  } | null>(null);
  const [fidoModal, setFidoModal] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwdForm] = Form.useForm();
  const [profileForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiJson<{
      ret: number;
      data?: {
        user?: { id: number; username: string };
        webauthn_devices?: Device[];
        totp_devices?: Device[];
        fido_devices?: Device[];
      };
    }>('/user/profile');
    if (data.ret !== 1) {
      message.error('无法加载');
      nav('/login');
      return;
    }
    const u = data.data?.user || null;
    setLocalUser(u);
    setWn(data.data?.webauthn_devices || []);
    setTotp(data.data?.totp_devices || []);
    setFido(data.data?.fido_devices || []);
    if (u) profileForm.setFieldsValue({username: u.username});
    setLoading(false);
  }, [nav, profileForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const mfaCount = (totp.length > 0 ? 1 : 0) + (wn.length > 0 ? 1 : 0) + (fido.length > 0 ? 1 : 0);

  const saveProfile = async (v: { username: string }) => {
    setProfileSaving(true);
    try {
      const res = await apiPostForm('/user/profile', {username: v.username.trim()});
      const out = (await res.json()) as {
        ret: number;
        msg?: string;
        user?: { id: number; username: string; is_admin: boolean };
      };
      if (out.ret !== 1) {
        message.error(out.msg || '保存失败');
        return;
      }
      if (out.user) setUser(out.user);
      message.success('资料已保存');
      await load();
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (v: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    setPwdSaving(true);
    try {
      const res = await apiPostForm('/user/profile', {
        username: user?.username ?? '',
        current_password: v.current_password,
        new_password: v.new_password,
        confirm_password: v.confirm_password,
      });
      const out = (await res.json()) as { ret: number; msg?: string };
      if (out.ret !== 1) {
        message.error(out.msg || '修改失败');
        return;
      }
      message.success(out.msg || '密码已更新');
      pwdForm.resetFields();
    } finally {
      setPwdSaving(false);
    }
  };

  const delTotp = () => {
    Modal.confirm({
      title: '删除 TOTP？',
      content: '删除后登录将不再要求 TOTP 验证码（若未配置其他二步验证）。',
      okType: 'danger',
      onOk: async () => {
        const res = await apiDelete('/user/totp_reg');
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) message.error(out.msg || '失败');
        else {
          message.success('已删除');
          await load();
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
      token?: string;
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
    await load();
  };

  const regWebauthn = async (pathPrefix: '/user/webauthn_reg' | '/user/fido_reg', extra?: Record<string, unknown>) => {
    const res = await apiFetch(pathPrefix);
    const d = (await res.json()) as { ret?: number; challenge_id?: string; publicKey?: unknown; msg?: string };
    if (!d.challenge_id || !d.publicKey) {
      message.error(d.msg || '无法获取注册参数');
      return;
    }
    const att = await startRegistration({
      optionsJSON: d.publicKey as PublicKeyCredentialCreationOptionsJSON,
    });
    const verifyRes = await apiPostJson(pathPrefix, {...att, challenge_id: d.challenge_id, ...extra});
    const out = (await verifyRes.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      message.error(out.msg || '注册失败');
      return;
    }
    message.success('注册成功');
    await load();
  };

  const delWn = (id: number) => {
    Modal.confirm({
      title: '删除该通行密钥？',
      okType: 'danger',
      onOk: async () => {
        const res = await apiDelete(`/user/webauthn_reg/${id}`);
        const out = (await res.json()) as { ret: number; msg?: string };
        if (out.ret !== 1) message.error(out.msg || '失败');
        else {
          message.success('已删除');
          await load();
        }
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
        else {
          message.success('已删除');
          await load();
        }
      },
    });
  };

  const initial = user?.username?.charAt(0)?.toUpperCase() || '?';

  return (
    <PageShell title="账户与安全" subtitle="管理个人资料、登录密码与多因素认证" loading={loading} maxWidth={1040}>
      <Card className="bbs-profile-hero" variant="borderless">
        <Flex align="center" justify="space-between" wrap="wrap" gap={20}>
          <Flex align="center" gap={16}>
            <Avatar size={64} className="bbs-profile-hero__avatar">
              {initial}
            </Avatar>
            <div>
              <Typography.Title level={4} style={{margin: 0}}>
                {user?.username || '—'}
              </Typography.Title>
              <Typography.Text type="secondary">用户 ID：{user?.id ?? '—'}</Typography.Text>
            </div>
          </Flex>
          <Flex gap={12} wrap="wrap">
            <div className="bbs-profile-stat">
              <span className="bbs-profile-stat__value">{mfaCount}</span>
              <span className="bbs-profile-stat__label">已启用验证方式</span>
            </div>
            <div className="bbs-profile-stat">
              <span className="bbs-profile-stat__value">{wn.length}</span>
              <span className="bbs-profile-stat__label">通行密钥</span>
            </div>
            <div className="bbs-profile-stat">
              <span className="bbs-profile-stat__value">{fido.length}</span>
              <span className="bbs-profile-stat__label">安全密钥</span>
            </div>
          </Flex>
        </Flex>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={10}>
          <SurfaceCard
            title={
              <span className="bbs-profile-section-title">
                <UserOutlined/>
                个人资料
              </span>
            }
          >
            <Form form={profileForm} layout="vertical" onFinish={saveProfile}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[{required: true, message: '请输入用户名'}]}
              >
                <Input placeholder="你的显示名称" autoComplete="username"/>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={profileSaving} block>
                保存资料
              </Button>
            </Form>
          </SurfaceCard>

          <SurfaceCard
            style={{marginTop: 24}}
            title={
              <span className="bbs-profile-section-title">
                <LockOutlined/>
                登录密码
              </span>
            }
          >
            <Form form={pwdForm} layout="vertical" onFinish={changePassword}>
              <Form.Item
                name="current_password"
                label="当前密码"
                rules={[{required: true, message: '请输入当前密码'}]}
              >
                <Input.Password autoComplete="current-password" placeholder="验证身份"/>
              </Form.Item>
              <Form.Item
                name="new_password"
                label="新密码"
                rules={[{required: true, min: 6, message: '至少 6 位'}]}
              >
                <Input.Password autoComplete="new-password" placeholder="至少 6 位"/>
              </Form.Item>
              <Form.Item
                name="confirm_password"
                label="确认新密码"
                dependencies={['new_password']}
                rules={[
                  {required: true, message: '请再次输入新密码'},
                  ({getFieldValue}) => ({
                    validator(_, val) {
                      if (!val || getFieldValue('new_password') === val) return Promise.resolve();
                      return Promise.reject(new Error('两次密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" placeholder="再次输入新密码"/>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={pwdSaving} block>
                更新密码
              </Button>
            </Form>
          </SurfaceCard>
        </Col>

        <Col xs={24} lg={14}>
          <SurfaceCard
            title={
              <span className="bbs-profile-section-title">
                <SafetyCertificateOutlined/>
                两步验证与安全密钥
              </span>
            }
          >
            <div className="bbs-security-grid">
              <SecurityBlock
                icon={<MobileOutlined/>}
                iconClass="bbs-security-item__icon--totp"
                title="TOTP 动态验证码"
                desc="使用 Authenticator 应用生成 6 位动态码，适合作为登录二步验证。"
                enabled={totp.length > 0}
                action={
                  totp.length > 0 ? (
                    <Button danger size="small" onClick={delTotp}>
                      解除绑定
                    </Button>
                  ) : (
                    <Button type="primary" size="small" icon={<SafetyCertificateOutlined/>}
                            onClick={() => void startTotp()}>
                      绑定 TOTP
                    </Button>
                  )
                }
              />

              <SecurityBlock
                icon={<KeyOutlined/>}
                iconClass="bbs-security-item__icon--passkey"
                title="通行密钥 (Passkey)"
                desc="使用 Face ID、指纹或设备 PIN 快速登录，无需输入密码。"
                enabled={wn.length > 0}
                devices={wn}
                defaultName="Passkey"
                onDelete={delWn}
                action={
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined/>}
                    onClick={() => void regWebauthn('/user/webauthn_reg').catch((e) => message.error(String(e)))}
                  >
                    注册新密钥
                  </Button>
                }
              />

              <SecurityBlock
                icon={<SecurityScanOutlined/>}
                iconClass="bbs-security-item__icon--fido"
                title="FIDO2 安全密钥"
                desc="物理安全密钥（如 YubiKey），可用于登录二步验证。"
                enabled={fido.length > 0}
                devices={fido}
                defaultName="FIDO"
                onDelete={delFido}
                action={
                  <Button type="primary" size="small" icon={<PlusOutlined/>} onClick={() => setFidoModal(true)}>
                    注册安全密钥
                  </Button>
                }
              />
            </div>
          </SurfaceCard>
        </Col>
      </Row>

      <Modal
        title="注册 FIDO2 安全密钥"
        open={fidoModal}
        onCancel={() => setFidoModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          onFinish={(v) =>
            void regWebauthn('/user/fido_reg', {name: v.name || ''})
              .then(() => setFidoModal(false))
              .catch((e) => message.error(String(e)))
          }
        >
          <Form.Item name="name" label="设备名称（可选）">
            <Input placeholder="例如：YubiKey"/>
          </Form.Item>
          <Button type="primary" htmlType="submit" block icon={<SafetyCertificateOutlined/>}>
            继续并完成注册
          </Button>
        </Form>
      </Modal>

      <Modal title="绑定 TOTP" open={!!totpModal} onCancel={() => setTotpModal(null)} footer={null} destroyOnClose>
        {totpModal?.url ? (
          <Flex vertical align="center" gap="middle" style={{marginBottom: 16}}>
            <QRCode value={totpModal.url} size={200} bordered={false}/>
            <Typography.Text type="secondary" style={{textAlign: 'center'}}>
              使用 Google Authenticator、Microsoft Authenticator 等应用扫描二维码
            </Typography.Text>
          </Flex>
        ) : null}
        <Typography.Paragraph type="secondary" copyable={{text: totpModal?.token ?? ''}}>
          无法扫码？手动输入密钥：{totpModal?.token || ''}
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={finishTotp}>
          <Form.Item name="code" label="6 位验证码" rules={[{required: true}]}>
            <Input placeholder="000000" autoComplete="one-time-code"/>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            确认绑定
          </Button>
        </Form>
      </Modal>
    </PageShell>
  );
}
