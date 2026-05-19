import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {Button, Checkbox, Form, Input, message, Select, Space} from 'antd';
import {apiJson, apiPostJson} from '@/api/client';
import {TimezoneField} from '@/components/TimezoneField';
import {CurrencyHints} from '@/components/CurrencyHints';
import {PageShell, SurfaceCard} from '@/components/ui';
import type {CurrencyMap} from '@/lib/currencies';
import {currencyCheckboxOptions, currencySelectOptions} from '@/lib/currencies';

export function PartyEditPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const nav = useNavigate();
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    timezone: string;
    base_currency: string;
    supported: string[];
  }>();
  const [available, setAvailable] = useState<CurrencyMap>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setFatal(null);
      const data = await apiJson<{
        ret: number;
        msg?: string;
        data?: {
          party?: { name?: string; description?: string; timezone?: string; base_currency?: string };
          available_currencies?: CurrencyMap;
          current_supported_currencies?: string[];
        };
      }>(`/user/party/${partyId}/edit`);
      if (data.ret !== 1 || !data.data?.party) {
        setFatal(data.msg || '无法加载');
        setLoading(false);
        return;
      }
      const party = data.data.party;
      const av = data.data.available_currencies || {};
      setAvailable(av);
      form.setFieldsValue({
        name: party.name || '',
        description: party.description || '',
        timezone: party.timezone || 'Asia/Shanghai',
        base_currency: party.base_currency || 'cny',
        supported: data.data.current_supported_currencies || [],
      });
      setLoading(false);
    })();
  }, [form, partyId]);

  const base = Form.useWatch('base_currency', form);
  const supported = Form.useWatch('supported', form) || [];
  const hintCodes = useMemo(() => Array.from(new Set([base, ...supported].filter(Boolean))), [base, supported]);

  const onBaseChange = (v: string) => {
    const cur = form.getFieldValue('supported') as string[] | undefined;
    const next = new Set(cur || []);
    next.add(v);
    form.setFieldsValue({supported: [...next]});
  };

  const onFinish = async (v: {
    name: string;
    description?: string;
    timezone: string;
    base_currency: string;
    supported: string[];
  }) => {
    setFatal(null);
    const body = {
      name: v.name.trim(),
      description: (v.description || '').trim(),
      timezone: v.timezone.trim(),
      base_currency: v.base_currency,
      supported_currencies: v.supported || [],
    };
    const res = await apiPostJson(`/user/party/${partyId}/update`, body);
    const out = (await res.json()) as { ret: number; msg?: string };
    if (out.ret !== 1) {
      setFatal(out.msg || '保存失败');
      return;
    }
    message.success('已保存');
    nav(`/parties/${partyId}`);
  };

  return (
    <PageShell
      title={`编辑 — ${form.getFieldValue('name') || '派对'}`}
      back={{to: `/parties/${partyId}`}}
      loading={loading}
      error={fatal}
      layout="narrow"
    >
      <SurfaceCard>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="名称" rules={[{required: true}]}>
            <Input/>
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2}/>
          </Form.Item>
          <Form.Item name="timezone" label="时区" rules={[{required: true}]}>
            <TimezoneField/>
          </Form.Item>
          <Form.Item name="base_currency" label="基础货币" rules={[{required: true}]}>
            <Select options={currencySelectOptions(available)} onChange={onBaseChange}/>
          </Form.Item>
          <Form.Item name="supported" label="支持的货币" rules={[{required: true, type: 'array', min: 1}]}>
            <Checkbox.Group options={currencyCheckboxOptions(available)}/>
          </Form.Item>
          <CurrencyHints codes={hintCodes}/>
          <Space style={{marginTop: 16}}>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Link to={`/parties/${partyId}`}>
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </SurfaceCard>
    </PageShell>
  );
}
