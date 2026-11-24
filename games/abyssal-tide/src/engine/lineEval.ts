import { LINES } from '../shared/config';
import { PAYING_IDS, PAYTABLE, type PayingId } from '../shared/symbols';
import { COLS, type LineWin, type ReelBoard } from '../shared/types';

/**
 * Лінії рахуємо поспіль з першого барабана. Wild підміняє будь-який платний символ;
 * для лінії з кількома варіантами обираємо найбільший виграш (за рівності — довшу комбінацію).
 * Виграші різних ліній сумуються.
 */
export function evaluateLines(board: ReelBoard, bet: number): LineWin[] {
  const wins: LineWin[] = [];
  LINES.forEach((rows, line) => {
    let best: { symbol: PayingId; count: number; pay: number } | null = null;
    for (const symbol of PAYING_IDS) {
      let count = 0;
      while (count < COLS) {
        const s = board[count][rows[count]].s;
        if (s !== symbol && s !== 'WILD') break;
        count++;
      }
      if (count < 3) continue;
      const pay = PAYTABLE[symbol][count - 3];
      if (!best || pay > best.pay || (pay === best.pay && count > best.count)) best = { symbol, count, pay };
    }
    if (best) {
      wins.push({
        line,
        symbol: best.symbol,
        count: best.count as 3 | 4 | 5,
        positions: rows.slice(0, best.count).map((r, c) => ({ c, r })),
        pay: best.pay,
        amount: best.pay * bet,
      });
    }
  });
  return wins;
}
