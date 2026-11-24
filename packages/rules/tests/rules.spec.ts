import { describe, expect, it } from 'vitest';
import { JURISDICTIONS, capAward, createCryptoRng, createRng, resolveJurisdiction } from '../src';

describe('@slotkit/rules', () => {
  it('сид дає ту саму послідовність', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect([a.next(), a.int(10), a.pick([['x', 1], ['y', 3]] as const)]).toEqual([b.next(), b.int(10), b.pick([['x', 1], ['y', 3]] as const)]);
  });

  it('криптографічний RNG тримає діапазон', () => {
    const r = createCryptoRng();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(r.next()).toBeLessThan(1);
    }
  });

  it('capAward не дає перейти max win', () => {
    expect(capAward(300, 0, 100, { maxWinX: 5 })).toBe(300);
    expect(capAward(300, 400, 100, { maxWinX: 5 })).toBe(100);
    expect(capAward(300, 600, 100, { maxWinX: 5 })).toBe(0);
  });

  it('UKGC: 2,5 с, без прискорення, автогри й купівлі бонусу; параметр запуску важливіший за вибір гравця', () => {
    const uk = JURISDICTIONS.ukgc;
    expect(uk.minCycleMs).toBe(2500);
    expect([uk.allowSpeedUp, uk.allowAutoplay, uk.allowBonusBuy, uk.celebrateAtOrBelowStake]).toEqual([false, false, false, false]);
    expect(resolveJurisdiction('?jurisdiction=ukgc', 'default').id).toBe('ukgc');
    expect(resolveJurisdiction('', 'ukgc').id).toBe('ukgc');
    expect(resolveJurisdiction('?jurisdiction=ukgc&rc=2', 'default').realityCheckMin).toBe(2);
  });
});
