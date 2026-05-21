import {useEffect, useState} from 'react';
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {Alert, Button, Card, Form, Input, Space, Typography} from 'antd';
import {SafetyCertificateOutlined} from '@ant-design/icons';
import {type PublicKeyCredentialRequestOptionsJSON, startAuthentication} from '@simplewebauthn/browser';
import {apiPostJson, applyAuthPayload, setAccessToken} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {AuthLayout} from '@/components/ui';

type MfaMethod = { require?: boolean; fido?: boolean; totp?: boolean };

export function MfaPage() {
  const [params] = useSearchParams();
  const ticket = params.get('ticket') || '';
  const nav = useNavigate();
  const loc = useLocation();
  const {setUser} = useAuth();
  const [method, setMethod] = useState<MfaMethod>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setAccessToken(null);
    try {
      setMethod(JSON.parse(sessionStorage.getItem('mfa_method') || '{}') as MfaMethod);
    } catch {
      setMethod({});
    }
  }, []);

  const finish = (data: { access_token?: string; user?: { id: number; username: string; is_admin: boolean } }) => {
    applyAuthPayload(data);
    sessionStorage.removeItem('mfa_method');
    setUser(data.user!);
    const from = (loc.state as { from?: string } | null)?.from;
    nav(from && from !== '/login' ? from : '/', {replace: true});
  };

  const onTotp = async (v: { code: string }) => {
    setErr(null);
    const p = new URLSearchParams();
    p.set('mfa_ticket', ticket);
    p.set('code', v.code);
    const res = await fetch('/api/auth/mfa/totp', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: p.toString(),
      credentials: 'include',
    });
    const data = (await res.json()) as {
      ret: number;
      msg?: string;
      access_token?: string;
      user?: { id: number; username: string; is_admin: boolean };
    };
    if (data.ret !== 1 || !data.access_token) {
      setErr(data.msg || '验证失败');
      return;
    }
    finish(data);
  };

  const onFido = async () => {
    setErr(null);
    try {
      const challengeBody = new URLSearchParams();
      challengeBody.set('mfa_ticket', ticket);
      const ch = await fetch('/api/auth/mfa/fido/challenge', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: challengeBody.toString(),
        credentials: 'include',
      });
      const d = (await ch.json()) as { ret?: number; msg?: string; challenge_id?: string; publicKey?: unknown };
      if (d.ret !== 1 || !d.challenge_id || !d.publicKey) {
        setErr(d.msg || '无法开始 FIDO 验证');
        return;
      }
      const assertion = await startAuthentication({
        optionsJSON: d.publicKey as PublicKeyCredentialRequestOptionsJSON,
      });
      const res = await apiPostJson('/auth/mfa/fido/verify', {
        mfa_ticket: ticket,
        challenge_id: d.challenge_id,
        ...assertion,
      });
      const out = (await res.json()) as {
        ret?: number;
        msg?: string;
        access_token?: string;
        user?: { id: number; username: string; is_admin: boolean };
      };
      if (out.ret !== 1 || !out.access_token) {
        setErr(out.msg || '验证失败');
        return;
      }
      finish(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!ticket) {
    return (
      <AuthLayout title="二步验证" variant="mfa" width={440}>
        <Alert type="error" message="缺少登录票据，请重新登录。" showIcon/>
        <Button type="primary" block onClick={() => nav('/login')}>
          去登录
        </Button>
      </AuthLayout>
    );
  }

  const showTotp = method.totp === true;
  const showFido = method.fido === true;
  const showHint = !showTotp && !showFido;

  return (
    <AuthLayout title="二步验证" subtitle="请完成身份验证以继续" variant="mfa" width={480}>
      {showHint ? <Alert type="warning" message="未检测到可用验证方式，请联系管理员。" showIcon/> : null}
      {err ? <Alert type="error" message={err} showIcon closable onClose={() => setErr(null)}/> : null}
      <Space direction="vertical" size="middle" style={{width: '100%'}}>
        {showTotp ? (
          <Card size="small" className="bbs-mfa-method" title="TOTP 动态码">
            <Form layout="vertical" onFinish={onTotp}>
              <Form.Item name="code" label="6 位验证码" rules={[{required: true}]}>
                <Input autoComplete="one-time-code" placeholder="000000"/>
              </Form.Item>
              <Button type="primary" htmlType="submit" block>
                验证并登录
              </Button>
            </Form>
          </Card>
        ) : null}
        {showFido ? (
          <Card size="small" className="bbs-mfa-method" title="安全密钥 / FIDO2">
            <Button type="primary" icon={<SafetyCertificateOutlined/>} block onClick={() => void onFido()}>
              使用安全密钥验证
            </Button>
          </Card>
        ) : null}
        <Typography.Text type="secondary" style={{display: 'block', textAlign: 'center'}}>
          <Link to="/login">返回登录</Link>
        </Typography.Text>
      </Space>
    </AuthLayout>
  );
}
