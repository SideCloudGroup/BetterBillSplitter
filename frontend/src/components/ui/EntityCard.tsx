import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Typography} from 'antd';
import {RightOutlined} from '@ant-design/icons';

type AmountTone = 'success' | 'warning' | 'neutral';

type EntityCardProps = {
  to: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  amount?: string;
  amountLabel?: string;
  amountTone?: AmountTone;
  icon?: ReactNode;
};

const toneColor: Record<AmountTone, string> = {
  success: '#15803d',
  warning: '#b45309',
  neutral: '#0f766e',
};

export function EntityCard({
                             to,
                             title,
                             description,
                             badge,
                             amount,
                             amountLabel,
                             amountTone = 'neutral',
                             icon,
                           }: EntityCardProps) {
  return (
    <Link to={to} className="bbs-entity-card">
      {icon ? <span className="bbs-entity-card__icon">{icon}</span> : null}
      <span className="bbs-entity-card__body">
        <span className="bbs-entity-card__head">
          <Typography.Text strong className="bbs-entity-card__title">
            {title}
          </Typography.Text>
          {badge}
        </span>
        {description ? (
          <Typography.Text type="secondary" className="bbs-entity-card__desc" ellipsis>
            {description}
          </Typography.Text>
        ) : null}
        {amount != null ? (
          <span className="bbs-entity-card__amount-wrap">
            {amountLabel ? (
              <Typography.Text type="secondary" className="bbs-entity-card__amount-label">
                {amountLabel}
              </Typography.Text>
            ) : null}
            <Typography.Text strong className="bbs-entity-card__amount" style={{color: toneColor[amountTone]}}>
              {amount}
            </Typography.Text>
          </span>
        ) : null}
      </span>
      <RightOutlined className="bbs-entity-card__chevron"/>
    </Link>
  );
}
