import {useEffect, useRef, useState} from 'react';
import {Alert, Button, Image, Input, Typography} from 'antd';

export type CaptchaBootstrap = {
  driver?: string;
  site_key?: string;
  captcha_image_url?: string;
  cap_custom_url?: string;
  general_name?: string;
};

let captchaExtra: Record<string, string> = {};

export function getCaptchaExtraParams(): Record<string, string> {
  return {...captchaExtra};
}

export async function fetchCaptchaBootstrap(): Promise<CaptchaBootstrap> {
  try {
    const r = await fetch('/api/auth/bootstrap', {credentials: 'same-origin'});
    const j = (await r.json()) as { ret?: number; data?: CaptchaBootstrap };
    return j.data || {driver: 'none'};
  } catch {
    return {driver: 'none'};
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(s);
  });
}

function setExtra(next: Record<string, string>) {
  captchaExtra = next;
}

type Props = { slotKey: string };

export function AuthCaptcha({slotKey}: Props) {
  const [boot, setBoot] = useState<CaptchaBootstrap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const numericUrl = boot?.captcha_image_url || '/captcha';
  const [capTick, setCapTick] = useState(0);
  const turnHost = useRef<HTMLDivElement>(null);
  const hcapHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captchaExtra = {};
    void (async () => {
      try {
        const b = await fetchCaptchaBootstrap();
        setBoot(b);
      } catch {
        setBoot({driver: 'none'});
      }
    })();
  }, [slotKey]);

  useEffect(() => {
    if (!boot) return;
    const driver = boot.driver || 'none';
    setErr(null);
    captchaExtra = {};
    if (driver === 'none' || driver === '') return;

    if (driver === 'numeric') {
      setExtra({});
      return;
    }

    if (driver === 'turnstile' && boot.site_key && turnHost.current) {
      void (async () => {
        try {
          await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js');
          const w = window as unknown as {
            turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
          };
          if (!w.turnstile || !turnHost.current) throw new Error('Turnstile 未就绪');
          turnHost.current.innerHTML = '';
          w.turnstile.render(turnHost.current, {
            sitekey: boot.site_key,
            callback: (token: string) => setExtra({'cf-turnstile-response': token}),
            'expired-callback': () => setExtra({}),
          });
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })();
      return;
    }

    if (driver === 'hcaptcha' && boot.site_key && hcapHost.current) {
      void (async () => {
        try {
          await loadScript('https://js.hcaptcha.com/1/api.js');
          const w = window as unknown as {
            hcaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
          };
          if (!w.hcaptcha || !hcapHost.current) throw new Error('hCaptcha 未就绪');
          hcapHost.current.innerHTML = '';
          w.hcaptcha.render(hcapHost.current, {
            sitekey: boot.site_key,
            callback: (token: string) => setExtra({'h-captcha-response': token}),
            'expired-callback': () => setExtra({}),
          });
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })();
    }
  }, [boot, capTick]);

  if (!boot) return null;
  const driver = boot.driver || 'none';
  if (driver === 'none' || driver === '') return null;
  if (err) return <Alert type="error" message={err}/>;

  if (driver === 'numeric') {
    const src = `${numericUrl}?t=${capTick}`;
    return (
      <div>
        <Typography.Text type="secondary">验证码</Typography.Text>
        <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8}}>
          <Image
            src={src}
            alt="验证码"
            preview={false}
            style={{cursor: 'pointer', border: '1px solid #d9d9d9', borderRadius: 6}}
            onClick={() => {
              setCapTick(Date.now());
              setExtra({});
            }}
          />
          <Button size="small" onClick={() => setCapTick(Date.now())}>
            换一张
          </Button>
        </div>
        <Input
          style={{marginTop: 8}}
          placeholder="请输入图中字符"
          autoComplete="off"
          onChange={(e) => setExtra({captcha: e.target.value.trim()})}
        />
      </div>
    );
  }

  if (driver === 'turnstile' && boot.site_key) {
    return <div ref={turnHost} className="mb-2"/>;
  }

  if (driver === 'hcaptcha' && boot.site_key) {
    return <div ref={hcapHost} className="mb-2"/>;
  }

  if (driver === 'cap') {
    return (
      <div>
        <Typography.Text strong>人机验证</Typography.Text>
        <Typography.Paragraph type="secondary" style={{marginBottom: 8}}>
          站点使用自定义验证服务，请完成验证后把 token 填入下方。
        </Typography.Paragraph>
        {boot.cap_custom_url ? (
          <Typography.Link href={boot.cap_custom_url} target="_blank" rel="noopener noreferrer">
            验证入口
          </Typography.Link>
        ) : null}
        <Input
          style={{marginTop: 8}}
          placeholder="cap-token"
          autoComplete="off"
          onChange={(e) => setExtra({'cap-token': e.target.value.trim()})}
        />
      </div>
    );
  }

  return <Alert type="warning" message={`未知验证码驱动：${driver}`}/>;
}
