import {setMe} from '@/lib/storage';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export type AuthUser = { id: number; username: string; is_admin: boolean };

export const AUTH_USER_CHANGED_EVENT = 'auth:user-changed';

function notifyAuthUserChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_USER_CHANGED_EVENT));
  }
}

export function applyAuthPayload(data: { access_token?: string; user?: AuthUser }): void {
  if (data.access_token) accessToken = data.access_token;
  if (data.user) {
    setMe(data.user);
    notifyAuthUserChanged();
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {method: 'POST', credentials: 'include'});
    if (!res.ok) return false;
    const data = (await res.json()) as { ret?: number; access_token?: string; user?: AuthUser };
    if (data.ret === 1 && data.access_token) {
      accessToken = data.access_token;
      if (data.user) {
        setMe(data.user);
        notifyAuthUserChanged();
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export type ApiJson = Record<string, unknown>;

export async function apiFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (res.status === 401 && path !== '/auth/refresh' && !retried) {
    const ok = await tryRefresh();
    if (ok) return apiFetch(path, init, true);
  }
  return res;
}

export async function apiJson<T extends ApiJson>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(`无效 JSON 响应: ${res.status}`);
  }
  if (!res.ok) {
    throw new Error((data as { msg?: string }).msg || (data as { error?: string }).error || res.statusText);
  }
  return data;
}

export async function apiPostJson(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export async function apiPostForm(path: string, body: URLSearchParams | Record<string, string>): Promise<Response> {
  const p = body instanceof URLSearchParams ? body : new URLSearchParams(body);
  return apiFetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: p.toString(),
  });
}

export async function apiDelete(path: string): Promise<Response> {
  return apiFetch(path, {method: 'DELETE'});
}

export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
