import type {AuthUser} from '@/api/client';

export function getMe(): AuthUser | null {
  try {
    const t = sessionStorage.getItem('me');
    if (!t) return null;
    return JSON.parse(t) as AuthUser;
  } catch {
    return null;
  }
}

export function setMe(u: AuthUser | null): void {
  if (!u) sessionStorage.removeItem('me');
  else sessionStorage.setItem('me', JSON.stringify(u));
}
