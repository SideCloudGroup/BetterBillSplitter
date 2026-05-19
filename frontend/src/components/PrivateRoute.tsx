import {useEffect, useState} from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import {Spin} from 'antd';
import {tryRefresh} from '@/api/client';

export function PrivateRoute({children}: { children: React.ReactNode }) {
  const loc = useLocation();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await tryRefresh();
      if (!cancelled) setState(ok ? 'ok' : 'fail');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div style={{display: 'flex', justifyContent: 'center', padding: 80}}>
        <Spin size="large"/>
      </div>
    );
  }
  if (state === 'fail') {
    return <Navigate to="/login" replace state={{from: `${loc.pathname}${loc.search}`}}/>;
  }
  return <>{children}</>;
}
