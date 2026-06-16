import {Avatar, Flex, Tag, Typography} from 'antd';
import {TeamOutlined, UserOutlined} from '@ant-design/icons';
import type {PartyInvitePreview} from '@/lib/partyInvite';

type PartyInviteCardProps = {
  preview: PartyInvitePreview;
};

export function PartyInviteCard({preview}: PartyInviteCardProps) {
  const initial = preview.name?.charAt(0)?.toUpperCase() || 'P';

  return (
    <div className="bbs-invite-hero">
      <Avatar size={64} className="bbs-invite-hero__avatar">
        {initial}
      </Avatar>
      <Typography.Title level={4} style={{margin: '12px 0 4px', textAlign: 'center'}}>
        {preview.name}
      </Typography.Title>
      {preview.description ? (
        <Typography.Paragraph
          type="secondary"
          style={{marginBottom: 16, textAlign: 'center', maxWidth: 360, margin: '0 auto 16px'}}
        >
          {preview.description}
        </Typography.Paragraph>
      ) : null}
      <Flex gap={8} wrap="wrap" justify="center" style={{marginBottom: 8}}>
        <Tag icon={<TeamOutlined/>} bordered={false}>
          {preview.member_count} 位成员
        </Tag>
        {preview.base_currency ? (
          <Tag bordered={false}>基准货币 {preview.base_currency.toUpperCase()}</Tag>
        ) : null}
      </Flex>
      {preview.owner_username ? (
        <Typography.Text type="secondary" style={{fontSize: 13}}>
          <UserOutlined style={{marginRight: 4}}/>
          由 {preview.owner_username} 创建
        </Typography.Text>
      ) : null}
    </div>
  );
}
