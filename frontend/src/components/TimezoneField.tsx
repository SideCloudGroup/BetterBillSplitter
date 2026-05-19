import {AutoComplete, Typography} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {apiFetch, apiPostForm} from '@/api/client';

type Props = {
  value?: string;
  onChange?: (v: string) => void;
};

export function TimezoneField({value, onChange}: Props) {
  const v = value ?? '';
  const [options, setOptions] = useState<{ value: string }[]>([]);
  const [hint, setHint] = useState('');
  const [hintOk, setHintOk] = useState<boolean | null>(null);
  const timer = useRef<number>();

  const runSearch = useCallback((q: string) => {
    window.clearTimeout(timer.current);
    const t = q.trim();
    if (t.length < 2) {
      setOptions([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      void (async () => {
        const res = await apiFetch(`/user/party/search-timezones?query=${encodeURIComponent(t)}`);
        const j = (await res.json()) as { ret?: number; timezones?: string[] };
        if (j.ret === 1 && j.timezones?.length) {
          setOptions(j.timezones.map((z) => ({value: z})));
        }
      })();
    }, 320);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  const onBlur = async () => {
    const raw = (value ?? '').trim();
    if (!raw) {
      setHint('');
      setHintOk(null);
      return;
    }
    const res = await apiPostForm('/user/party/validate-timezone', {timezone: raw});
    const j = (await res.json()) as { ret: number; msg?: string };
    setHint(j.msg || (j.ret === 1 ? '时区有效' : '无效'));
    setHintOk(j.ret === 1);
  };

  return (
    <div>
      <AutoComplete
        value={v}
        onChange={(x) => onChange?.(String(x))}
        options={options}
        onSearch={runSearch}
        onBlur={() => void onBlur()}
        style={{width: '100%'}}
        placeholder="例如 Asia/Shanghai"
        allowClear
      />
      {hint ? (
        <Typography.Text type={hintOk ? 'success' : 'danger'} style={{fontSize: 12}}>
          {hint}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{fontSize: 12}}>
          输入至少 2 个字符触发建议，失焦时校验
        </Typography.Text>
      )}
    </div>
  );
}
