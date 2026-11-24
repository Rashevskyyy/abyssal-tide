/**
 * Симуляція математики: `npm run sim -w @games/petrykivka-bloom -- [спінів] [сид] [потоків]`.
 * Грає тим самим `step()`, що й гра, у кількох потоках (worker_threads) і друкує звіт:
 * RTP з 95 % довірчим інтервалом, внесок бази, бонусу й «Мазка», частоти, розподіл виграшів.
 * Окремо — куплений бонус. `--json` друкує ті самі числа для docs/MATH.uk.md і CI.
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { expectedAction, initialState, step } from '../src/engine/engine';
import { RandomOutcomeProvider } from '../src/engine/outcome';
import type { EngineState } from '../src/shared/types';

const BET = 100;
const BUCKETS = [0, 1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000]; // межі кошиків виграшу, у ставках

interface Tally {
  rounds: number;
  staked: number;
  won: number;
  sumSq: number; // Σ (виграш раунду / вартість)²
  baseWon: number;
  freeWon: number;
  strokeRounds: number;
  strokeWon: number;
  hits: number;
  fsTriggers: number;
  fsSpins: number;
  maxWins: number;
  maxRoundX: number;
  longestChain: number;
  topLevel: number;
  bins: number[];
}

const emptyTally = (): Tally => ({
  rounds: 0, staked: 0, won: 0, sumSq: 0, baseWon: 0, freeWon: 0, strokeRounds: 0, strokeWon: 0,
  hits: 0, fsTriggers: 0, fsSpins: 0, maxWins: 0, maxRoundX: 0, longestChain: 0, topLevel: 0,
  bins: new Array(BUCKETS.length + 1).fill(0), // [0] — без виграшу, далі [межа, наступна межа)
});

function run(rounds: number, seed: number, mode: 'play' | 'ante' | 'buy'): Tally {
  const provider = new RandomOutcomeProvider(seed);
  const t = emptyTally();
  let state: EngineState = initialState(Number.MAX_SAFE_INTEGER / 4);
  let n = 0;
  for (let r = 0; r < rounds; r++) {
    let roundWon = 0;
    let cost = 0;
    let stroked = false;
    do {
      const action = expectedAction(state);
      const out = step(state, { stepId: String(n++), action, bet: BET, ante: mode === 'ante', buy: mode === 'buy' }, provider);
      state = out.state;
      const res = out.result;
      cost += res.cost;
      roundWon += res.stepWin;
      if (res.mode === 'base') {
        t.baseWon += res.stepWin;
        if (res.stroke) stroked = true;
        if (res.fsAwarded) t.fsTriggers++;
      } else {
        t.freeWon += res.stepWin;
        t.fsSpins++;
      }
      t.longestChain = Math.max(t.longestChain, res.tumbles.length);
      for (const tu of res.tumbles) for (const lv of tu.spots) if (lv > t.topLevel) t.topLevel = lv;
      if (res.maxWin) t.maxWins++;
      if (res.roundComplete) break;
    } while (true);
    t.rounds++;
    t.staked += cost;
    t.won += roundWon;
    const x = roundWon / BET;
    t.sumSq += (roundWon / cost) ** 2;
    if (roundWon > 0) t.hits++;
    if (stroked) {
      t.strokeRounds++;
      t.strokeWon += roundWon;
    }
    t.maxRoundX = Math.max(t.maxRoundX, x);
    let b = 1;
    while (b < BUCKETS.length && x >= BUCKETS[b]) b++;
    t.bins[x === 0 ? 0 : b]++;
  }
  return t;
}

function merge(a: Tally, b: Tally): Tally {
  const out = emptyTally();
  for (const k of Object.keys(out) as (keyof Tally)[]) {
    if (k === 'bins') out.bins = a.bins.map((v, i) => v + b.bins[i]);
    else if (k === 'maxRoundX' || k === 'longestChain' || k === 'topLevel') out[k] = Math.max(a[k], b[k]);
    else out[k] = a[k] + b[k];
  }
  return out;
}

async function parallel(rounds: number, seed: number, threads: number, mode: 'play' | 'ante' | 'buy'): Promise<Tally> {
  const per = Math.ceil(rounds / threads);
  const parts = await Promise.all(
    Array.from({ length: threads }, (_, i) =>
      new Promise<Tally>((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), {
          workerData: { rounds: Math.min(per, rounds - i * per), seed: seed + i * 7919, mode },
          execArgv: ['--import', 'tsx'],
        });
        w.once('message', resolve);
        w.once('error', reject);
      }),
    ),
  );
  return parts.reduce(merge, emptyTally());
}

function report(t: Tally, label: string) {
  const rtp = t.won / t.staked;
  const mean = rtp;
  const sd = Math.sqrt(Math.max(0, t.sumSq / t.rounds - mean * mean));
  const ci = (1.96 * sd) / Math.sqrt(t.rounds);
  const pct = (v: number) => `${(v * 100).toFixed(2)} %`;
  const oneIn = (v: number) => (v ? `1 in ${Math.round(t.rounds / v)}` : '—');
  const rows: Record<string, string | number> = {
    rounds: t.rounds,
    RTP: `${pct(rtp)} ± ${pct(ci)}`,
    'RTP base game': pct(t.baseWon / t.staked),
    'RTP free spins': pct(t.freeWon / t.staked),
    'rounds with Stroke': oneIn(t.strokeRounds),
    'Stroke rounds pay, ×cost': t.strokeRounds ? (t.strokeWon / t.strokeRounds / BET).toFixed(2) : '—',
    'hit rate': pct(t.hits / t.rounds),
    'free spins': oneIn(t.fsTriggers),
    'avg free spins per bonus': t.fsTriggers ? (t.fsSpins / t.fsTriggers).toFixed(1) : '—',
    'avg bonus, ×bet': t.fsTriggers ? (t.freeWon / t.fsTriggers / BET).toFixed(1) : '—',
    'max win (5 000×)': oneIn(t.maxWins),
    'biggest round, ×bet': Math.round(t.maxRoundX),
    'longest tumble chain': t.longestChain,
    'top multiplier': `×${2 ** Math.max(0, t.topLevel - 1)}`,
    'std deviation, ×cost': sd.toFixed(2),
  };
  console.log(`\n${label}`);
  console.table(rows);
  const bins: Record<string, string> = {};
  t.bins.forEach((v, i) => {
    const name = i === 0 ? 'no win' : i < BUCKETS.length ? `${BUCKETS[i - 1]}–${BUCKETS[i]}×` : `${BUCKETS.at(-1)}×+`;
    bins[name] = pct(v / t.rounds);
  });
  console.table(bins);
  return { rtp, ci, rows };
}

if (!isMainThread) {
  const { rounds, seed, mode } = workerData as { rounds: number; seed: number; mode: 'play' | 'ante' | 'buy' };
  parentPort!.postMessage(run(rounds, seed, mode));
} else {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const rounds = Number(args[0] ?? 1_000_000);
  const seed = Number(args[1] ?? 2026);
  const threads = Number(args[2] ?? Math.max(1, availableParallelism() - 1));
  const t0 = Date.now();
  const play = await parallel(rounds, seed, threads, 'play');
  const base = report(play, `Base game, bet ${BET / 100} €`);
  const ante = report(await parallel(Math.round(rounds / 2), seed + 1, threads, 'ante'), 'Ante bet (×1.25)');
  const buy = report(await parallel(Math.round(rounds / 20), seed + 2, threads, 'buy'), 'Bonus buy (100×)');
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s, ${threads} threads`);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ base: base.rtp, baseCi: base.ci, ante: ante.rtp, buy: buy.rtp }));
  }
}
