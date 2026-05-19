import type {ReactNode} from 'react';
import {Card, type CardProps} from 'antd';

type SurfaceCardProps = CardProps & {
  children: ReactNode;
};

/** 统一内容卡片：白底、轻阴影、圆角 */
export function SurfaceCard({children, className, ...rest}: SurfaceCardProps) {
  return (
    <Card bordered={false} className={`bbs-surface-card ${className ?? ''}`.trim()} {...rest}>
      {children}
    </Card>
  );
}
