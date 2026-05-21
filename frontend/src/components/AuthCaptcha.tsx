import type {ReactNode} from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Button, Image, Input, Typography} from 'antd';
import type {CapWidgetElement} from '@/cap-widget';
import {fetchPublicBootstrap, type PublicBootstrap} from '@/lib/publicBootstrap';

export type CaptchaBootstrap = PublicBootstrap;

let captchaExtra: Record<string, string> = {};

export function getCaptchaExtraParams(): Record<string, string> {
  return {...captchaExtra};
}

export {fetchPublicBootstrap as fetchCaptchaBootstrap};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(s);
  });
}

function setExtra(next: Record<string, string>) {
  captchaExtra = next;
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const HCAPTCHA_SCRIPT = 'https://js.hcaptcha.com/1/api.js';
const CAP_SCRIPT = 'https://cdn.jsdelivr.net/npm/@cap.js/widget';

type Props = { slotKey: string };

function CaptchaWrap({children}: { children: ReactNode }) {
  return <div className="bbs-auth-captcha">{children}</div>;
}

function configError(driver: string, detail: string) {
  return (
    <CaptchaWrap>
      <Alert
        type="warning"
        message={`${driver} 验证码未正确配置`}
        description={detail}
        showIcon
      />
    </CaptchaWrap>
  );
}

export function AuthCaptcha({slotKey}: Props) {
  const [boot, setBoot] = useState<PublicBootstrap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [numericTick, setNumericTick] = useState(0);
  const turnHost = useRef<HTMLDivElement>(null);
  const hcapHost = useRef<HTMLDivElement>(null);
  const capHost = useRef<HTMLDivElement>(null);
  const capWidgetRef = useRef<CapWidgetElement | null>(null);
  const turnWidgetId = useRef(`bbs-turnstile-${slotKey}`);
  const hcapWidgetId = useRef(`bbs-hcaptcha-${slotKey}`);

  const refreshNumeric = useCallback(() => {
    setNumericTick(Date.now());
    setExtra({});
  }, []);

  useEffect(() => {
    captchaExtra = {};
    void (async () => {
      try {
        const b = await fetchPublicBootstrap();
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

    if (driver !== 'turnstile' || !boot.site_key) return;
    const host = turnHost.current;
    if (!host) return;

    let cancelled = false;
    const cbName = `__bbsTurnstile_${slotKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

    void (async () => {
      try {
        await loadScript(TURNSTILE_SCRIPT);
        if (cancelled || !turnHost.current) return;

        const w = window as unknown as {
          turnstile?: {
            render: (el: HTMLElement, opts: Record<string, unknown>) => string;
            reset: (id: string) => void;
          };
          [key: string]: unknown;
        };

        (w as Record<string, unknown>)[cbName] = (token: string) => {
          setExtra({'cf-turnstile-response': token});
        };
        (w as Record<string, unknown>)[`${cbName}_expired`] = () => setExtra({});

        turnHost.current.innerHTML = '';
        const el = document.createElement('div');
        el.id = turnWidgetId.current;
        el.className = 'cf-turnstile';
        el.setAttribute('data-sitekey', boot.site_key!);
        el.setAttribute('data-theme', 'light');
        el.setAttribute('data-callback', cbName);
        el.setAttribute('data-expired-callback', `${cbName}_expired`);
        turnHost.current.appendChild(el);

        if (w.turnstile?.render) {
          w.turnstile.render(el, {
            sitekey: boot.site_key,
            theme: 'light',
            callback: (token: string) => setExtra({'cf-turnstile-response': token}),
            'expired-callback': () => setExtra({}),
          });
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      delete (window as Record<string, unknown>)[cbName];
      delete (window as Record<string, unknown>)[`${cbName}_expired`];
      if (turnHost.current) turnHost.current.innerHTML = '';
    };
  }, [boot, slotKey]);

  useEffect(() => {
    if (!boot) return;
    const driver = boot.driver || 'none';
    if (driver !== 'hcaptcha' || !boot.site_key) return;
    const host = hcapHost.current;
    if (!host) return;

    let cancelled = false;
    const cbName = `__bbsHcaptcha_${slotKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

    void (async () => {
      try {
        await loadScript(HCAPTCHA_SCRIPT);
        if (cancelled || !hcapHost.current) return;

        const w = window as unknown as {
          hcaptcha?: {
            render: (el: HTMLElement, opts: Record<string, unknown>) => string;
            reset: (id: string) => void;
          };
          [key: string]: unknown;
        };

        (w as Record<string, unknown>)[cbName] = (token: string) => {
          setExtra({'h-captcha-response': token});
        };
        (w as Record<string, unknown>)[`${cbName}_expired`] = () => setExtra({});

        hcapHost.current.innerHTML = '';
        const el = document.createElement('div');
        el.id = hcapWidgetId.current;
        el.className = 'h-captcha';
        el.setAttribute('data-sitekey', boot.site_key!);
        el.setAttribute('data-callback', cbName);
        el.setAttribute('data-expired-callback', `${cbName}_expired`);
        hcapHost.current.appendChild(el);

        if (w.hcaptcha?.render) {
          w.hcaptcha.render(el, {
            sitekey: boot.site_key,
            callback: (token: string) => setExtra({'h-captcha-response': token}),
            'expired-callback': () => setExtra({}),
          });
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      delete (window as Record<string, unknown>)[cbName];
      delete (window as Record<string, unknown>)[`${cbName}_expired`];
      if (hcapHost.current) hcapHost.current.innerHTML = '';
    };
  }, [boot, slotKey]);

  useEffect(() => {
    if (!boot) return;
    const driver = boot.driver || 'none';
    if (driver !== 'cap' || !boot.site_key || !boot.cap_custom_url) return;
    const host = capHost.current;
    if (!host) return;

    let cancelled = false;

    const onSolve = (e: Event) => {
      const token = (e as CustomEvent<{ token: string }>).detail?.token;
      if (token) setExtra({'cap-token': token});
    };

    void (async () => {
      try {
        await loadScript(CAP_SCRIPT);
        if (cancelled || !capHost.current) return;

        capHost.current.innerHTML = '';
        const widget = document.createElement('cap-widget') as CapWidgetElement;
        widget.id = 'cap';
        widget.setAttribute(
          'data-cap-api-endpoint',
          `${boot.cap_custom_url!.replace(/\/$/, '')}/${boot.site_key}/`,
        );
        widget.addEventListener('solve', onSolve);
        capHost.current.appendChild(widget);
        capWidgetRef.current = widget;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      capWidgetRef.current?.removeEventListener('solve', onSolve);
      capWidgetRef.current = null;
      if (capHost.current) capHost.current.innerHTML = '';
    };
  }, [boot, slotKey]);

  if (!boot) return null;
  const driver = boot.driver || 'none';
  if (driver === 'none' || driver === '') return null;

  if (err) {
    return (
      <CaptchaWrap>
        <Alert type="error" message={err}/>
      </CaptchaWrap>
    );
  }

  if (driver === 'numeric') {
    const numericUrl = boot.captcha_image_url || '/captcha';
    const src = `${numericUrl}?t=${numericTick}`;
    return (
      <CaptchaWrap>
        <Typography.Text type="secondary">验证码</Typography.Text>
        <div className="bbs-auth-captcha__image-row">
          <Image
            src={src}
            alt="captcha"
            preview={false}
            style={{cursor: 'pointer', border: '1px solid #d9d9d9', borderRadius: 6}}
            onClick={refreshNumeric}
          />
          <Button size="small" onClick={refreshNumeric}>
            换一张
          </Button>
        </div>
        <Input
          className="bbs-auth-captcha__input"
          name="captcha"
          placeholder="请输入图中字符"
          autoComplete="off"
          onChange={(e) => setExtra({captcha: e.target.value.trim()})}
        />
      </CaptchaWrap>
    );
  }

  if (driver === 'turnstile') {
    if (!boot.site_key) {
      return configError('Turnstile', '请在管理后台设置中填写 Site Key。');
    }
    return (
      <CaptchaWrap>
        <div ref={turnHost}/>
      </CaptchaWrap>
    );
  }

  if (driver === 'hcaptcha') {
    if (!boot.site_key) {
      return configError('hCaptcha', '请在管理后台设置中填写 Site Key。');
    }
    return (
      <CaptchaWrap>
        <div ref={hcapHost}/>
      </CaptchaWrap>
    );
  }

  if (driver === 'cap') {
    if (!boot.site_key || !boot.cap_custom_url) {
      return configError('Cap', '请在管理后台设置中填写自定义 URL 与 Site Key。');
    }
    return (
      <CaptchaWrap>
        <div ref={capHost}/>
      </CaptchaWrap>
    );
  }

  return (
    <CaptchaWrap>
      <Alert type="warning" message={`未知验证码驱动：${driver}`}/>
    </CaptchaWrap>
  );
}
