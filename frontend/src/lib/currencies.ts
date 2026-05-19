export type CurrencyMeta = {
  id?: number;
  name?: string;
  name_en?: string;
  symbol?: string;
  code?: string;
  decimal_places?: number;
  is_default?: boolean;
  is_active?: boolean;
};

/** 后端 getAllAvailableCurrencies：code -> 字符串或货币对象 */
export type CurrencyMap = Record<string, string | CurrencyMeta>;

function metaOf(value: string | CurrencyMeta | undefined): CurrencyMeta | undefined {
  if (value == null) return undefined;
  return typeof value === 'object' ? value : undefined;
}

/** 金额旁显示：优先符号（¥），否则代号 */
export function currencySymbol(value: string | CurrencyMeta | undefined, code: string): string {
  const sym = metaOf(value)?.symbol?.trim();
  if (sym) return sym;
  if (code === 'cny') return '¥';
  return code.toUpperCase();
}

/** 下拉选项：人民币 (¥) */
export function currencyOptionLabel(value: string | CurrencyMeta | undefined, code: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const meta = metaOf(value);
  const name = meta?.name?.trim();
  const sym = meta?.symbol?.trim();
  if (name && sym) return `${name} (${sym})`;
  if (name) return name;
  if (sym) return sym;
  return code.toUpperCase();
}

export function currencyLabel(value: string | CurrencyMeta | undefined, code: string): string {
  return currencyOptionLabel(value, code);
}

export function currencySelectOptions(map: CurrencyMap | undefined): { value: string; label: string }[] {
  return Object.entries(map ?? {}).map(([code, meta]) => ({
    value: code,
    label: currencyOptionLabel(meta, code),
  }));
}

export function currencySelectOptionsForCodes(
  codes: string[],
  map: CurrencyMap | undefined,
): { value: string; label: string }[] {
  const m = map ?? {};
  return codes.map((code) => ({
    value: code,
    label: currencyOptionLabel(m[code], code),
  }));
}

export function currencyCheckboxOptions(map: CurrencyMap | undefined): { label: string; value: string }[] {
  return currencySelectOptions(map).map(({value, label}) => ({value, label}));
}
