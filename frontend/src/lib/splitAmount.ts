export type SplitMode = 'total' | 'per_person' | 'custom';

export type SplitEntry = {
  user_id: number;
  amount: number;
};

/** 总金额均分：每人相同金额（四舍五入到分），与后端「每人一条相同 amount」一致 */
export function perPersonFromTotal(total: number, headCount: number): number | null {
  if (headCount < 1 || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((total / headCount) * 100) / 100;
}

export function totalFromPerPerson(perPerson: number, headCount: number): number | null {
  if (headCount < 1 || !Number.isFinite(perPerson) || perPerson <= 0) return null;
  return Math.round(perPerson * headCount * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toFixed(2);
}

export function resolveSubmitPerPerson(mode: SplitMode, amountInput: number, headCount: number): number | null {
  if (mode === 'custom') return null;
  if (mode === 'per_person') {
    if (!Number.isFinite(amountInput) || amountInput <= 0) return null;
    return Math.round(amountInput * 100) / 100;
  }
  return perPersonFromTotal(amountInput, headCount);
}

export function buildSplitsPayload(
  amounts: Record<number, number | null | undefined>,
): SplitEntry[] | null {
  const splits: SplitEntry[] = [];
  for (const [idStr, raw] of Object.entries(amounts)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    splits.push({user_id: Number(idStr), amount: Math.round(n * 100) / 100});
  }
  if (splits.length === 0) return null;
  return splits;
}

export function sumCustomAmounts(amounts: Record<number, number | null | undefined>): number {
  let sum = 0;
  for (const raw of Object.values(amounts)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 100) / 100;
}

export function countCustomFilled(amounts: Record<number, number | null | undefined>): number {
  return Object.values(amounts).filter((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }).length;
}
