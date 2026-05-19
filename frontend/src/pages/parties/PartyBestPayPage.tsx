import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Button, Col, message, Modal, Row, Space, Table} from 'antd';
import {CheckCircleOutlined, DownloadOutlined} from '@ant-design/icons';
import {apiFetch, apiJson, downloadAuthenticated} from '@/api/client';
import {PageShell, SurfaceCard} from '@/components/ui';

export function PartyBestPayPage() {
  const {id} = useParams();
  const partyId = Number(id);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [partyName, setPartyName] = useState('');
  const [sym, setSym] = useState('¥');
  const [isOwner, setIsOwner] = useState(false);
  const [payRows, setPayRows] = useState<{ debtor: string; cred: string; amt: string }[]>([]);
  const [statRows, setStatRows] = useState<{ user: string; out: string; inn: string }[]>([]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{
        ret: number;
        msg?: string;
        data?: {
          party?: { name?: string };
          bestPayFinal?: Record<string, Record<string, string>>;
          userStat?: Record<string, { in?: string | number; out?: string | number }>;
          isOwner?: boolean;
          currencySymbol?: string;
        };
      }>(`/user/party/${partyId}/bestpay`);
      if (data.ret !== 1) {
        setErr(data.msg || '加载失败');
        return;
      }
      const d = data.data;
      setPartyName(d?.party?.name || '');
      setSym(d?.currencySymbol || '¥');
      setIsOwner(d?.isOwner === true);
      const pr: { debtor: string; cred: string; amt: string }[] = [];
      const fm = d?.bestPayFinal || {};
      for (const [debtor, creditors] of Object.entries(fm)) {
        for (const [cred, amt] of Object.entries(creditors)) {
          pr.push({debtor, cred, amt: String(amt)});
        }
      }
      setPayRows(pr);
      const st = d?.userStat || {};
      setStatRows(
        Object.entries(st).map(([u, s]) => ({
          user: u,
          out: String(s.out ?? ''),
          inn: String(s.in ?? ''),
        })),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [partyId]);

  const clearAll = () => {
    Modal.confirm({
      title: '确认清空未付？',
      content: '将所有未支付项标为已付',
      okType: 'danger',
      onOk: async () => {
        const r = await apiFetch(`/user/party/${partyId}/bestpay/clear`, {method: 'POST'});
        const out = (await r.json()) as { ret: number; msg?: string };
        if (out.ret === 1) message.success(out.msg || '完成');
        else message.error(out.msg || '失败');
        await load();
      },
    });
  };

  return (
    <PageShell
      title={`最优支付 — ${partyName}`}
      subtitle="最少转账次数的结算方案"
      back={{to: `/parties/${partyId}`}}
      loading={loading}
      error={err}
      centered
      extra={
        <Space wrap>
          <Button
            icon={<DownloadOutlined/>}
            onClick={async () => {
              try {
                await downloadAuthenticated(`/user/party/${partyId}/bestpay/download`, `party_bestpay_${partyId}.json`);
              } catch (e) {
                message.error(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            下载 JSON
          </Button>
          {isOwner ? (
            <Button danger icon={<CheckCircleOutlined/>} onClick={clearAll}>
              清空未付
            </Button>
          ) : null}
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <SurfaceCard title="优化后支付关系">
            <Table
              rowKey={(r) => `${r.debtor}-${r.cred}`}
              pagination={false}
              dataSource={payRows}
              locale={{emptyText: '无待结算'}}
              columns={[
                {title: '付款方', dataIndex: 'debtor'},
                {title: '收款方', dataIndex: 'cred'},
                {
                  title: '金额',
                  dataIndex: 'amt',
                  align: 'right',
                  render: (a) => (
                    <strong>
                      {sym}
                      {a}
                    </strong>
                  ),
                },
              ]}
            />
          </SurfaceCard>
        </Col>
        <Col xs={24} lg={12}>
          <SurfaceCard title="成员未付流入 / 流出">
            <Table
              rowKey="user"
              pagination={false}
              dataSource={statRows}
              locale={{emptyText: '无'}}
              columns={[
                {title: '成员', dataIndex: 'user'},
                {title: '应付', dataIndex: 'out', align: 'right', render: (x) => `${sym}${x}`},
                {title: '应收', dataIndex: 'inn', align: 'right', render: (x) => `${sym}${x}`},
              ]}
            />
          </SurfaceCard>
        </Col>
      </Row>
    </PageShell>
  );
}
