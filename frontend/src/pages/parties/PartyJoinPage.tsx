import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, Button, Form, Input, message, Space} from 'antd';
import {joinPartyWithCode} from '@/components/PartyJoinModal';
import {PageShell, SurfaceCard} from '@/components/ui';

export function PartyJoinPage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (v: { invite_code: string }) => {
    setErr(null);
    setSubmitting(true);
    try {
      const result = await joinPartyWithCode(v.invite_code);
      if (!result.ok) {
        if (result.partyId) {
          message.info(result.msg);
          nav(`/parties/${result.partyId}`);
          return;
        }
        setErr(result.msg);
        return;
      }
      message.success(result.msg);
      nav(`/parties/${result.partyId}`);
    } finally {
      setSubmitting(false);
    }
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
            <Button type="primary" htmlType="submit" loading={submitting}>
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
