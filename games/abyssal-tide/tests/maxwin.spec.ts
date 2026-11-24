/**
 * Максимальний виграш раунду (правило оператора/юрисдикції): виплата обрізається до межі,
 * раунд одразу закінчується, а фічі, що мали б початись, згоряють.
 */
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../src/engine/engine';
import { board, ScriptedOutcomeProvider } from '../src/engine/scripted';
import { DEFAULT_RULES, START_BALANCE } from '../src/shared/config';
import { sid } from './helpers';

const BET = 100;
// п’ять наутилусів угорі — помітний лінійний виграш
const NAUTILUS_ROW = board([
  'N  N  N  N  N ',
  'R1 R2 R3 R4 R1',
  'R2 R3 R4 R1 R2',
]);
// той самий виграш і шість перлин — тригер Salvage
const NAUTILUS_AND_SIX = board([
  'N  N  N  N  N ',
  'P1 P1 P1 P1 P1',
  'P1 R3 R4 R1 R2',
]);
// той самий виграш і три карти — тригер Free Dives
const NAUTILUS_AND_MAPS = board([
  'N  N  N  N  N ',
  'R1 M  M  M  R1',
  'R2 R3 R4 R1 R2',
]);

const spin = (reels: ReturnType<typeof board>, maxWinX: number) =>
  step(initialState(), { stepId: sid(), action: 'spin', bet: BET }, new ScriptedOutcomeProvider({ reels: [reels] }), { maxWinX }).result;

describe('max win', () => {
  const uncapped = spin(NAUTILUS_ROW, DEFAULT_RULES.maxWinX);

  it('below the cap nothing changes', () => {
    expect(uncapped.maxWin).toBe(false);
    expect(uncapped.roundAward).toBeGreaterThan(5 * BET);
  });

  it('the award is trimmed to the cap and the round ends', () => {
    const r = spin(NAUTILUS_ROW, 5);
    expect(r.roundAward).toBe(5 * BET);
    expect(r.roundWin).toBe(5 * BET);
    expect(r.maxWin).toBe(true);
    expect(r.roundComplete).toBe(true);
    expect(r.balanceAfter).toBe(START_BALANCE - BET + 5 * BET);
  });

  it('reaching the cap on a trigger spin forfeits Salvage', () => {
    const r = spin(NAUTILUS_AND_SIX, 5);
    expect(r.salvageTriggered).toBe(false);
    expect(r.next).toBe('none');
  });

  it('reaching the cap on a trigger spin forfeits Free Dives', () => {
    const r = spin(NAUTILUS_AND_MAPS, 5);
    expect(r.fsAwarded).toBe(0);
    expect(r.freeSpinsLeft).toBe(0);
    expect(r.roundComplete).toBe(true);
  });

  it('without reaching the cap the same boards start their features', () => {
    expect(spin(NAUTILUS_AND_SIX, DEFAULT_RULES.maxWinX).salvageTriggered).toBe(true);
    expect(spin(NAUTILUS_AND_MAPS, DEFAULT_RULES.maxWinX).fsAwarded).toBeGreaterThan(0);
  });
});
