/**
 * 3 Pots: мітки на перлинах бази наповнюють банки окремо для кожної ставки;
 * повна банка вмикає модифікатор у найближчому Salvage і спорожнюється.
 */
import { describe, expect, it } from 'vitest';
import { initialState, potsFor, step } from '../src/engine/engine';
import { board, landing, ScriptedOutcomeProvider } from '../src/engine/scripted';
import { LocalResultSource } from '../src/server/LocalResultSource';
import { MemoryStore } from '../src/server/storage';
import { POT_SIZE, RESPINS_EXTRA } from '../src/shared/config';
import { cellValue } from '../src/shared/values';
import type { EngineState, Pots } from '../src/shared/types';
import { play, playOut, sid } from './helpers';

// Дві мітки (Extra і Boost) на перлинах, Salvage не запускається (лише три перлини).
const TWO_MARKS = board([
  'P1x R1 R2 C  R3',
  'R2  P3b H  R4 R4',
  'N   R1 P1 R2 C ',
]);
// Шість перлин; одна з міткою Multi.
const SIX_MULTI_MARK = board([
  'P1  R1 P2 C  P2m',
  'R2  P3 H  P5 R4',
  'N   R1 P1 R2 C ',
]);
const SIX = board([
  'P1 R1 P2 C  P2',
  'R2 P3 H  P5 R4',
  'N  R1 P1 R2 C ',
]);
const NOTHING = board([
  'R1 R2 R3 C  R4',
  'R2 R3 H  R4 R1',
  'N  R1 R2 R3 C ',
]);
// Карти на 2–4 і перлина з міткою — у Free Dives мітки не рахуються.
const MAPS = board([
  'R1 M  R2 C  R3',
  'R2 R3 M  R4 R4',
  'N  R1 R2 M  C ',
]);
const FS_MARKED = board([
  'C  H  N  C  P2x',
  'H  N  C  H  N',
  'N  C  H  N  C',
]);

/** Стан із заданими банками для ставки. */
function withPots(bet: number, pots: Partial<Pots>): EngineState {
  const s = initialState();
  Object.assign(potsFor(s, bet), pots);
  return s;
}

describe('3 Pots — filling', () => {
  it('marks on base pearls fill their pots, each mark reported once', () => {
    const { last } = play({ reels: [TWO_MARKS] }, ['spin']);
    expect(last.potsBefore).toEqual({ extra: 0, boost: 0, multi: 0 });
    expect(last.pots).toEqual({ extra: 1, boost: 1, multi: 0 });
    expect(last.potHits.map((h) => h.pot).sort()).toEqual(['boost', 'extra']);
    expect(last.potHits.find((h) => h.pot === 'extra')).toMatchObject({ c: 0, r: 0 });
  });

  it('pots are kept per bet: another bet has its own pots', () => {
    const a = play({ reels: [TWO_MARKS] }, ['spin'], { bet: 100 });
    const b = play({ reels: [NOTHING] }, ['spin'], { bet: 200, state: a.state });
    expect(b.last.pots).toEqual({ extra: 0, boost: 0, multi: 0 });
    expect(b.state.pots['100']).toEqual({ extra: 1, boost: 1, multi: 0 });
  });

  it('a pot never overflows past POT_SIZE', () => {
    const { last } = play({ reels: [TWO_MARKS] }, ['spin'], { state: withPots(100, { extra: POT_SIZE }) });
    expect(last.pots.extra).toBe(POT_SIZE);
  });

  it('marks do not count in Free Dives', () => {
    const { results } = playOut({ reels: [MAPS, FS_MARKED, ...Array(7).fill(NOTHING)] });
    const fsSteps = results.filter((r) => r.action === 'freeSpin');
    expect(fsSteps).toHaveLength(8);
    expect(fsSteps.every((r) => r.potHits.length === 0)).toBe(true);
    expect(results[results.length - 1].pots).toEqual({ extra: 0, boost: 0, multi: 0 });
  });
});

describe('3 Pots — modifiers in Salvage', () => {
  it('without full pots Salvage is unchanged and pots keep their progress', () => {
    const { results } = playOut(
      { reels: [SIX], respins: [[], [], []] },
      { state: withPots(100, { extra: 5, boost: POT_SIZE - 1, multi: 0 }) },
    );
    expect(results[0].mods).toEqual({ extra: false, boost: 0, multi: false, multiHits: [] });
    expect(results[0].respinsLeft).toBe(3);
    expect(results[results.length - 1].pots).toEqual({ extra: 5, boost: POT_SIZE - 1, multi: 0 });
  });

  it('Extra: 4 respins, and a new pearl resets the counter to 4', () => {
    const { results } = playOut(
      { reels: [SIX], respins: [[], landing(['P1', 1, 0]), [], [], [], []] },
      { state: withPots(100, { extra: POT_SIZE }) },
    );
    expect(results[0].mods?.extra).toBe(true);
    expect(results[0].respinsLeft).toBe(RESPINS_EXTRA);
    expect(results[0].pots.extra).toBe(0); // використана банка спорожніла
    const respins = results.filter((r) => r.action === 'respin');
    expect(respins.map((r) => r.respinsLeft)).toEqual([3, 4, 3, 2, 1, 0]);
  });

  it('Boost: adds its value to every pearl on the starting board, and the total includes it', () => {
    const { results, last } = playOut(
      { reels: [SIX], respins: [[], [], []], boosts: [2] },
      { state: withPots(100, { boost: POT_SIZE }) },
    );
    const entry = results[0];
    expect(entry.mods?.boost).toBe(2);
    const pearls = entry.salvageGrid!.flat().filter((c) => c?.s === 'PEARL');
    // на поле впали 1, 2, 2, 3, 5, 1 → після Boost кожна на 2 більша
    expect(pearls.map((c) => c!.v ?? 0).sort((a, b) => a - b)).toEqual([3, 3, 4, 4, 5, 7]);
    expect(last.bonusTotal).toBe((14 + 6 * 2) * 100);
  });

  it('Boost does not touch pearls that land later in respins', () => {
    const { last } = playOut(
      { reels: [SIX], respins: [landing(['P5', 4, 2]), [], [], []], boosts: [1] },
      { state: withPots(100, { boost: POT_SIZE }) },
    );
    expect(last.salvageGrid![4][2]).toMatchObject({ s: 'PEARL', v: 5 });
    expect(last.bonusTotal).toBe((14 + 6 + 5) * 100);
  });

  it('Multi: multipliers land on pearls when respins end, and the total includes them', () => {
    const { results, last } = playOut(
      { reels: [SIX], respins: [[], [], []], multis: [[{ c: 3, r: 1, m: 3 }]] },
      { state: withPots(100, { multi: POT_SIZE }) },
    );
    expect(results[0].mods?.multi).toBe(true);
    const ending = results.find((r) => r.next === 'collect')!;
    expect(ending.mods?.multiHits).toEqual([{ c: 3, r: 1, m: 3 }]);
    expect(ending.salvageGrid![3][1]).toMatchObject({ s: 'PEARL', v: 5, m: 3 });
    // 1+2+2+3+1 + 5×3
    expect(last.bonusTotal).toBe((9 + 15) * 100);
    expect(cellValue({ s: 'PEARL', v: 5, m: 3 }, true)).toBe(30); // з Super множники перемножуються
  });

  it('a pot that fills on the triggering spin works in that same Salvage', () => {
    const { results } = playOut(
      { reels: [SIX_MULTI_MARK], respins: [[], [], []], multis: [[{ c: 0, r: 0, m: 2 }]] },
      { state: withPots(100, { multi: POT_SIZE - 1 }) },
    );
    expect(results[0].potHits).toEqual([{ c: 4, r: 0, pot: 'multi' }]);
    expect(results[0].mods?.multi).toBe(true);
    expect(results[0].pots.multi).toBe(0);
  });

  it('all three pots at once', () => {
    const { results, last } = playOut(
      { reels: [SIX], respins: [[], [], [], []], boosts: [1], multis: [[{ c: 0, r: 0, m: 5 }]] },
      { state: withPots(100, { extra: POT_SIZE, boost: POT_SIZE, multi: POT_SIZE }) },
    );
    expect(results[0].mods).toMatchObject({ extra: true, boost: 1, multi: true });
    expect(results.filter((r) => r.action === 'respin')).toHaveLength(4);
    // перлини з Boost: 2,3,3,4,6,2 = 20; перша (1+1=2) ×5 → +8
    expect(last.bonusTotal).toBe((20 + 8) * 100);
    expect(last.pots).toEqual({ extra: 0, boost: 0, multi: 0 });
  });
});

describe('3 Pots — server', () => {
  it('a session saved before 3 Pots loads, and its pots start empty', async () => {
    const store = new MemoryStore();
    const old = initialState() as unknown as Record<string, unknown>;
    delete old.pots;
    store.set('k', JSON.stringify({ version: 1, engine: old, lastResult: null, current: null, history: [] }));
    const src = new LocalResultSource({ store, key: 'k', provider: new ScriptedOutcomeProvider({ reels: [TWO_MARKS] }) });
    expect((await src.session()).pots).toEqual({});
    const r = await src.request({ stepId: sid(), action: 'spin', bet: 100 });
    expect(r.pots).toEqual({ extra: 1, boost: 1, multi: 0 });
    expect((await src.session()).pots['100']).toEqual({ extra: 1, boost: 1, multi: 0 });
  });

  it('modifiers survive a reload in the middle of Salvage', async () => {
    const store = new MemoryStore();
    const seeded = withPots(100, { extra: POT_SIZE, boost: POT_SIZE });
    store.set('k', JSON.stringify({ version: 1, engine: seeded, lastResult: null, current: null, history: [] }));
    const src = new LocalResultSource({ store, key: 'k', provider: new ScriptedOutcomeProvider({ reels: [SIX], boosts: [3] }) });
    const entry = await src.request({ stepId: sid(), action: 'spin', bet: 100 });
    expect(entry.mods).toMatchObject({ extra: true, boost: 3 });
    // «перезавантаження сторінки»: нове джерело читає те саме сховище
    const reloaded = await new LocalResultSource({ store, key: 'k', provider: new ScriptedOutcomeProvider({}) }).session();
    expect(reloaded.round?.salvage?.mods).toMatchObject({ extra: true, boost: 3, multi: false });
    expect(reloaded.round?.salvage?.respinsLeft).toBe(RESPINS_EXTRA);
    expect(reloaded.pots['100']).toEqual({ extra: 0, boost: 0, multi: 0 });
  });

  it('a step outside Salvage reports no modifiers', () => {
    const r = step(initialState(), { stepId: sid(), action: 'spin', bet: 100 }, new ScriptedOutcomeProvider({ reels: [NOTHING] })).result;
    expect(r.mods).toBeNull();
  });
});
