import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, Button, Form, Input, Space} from 'antd';
import {partyInvitePath} from '@/lib/partyInvite';
import {PageShell, SurfaceCard} from '@/components/ui';

export function PartyJoinPage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  const onFinish = (v: { invite_code: string }) => {
    const code = v.invite_code.trim();
    if (!code) {
      setErr('请输入邀请码');
      return;
    }
    setErr(null);
    nav(partyInvitePath(code));
  };

  return (
    <PageShell title="加入派对" back={{to: '/parties'}} layout="narrow" maxWidth={520}>
      <SurfaceCard className="bbs-form-page">
        {err ? <Alert type="error" message={err} showIcon style={{marginBottom: 16}}/> : null}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="invite_code" label="邀请码" rules={[{required: true}]}>
            <Input placeholder="输入派对邀请码"/>
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              下一步
            </Button>
            <Link to="/parties">
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </SurfaceCard>
    </PageShell>
  );
}
