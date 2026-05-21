import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert, Form, Input, message, Modal} from 'antd';
import {apiPostForm} from '@/api/client';

export type PartyJoinResult =
  | { ok: true; partyId: number; msg: string }
  | { ok: false; msg: string; partyId?: number };

export async function joinPartyWithCode(inviteCode: string): Promise<PartyJoinResult> {
  const res = await apiPostForm('/user/party/join', {invite_code: inviteCode.trim()});
  const out = (await res.json()) as {
    ret: number;
    msg?: string;
    data?: { party_id?: number };
  };
  if (out.ret !== 1) {
    return {ok: false, msg: out.msg || '加入失败', partyId: out.data?.party_id};
  }
  const partyId = out.data?.party_id;
  if (!partyId) {
    return {ok: false, msg: out.msg || '加入失败'};
  }
  return {ok: true, partyId, msg: out.msg || '加入成功'};
}

type PartyJoinModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (partyId: number) => void;
};

export function PartyJoinModal({open, onClose, onSuccess}: PartyJoinModalProps) {
  const nav = useNavigate();
  const [form] = Form.useForm<{ invite_code: string }>();
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setErr(null);
    }
  }, [open, form]);

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setErr(null);
      setSubmitting(true);
      const result = await joinPartyWithCode(v.invite_code);
      if (!result.ok) {
        if (result.partyId) {
          message.info(result.msg);
          onSuccess?.(result.partyId);
          onClose();
          nav(`/parties/${result.partyId}`);
          return;
        }
        setErr(result.msg);
        return;
      }
      message.success(result.msg);
      onClose();
      onSuccess?.(result.partyId);
      nav(`/parties/${result.partyId}`);
    } catch {
      /* validation */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="加入派对"
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="加入"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
    >
      {err ? <Alert type="error" message={err} showIcon style={{marginBottom: 16}}/> : null}
      <Form form={form} layout="vertical">
        <Form.Item
          name="invite_code"
          label="邀请码"
          rules={[{required: true, message: '请输入邀请码'}]}
        >
          <Input placeholder="输入派对邀请码" autoComplete="off"/>
        </Form.Item>
      </Form>
    </Modal>
  );
}
