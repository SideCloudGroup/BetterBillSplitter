import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {Alert, Button, Checkbox, Form, Input, InputNumber, message, Segmented, Select, Space, Typography} from 'antd';
import {apiJson, apiPostForm} from '@/api/client';
import {type PartyOption, PartyPicker} from '@/components/PartyPicker';
import {PageShell, SurfaceCard} from '@/components/ui';
import {type CurrencyMap, currencySelectOptionsForCodes, currencySymbol,} from '@/lib/currencies';
import {
  formatMoney,
  perPersonFromTotal,
  resolveSubmitPerPerson,
  type SplitMode,
  totalFromPerPerson,
} from '@/lib/splitAmount';

type FormValues = {
  party_id: number;
  description: string;
  unit: string;
  users: number[];
  split_mode: SplitMode;
  amount_input: number;
};

export function ItemAddPage() {
  const [params] = useSearchParams();
  const partyQ = params.get('party_id');
  const nav = useNavigate();
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([]);
  const [currencyMap, setCurrencyMap] = useState<CurrencyMap>({});
  const [members, setMembers] = useState<{ id: number; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    void (async () => {
      const addData = await apiJson<{ ret: number; data?: { parties?: PartyOption[] } }>('/user/item/add');
      if (addData.ret !== 1) {
        message.error('无法加载');
        nav('/login');
        return;
      }
      const ps = addData.data?.parties || [];
      setParties(ps);
      const qid = partyQ ? Number(partyQ) : undefined;
      const initial = qid && ps.some((p) => p.id === qid) ? qid : ps[0]?.id;
      if (initial) {
        form.setFieldsValue({party_id: initial} as never);
      }
      setLoading(false);
    })();
  }, [form, nav, partyQ]);

  const loadParty = async (pid: number) => {
    const info = await apiJson<{
      ret: number;
      data?: {
        supported_currencies?: string[];
        all_currencies?: CurrencyMap;
        members?: { id: number; username: string }[];
      };
    }>(`/user/party/${pid}/info`);
    if (info.ret !== 1) {
      message.error('无法加载派对信息');
      setMembers([]);
      setCurrencyCodes([]);
      setCurrencyMap({});
      return;
    }
    const codes = info.data?.supported_currencies || ['cny'];
    setCurrencyCodes(codes);
    setCurrencyMap(info.data?.all_currencies || {});
    setMembers(info.data?.members || []);
    const u = form.getFieldValue('unit');
    if (!u && codes[0]) {
      form.setFieldsValue({unit: codes[0]});
    }
  };

  const watchPartyId = Form.useWatch('party_id', form);
  const splitMode = Form.useWatch('split_mode', form) ?? 'total';
  const amountInput = Form.useWatch('amount_input', form);
  const selectedUsers = Form.useWatch('users', form) ?? [];

  useEffect(() => {
    if (watchPartyId) void loadParty(Number(watchPartyId));
  }, [watchPartyId]);

  const headCount = selectedUsers.length;
  const preview = useMemo(() => {
    const raw = Number(amountInput);
    if (!headCount || !Number.isFinite(raw) || raw <= 0) return null;

    if (splitMode === 'per_person') {
      const per = Math.round(raw * 100) / 100;
      const sum = totalFromPerPerson(per, headCount);
      return {per, sum, mode: splitMode as SplitMode};
    }
    const per = perPersonFromTotal(raw, headCount);
    if (per == null) return null;
    const sum = Math.round(per * headCount * 100) / 100;
    return {per, sum, totalInput: raw, mode: splitMode as SplitMode};
  }, [amountInput, headCount, splitMode]);

  const onFinish = async (v: FormValues) => {
    if (!v.users?.length) {
      message.error('请至少选择一名成员');
      return;
    }
    const perPerson = resolveSubmitPerPerson(v.split_mode, Number(v.amount_input), v.users.length);
    if (perPerson == null || perPerson <= 0) {
      message.error(v.split_mode === 'total' ? '请输入有效的总金额' : '请输入有效的人均金额');
      return;
    }

    const p = new URLSearchParams();
    p.set('party_id', String(v.party_id));
    p.set('description', v.description.trim());
    p.set('amount', String(perPerson));
    p.set('unit', v.unit);
    p.set('users', JSON.stringify(v.users));
    const res = await apiPostForm('/user/item/add', p);
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      message.error(out.msg || '添加失败');
      return;
    }
    const sym = currencySymbol(currencyMap[v.unit], v.unit);
    message.success(
      v.split_mode === 'total'
        ? `已添加：${v.users.length} 人，人均 ${sym}${formatMoney(perPerson)}`
        : `已添加：${v.users.length} 人，每人 ${sym}${formatMoney(perPerson)}`,
    );
    nav(`/items/party/${v.party_id}`);
  };

  const selectedParty = parties.find((p) => p.id === watchPartyId);
  const unitCode = Form.useWatch('unit', form) ?? '';
  const unitSym = currencySymbol(currencyMap[unitCode], unitCode);
  const currencyOptions = currencySelectOptionsForCodes(currencyCodes, currencyMap);

  return (
    <PageShell title="添加收款" back={{to: '/items'}} loading={loading} layout="narrow" maxWidth={640}>
      <SurfaceCard className="bbs-form-page">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{split_mode: 'total', amount_input: undefined, users: []}}
        >
          <Form.Item
            name="party_id"
            label="选择派对"
            rules={[{required: true, message: '请选择一个派对'}]}
            extra="仅显示未归档且你已加入的派对"
          >
            <PartyPicker options={parties}/>
          </Form.Item>

          {selectedParty ? (
            <Alert
              type="success"
              showIcon
              style={{marginBottom: 20}}
              message={
                <Typography.Text>
                  当前：<Typography.Text strong>{selectedParty.name}</Typography.Text>
                </Typography.Text>
              }
            />
          ) : null}

          {watchPartyId ? (
            <>
              <Form.Item name="description" label="描述" rules={[{required: true}]}>
                <Input autoComplete="off" placeholder="这笔款项的说明"/>
              </Form.Item>

              <Form.Item name="unit" label="货币" rules={[{required: true}]}>
                <Select options={currencyOptions} placeholder="选择货币"/>
              </Form.Item>

              <Form.Item label="金额方式" name="split_mode">
                <Segmented
                  block
                  options={[
                    {label: '总金额分摊', value: 'total'},
                    {label: '人均金额', value: 'per_person'},
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="amount_input"
                label={splitMode === 'total' ? '总金额' : '人均金额'}
                rules={[{required: true, message: splitMode === 'total' ? '请输入总金额' : '请输入人均金额'}]}
                extra={
                  splitMode === 'total'
                    ? '按所选人数均分；提交时每人记入相同的人均金额'
                    : '每位选中成员各记入该金额'
                }
              >
                <InputNumber
                  style={{width: '100%'}}
                  min={0.01}
                  step={0.01}
                  precision={2}
                  placeholder="0.00"
                  addonAfter={unitSym || undefined}
                />
              </Form.Item>

              <Form.Item
                name="users"
                label="记入谁名下（可多选）"
                rules={[{required: true, type: 'array', min: 1, message: '请至少选择一名成员'}]}
              >
                <Checkbox.Group
                  className="bbs-member-check-group"
                  options={members.map((m) => ({label: m.username, value: m.id}))}
                />
              </Form.Item>

              {preview ? (
                <Alert
                  type="info"
                  showIcon
                  className="bbs-split-preview"
                  message="分摊预览"
                  description={
                    preview.mode === 'total' ? (
                      <>
                        已选 <strong>{headCount}</strong> 人，人均{' '}
                        <strong>
                          {unitSym}
                          {formatMoney(preview.per)}
                        </strong>
                        （按总金额 {unitSym}
                        {formatMoney(preview.totalInput!)} 均分，合计约 {unitSym}
                        {formatMoney(preview.sum)}）
                      </>
                    ) : (
                      <>
                        已选 <strong>{headCount}</strong> 人，每人{' '}
                        <strong>
                          {unitSym}
                          {formatMoney(preview.per)}
                        </strong>
                        ，合计{' '}
                        <strong>
                          {unitSym}
                          {formatMoney(preview.sum)}
                        </strong>
                      </>
                    )
                  }
                  style={{marginBottom: 20}}
                />
              ) : headCount === 0 && amountInput ? (
                <Alert type="warning" showIcon message="请先选择至少一名成员以计算分摊" style={{marginBottom: 20}}/>
              ) : null}
            </>
          ) : (
            <Typography.Paragraph type="secondary" style={{textAlign: 'center', marginBottom: 24}}>
              请先选择派对，再填写收款详情
            </Typography.Paragraph>
          )}

          <Space style={{width: '100%', justifyContent: 'center'}}>
            <Button type="primary" htmlType="submit" disabled={!watchPartyId || !parties.length}>
              提交
            </Button>
            <Link to="/items">
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </SurfaceCard>
    </PageShell>
  );
}
