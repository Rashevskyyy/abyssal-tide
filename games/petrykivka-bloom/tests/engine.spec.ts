import { describe, expect, it } from 'vitest';
import { EngineError, emptySpots, expectedAction, initialState, spinCost, step } from '../src/engine/engine';
import { RandomOutcomeProvider } from '../src/engine/outcome';
import { BETS, MAX_LEVEL } from '../src/shared/config';
import type { SymbolId } from '../src/shared/symbols';
import type { EngineState } from '../src/shared/types';
import { ScriptedProvider, gridWith } from './helpers';

const FIVE = { 0: 'KALYNA', 1: 'KALYNA', 2: 'KALYNA', 3: 'KALYNA', 4: 'KALYNA' } as const; // верхній рядок, сусіди на фоні — інші символи
const PLATES = (n: number): Record<number, SymbolId> => Object.fromEntries(Array.from({ length: n }, (_, k) => [42 + k, 'PLATE'])); // нижній рядок

describe('виплати й множники', () => {
  it('кластер із 5 калин при ставці 1 € — 2 €', () => {
    const p = new ScriptedProvider([gridWith(FIVE)], [null]);
    const { result, state } = step(initialState(), { stepId: 's1', action: 'spin', bet: 100 }, p);
    const t = result.tumbles[0];
    expect(t.clusters).toEqual([{ symbol: 'KALYNA', cells: [0, 1, 2, 3, 4], units: 40, multiplier: 1, amount: 200 }]);
    expect(t.removed).toEqual([0, 1, 2, 3, 4]);
    // клітинки кластера стали бутонами
    expect([0, 1, 2, 3, 4].map((i) => t.spots[i])).toEqual([1, 1, 1, 1, 1]);
    expect(result.cost).toBe(100);
    expect(state.balance).toBe(100_000 - 100 + result.stepWin);
  });

  it('квітки під кластером додаються: ×2 + ×2 = ×4', () => {
    const stroke = { points: [[0, 0], [3, 0], [6, 0]] as [[number, number], [number, number], [number, number]], cells: [0, 1, 2], blooms: [0, 2] };
    const p = new ScriptedProvider([gridWith(FIVE)], [stroke]);
    const { result } = step(initialState(), { stepId: 's1', action: 'spin', bet: 100 }, p);
    const cl = result.tumbles[0].clusters[0];
    expect(cl.multiplier).toBe(4);
    expect(cl.amount).toBe(800);
    // бутон став квіткою ×2, квітки ×2 подвоїлись до ×4
    expect(result.tumbles[0].spots.slice(0, 5)).toEqual([3, 2, 3, 1, 1]);
  });

  it('усі суми — цілі центи для кожної ставки', () => {
    const p = new RandomOutcomeProvider(7);
    let s: EngineState = initialState(1e12);
    for (let n = 0; n < 3000; n++) {
      const bet = BETS[n % BETS.length];
      const out = step(s, { stepId: String(n), action: expectedAction(s), bet }, p);
      for (const t of out.result.tumbles) for (const c of t.clusters) expect(Number.isInteger(c.amount)).toBe(true);
      expect(Number.isInteger(out.result.stepWin)).toBe(true);
      s = out.state;
    }
  });
});

describe('Free Spins', () => {
  it('3 тарілки — 10 фриспінів; перший із «Мазком»; бутони переходять між спінами', () => {
    const p = new ScriptedProvider([gridWith(PLATES(3)), gridWith(FIVE), gridWith({})], [null]);
    let { state, result } = step(initialState(), { stepId: 's1', action: 'spin', bet: 100 }, p);
    expect(result.plates).toEqual([42, 43, 44]);
    expect(result.fsAwarded).toBe(10);
    expect(result.next).toBe('freeSpin');
    ({ state, result } = step(state, { stepId: 's2', action: 'freeSpin' }, p));
    expect(result.mode).toBe('free');
    expect(result.stroke).not.toBeNull();
    expect(result.freeSpinsLeft).toBe(9);
    const after = result.tumbles.at(-1)!.spots;
    ({ state, result } = step(state, { stepId: 's3', action: 'freeSpin' }, p));
    expect(result.stroke).toBeNull();
    expect(result.spotsBefore).toEqual(after);
  });

  it('4 тарілки — 12, ретригер у бонусі — +5', () => {
    const p = new ScriptedProvider([gridWith(PLATES(4)), gridWith(PLATES(3))], [null]);
    let { state, result } = step(initialState(), { stepId: 's1', action: 'spin', bet: 100 }, p);
    expect(result.fsAwarded).toBe(12);
    ({ state, result } = step(state, { stepId: 's2', action: 'freeSpin' }, p));
    expect(result.fsAwarded).toBe(5);
    expect(result.freeSpinsLeft).toBe(12 - 1 + 5);
    expect(result.freeSpinsTotal).toBe(17);
  });

  it('купівля: 100 ставок, одразу 10 фриспінів, сітка не змінюється', () => {
    const s0 = initialState();
    const { state, result } = step(s0, { stepId: 's1', action: 'spin', bet: 100, buy: true }, new RandomOutcomeProvider(1));
    expect(result.cost).toBe(10_000);
    expect(result.bought).toBe(true);
    expect(result.tumbles).toEqual([]);
    expect(result.freeSpinsLeft).toBe(10);
    expect(state.balance).toBe(s0.balance - 10_000);
    expect(expectedAction(state)).toBe('freeSpin');
  });

  it('ante bet коштує ×1,25 і не поєднується з купівлею', () => {
    expect(spinCost(100, { ante: true })).toBe(125);
    expect(spinCost(20, { ante: true })).toBe(25);
    expect(() => step(initialState(), { stepId: 'x', action: 'spin', bet: 100, ante: true, buy: true }, new RandomOutcomeProvider(1))).toThrow(EngineError);
  });
});

describe('max win і правила', () => {
  it('виграш обрізається до max win, бонус згорає', () => {
    const p = new ScriptedProvider([gridWith({ ...FIVE, ...PLATES(3) })], [null]);
    const { state, result } = step(initialState(), { stepId: 's1', action: 'spin', bet: 100 }, p, { maxWinX: 0.2 });
    expect(result.stepWin).toBe(20);
    expect(result.maxWin).toBe(true);
    expect(result.fsAwarded).toBe(0);
    expect(result.roundComplete).toBe(true);
    expect(state.round).toBeNull();
  });

  it('неочікувана дія, ставка поза списком, нестача коштів', () => {
    const p = new RandomOutcomeProvider(1);
    expect(() => step(initialState(), { stepId: 'x', action: 'freeSpin' }, p)).toThrow(/Expected "spin"/);
    expect(() => step(initialState(), { stepId: 'x', action: 'spin', bet: 25 }, p)).toThrow(EngineError);
    expect(() => step(initialState(50), { stepId: 'x', action: 'spin', bet: 100 }, p)).toThrow(/Not enough/);
  });
});

describe('інваріанти на випадкових раундах', () => {
  it('гроші сходяться, кластери чисті, рівні в межах, той самий сид — той самий результат', () => {
    const run = (seed: number) => {
      const p = new RandomOutcomeProvider(seed);
      let s: EngineState = initialState(1e12);
      const log: number[] = [];
      for (let n = 0; n < 2000; n++) {
        const action = expectedAction(s);
        const before = s.balance;
        const out = step(s, { stepId: String(n), action, bet: 100, ante: n % 5 === 0 }, p);
        const r = out.result;
        expect(r.balanceAfter).toBe(before - r.cost + r.stepWin);
        for (const t of r.tumbles) {
          const union = new Set(t.clusters.flatMap((c) => c.cells));
          expect(t.removed).toEqual([...union].sort((a, b) => a - b));
          expect(t.grid).toHaveLength(49);
          expect(Math.max(...t.spots)).toBeLessThanOrEqual(MAX_LEVEL);
          expect(t.refill.reduce((k, col) => k + col.length, 0)).toBe(t.removed.length);
          for (const col of [0, 1, 2, 3, 4, 5, 6]) {
            const plates = [0, 1, 2, 3, 4, 5, 6].filter((row) => t.grid[row * 7 + col] === 'PLATE').length;
            expect(plates).toBeLessThanOrEqual(1);
          }
        }
        log.push(r.stepWin);
        s = out.state;
      }
      return log;
    };
    expect(run(42)).toEqual(run(42));
  });

  it('бонус починається з порожніх клітинок', () => {
    const { state } = step(initialState(), { stepId: 's', action: 'spin', bet: 100, buy: true }, new RandomOutcomeProvider(3));
    expect(state.round!.fs!.spots).toEqual(emptySpots());
  });
});
