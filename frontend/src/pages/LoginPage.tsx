import {useEffect, useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {Alert, Button, Form, Input, Typography} from 'antd';
import {KeyOutlined} from '@ant-design/icons';
import {startAuthentication} from '@simplewebauthn/browser';
import {applyAuthPayload, setAccessToken} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {AuthCaptcha, getCaptchaExtraParams} from '@/components/AuthCaptcha';
import {AuthLayout} from '@/components/ui';

type MfaMethod = { require?: boolean; fido?: boolean; totp?: boolean };

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const redirectAfterLogin = () => {
    const from = (loc.state as { from?: string } | null)?.from;
    nav(from && from !== '/login' ? from : '/', {replace: true});
  };
  const {setUser} = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);

  useEffect(() => {
    setAccessToken(null);
    setUser(null);
  }, [setUser]);

  const onFinish = async (v: { username: string; password: string }) => {
    setErr(null);
    const body = new URLSearchParams();
    body.set('username', v.username);
    body.set('password', v.password);
    Object.entries(getCaptchaExtraParams()).forEach(([k, x]) => body.set(k, x));
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
      credentials: 'include',
    });
    const data = (await res.json()) as {
      ret?: number;
      msg?: string;
      access_token?: string;
      user?: { id: number; username: string; is_admin: boolean };
      mfa_required?: boolean;
      mfa_ticket?: string;
      method?: MfaMethod;
    };
    if (data.ret !== 1) {
      setErr(data.msg || '登录失败');
      setCapKey((k) => k + 1);
      return;
    }
    if (data.mfa_required && data.mfa_ticket) {
      sessionStorage.setItem('mfa_method', JSON.stringify(data.method || {}));
      nav(`/mfa?ticket=${encodeURIComponent(data.mfa_ticket)}`, {replace: true, state: loc.state});
      return;
    }
    if (data.access_token) {
      applyAuthPayload(data);
      setUser(data.user!);
      redirectAfterLogin();
    }
  };

  const passkey = async () => {
    setErr(null);
    try {
      const ch = await fetch('/api/auth/webauthn/challenge', {credentials: 'include'});
      const d = (await ch.json()) as { ret?: number; msg?: string; challenge_id?: string; publicKey?: unknown };
      if (d.ret !== 1 || !d.challenge_id || !d.publicKey) {
        setErr(d.msg || '无法获取通行密钥挑战');
        return;
      }
      const assertion = await startAuthentication({optionsJSON: JSON.stringify(d.publicKey)});
      const res = await fetch('/api/auth/webauthn/verify', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...assertion, challenge_id: d.challenge_id}),
        credentials: 'include',
      });
      const out = (await res.json()) as {
        ret?: number;
        msg?: string;
        access_token?: string;
        user?: { id: number; username: string; is_admin: boolean };
      };
      if (out.ret !== 1 || !out.access_token) {
        setErr(out.msg || '通行密钥验证失败');
        return;
      }
      applyAuthPayload(out);
      setUser(out.user!);
      redirectAfterLogin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AuthLayout title="BetterBillSplitter" subtitle="登录你的账户" variant="login">
      {err ? <Alert type="error" message={err} showIcon closable onClose={() => setErr(null)}/> : null}
      <Form layout="vertical" onFinish={onFinish} requiredMark="optional" size="large">
        <Form.Item name="username" label="用户名" rules={[{required: true}]}>
          <Input autoComplete="username" placeholder="请输入用户名"/>
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{required: true}]}>
          <Input.Password autoComplete="current-password" placeholder="请输入密码"/>
        </Form.Item>
        <AuthCaptcha slotKey={`login-${capKey}`}/>
        <Form.Item style={{marginBottom: 12}}>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form.Item>
      </Form>
      <Button block icon={<KeyOutlined/>} onClick={() => void passkey()}>
        使用通行密钥登录
      </Button>
      <Typography.Text type="secondary" style={{display: 'block', textAlign: 'center'}}>
        还没有账号？ <Link to="/register">立即注册</Link>
      </Typography.Text>
    </AuthLayout>
  );
}
