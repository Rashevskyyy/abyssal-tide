/**
 * Автогра як у слотах 3 Oaks: кількість раундів і умови зупинки.
 * Суми — цілі центи; null — умову вимкнено. Перевірка умов — чиста функція, без DOM і часу.
 */
export interface AutoConfig {
  rounds: number;
  stopOnFeature: boolean;
  stopOnAnyWin: boolean;
  singleWin: number | null;
  balanceUp: number | null;
  balanceDown: number | null;
}

export const DEFAULT_AUTO: AutoConfig = { rounds: 50, stopOnFeature: true, stopOnAnyWin: false, singleWin: null, balanceUp: null, balanceDown: null };

export const AUTO_COUNTS: readonly number[] = [10, 25, 50, 75, 100, 250, 500, 1000];

/** Стан автогри після завершеного раунду. */
export interface AutoProgress {
  /** Скільки раундів лишилось (вже з урахуванням щойно зіграного). */
  left: number;
  startBalance: number;
  balance: number;
  /** Виграш щойно зіграного раунду. */
  lastWin: number;
}

/** Чи зупиняти автогру після раунду. Тригер бонусу перевіряє гра окремо (stopOnFeature). */
export function shouldStopAutoplay(cfg: AutoConfig, p: AutoProgress): boolean {
  return (
    p.left <= 0 ||
    (cfg.stopOnAnyWin && p.lastWin > 0) ||
    (cfg.singleWin !== null && p.lastWin >= cfg.singleWin) ||
    (cfg.balanceUp !== null && p.balance - p.startBalance >= cfg.balanceUp) ||
    (cfg.balanceDown !== null && p.startBalance - p.balance >= cfg.balanceDown)
  );
}

/** Поле суми («3», «2,50», «2.5») → центи; порожнє, нуль чи нісенітниця — умову вимкнено. */
export function parseMoneyInput(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100);
}

export function moneyInputValue(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}
