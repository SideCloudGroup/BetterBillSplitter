import type {ReactNode} from 'react';
import {Card, Statistic, theme} from 'antd';

type Accent = 'primary' | 'success' | 'warning' | 'info';

const accentMap: Record<Accent, { bar: string; value: string }> = {
  primary: {bar: '#0d9488', value: '#0f766e'},
  success: {bar: '#16a34a', value: '#15803d'},
  warning: {bar: '#d97706', value: '#b45309'},
  info: {bar: '#0284c7', value: '#0369a1'},
};

type StatCardProps = {
  title: string;
  value: ReactNode;
  accent?: Accent;
  suffix?: ReactNode;
};

export function StatCard({title, value, accent = 'primary', suffix}: StatCardProps) {
  const {token} = theme.useToken();
  const colors = accentMap[accent];

  return (
    <Card
      bordered={false}
      className="bbs-stat-card"
      styles={{body: {padding: '18px 20px'}}}
      style={{
        borderTop: `3px solid ${colors.bar}`,
        boxShadow: token.boxShadowTertiary,
      }}
    >
      <Statistic
        title={<span style={{color: token.colorTextSecondary, fontWeight: 500}}>{title}</span>}
        value={value}
        suffix={suffix}
        valueStyle={{color: colors.value, fontWeight: 600, fontSize: 26}}
      />
    </Card>
  );
}
