import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Alert, Button, Card, Flex, Spin, theme, Typography} from 'antd';
import {ArrowLeftOutlined} from '@ant-design/icons';

type PageLayout = 'wide' | 'narrow';

type PageShellProps = {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  back?: { to: string; label?: string };
  loading?: boolean;
  error?: string | null;
  children?: ReactNode;
  card?: boolean;
  maxWidth?: number | string;
  layout?: PageLayout;
  centered?: boolean;
};

const LAYOUT_MAX: Record<PageLayout, number> = {
  narrow: 720,
  wide: 1200,
};

export function PageShell({
                            title,
                            subtitle,
                            extra,
                            back,
                            loading,
                            error,
                            children,
                            card = false,
                            maxWidth,
                            layout = 'wide',
                            centered,
                          }: PageShellProps) {
  const {token} = theme.useToken();
  const isCentered = centered ?? layout === 'narrow';
  const resolvedMax = maxWidth ?? LAYOUT_MAX[layout];

  const pageClass = ['bbs-page', isCentered ? 'bbs-page--center' : '', layout === 'narrow' ? 'bbs-page--narrow' : 'bbs-page--wide']
    .filter(Boolean)
    .join(' ');

  const titleBlock = (
    <div className="bbs-page-heading">
      {back ? (
        <Link to={back.to} className="bbs-page-back">
          <Button type="text" icon={<ArrowLeftOutlined/>} size="small">
            {back.label ?? '返回'}
          </Button>
        </Link>
      ) : null}
      <Typography.Title level={3} style={{margin: 0, color: token.colorTextHeading}}>
        {title}
      </Typography.Title>
      {subtitle ? (
        <Typography.Paragraph type="secondary" className="bbs-page-subtitle">
          {subtitle}
        </Typography.Paragraph>
      ) : null}
    </div>
  );

  const header = (
    <Flex
      className="bbs-page-header"
      align={isCentered ? 'center' : 'flex-start'}
      justify={isCentered && !extra ? 'center' : 'space-between'}
      gap={16}
      wrap="wrap"
      vertical={isCentered && !!extra}
    >
      {titleBlock}
      {extra ? <div className="bbs-page-header-extra">{extra}</div> : null}
    </Flex>
  );

  const shell = (body: ReactNode) => (
    <div className={pageClass} style={{maxWidth: resolvedMax}}>
      {header}
      {body}
    </div>
  );

  if (loading) {
    return shell(
      <Flex justify="center" style={{padding: 48}}>
        <Spin size="large"/>
      </Flex>,
    );
  }

  if (error) {
    return shell(<Alert type="error" message={error} showIcon/>);
  }

  const body = card ? (
    <Card variant="borderless" className="bbs-surface-card">
      {children}
    </Card>
  ) : (
    children
  );

  return shell(body);
}
