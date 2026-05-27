import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {AUTH_USER_CHANGED_EVENT, type AuthUser} from '@/api/client';
import {getMe, setMe as persistMe} from '@/lib/storage';

type Ctx = {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({children}: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => getMe());
  const setUser = useCallback((u: AuthUser | null) => {
    persistMe(u);
    setUserState(u);
  }, []);

  useEffect(() => {
    const handler = () => {
      setUserState(getMe());
    };
    window.addEventListener(AUTH_USER_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(AUTH_USER_CHANGED_EVENT, handler);
    };
  }, []);

  const v = useMemo(() => ({user, setUser}), [user, setUser]);
  return <AuthContext.Provider value={v}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
