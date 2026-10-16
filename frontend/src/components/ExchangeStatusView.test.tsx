import {render, screen} from '@testing-library/react';
import {theme} from 'antd';
import {describe, expect, it} from 'vitest';
import {ExchangeStatusView, type ExchangeStatus} from './ExchangeStatusView';

const updatedAt = '2026-10-16T04:00:00Z';
const attemptedAt = '2026-10-16T05:00:00Z';
const healthy: ExchangeStatus = {
  updated_at: updatedAt, attempted_at: updatedAt, data_date: '2026-10-16', last_error: '', stale: false,
};

describe('汇率更新时间与异常提示', () => {
  it('没有获取记录时显示初始状态', () => {
    render(<ExchangeStatusView/>);
    expect(screen.getByText('尚未成功获取')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('正常状态显示最近成功时间及数据日期', () => {
    render(<ExchangeStatusView status={healthy}/>);
    expect(screen.getByText(new Date(updatedAt).toLocaleString())).toBeVisible();
    expect(screen.getByText('数据日期：2026-10-16')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('更新时间过久时将成功时间标红', () => {
    render(<ExchangeStatusView status={{...healthy, stale: true}}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('超过有效更新时间');
    expect(screen.getByText(/超过有效更新时间/)).toHaveStyle({color: theme.getDesignToken().colorError});
  });

  it('更新失败保留成功时间，并标红显示尝试时间和失败原因', () => {
    render(<ExchangeStatusView status={{...healthy, attempted_at: attemptedAt, last_error: 'HTTP 503'}}/>);
    expect(screen.getByRole('alert')).toHaveTextContent(new Date(updatedAt).toLocaleString());
    expect(screen.getByText(/更新失败/)).toHaveStyle({color: theme.getDesignToken().colorError});
    expect(screen.getByText(/最近尝试/)).toHaveTextContent(new Date(attemptedAt).toLocaleString());
    expect(screen.getByText(/HTTP 503/)).toHaveStyle({color: theme.getDesignToken().colorError});
  });

  it('首次更新失败也会标红，不伪造成功时间', () => {
    render(<ExchangeStatusView status={{...healthy, updated_at: null, data_date: '', last_error: 'connection refused'}}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('尚未成功获取（更新失败）');
    expect(screen.getByText(/尚未成功获取/)).toHaveStyle({color: theme.getDesignToken().colorError});
    expect(screen.queryByText(/数据日期/)).not.toBeInTheDocument();
  });

  it('成功恢复后清除红色告警及旧失败信息', () => {
    const {rerender} = render(<ExchangeStatusView status={{...healthy, stale: true, last_error: 'HTTP 503'}}/>);
    expect(screen.getByRole('alert')).toBeVisible();
    rerender(<ExchangeStatusView status={healthy}/>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP 503/)).not.toBeInTheDocument();
    expect(screen.getByText(new Date(updatedAt).toLocaleString())).not.toHaveStyle({color: theme.getDesignToken().colorError});
  });
});
