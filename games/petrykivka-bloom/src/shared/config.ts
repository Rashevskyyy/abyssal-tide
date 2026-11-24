/**
 * Константи Petrykivka Bloom (GDD: «Петриківка Bloom — GDD», розділи «Огляд» і «Free Spins»).
 * Гроші — цілі євроценти, як і в Abyssal Tide.
 */
export const COLS = 7;
export const ROWS = 7;
export const CELLS = COLS * ROWS;

/** Кластер — щонайменше 5 однакових символів, що торкаються сторонами. */
export const MIN_CLUSTER = 5;

export const CURRENCY = 'EUR';
/**
 * Ставки кратні 20 центам: виплати таблиці кратні 0,05× ставки,
 * тож будь-який виграш — ціле число центів без округлень.
 */
export const BETS: readonly number[] = [20, 40, 60, 80, 100, 120, 160, 200, 300, 400, 500, 600, 800, 1000, 2000, 5000];
export const DEFAULT_BET = 100;
export const START_BALANCE = 100_000;
export const TOP_UP_AMOUNT = 100_000;

/** Ante bet: ставка ×1,25, тарілки частіші. */
export const anteCost = (bet: number): number => (bet * 5) / 4;
/** Buy Feature: бонус за 100 ставок. */
export const BUY_COST_X = 100;

/** Скільки фриспінів дають тарілки (6 і 7 — однаково). */
export const FS_AWARD: Readonly<Record<number, number>> = { 3: 10, 4: 12, 5: 15, 6: 20, 7: 20 };
export const PLATES_TO_TRIGGER = 3;
export const FS_RETRIGGER = 5;
export const BUY_FS = 10;

/** Рівень клітинки: 0 — порожня, 1 — бутон, 2…8 — квітка ×2…×128. */
export const MAX_LEVEL = 8;
export const multiplierOf = (level: number): number => (level >= 2 ? 2 ** (level - 1) : 0);

export const BIG_WIN_X = 20;
export const MEGA_WIN_X = 50;
export const EPIC_WIN_X = 100;
