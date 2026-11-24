/**
 * Рушій Petrykivka Bloom: чиста функція `step(state, request, provider, rules)`.
 * Ні DOM, ні таймерів, ні сховища — той самий код рахує гру в браузері, на сервері й у симуляції.
 * Клієнт отримує готовий список каскадів і лише програє його.
 */
import { DEFAULT_RULES, capAward, type GameRules } from '@slotkit/rules';
import {
  BETS,
  BUY_COST_X,
  BUY_FS,
  CELLS,
  FS_AWARD,
  FS_RETRIGGER,
  MAX_LEVEL,
  PLATES_TO_TRIGGER,
  START_BALANCE,
  anteCost,
  multiplierOf,
} from '../shared/config';
import { PAYTABLE, bucketOf, type SymbolId } from '../shared/symbols';
import type {
  Action,
  ClusterWin,
  DrawMode,
  EngineState,
  Grid,
  Mode,
  RoundState,
  Spots,
  StepRequest,
  StepResult,
  Stroke,
  Tumble,
} from '../shared/types';
import { collapse, findClusters } from './grid';
import type { OutcomeProvider } from './outcome';

export type EngineErrorCode = 'INSUFFICIENT_FUNDS' | 'INVALID_BET' | 'UNEXPECTED_ACTION' | 'BAD_REQUEST';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** Ланцюжок каскадів обмежений: на справжній сітці він закінчується за кілька кроків, це запобіжник. */
const MAX_TUMBLES = 200;

const IDLE_ROWS = [
  'MALLOW SEED   LEAF   KALYNA CURL   COMB   ROOSTER',
  'COMB   CURL   KALYNA SEED   LEAF   FIREBIRD SEED',
  'LEAF   ROOSTER COMB  CURL   MALLOW SEED   KALYNA',
  'SEED   MALLOW CURL   FIREBIRD COMB LEAF   CURL',
  'CURL   KALYNA SEED   LEAF   ROOSTER COMB  MALLOW',
  'FIREBIRD LEAF MALLOW COMB   SEED   CURL   LEAF',
  'KALYNA COMB   FIREBIRD SEED CURL   MALLOW COMB',
];
/** Сітка до першого спіну: без жодного кластера. */
export const IDLE_GRID: Grid = IDLE_ROWS.flatMap((row) => row.trim().split(/\s+/) as SymbolId[]);

export const emptySpots = (): Spots => new Array(CELLS).fill(0);

export function initialState(balance = START_BALANCE): EngineState {
  return { balance, roundSeq: 0, round: null, lastGrid: IDLE_GRID.slice() };
}

export function expectedAction(state: EngineState): Action {
  return state.round?.fs && state.round.fs.left > 0 ? 'freeSpin' : 'spin';
}

/** Скільки коштує спін із такими параметрами, центи. */
export function spinCost(bet: number, opts: { ante?: boolean; buy?: boolean } = {}): number {
  if (opts.buy) return bet * BUY_COST_X;
  return opts.ante ? anteCost(bet) : bet;
}

export function step(
  prev: EngineState,
  req: StepRequest,
  provider: OutcomeProvider,
  rules: GameRules = DEFAULT_RULES,
): { state: EngineState; result: StepResult } {
  const state = structuredClone(prev);
  const expected = expectedAction(state);
  if (req.action !== expected) throw new EngineError('UNEXPECTED_ACTION', `Expected "${expected}", got "${req.action}"`);
  return req.action === 'spin' ? spin(state, req, provider, rules) : freeSpin(state, req, provider, rules);
}

// ───────────────────────────── кроки ─────────────────────────────

function spin(state: EngineState, req: StepRequest, provider: OutcomeProvider, rules: GameRules) {
  const bet = req.bet ?? 0;
  if (!BETS.includes(bet)) throw new EngineError('INVALID_BET', `Bet ${bet} is not allowed`);
  if (req.ante && req.buy) throw new EngineError('BAD_REQUEST', 'Ante bet and bonus buy cannot be combined');
  const ante = !!req.ante;
  const bought = !!req.buy;
  const cost = spinCost(bet, { ante, buy: bought });
  if (state.balance < cost) throw new EngineError('INSUFFICIENT_FUNDS', 'Not enough credits');

  state.balance -= cost; // одне списання за раунд
  state.roundSeq += 1;
  const round: RoundState = { id: `P${String(state.roundSeq).padStart(6, '0')}`, bet, ante, bought, win: 0, fs: null };
  state.round = round;

  if (bought) {
    // купівля: раунд одразу переходить у бонус, сітка лишається як була
    round.fs = { left: BUY_FS, total: BUY_FS, win: 0, spots: emptySpots(), stroked: false };
    return finish(state, req, {
      mode: 'base',
      cost,
      stroke: null,
      spotsBefore: emptySpots(),
      grid: state.lastGrid,
      tumbles: [],
      finalGrid: state.lastGrid,
      plates: [],
      fsAwarded: BUY_FS,
      win: 0,
      rules,
    });
  }

  const drawMode: DrawMode = ante ? 'ante' : 'base';
  const spots = emptySpots(); // в основній грі бутони живуть один спін
  const stroke = provider.stroke('base', false);
  const play = playSpin(drawMode, spots, stroke, bet, provider);
  const fsAwarded = play.plates.length >= PLATES_TO_TRIGGER ? FS_AWARD[play.plates.length] : 0;
  if (fsAwarded) round.fs = { left: fsAwarded, total: fsAwarded, win: 0, spots: emptySpots(), stroked: false };
  return finish(state, req, { mode: 'base', cost, stroke, spotsBefore: emptySpots(), ...play, fsAwarded, rules });
}

function freeSpin(state: EngineState, req: StepRequest, provider: OutcomeProvider, rules: GameRules) {
  const round = state.round!;
  const fs = round.fs!;
  const spotsBefore = fs.spots.slice();
  const stroke = provider.stroke('free', !fs.stroked); // перший фриспін завжди з «Мазком»
  fs.stroked = true;
  const play = playSpin('free', fs.spots, stroke, round.bet, provider);
  fs.left -= 1;
  const fsAwarded = play.plates.length >= PLATES_TO_TRIGGER ? FS_RETRIGGER : 0;
  fs.left += fsAwarded;
  fs.total += fsAwarded;
  return finish(state, req, { mode: 'free', cost: 0, stroke, spotsBefore, ...play, fsAwarded, rules });
}

interface Played {
  grid: Grid;
  tumbles: Tumble[];
  finalGrid: Grid;
  plates: number[];
  win: number;
}

/**
 * Один спін: «Мазок» → нова сітка → каскади, доки є кластер. `spots` змінюється на місці:
 * у фриспінах це стан бонусу, що переходить на наступний спін.
 */
function playSpin(mode: DrawMode, spots: Spots, stroke: Stroke | null, bet: number, provider: OutcomeProvider): Played {
  if (stroke) applyStroke(spots, stroke);
  const grid = provider.grid(mode);
  let current = grid;
  const tumbles: Tumble[] = [];
  let win = 0;
  for (let n = 0; n < MAX_TUMBLES; n++) {
    const found = findClusters(current);
    if (!found.length) break;
    // спершу виплата за станом клітинок до вибуху, потім ріст
    const clusters: ClusterWin[] = found.map(({ symbol, cells }) => {
      const sum = cells.reduce((s, i) => s + multiplierOf(spots[i]), 0);
      const multiplier = sum > 0 ? sum : 1;
      const units = PAYTABLE[symbol][bucketOf(cells.length)];
      return { symbol, cells, units, multiplier, amount: (units * bet * multiplier) / 20 };
    });
    const removed = new Set<number>();
    for (const cl of clusters) for (const i of cl.cells) removed.add(i);
    for (const i of removed) spots[i] = Math.min(MAX_LEVEL, spots[i] + 1);
    const next = collapse(current, removed, (col, count, kept) => provider.refill(col, count, mode, kept));
    const tumbleWin = clusters.reduce((s, c) => s + c.amount, 0);
    win += tumbleWin;
    tumbles.push({
      clusters,
      removed: [...removed].sort((a, b) => a - b),
      refill: next.refill,
      grid: next.grid,
      spots: spots.slice(),
      win: tumbleWin,
    });
    current = next.grid;
  }
  const plates: number[] = [];
  current.forEach((s, i) => s === 'PLATE' && plates.push(i));
  return { grid, tumbles, finalGrid: current, plates, win };
}

/** Бутони від пензля; квітка не стає меншою, якщо мазок пройшов по ній. */
export function applyStroke(spots: Spots, stroke: Stroke): void {
  for (const i of stroke.cells) spots[i] = Math.max(spots[i], 1);
  for (const i of stroke.blooms) spots[i] = Math.max(spots[i], 2);
}

interface Outcome extends Played {
  mode: Mode;
  cost: number;
  stroke: Stroke | null;
  spotsBefore: Spots;
  fsAwarded: number;
  rules: GameRules;
}

/** Нарахування з обмеженням max win, кінець раунду, результат кроку. */
function finish(state: EngineState, req: StepRequest, o: Outcome): { state: EngineState; result: StepResult } {
  const round = state.round!;
  const award = capAward(o.win, round.win, round.bet, o.rules);
  round.win += award;
  state.balance += award;
  if (round.fs && o.mode === 'free') round.fs.win += award;
  const maxWin = round.win >= o.rules.maxWinX * round.bet;
  const fsWin = round.fs?.win ?? 0;
  if (maxWin) {
    round.maxWin = true;
    round.fs = null; // решта бонусу згорає
  }
  state.lastGrid = o.finalGrid;
  const fs = round.fs;
  const next: Action | 'none' = fs && fs.left > 0 ? 'freeSpin' : 'none';
  const result: StepResult = {
    roundId: round.id,
    stepId: req.stepId,
    action: req.action,
    mode: o.mode,
    bet: round.bet,
    ante: round.ante,
    bought: round.bought,
    cost: o.cost,
    stroke: o.stroke,
    spotsBefore: o.spotsBefore,
    grid: o.grid,
    tumbles: o.tumbles,
    finalGrid: o.finalGrid,
    plates: o.plates,
    fsAwarded: maxWin ? 0 : o.fsAwarded,
    freeSpinsLeft: fs?.left ?? 0,
    freeSpinsTotal: fs?.total ?? 0,
    fsWin,
    stepWin: award,
    roundWin: round.win,
    balanceAfter: state.balance,
    next,
    roundComplete: next === 'none',
    maxWin,
  };
  if (next === 'none') state.round = null;
  return { state, result };
}
