import { describe, expect, it } from 'vitest';
import { IDLE_BOARD } from '../src/engine/engine';
import { evaluateLines } from '../src/engine/lineEval';
import { board } from '../src/engine/scripted';
import { LINES } from '../src/shared/config';

describe('paylines', () => {
  it('parses 25 lines from the GDD spec', () => {
    expect(LINES).toHaveLength(25);
    expect(LINES[0]).toEqual([0, 0, 0, 0, 0]);
    expect(LINES[3]).toEqual([0, 1, 2, 1, 0]); // 12321
    expect(LINES[24]).toEqual([2, 2, 2, 1, 0]); // 33321
    expect(new Set(LINES.map((l) => l.join(''))).size).toBe(25);
  });

  it('idle board has no wins', () => {
    expect(evaluateLines(IDLE_BOARD, 1)).toEqual([]);
  });

  it('pays left-to-right in bet multiples', () => {
    const b = board(['N  N  N  N  N', 'R1 R2 R3 R4 C', 'C  H  R1 R2 R3']);
    const wins = evaluateLines(b, 2);
    const top = wins.find((w) => w.line === 0)!;
    expect(top).toMatchObject({ symbol: 'NAUTILUS', count: 5, pay: 16, amount: 32 });
  });

  it('wild substitutes and the best variant is chosen', () => {
    // W W R1 R1 R1 → R1×5 (4) beats N×2 (none)
    const b1 = board(['W  W  R1 R1 R1', 'R2 R3 C  H  R4', 'C  H  R4 R2 R3']);
    expect(evaluateLines(b1, 1).find((w) => w.line === 0)).toMatchObject({ symbol: 'R1', count: 5, pay: 4 });

    // W W W C R1 → N×3 = 4, H×3 = 3, C×4 = 4 → tie broken by the longer combination
    const b2 = board(['W  W  W  C  R1', 'R2 R3 C  H  R4', 'C  H  R4 R2 R3']);
    expect(evaluateLines(b2, 1).find((w) => w.line === 0)).toMatchObject({ symbol: 'COMPASS', count: 4, pay: 4 });

    // five wilds pay as the top symbol
    const b3 = board(['W  W  W  W  W', 'R2 R3 C  H  R4', 'C  H  R4 R2 R3']);
    expect(evaluateLines(b3, 1).find((w) => w.line === 0)).toMatchObject({ symbol: 'NAUTILUS', count: 5, pay: 16 });
  });

  it('scatter, pearls and a break in the run stop the line', () => {
    const b = board(['M  N  N  N  N', 'N  P2 N  N  N', 'N  N  R1 N  N']);
    const wins = evaluateLines(b, 1);
    expect(wins.find((w) => w.line === 0)).toBeUndefined(); // starts with MAP
    expect(wins.find((w) => w.line === 1)).toBeUndefined(); // N P2 … breaks at reel 2
    expect(wins.find((w) => w.line === 2)).toBeUndefined(); // N N R1 → only two
  });

  it('wins on different lines are summed', () => {
    const b = board(['H  H  H  R1 R2', 'H  H  H  R3 R4', 'C  C  C  C  R2']);
    const wins = evaluateLines(b, 1);
    expect(wins.find((w) => w.line === 0)?.amount).toBe(3);
    expect(wins.find((w) => w.line === 1)?.amount).toBe(3);
    expect(wins.find((w) => w.line === 2)?.amount).toBe(4);
    expect(wins.length).toBeGreaterThan(3); // diagonals through the H block also pay
  });
});
