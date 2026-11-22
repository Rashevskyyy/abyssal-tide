/**
 * Символи, таблиця виплат і бонусні номінали (GDD §2).
 * Усі номінали — у кратних ставки (bet multiples); у кредити переводимо множенням на ставку.
 */

export const SYMBOL_IDS = [
  'R1', 'R2', 'R3', 'R4', // чотири молодші руни
  'COMPASS', 'HELMET', 'NAUTILUS', // старші символи
  'WILD', // ліхтар
  'MAP', // Scatter — карта
  'PEARL', // звичайна перлина з номіналом
  'BLACK', // чорна перлина Super
  'SHELL', // запечатана мушля (Mystery), лише в Salvage
  'JP1', 'JP2', 'JP3', 'JP4', // чотири фіксовані бонусні символи
] as const;

export type SymbolId = (typeof SYMBOL_IDS)[number];

export const PAYING_IDS = ['NAUTILUS', 'HELMET', 'COMPASS', 'R4', 'R3', 'R2', 'R1'] as const;
export type PayingId = (typeof PAYING_IDS)[number];

/** Виплата за 3/4/5 збігів, у ставках. */
export const PAYTABLE: Record<PayingId, readonly [number, number, number]> = {
  R1: [1, 2, 4],
  R2: [1, 2, 4],
  R3: [1, 2, 4],
  R4: [1, 2, 4],
  COMPASS: [2, 4, 8],
  HELMET: [3, 6, 12],
  NAUTILUS: [4, 8, 16],
};

export type JackpotId = 'JP1' | 'JP2' | 'JP3' | 'JP4';

export const JACKPOTS: Record<JackpotId, { readonly key: string; readonly value: number }> = {
  JP1: { key: 'shoal', value: 10 },
  JP2: { key: 'reef', value: 25 },
  JP3: { key: 'trench', value: 75 },
  JP4: { key: 'abyss', value: 250 },
};

export const PEARL_VALUES = [1, 2, 3, 5, 10] as const;
export const BLACK_PEARL_VALUE = 10;
export const FULL_BOARD_AWARD = 500;
export const SUPER_MULTIPLIER = 2;

export const isPaying = (s: SymbolId): s is PayingId => (PAYING_IDS as readonly string[]).includes(s);
export const isJackpot = (s: SymbolId): s is JackpotId => s === 'JP1' || s === 'JP2' || s === 'JP3' || s === 'JP4';

/** Символи, які займають клітину в Salvage. */
export const isBonusSymbol = (s: SymbolId): boolean =>
  s === 'PEARL' || s === 'BLACK' || s === 'SHELL' || isJackpot(s);

/** Символи, що рахуються для тригера Salvage на барабанах (мушлі на барабанах не випадають). */
export const isTriggerSymbol = (s: SymbolId): boolean => s === 'PEARL' || s === 'BLACK' || isJackpot(s);
