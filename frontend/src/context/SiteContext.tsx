import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {defaultSiteName, fetchPublicBootstrap} from '@/lib/publicBootstrap';

type SiteCtx = {
  siteName: string;
  loading: boolean;
};

const SiteContext = createContext<SiteCtx | null>(null);

export function SiteProvider({children}: { children: React.ReactNode }) {
  const [siteName, setSiteName] = useState(defaultSiteName);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const b = await fetchPublicBootstrap();
        const name = (b.general_name || '').trim() || defaultSiteName();
        setSiteName(name);
        document.title = name;
      } catch {
        setSiteName(defaultSiteName());
        document.title = defaultSiteName();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo(() => ({siteName, loading}), [siteName, loading]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteCtx {
  const c = useContext(SiteContext);
  if (!c) throw new Error('useSite outside SiteProvider');
  return c;
}
