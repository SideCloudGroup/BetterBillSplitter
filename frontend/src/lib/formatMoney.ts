export function parseAmount(v: string | number | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(sym: string, v: number | string): string {
  const n = typeof v === 'number' ? v : parseAmount(v);
  const fixed = n.toFixed(2);
  return `${sym}${fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed}`;
}
