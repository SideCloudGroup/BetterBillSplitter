export type SplitMode = 'total' | 'per_person';

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
  if (mode === 'per_person') {
    if (!Number.isFinite(amountInput) || amountInput <= 0) return null;
    return Math.round(amountInput * 100) / 100;
  }
  return perPersonFromTotal(amountInput, headCount);
}
