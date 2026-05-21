import {useEffect, useState} from 'react';
import {Link, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {Avatar, Button, Grid, Layout, Menu, Space, theme as antTheme, Typography} from 'antd';
import {
  AccountBookFilled,
  AccountBookOutlined,
  CloseOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  PayCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {apiFetch, setAccessToken} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {useSite} from '@/context/SiteContext';
import {brandPrimary} from '@/theme/appTheme';

const {Header, Sider, Content} = Layout;
const {useBreakpoint} = Grid;

const navItems = (isAdmin: boolean) => {
  const base = [
    {key: '/', icon: <HomeOutlined/>, label: <Link to="/">概览</Link>},
    {key: '/payment', icon: <PayCircleOutlined/>, label: <Link to="/payment">支付</Link>},
    {key: '/items', icon: <AccountBookOutlined/>, label: <Link to="/items">收款</Link>},
    {key: '/parties', icon: <TeamOutlined/>, label: <Link to="/parties">派对</Link>},
    {key: '/profile', icon: <UserOutlined/>, label: <Link to="/profile">账户</Link>},
  ];
  if (isAdmin) {
    base.push({
      key: '/admin',
      icon: <SafetyCertificateOutlined/>,
      label: <Link to="/admin">管理</Link>,
    });
  }
  return base;
};

function selectedFromPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return '/';
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/payment')) return '/payment';
  if (pathname.startsWith('/items')) return '/items';
  if (pathname.startsWith('/parties')) return '/parties';
  if (pathname.startsWith('/profile')) return '/profile';
  return '/';
}

function BrandMark({collapsed, compact, siteName}: { collapsed?: boolean; compact?: boolean; siteName: string }) {
  const short = siteName.length <= 4 ? siteName : siteName.slice(0, 2);
  return (
    <div
      className="bbs-brand-mark"
      style={{
        height: compact ? 40 : 56,
        margin: compact ? '0' : '12px 12px 8px',
        paddingInline: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      <AccountBookFilled/>
      {!collapsed ? <span>{compact ? short : siteName}</span> : null}
    </div>
  );
}

export function MainLayout() {
  const {token} = antTheme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const loc = useLocation();
  const nav = useNavigate();
  const {user, setUser} = useAuth();
  const {siteName} = useSite();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const logout = async () => {
    await apiFetch('/auth/logout', {method: 'POST'});
    setAccessToken(null);
    setUser(null);
    nav('/login', {replace: true});
  };

  const displayName = user?.username ?? '';
  const initial = displayName ? displayName.slice(0, 1).toUpperCase() : '?';
  const siderBg = token.Layout?.siderBg ?? '#0f766e';

  const menuProps = {
    theme: 'dark' as const,
    mode: 'inline' as const,
    selectedKeys: [selectedFromPath(loc.pathname)],
    items: navItems(!!user?.is_admin),
    style: {background: 'transparent', borderInlineEnd: 'none'},
    onClick: () => setMobileNavOpen(false),
  };

  return (
    <Layout style={{minHeight: '100vh'}}>
      {!isMobile ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          breakpoint="lg"
          width={232}
          style={{background: siderBg}}
        >
          <BrandMark collapsed={collapsed} siteName={siteName}/>
          <Menu {...menuProps} />
        </Sider>
      ) : null}

      <Layout>
        <div className={isMobile ? 'bbs-mobile-top' : undefined}>
          <Header
            className="bbs-app-header"
            style={{
              background: token.colorBgContainer,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: mobileNavOpen ? 'none' : `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {isMobile ? (
              <Space size={8} align="center">
                <Button
                  type="text"
                  icon={mobileNavOpen ? <CloseOutlined/> : <MenuOutlined/>}
                  aria-label={mobileNavOpen ? '关闭菜单' : '打开菜单'}
                  aria-expanded={mobileNavOpen}
                  onClick={() => setMobileNavOpen((o) => !o)}
                />
                <BrandMark compact siteName={siteName}/>
              </Space>
            ) : (
              <span/>
            )}
            <Space size="middle">
              <Space size={10}>
                <Avatar style={{backgroundColor: brandPrimary}} size="small">
                  {initial}
                </Avatar>
                <Typography.Text strong className="bbs-hide-mobile">
                  {displayName}
                </Typography.Text>
              </Space>
              <Button type="default" icon={<LogoutOutlined/>} onClick={() => void logout()} aria-label="退出登录">
                <span className="bbs-hide-mobile">退出</span>
              </Button>
            </Space>
          </Header>

          {isMobile ? (
            <nav
              className={`bbs-mobile-nav${mobileNavOpen ? ' bbs-mobile-nav--open' : ''}`}
              style={{background: siderBg}}
              aria-hidden={!mobileNavOpen}
            >
              <Menu {...menuProps} />
            </nav>
          ) : null}
        </div>

        <Content className="bbs-main-content">
          <div className="bbs-content-inner">
            <Outlet/>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
