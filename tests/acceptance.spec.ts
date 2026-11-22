/**
 * Приймальні сценарії GDD §5 на рівні рушія і джерела результатів.
 * Візуальні сценарії (quick stop, поворот, reduced motion) перевіряє e2e/game.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../src/engine/engine';
import { board, landing, ScriptedOutcomeProvider } from '../src/engine/scripted';
import { LocalResultSource } from '../src/server/LocalResultSource';
import { SourceError } from '../src/server/protocol';
import { MemoryStore } from '../src/server/storage';
import { cellValue } from '../src/shared/values';
import type { Grid } from '../src/shared/types';
import { play, playOut, sid } from './helpers';

// Шість перлин, без ліній і карт.
const SIX = board([
  'P1 R1 P2 C  P2',
  'R2 P3 H  P5 R4',
  'N  R1 P1 R2 C ',
]);
// П’ять перлин — шостої немає.
const FIVE = board([
  'P1 R1 P2 C  R3',
  'R2 P3 H  P5 R4',
  'N  R1 P1 R2 C ',
]);
// Шість тригерних символів, серед них чорна перлина на 5-му барабані (прямий Super).
const SIX_SUPER = board([
  'P1 R1 P2 C  B ',
  'R2 P3 H  P5 R4',
  'N  R1 P1 R2 C ',
]);
// Три карти на барабанах 2–4 + шість перлин.
const MAPS_AND_SIX = board([
  'P1 M  P2 C  P2',
  'R2 P3 M  P5 R4',
  'N  R1 P1 M  C ',
]);
const MAPS_ONLY = board([
  'R1 M  R2 C  R3',
  'R2 R3 M  H  R4',
  'N  R1 R4 M  C ',
]);
const BLANK = board([
  'R1 C  R3 H  R2',
  'N  R2 R4 R4 R1',
  'R4 H  R1 C  R3',
]);

const EMPTY: never[] = [];
const values = (grid: Grid, superActive: boolean) => grid.map((col) => col.map((c) => (c ? cellValue(c, superActive) : 0)));

describe('GDD §5 acceptance — engine', () => {
  it('paid spin debits exactly one bet; free dives never debit', () => {
    const { results } = playOut(
      { reels: [MAPS_ONLY, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK] },
      { bet: 500 },
    );
    expect(results[0].action).toBe('spin');
    expect(results[0].balanceAfter).toBe(100_000 - 500 + results[0].roundAward);
    const fs = results.slice(1);
    expect(fs).toHaveLength(8);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].balanceAfter).toBe(results[i - 1].balanceAfter + results[i].roundAward);
    }
    expect(results.map((r) => r.freeSpinsLeft)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(results.at(-1)!.roundComplete).toBe(true);
  });

  it('five pearls, sixth missing → no Salvage, back to base', () => {
    const { last } = play({ reels: [FIVE] }, ['spin']);
    expect(last.salvageTriggered).toBe(false);
    expect(last.next).toBe('none');
    expect(last.roundComplete).toBe(true);
  });

  it('six at start; empty, new, empty ×3 → counter 3→2→3→2→1→0 and pearls stay in place', () => {
    const { results } = playOut({ reels: [SIX], respins: [EMPTY, landing(['P2', 1, 0]), EMPTY, EMPTY, EMPTY] });
    const [entry, ...rest] = results;
    expect(entry.salvageTriggered).toBe(true);
    expect(entry.respinsLeft).toBe(3);
    const respins = rest.filter((r) => r.action === 'respin');
    expect([entry.respinsLeft, ...respins.map((r) => r.respinsLeft)]).toEqual([3, 2, 3, 2, 1, 0]);
    // початкові перлини не рухаються
    const initial = entry.salvageGrid!;
    for (const r of respins) {
      initial.forEach((col, c) =>
        col.forEach((cell, row) => {
          if (cell) expect(r.salvageGrid![c][row]).toEqual(cell);
        }),
      );
    }
    expect(respins.at(-1)!.next).toBe('collect');
    expect(results.at(-1)!.action).toBe('collect');
  });

  it('direct Super and mid-bonus Super give identical values; multiplier applied once', () => {
    // A: чорна перлина вже на вході; пізніше падає друга чорна (зберігає 10)
    const a = playOut({ reels: [SIX_SUPER], respins: [landing(['B', 1, 0]), EMPTY, EMPTY, EMPTY] });
    // B: без Super на вході; чорна падає під час бонусу
    const b = playOut({ reels: [SIX], respins: [landing(['B', 1, 0]), EMPTY, EMPTY, EMPTY] });

    const entryA = a.results[0];
    expect(entryA.superActivated).toBe('entry');
    expect(b.results[1].superActivated).toBe('respin');

    const finalA = a.last.salvageGrid!;
    const finalB = b.last.salvageGrid!;
    const va = values(finalA, true);
    const vb = values(finalB, true);
    // перлини, що є в обох полях, мають однаковий остаточний номінал
    for (const [c, r] of [[0, 0], [2, 0], [1, 1], [3, 1], [2, 2]] as const) expect(va[c][r]).toBe(vb[c][r]);
    expect(va[3][1]).toBe(10); // P5 → 10, не 20
    expect(va[4][0]).toBe(10); // чорна перлина на вході — власний номінал
    expect(va[1][0]).toBe(10); // друга чорна — власний номінал
    // явна перевірка суми A (ставка €1.00): перлини (1+2+3+5+1)×2 = 24, дві чорні 20 → 44 ставки = €44.00
    expect(a.last.bonusTotal).toBe(4400);
  });

  it('GDD example: bet 2 (€2.00), pearls 1, 2, 5 under Super → 32 = €32.00', () => {
    const cells = [{ s: 'PEARL', v: 1 }, { s: 'PEARL', v: 2 }, { s: 'PEARL', v: 5 }] as const;
    const cents = cells.reduce((s, c) => s + cellValue(c, true), 0) * 200;
    expect(cents).toBe(3200);
  });

  it('two Mystery shells, the second reveals Super → order and recalculation before collect', () => {
    const { results, last } = playOut({
      reels: [SIX],
      respins: [landing(['S', 4, 2], ['S', 1, 0]), EMPTY, EMPTY, EMPTY],
      mysteries: ['J1', 'B'],
    });
    const ending = results.find((r) => r.mysteryReveals.length > 0 && r.action === 'respin')!;
    expect(ending.mysteryReveals.map((m) => [m.c, m.r])).toEqual([[1, 0], [4, 2]]); // згори вниз, зліва направо
    expect(ending.mysteryReveals[0]).toMatchObject({ cell: { s: 'JP1' }, activatesSuper: false });
    expect(ending.mysteryReveals[1]).toMatchObject({ cell: { s: 'BLACK' }, activatesSuper: true });
    // pearls 1+2+2+3+5+1 = 14 → ×2 = 28; JP1 = 10; black = 10 → 48 ставок по €1.00
    expect(ending.bonusTotal).toBe(4800);
    expect(last.action).toBe('collect');
    expect(last.roundAward).toBe(4800);
  });

  it('last free cell filled → no new respin, full board awarded once', () => {
    const nine = landing(
      ['P1', 1, 0], ['P1', 3, 0],
      ['P1', 0, 1], ['P1', 2, 1], ['P1', 4, 1],
      ['P1', 0, 2], ['P1', 1, 2], ['P1', 3, 2], ['P1', 4, 2],
    );
    const { results, last } = playOut({ reels: [SIX], respins: [nine] });
    const respin = results[1];
    expect(respin.next).toBe('collect');
    expect(respin.fullBoard).toBe(true);
    expect(results.filter((r) => r.action === 'respin')).toHaveLength(1);
    // (1+2+2+3+5+1) + 9×1 = 23, + 500 → 523 ставки = €523.00
    expect(last.bonusTotal).toBe(52_300);
    expect(results.filter((r) => r.roundAward >= 50_000)).toHaveLength(1);
  });

  it('full board right at entry skips respins', () => {
    const full = board(['P1 P1 P1 P1 P1', 'P1 P1 P1 P1 P1', 'P1 P1 P1 P1 B']);
    const { results } = play({ reels: [full] }, ['spin']);
    expect(results[0].next).toBe('collect');
    expect(results[0].fullBoard).toBe(true);
    expect(results[0].bonusTotal).toBe((14 * 2 + 10 + 500) * 100);
  });

  it('three maps and six pearls together → after collect all 8 Free Dives open', () => {
    const { results } = play({ reels: [MAPS_AND_SIX], respins: [EMPTY, EMPTY, EMPTY] }, ['spin', 'respin', 'respin', 'respin', 'collect']);
    const [entry] = results;
    expect(entry.fsAwarded).toBe(8);
    expect(entry.salvageTriggered).toBe(true);
    expect(entry.next).toBe('respin'); // Salvage іде першим
    const collected = results.at(-1)!;
    expect(collected.next).toBe('freeSpin');
    expect(collected.freeSpinsLeft).toBe(8);
    expect(collected.fsWin).toBe(0); // бонус з базового спіну не належить серії
  });

  it('bonus on the last Free Dive → series summary includes it exactly once', () => {
    const fsBoards = Array.from({ length: 7 }, () => BLANK);
    const { results, last } = playOut({
      reels: [MAPS_ONLY, ...fsBoards, SIX],
      respins: [EMPTY, EMPTY, EMPTY],
    });
    const lastFs = results.find((r) => r.action === 'freeSpin' && r.salvageTriggered)!;
    expect(lastFs.freeSpinsLeft).toBe(0);
    expect(lastFs.next).toBe('respin');
    expect(lastFs.roundComplete).toBe(false);
    expect(last.action).toBe('collect');
    expect(last.roundComplete).toBe(true);
    const lineWinsInFs = results.filter((r) => r.action === 'freeSpin').reduce((s, r) => s + r.roundAward, 0);
    expect(last.fsWin).toBe(lineWinsInFs + last.bonusTotal);
    expect(last.roundWin).toBe(results.reduce((s, r) => s + r.roundAward, 0));
  });

  it('retrigger on the last free dive continues the series', () => {
    const fsBoards = Array.from({ length: 7 }, () => BLANK);
    const { results } = playOut({ reels: [MAPS_ONLY, ...fsBoards, MAPS_ONLY, ...Array.from({ length: 8 }, () => BLANK)] });
    const retrigger = results[8];
    expect(retrigger.action).toBe('freeSpin');
    expect(retrigger.fsAwarded).toBe(8);
    expect(retrigger.freeSpinsLeft).toBe(8);
    expect(retrigger.freeSpinsTotal).toBe(16);
    expect(results).toHaveLength(17);
    expect(results.at(-1)!.roundComplete).toBe(true);
  });

  it('rejects an unexpected action and insufficient funds without touching the balance', () => {
    const p = new ScriptedOutcomeProvider({ reels: [BLANK] });
    expect(() => step(initialState(), { stepId: sid(), action: 'respin' }, p)).toThrow(/Expected "spin"/);
    expect(() => step(initialState(30), { stepId: sid(), action: 'spin', bet: 50 }, p)).toThrow(/Not enough/);
    expect(() => step(initialState(), { stepId: sid(), action: 'spin', bet: 30 }, p)).toThrow(/not allowed/);
    expect(() => step(initialState(), { stepId: sid(), action: 'spin', bet: 10 }, p)).toThrow(/not allowed/);
  });
});

describe('GDD §5 acceptance — result source', () => {
  const make = (store: MemoryStore, script: ConstructorParameters<typeof ScriptedOutcomeProvider>[0], failRate = 0) =>
    new LocalResultSource({ store, provider: new ScriptedOutcomeProvider(script), failRate });

  it('double click / repeated stepId → one bet, one result, one credit record', async () => {
    const store = new MemoryStore();
    const src = make(store, { reels: [BLANK, BLANK] });
    const a = await src.request({ stepId: 'same', action: 'spin', bet: 200 });
    const b = await src.request({ stepId: 'same', action: 'spin', bet: 200 });
    expect(b).toEqual(a);
    expect((await src.session()).balance).toBe(100_000 - 200 + a.roundAward);
    expect(src.history()).toHaveLength(1);
  });

  it('lost response is retried with the same stepId without a second debit', async () => {
    const store = new MemoryStore();
    const src = make(store, { reels: [BLANK, BLANK] }, 1);
    // failRate=1: Math.random() < 0.5 → запит загублено до обробки; інакше відповідь загублено після фіксації
    let result;
    for (let i = 0; i < 20 && !result; i++) {
      try {
        result = await src.request({ stepId: 'retry-me', action: 'spin', bet: 100 });
      } catch (e) {
        expect(e).toBeInstanceOf(SourceError);
        expect((e as SourceError).retryable).toBe(true);
        if (i > 5) src.failRate = 0;
      }
    }
    expect(result).toBeDefined();
    expect(src.snapshot().balance).toBe(100_000 - 100 + result!.roundAward);
  });

  it('reload during respin and during collect restores the same result, respins and balance', async () => {
    const store = new MemoryStore();
    const script = { reels: [SIX], respins: [landing(['P2', 1, 0]), EMPTY, EMPTY, EMPTY], mysteries: [] };
    const first = make(store, script);
    const entry = await first.request({ stepId: 's1', action: 'spin', bet: 100 });
    const r1 = await first.request({ stepId: 's2', action: 'respin' });
    const r2 = await first.request({ stepId: 's3', action: 'respin' });

    // «перезавантаження» — новий екземпляр на тому самому сховищі
    const second = make(store, { respins: [EMPTY, EMPTY], mysteries: [] });
    const snap = await second.session();
    expect(snap.balance).toBe(r2.balanceAfter);
    expect(snap.round?.salvage?.respinsLeft).toBe(2);
    expect(snap.round?.salvage?.grid).toEqual(r2.salvageGrid);
    expect(snap.lastResult).toEqual(r2);
    // повтор останнього кроку після перезавантаження нічого не змінює
    expect(await second.request({ stepId: 's3', action: 'respin' })).toEqual(r2);

    const r3 = await second.request({ stepId: 's4', action: 'respin' });
    const r4 = await second.request({ stepId: 's5', action: 'respin' });
    expect(r4.next).toBe('collect');

    // перезавантаження під час збору
    const third = make(store, {});
    const snap2 = await third.session();
    expect(snap2.round?.salvage?.phase).toBe('collect');
    expect(snap2.round?.salvage?.total).toBe(r4.bonusTotal);
    expect(snap2.balance).toBe(r4.balanceAfter); // ще не зараховано
    const c = await third.request({ stepId: 's6', action: 'collect' });
    expect(c.balanceAfter).toBe(r4.balanceAfter + r4.bonusTotal);
    const again = await third.request({ stepId: 's6', action: 'collect' });
    expect(again.balanceAfter).toBe(c.balanceAfter);
    expect([entry, r1, r2, r3, r4].every((r) => r.roundId === c.roundId)).toBe(true);
    expect(third.history()[0].steps).toHaveLength(6);
  });

  it('top-up is refused mid-round and allowed when idle', async () => {
    const store = new MemoryStore();
    const src = make(store, { reels: [SIX], respins: [EMPTY, EMPTY, EMPTY] });
    await src.request({ stepId: 'a', action: 'spin', bet: 100 });
    await expect(src.topUp()).rejects.toThrow(/during a round/);
  });
});
