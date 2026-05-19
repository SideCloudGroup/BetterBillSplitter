import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, Button, Checkbox, Form, Input, message, Select, Space} from 'antd';
import {apiJson, apiPostJson} from '@/api/client';
import {TimezoneField} from '@/components/TimezoneField';
import {CurrencyHints} from '@/components/CurrencyHints';
import {PageShell, SurfaceCard} from '@/components/ui';
import type {CurrencyMap} from '@/lib/currencies';
import {currencyCheckboxOptions, currencySelectOptions} from '@/lib/currencies';

export function PartyCreatePage() {
  const nav = useNavigate();
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    timezone: string;
    base_currency: string;
    supported: string[];
  }>();
  const [currencies, setCurrencies] = useState<CurrencyMap>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const data = await apiJson<{ ret: number; data?: { currencies?: CurrencyMap } }>('/user/party/create');
      if (data.ret !== 1) {
        message.error('无法加载');
        nav('/login');
        return;
      }
      const c = data.data?.currencies || {};
      setCurrencies(c);
      const codes = Object.keys(c);
      form.setFieldsValue({
        timezone: 'Asia/Shanghai',
        base_currency: codes.includes('cny') ? 'cny' : codes[0],
        supported: codes.filter((x) => x === 'cny'),
      });
    })();
  }, [form, nav]);

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
    setErr(null);
    const sup = v.supported?.length ? v.supported : [v.base_currency];
    const body = {
      name: v.name.trim(),
      description: (v.description || '').trim(),
      timezone: v.timezone.trim(),
      base_currency: v.base_currency,
      supported_currencies: sup,
    };
    const res = await apiPostJson('/user/party', body);
    const out = (await res.json()) as { ret: number; msg?: string; party_id?: number };
    if (out.ret !== 1 || !out.party_id) {
      setErr(out.msg || '创建失败');
      return;
    }
    nav(`/parties/${out.party_id}`);
  };

  return (
    <PageShell title="创建派对" back={{to: '/parties'}} layout="narrow">
      <SurfaceCard>
        {err ? <Alert type="error" message={err} style={{marginBottom: 16}} showIcon/> : null}
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="名称" rules={[{required: true}]}>
            <Input placeholder="例如：周末聚餐"/>
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="可选说明"/>
          </Form.Item>
          <Form.Item name="timezone" label="时区" rules={[{required: true}]} initialValue="Asia/Shanghai">
            <TimezoneField/>
          </Form.Item>
          <Form.Item name="base_currency" label="基础货币" rules={[{required: true}]}>
            <Select options={currencySelectOptions(currencies)} onChange={onBaseChange}/>
          </Form.Item>
          <Form.Item name="supported" label="支持的货币" rules={[{required: true, type: 'array', min: 1}]}>
            <Checkbox.Group options={currencyCheckboxOptions(currencies)}/>
          </Form.Item>
          <CurrencyHints codes={hintCodes}/>
          <Space style={{marginTop: 16}}>
            <Button type="primary" htmlType="submit">
              创建
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
