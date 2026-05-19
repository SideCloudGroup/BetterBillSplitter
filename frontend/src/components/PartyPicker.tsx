import {Link} from 'react-router-dom';
import {Alert, Col, Row, theme, Typography} from 'antd';
import {CheckCircleFilled, TeamOutlined} from '@ant-design/icons';
import {brandPrimary} from '@/theme/appTheme';

export type PartyOption = {
  id: number;
  name: string;
  description?: string;
};

type PartyPickerProps = {
  value?: number;
  onChange?: (partyId: number) => void;
  options: PartyOption[];
};

export function PartyPicker({value, onChange, options}: PartyPickerProps) {
  const {token} = theme.useToken();

  if (!options.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="暂无可用派对"
        description={
          <>
            仅显示未归档且你已加入的派对。
            <Link to="/parties/create" style={{marginInline: 6}}>
              创建
            </Link>
            或
            <Link to="/parties/join" style={{marginInline: 6}}>
              加入
            </Link>
            后再添加收款。
          </>
        }
      />
    );
  }

  return (
    <Row gutter={[12, 12]} className="bbs-party-picker">
      {options.map((p) => {
        const selected = value === p.id;
        return (
          <Col xs={24} sm={options.length === 1 ? 24 : 12} key={p.id}>
            <button
              type="button"
              className={`bbs-party-pick${selected ? ' bbs-party-pick--active' : ''}`}
              onClick={() => onChange?.(p.id)}
              aria-pressed={selected}
              style={
                selected
                  ? {
                    borderColor: brandPrimary,
                    background: token.colorPrimaryBg,
                    boxShadow: `0 0 0 1px ${brandPrimary}`,
                  }
                  : undefined
              }
            >
              <span className="bbs-party-pick__icon" aria-hidden>
                <TeamOutlined/>
              </span>
              <span className="bbs-party-pick__body">
                <Typography.Text strong className="bbs-party-pick__name">
                  {p.name}
                </Typography.Text>
                {p.description ? (
                  <Typography.Text type="secondary" className="bbs-party-pick__desc" ellipsis>
                    {p.description}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" className="bbs-party-pick__desc">
                    无说明
                  </Typography.Text>
                )}
              </span>
              {selected ? (
                <CheckCircleFilled className="bbs-party-pick__check" style={{color: brandPrimary}}/>
              ) : null}
            </button>
          </Col>
        );
      })}
    </Row>
  );
}
