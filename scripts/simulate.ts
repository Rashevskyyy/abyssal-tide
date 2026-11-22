/**
 * Симуляція математики демо: `npm run sim -- [rounds] [seed]`.
 * Грає повні раунди через той самий рушій, що й клієнт, і рахує RTP та частоти фіч.
 */
import { initialState, step } from '../src/engine/engine';
import { RandomOutcomeProvider } from '../src/engine/outcome';
import type { Action, EngineState } from '../src/shared/types';
import { BETS } from '../src/shared/config';

const rounds = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 12345);
const provider = new RandomOutcomeProvider(seed);
const BET = BETS[0]; // €0.10 у центах

let state: EngineState = initialState(1e12);
const t = {
  bet: 0,
  win: 0,
  baseLines: 0,
  fsLines: 0,
  salvageBase: 0,
  salvageFs: 0,
  hits: 0,
  fsTriggers: 0,
  fsRetriggers: 0,
  fsSpins: 0,
  salvages: 0,
  supers: 0,
  fullBoards: 0,
  maxWin: 0,
  bigWins: 0,
  respins: 0,
  potHits: 0,
  modExtra: 0,
  modBoost: 0,
  modMulti: 0,
  modAll: 0,
  salvageWithMods: 0,
  salvageNoMods: 0,
  salvagesWithMods: 0,
};
const winSq = { sum: 0 };
let fsOrigin = false;

const started = Date.now();
for (let i = 0; i < rounds; i++) {
  let action: Action = 'spin';
  let roundWin = 0;
  for (;;) {
    const { state: s, result: r } = step(state, { stepId: String(i), action, bet: BET }, provider);
    state = s;
    if (action === 'spin') {
      t.bet += BET;
      t.baseLines += r.roundAward;
      if (r.fsAwarded) t.fsTriggers++;
    } else if (action === 'freeSpin') {
      t.fsSpins++;
      t.fsLines += r.roundAward;
      if (r.fsAwarded) t.fsRetriggers++;
    } else if (action === 'respin') {
      t.respins++;
    } else if (action === 'collect') {
      if (fsOrigin) t.salvageFs += r.roundAward;
      else t.salvageBase += r.roundAward;
      if (r.fullBoard) t.fullBoards++;
    }
    t.potHits += r.potHits.length;
    if (r.salvageTriggered) {
      t.salvages++;
      fsOrigin = action === 'freeSpin';
      const m = r.mods!;
      if (m.extra) t.modExtra++;
      if (m.boost) t.modBoost++;
      if (m.multi) t.modMulti++;
      if (m.extra && m.boost && m.multi) t.modAll++;
      if (m.extra || m.boost || m.multi) t.salvagesWithMods++;
    }
    if (action === 'collect') {
      const m = r.mods!;
      if (m.extra || m.boost || m.multi) t.salvageWithMods += r.roundAward;
      else t.salvageNoMods += r.roundAward;
    }
    if (r.superActivated) t.supers++;
    if (r.mysteryReveals.some((m) => m.activatesSuper) && action === 'respin') t.supers++;
    roundWin += r.roundAward;
    if (r.next === 'none') break;
    action = r.next;
  }
  t.win += roundWin;
  winSq.sum += roundWin * roundWin;
  if (roundWin > 0) t.hits++;
  if (roundWin >= 20 * BET) t.bigWins++;
  if (roundWin > t.maxWin) t.maxWin = roundWin;
}

const pct = (x: number) => `${((x / t.bet) * 100).toFixed(2)}%`;
const oneIn = (n: number) => (n ? `1 in ${(rounds / n).toFixed(0)}` : '—');
const mean = t.win / rounds;
const sd = Math.sqrt(winSq.sum / rounds - mean * mean);

console.log(`Abyssal Tide — simulation of ${rounds.toLocaleString('en')} paid rounds (seed ${seed}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.table({
  'RTP total': pct(t.win),
  '  base lines': pct(t.baseLines),
  '  free dives lines': pct(t.fsLines),
  '  salvage (base)': pct(t.salvageBase),
  '  salvage (in FS)': pct(t.salvageFs),
  'hit frequency': `${((t.hits / rounds) * 100).toFixed(1)}%`,
  'free dives trigger': oneIn(t.fsTriggers),
  'retrigger per series': (t.fsRetriggers / Math.max(1, t.fsTriggers)).toFixed(3),
  'salvage trigger (any)': oneIn(t.salvages),
  'avg salvage award ×bet': ((t.salvageBase + t.salvageFs) / Math.max(1, t.salvages) / BET).toFixed(1),
  'super in salvage': `${((t.supers / Math.max(1, t.salvages)) * 100).toFixed(1)}%`,
  'full board': oneIn(t.fullBoards),
  'pot mark lands': oneIn(t.potHits),
  'salvage with Extra': `${((t.modExtra / Math.max(1, t.salvages)) * 100).toFixed(1)}%`,
  'salvage with Boost': `${((t.modBoost / Math.max(1, t.salvages)) * 100).toFixed(1)}%`,
  'salvage with Multi': `${((t.modMulti / Math.max(1, t.salvages)) * 100).toFixed(1)}%`,
  'salvage with all three': `${((t.modAll / Math.max(1, t.salvages)) * 100).toFixed(1)}%`,
  'avg award, no pots ×bet': (t.salvageNoMods / Math.max(1, t.salvages - t.salvagesWithMods) / BET).toFixed(1),
  'avg award, with pots ×bet': (t.salvageWithMods / Math.max(1, t.salvagesWithMods) / BET).toFixed(1),
  'win ≥20× bet': oneIn(t.bigWins),
  'max round win ×bet': t.maxWin / BET,
  'std deviation (×bet)': (sd / BET).toFixed(2),
});
