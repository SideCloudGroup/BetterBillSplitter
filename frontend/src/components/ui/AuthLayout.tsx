import type {ReactNode} from 'react';
import {Card, Space, theme, Typography} from 'antd';
import {AccountBookOutlined} from '@ant-design/icons';

type AuthVariant = 'login' | 'register' | 'mfa';

const gradients: Record<AuthVariant, string> = {
  login: 'linear-gradient(145deg, #0f766e 0%, #134e4a 45%, #1e3a5f 100%)',
  register: 'linear-gradient(145deg, #047857 0%, #0d9488 50%, #155e75 100%)',
  mfa: 'linear-gradient(145deg, #1e40af 0%, #0f766e 55%, #134e4a 100%)',
};

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  variant?: AuthVariant;
  children: ReactNode;
  width?: number;
};

export function AuthLayout({title, subtitle, variant = 'login', children, width = 440}: AuthLayoutProps) {
  const {token} = theme.useToken();

  return (
    <div className="bbs-auth-shell" style={{background: gradients[variant]}}>
      <Card
        className="bbs-auth-card"
        style={{width, maxWidth: '100%', boxShadow: token.boxShadowSecondary}}
        styles={{body: {padding: 'clamp(16px, 4vw, 28px)'}}}
      >
        <Space direction="vertical" size="large" style={{width: '100%'}}>
          <div style={{textAlign: 'center'}}>
            <AccountBookOutlined style={{fontSize: 36, color: token.colorPrimary, marginBottom: 8}}/>
            <Typography.Title level={3} style={{marginBottom: 4}}>
              {title}
            </Typography.Title>
            {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
          </div>
          {children}
        </Space>
      </Card>
    </div>
  );
}
