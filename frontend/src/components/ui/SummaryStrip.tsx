import type {ReactNode} from 'react';
import {Typography} from 'antd';

type SummaryStripProps = {
  label: string;
  value: ReactNode;
  tone?: 'success' | 'warning' | 'primary';
};

const toneColor = {
  success: '#15803d',
  warning: '#b45309',
  primary: '#0f766e',
};

export function SummaryStrip({label, value, tone = 'primary'}: SummaryStripProps) {
  return (
    <div className={`bbs-summary-strip bbs-summary-strip--${tone}`}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong className="bbs-summary-strip__value" style={{color: toneColor[tone]}}>
        {value}
      </Typography.Text>
    </div>
  );
}
