import {Typography} from 'antd';

export type ExchangeStatus = {
  updated_at: string | null;
  attempted_at: string | null;
  data_date: string;
  last_error: string;
  stale: boolean;
};

export function ExchangeStatusView({status}: {status?: ExchangeStatus}) {
  const failed = Boolean(status?.last_error);
  const needsAttention = failed || status?.stale;
  return (
    <div role={needsAttention ? 'alert' : undefined}>
      <Typography.Text type={needsAttention ? 'danger' : undefined}>
        {status?.updated_at ? new Date(status.updated_at).toLocaleString() : '尚未成功获取'}
        {failed ? '（更新失败）' : status?.stale ? '（超过有效更新时间）' : ''}
      </Typography.Text>
      {status?.data_date && <div>数据日期：{status.data_date}</div>}
      {failed && <div><Typography.Text type="danger">
        最近尝试：{status?.attempted_at ? new Date(status.attempted_at).toLocaleString() : '未知'}
        <br/>{status?.last_error}
      </Typography.Text></div>}
    </div>
  );
}
