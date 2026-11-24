/**
 * Правила, які оператор чи юрисдикція можуть змінити без зміни математики:
 * максимальний виграш за раунд у ставках. Досягнувши його, раунд одразу закінчується,
 * а решта фіч згорає — так зазвичай пишуть у правилах слотів.
 */
export interface GameRules {
  maxWinX: number;
}

export const DEFAULT_RULES: GameRules = { maxWinX: 5000 };

/** Скільки ще можна виплатити в раунді, щоб не перейти max win. */
export function capAward(amount: number, roundWin: number, bet: number, rules: GameRules = DEFAULT_RULES): number {
  return Math.min(amount, Math.max(0, rules.maxWinX * bet - roundWin));
}
