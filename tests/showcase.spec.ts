import type { ScenarioId } from '../src/server/showcase';
import { describe, expect, it } from 'vitest';
import { createShowcaseSource } from '../src/server/showcase';
import type { Action, StepResult } from '../src/shared/types';

async function runAll(id: ScenarioId, bet = 100): Promise<StepResult[]> {
  const src = createShowcaseSource(id, bet);
  const out: StepResult[] = [];
  let action: Action = 'spin';
  for (let i = 0; i < 100; i++) {
    const r = await src.request({ stepId: `s${i}`, action, bet });
    out.push(r);
    if (r.next === 'none') break;
    action = r.next;
  }
  return out;
}

describe('bonus showcase scripts', () => {
  it('scenario 4: marks fill all three jars on the trigger spin; Extra, Boost and Multi work together', async () => {
    const steps = await runAll(4, 100);
    const entry = steps[0];
    expect(entry.potHits.map((h) => h.pot).sort()).toEqual(['boost', 'extra', 'multi', 'multi']);
    expect(entry.mods).toMatchObject({ extra: true, boost: 2, multi: true });
    expect(entry.respinsLeft).toBe(4);
    expect(entry.pots).toEqual({ extra: 0, boost: 0, multi: 0 });
    const end = steps.find((s) => s.next === 'collect')!;
    expect(end.mods?.multiHits).toEqual([
      { c: 1, r: 1, m: 3 },
      { c: 4, r: 2, m: 2 },
    ]);
    // стартові перлини +2: 4,3,7,5,4,3,4 = 30; P5+2=7 ×3 → +14; P2+2=4 ×2 → +4; нова P3; мушля → J2 25
    expect(end.bonusTotal).toBe((30 + 14 + 4 + 3 + 25) * 100);
    expect(steps.filter((s) => s.action === 'respin')).toHaveLength(8);
  });

  it('scenario 1: direct Super, full board, Tide Crown once', async () => {
    const steps = await runAll(1, 200);
    const entry = steps[0];
    expect(entry.salvageTriggered).toBe(true);
    expect(entry.superActivated).toBe('entry');
    expect(entry.lineWins.length).toBeGreaterThan(0);
    const end = steps.find((s) => s.action === 'respin' && s.next === 'collect')!;
    expect(end.fullBoard).toBe(true);
    expect(end.mysteryReveals.map((m) => m.cell.s)).toEqual(['JP3', 'BLACK']);
    expect(end.mysteryReveals.some((m) => m.activatesSuper)).toBe(false);
    // перлини (2+1+5+3+1 + 2+2+5+1+10+3)=35 ×2 = 70; чорні 10+10; J2 25; J3 75; повне поле 500 → 690 ставок по €2.00
    expect(end.bonusTotal).toBe(690 * 200);
    expect(steps.at(-1)!.roundComplete).toBe(true);
  });

  it('scenario 2: Salvage before Free Dives, nested Salvage with Super on reveal', async () => {
    const steps = await runAll(2);
    expect(steps[0]).toMatchObject({ fsAwarded: 8, salvageTriggered: true, next: 'respin' });
    const firstCollect = steps.find((s) => s.action === 'collect')!;
    expect(firstCollect.next).toBe('freeSpin');
    expect(firstCollect.freeSpinsLeft).toBe(8);
    const fs = steps.filter((s) => s.action === 'freeSpin');
    expect(fs).toHaveLength(8);
    expect(fs.some((s) => s.roundAward >= 20 * s.bet)).toBe(true); // великий виграш у серії
    const nested = fs.find((s) => s.salvageTriggered)!;
    expect(nested.freeSpinsLeft).toBe(4);
    const reveal = steps.find((s) => s.mysteryReveals.some((m) => m.activatesSuper) && s.action === 'respin')!;
    expect(reveal.mysteryReveals.map((m) => [m.c, m.r, m.cell.s])).toEqual([[1, 0, 'JP1'], [4, 1, 'BLACK']]);
    const last = steps.at(-1)!;
    expect(last.roundComplete).toBe(true);
    expect(last.fsWin).toBe(fs.reduce((s, r) => s + r.roundAward, 0) + steps.filter((s) => s.action === 'collect').at(-1)!.roundAward);
  });

  it('scenario 3: a big win from wilds', async () => {
    const [r] = await runAll(3, 500);
    expect(r.roundComplete).toBe(true);
    expect(r.roundAward / r.bet).toBeGreaterThanOrEqual(50);
  });
});
