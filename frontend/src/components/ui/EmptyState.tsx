import type {ReactNode} from 'react';
import {Typography} from 'antd';

type EmptyStateProps = {
  description: string;
  action?: ReactNode;
};

export function EmptyState({description, action}: EmptyStateProps) {
  return (
    <div className="bbs-empty-state">
      <Typography.Text type="secondary">{description}</Typography.Text>
      {action ? <div className="bbs-empty-state__action">{action}</div> : null}
    </div>
  );
}
