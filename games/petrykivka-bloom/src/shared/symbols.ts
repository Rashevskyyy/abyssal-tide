/** Символи гри: чотири високі, чотири низькі (базові мазки розпису) і scatter. */
export const HIGH = ['ROOSTER', 'FIREBIRD', 'KALYNA', 'MALLOW'] as const;
export const LOW = ['SEED', 'COMB', 'CURL', 'LEAF'] as const;
export const PAYING = [...HIGH, ...LOW] as const;
export type PayingSymbol = (typeof PAYING)[number];
export type SymbolId = PayingSymbol | 'PLATE';
export const SYMBOLS: readonly SymbolId[] = [...PAYING, 'PLATE'];

export const isPaying = (s: SymbolId): s is PayingSymbol => s !== 'PLATE';

/**
 * Виплати в «двадцятих» ставки (1 = 0,05× ставки) за розмір кластера:
 * 5–6, 7–8, 9–10, 11–12, 13–14, 15+.
 */
export const PAYTABLE: Readonly<Record<PayingSymbol, readonly number[]>> = {
  ROOSTER: [70, 140, 350, 1000, 2800, 10000],
  FIREBIRD: [50, 100, 280, 800, 2000, 7000],
  KALYNA: [40, 80, 200, 560, 1400, 4000],
  MALLOW: [35, 70, 180, 400, 1000, 2800],
  SEED: [20, 40, 100, 280, 700, 1800],
  COMB: [18, 35, 80, 200, 560, 1400],
  CURL: [14, 28, 70, 180, 400, 1000],
  LEAF: [10, 20, 55, 140, 350, 800],
};

export const SIZE_BUCKETS = ['5–6', '7–8', '9–10', '11–12', '13–14', '15+'] as const;

/** Індекс стовпця виплат для розміру кластера. */
export const bucketOf = (size: number): number => Math.min(5, Math.floor((size - 5) / 2));
