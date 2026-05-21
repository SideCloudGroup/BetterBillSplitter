import {useEffect, useMemo, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Button, Col, message, Modal, Row, Space} from 'antd';
import {ArrowRightOutlined, CheckCircleOutlined, DownloadOutlined, SwapOutlined} from '@ant-design/icons';
import {apiFetch, apiJson, downloadAuthenticated} from '@/api/client';
import {formatMoney, parseAmount} from '@/lib/formatMoney';
import {EmptyState, LedgerList, PageShell, SectionTitle, StatCard, SurfaceCard} from '@/components/ui';

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

  const totalTransfer = useMemo(
    () => payRows.reduce((s, r) => s + parseAmount(r.amt), 0),
    [payRows],
  );

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
      maxWidth={1040}
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
      <Row gutter={[16, 16]} style={{marginBottom: 24}}>
        <Col xs={12} sm={8}>
          <StatCard title="转账笔数" value={payRows.length} accent="primary"/>
        </Col>
        <Col xs={12} sm={8}>
          <StatCard title="结算总额" value={formatMoney(sym, totalTransfer)} accent="warning"/>
        </Col>
        <Col xs={24} sm={8}>
          <StatCard title="参与成员" value={statRows.length} accent="info"/>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <SurfaceCard title={<SectionTitle icon={<SwapOutlined/>}>优化后支付关系</SectionTitle>}>
            {payRows.length === 0 ? (
              <EmptyState description="无待结算转账，账目已平衡"/>
            ) : (
              <ul className="bbs-entity-list">
                {payRows.map((r) => (
                  <li key={`${r.debtor}-${r.cred}`} className="bbs-bestpay-row">
                    <span className="bbs-bestpay-row__party">{r.debtor}</span>
                    <ArrowRightOutlined className="bbs-bestpay-row__arrow"/>
                    <span className="bbs-bestpay-row__party">{r.cred}</span>
                    <span className="bbs-bestpay-row__amt">{formatMoney(sym, r.amt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>
        </Col>
        <Col xs={24} lg={10}>
          <SurfaceCard title={<SectionTitle icon={<SwapOutlined/>}>成员流入 / 流出</SectionTitle>}>
            <LedgerList
              rows={statRows.map((r) => ({
                id: r.user,
                title: r.user,
                meta: `应付 ${sym}${r.out} · 应收 ${sym}${r.inn}`,
                amount: formatMoney(sym, parseAmount(r.out) - parseAmount(r.inn)),
              }))}
              empty={<EmptyState description="无统计数据"/>}
            />
          </SurfaceCard>
        </Col>
      </Row>
    </PageShell>
  );
}
