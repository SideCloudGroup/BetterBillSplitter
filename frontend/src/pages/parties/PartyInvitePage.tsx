import {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {Button, Result, Space, Spin, Typography} from 'antd';
import {LoginOutlined, TeamOutlined, UserAddOutlined} from '@ant-design/icons';
import {getAccessToken, tryRefresh} from '@/api/client';
import {useAuth} from '@/context/AuthContext';
import {joinPartyWithCode} from '@/components/PartyJoinModal';
import {PartyInviteCard} from '@/components/PartyInviteCard';
import {AuthLayout} from '@/components/ui';
import {fetchPartyInvitePreview, type PartyInvitePreview} from '@/lib/partyInvite';

type PageState =
  | { status: 'loading' }
  | { status: 'error'; msg: string }
  | { status: 'ready'; preview: PartyInvitePreview; authed: boolean };

export function PartyInvitePage() {
  const {code} = useParams();
  const nav = useNavigate();
  const {user} = useAuth();
  const inviteCode = (code || '').trim();
  const from = `/parties/join/${encodeURIComponent(inviteCode)}`;

  const [state, setState] = useState<PageState>({status: 'loading'});
  const [joining, setJoining] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const loadPreview = useCallback(async (authed: boolean) => {
    if (!inviteCode) {
      setState({status: 'error', msg: '邀请码无效'});
      return;
    }
    setState({status: 'loading'});
    const result = await fetchPartyInvitePreview(inviteCode);
    if (!result.ok) {
      setState({status: 'error', msg: result.msg});
      return;
    }
    setState({status: 'ready', preview: result.data, authed});
  }, [inviteCode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await tryRefresh();
      if (!cancelled) setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const authed = !!getAccessToken() || !!user;
    void loadPreview(authed);
  }, [authChecked, user, loadPreview]);

  const handleJoin = async () => {
    if (state.status !== 'ready') return;
    setJoining(true);
    try {
      const result = await joinPartyWithCode(inviteCode);
      if (!result.ok) {
        if (result.partyId) {
          nav(`/parties/${result.partyId}`, {replace: true});
          return;
        }
        setState({status: 'error', msg: result.msg});
        return;
      }
      nav(`/parties/${result.partyId}`, {replace: true});
    } finally {
      setJoining(false);
    }
  };

  if (state.status === 'loading' || !authChecked) {
    return (
      <div className="bbs-auth-shell bbs-invite-page" style={{justifyContent: 'center', alignItems: 'center'}}>
        <Spin size="large"/>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="bbs-auth-shell bbs-invite-page">
        <Result
          status="error"
          title="无法加入派对"
          subTitle={state.msg}
          extra={
            <Link to="/">
              <Button type="primary">返回首页</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const {preview, authed} = state;
  const isMember = preview.is_member === true;

  return (
    <AuthLayout
      title={isMember ? '你已是该派对成员' : '加入派对'}
      subtitle={isMember ? '可直接进入派对查看账目' : '确认派对信息后选择是否加入'}
      variant="login"
      width={480}
    >
      <PartyInviteCard preview={preview}/>

      {isMember ? (
        <Space direction="vertical" size="middle" style={{width: '100%', marginTop: 8}}>
          <Button
            type="primary"
            size="large"
            block
            icon={<TeamOutlined/>}
            onClick={() => nav(`/parties/${preview.party_id}`, {replace: true})}
          >
            进入派对
          </Button>
          <Link to="/parties" style={{display: 'block', textAlign: 'center'}}>
            <Typography.Text type="secondary">返回派对列表</Typography.Text>
          </Link>
        </Space>
      ) : authed ? (
        <Space direction="vertical" size="middle" style={{width: '100%', marginTop: 8}}>
          <Typography.Text style={{display: 'block', textAlign: 'center'}}>
            是否加入该派对？
          </Typography.Text>
          <Button
            type="primary"
            size="large"
            block
            icon={<TeamOutlined/>}
            loading={joining}
            onClick={() => void handleJoin()}
          >
            确认加入
          </Button>
          <Button size="large" block onClick={() => nav('/parties')}>
            暂不加入
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{width: '100%', marginTop: 8}}>
          <Typography.Text type="secondary" style={{display: 'block', textAlign: 'center'}}>
            登录或注册后即可加入该派对
          </Typography.Text>
          <Button
            type="primary"
            size="large"
            block
            icon={<LoginOutlined/>}
            onClick={() => nav('/login', {state: {from}})}
          >
            登录并加入
          </Button>
          <Button
            size="large"
            block
            icon={<UserAddOutlined/>}
            onClick={() => nav('/register', {state: {from}})}
          >
            注册账号
          </Button>
          <Link to="/" style={{display: 'block', textAlign: 'center'}}>
            <Typography.Text type="secondary">返回首页</Typography.Text>
          </Link>
        </Space>
      )}
    </AuthLayout>
  );
}
