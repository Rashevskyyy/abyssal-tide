import { describe, expect, it } from 'vitest';
import { initialState, step } from '../src/engine/engine';
import { RandomOutcomeProvider } from '../src/engine/outcome';

/**
 * Захист математики від випадкових змін: частини з малою дисперсією (база, частота бонусу)
 * на 60 000 спінах із фіксованим сидом. Повний звіт — `npm run sim` (docs/MATH.uk.md).
 */
describe('математика (швидка перевірка)', () => {
  it('частота виграшу, внесок бази й частота бонусу в межах моделі', () => {
    const p = new RandomOutcomeProvider(2026);
    let s = initialState(1e12);
    const n = 60_000;
    let won = 0;
    let hits = 0;
    let triggers = 0;
    for (let i = 0; i < n; i++) {
      const { state, result } = step(s, { stepId: String(i), action: 'spin', bet: 100 }, p);
      won += result.stepWin;
      if (result.stepWin) hits++;
      if (result.fsAwarded) triggers++;
      s = { ...state, round: null }; // бонус не граємо: тут лише база
    }
    expect(hits / n).toBeGreaterThan(0.33);
    expect(hits / n).toBeLessThan(0.41);
    expect(won / (n * 100)).toBeGreaterThan(0.5);
    expect(won / (n * 100)).toBeLessThan(0.59);
    expect(n / triggers).toBeGreaterThan(180);
    expect(n / triggers).toBeLessThan(300);
  });
});
