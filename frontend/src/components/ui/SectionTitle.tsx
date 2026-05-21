import type {ReactNode} from 'react';

type SectionTitleProps = {
  icon?: ReactNode;
  children: ReactNode;
};

export function SectionTitle({icon, children}: SectionTitleProps) {
  return (
    <span className="bbs-section-title">
      {icon}
      {children}
    </span>
  );
}
