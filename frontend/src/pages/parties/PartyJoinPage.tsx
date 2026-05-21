import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, Button, Form, Input, message, Space} from 'antd';
import {apiPostForm} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

export function PartyJoinPage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  const onFinish = async (v: { invite_code: string }) => {
    setErr(null);
    const res = await apiPostForm('/user/party/join', {invite_code: v.invite_code.trim()});
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      setErr(out.msg || '加入失败');
      return;
    }
    message.success(out.msg || '成功');
    setTimeout(() => nav('/parties'), 500);
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
              加入
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
