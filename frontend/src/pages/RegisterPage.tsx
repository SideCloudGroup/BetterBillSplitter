import {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, Button, Form, Input, message, Typography} from 'antd';
import {setAccessToken} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {useSite} from '@/context/SiteContext';
import {AuthCaptcha, getCaptchaExtraParams} from '@/components/AuthCaptcha';
import {AuthLayout} from '@/components/ui';

export function RegisterPage() {
  const nav = useNavigate();
  const {setUser} = useAuth();
  const {siteName} = useSite();
  const [err, setErr] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);

  useEffect(() => {
    setAccessToken(null);
    setUser(null);
  }, [setUser]);

  const onFinish = async (v: { username: string; password: string; confirm_password: string }) => {
    setErr(null);
    const body = new URLSearchParams();
    body.set('username', v.username);
    body.set('password', v.password);
    body.set('confirm_password', v.confirm_password);
    Object.entries(getCaptchaExtraParams()).forEach(([k, x]) => body.set(k, x));
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
      credentials: 'include',
    });
    const data = (await res.json()) as { ret?: number; msg?: string };
    if (data.ret !== 1) {
      setErr(data.msg || '注册失败');
      if (data.ret === 0) setCapKey((k) => k + 1);
      return;
    }
    message.success(data.msg || '注册成功');
    setTimeout(() => nav('/login', {replace: true}), 800);
  };

  return (
    <AuthLayout title="创建账号" subtitle={`加入 ${siteName}`} variant="register">
      {err ? <Alert type="error" message={err} showIcon closable onClose={() => setErr(null)}/> : null}
      <Form layout="vertical" onFinish={onFinish} size="large">
        <Form.Item name="username" label="用户名" rules={[{required: true}]}>
          <Input placeholder="设置用户名"/>
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{required: true, min: 6}]}>
          <Input.Password placeholder="至少 6 位"/>
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认密码"
          dependencies={['password']}
          rules={[
            {required: true},
            ({getFieldValue}) => ({
              validator(_, val) {
                if (!val || getFieldValue('password') === val) return Promise.resolve();
                return Promise.reject(new Error('两次密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入密码"/>
        </Form.Item>
        <AuthCaptcha slotKey="register" refreshSignal={capKey}/>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            注册
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{display: 'block', textAlign: 'center'}}>
        已有账号？ <Link to="/login">去登录</Link>
      </Typography.Text>
    </AuthLayout>
  );
}
