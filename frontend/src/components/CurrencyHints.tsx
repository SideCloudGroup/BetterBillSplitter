import {useEffect, useState} from 'react';
import {List, Typography} from 'antd';
import {apiPostJson} from '@/api/client';

export function CurrencyHints({codes}: { codes: string[] }) {
  const [info, setInfo] = useState<Record<string, string> | null>(null);
  const key = [...new Set(codes.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const uniq = [...new Set(codes.filter(Boolean))];
    if (!uniq.length) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiPostJson('/user/party/currency-info', {currencies: uniq});
      const j = (await res.json()) as { ret?: number; currency_info?: Record<string, string> };
      if (!cancelled && j.ret === 1 && j.currency_info) setInfo(j.currency_info);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!info) return null;
  const entries = Object.entries(info);
  return (
    <List
      size="small"
      dataSource={entries}
      renderItem={([code, label]) => (
        <List.Item style={{padding: '4px 0', border: 'none'}}>
          <Typography.Text type="secondary" style={{fontSize: 12}}>
            {code} — {label}
          </Typography.Text>
        </List.Item>
      )}
    />
  );
}
