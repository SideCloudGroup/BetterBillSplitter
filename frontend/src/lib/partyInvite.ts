import {apiJson} from '@/api/client';

export type PartyInvitePreview = {
  party_id: number;
  name: string;
  description: string;
  member_count: number;
  base_currency: string;
  currency_symbol: string;
  owner_username: string;
  archived: boolean;
  invite_code: string;
  is_member?: boolean;
};

export function buildPartyInviteUrl(inviteCode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/parties/join/${encodeURIComponent(inviteCode.trim())}`;
}

export function partyInvitePath(inviteCode: string): string {
  return `/parties/join/${encodeURIComponent(inviteCode.trim())}`;
}

export async function fetchPartyInvitePreview(
  inviteCode: string,
): Promise<{ ok: true; data: PartyInvitePreview } | { ok: false; msg: string }> {
  const code = encodeURIComponent(inviteCode.trim());
  const res = await apiJson<{ ret: number; msg?: string; data?: PartyInvitePreview }>(
    `/party/invite/${code}`,
  );
  if (res.ret !== 1 || !res.data) {
    return {ok: false, msg: res.msg || '邀请码无效'};
  }
  return {ok: true, data: res.data};
}
