import {
  DEFAULT_RULES,
  type GameRules,
  BETS,
  FREE_DIVES_AWARD,
  POT_IDS,
  POT_SIZE,
  RESPINS,
  RESPINS_EXTRA,
  SALVAGE_TRIGGER,
  SCATTERS_TO_TRIGGER,
  SCATTER_REELS,
  START_BALANCE,
} from '../shared/config';
import { isJackpot, isTriggerSymbol } from '../shared/symbols';
import {
  CELLS,
  allPositions,
  cloneGrid,
  emptyGrid,
  emptyPots,
  noMods,
  readingOrder,
  type Action,
  type EngineState,
  type Grid,
  type Landed,
  type Mode,
  type MysteryReveal,
  type PotHit,
  type Pots,
  type Pos,
  type SalvageMods,
  type ReelBoard,
  type RoundState,
  type SalvageState,
  type StepRequest,
  type StepResult,
  type SuperSource,
} from '../shared/types';
import { countFilled, salvageTotalX } from '../shared/values';
import { evaluateLines } from './lineEval';
import type { OutcomeProvider } from './outcome';
import { board } from './scripted';

/**
 * Рушій правил — чиста функція `step(state, request, provider) → { state, result }`.
 * Не має доступу до DOM, часу чи сховища: це «серверна» частина, яку можна винести в Node без змін.
 */

export type EngineErrorCode = 'INSUFFICIENT_FUNDS' | 'INVALID_BET' | 'UNEXPECTED_ACTION' | 'BAD_SCRIPT';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export const IDLE_BOARD: ReelBoard = board([
  'R1 C  R3 H  R2',
  'N  R2 M  R4 P2',
  'R4 H  R1 C  R3',
]);

export function initialState(balance = START_BALANCE): EngineState {
  return { balance, roundSeq: 0, round: null, lastBoard: IDLE_BOARD, pots: {} };
}

/** Банки 3 Pots для ставки (створює порожні, якщо на цій ставці ще не грали). */
export function potsFor(state: EngineState, bet: number): Pots {
  state.pots ??= {}; // сесії, збережені до появи банок
  return (state.pots[String(bet)] ??= emptyPots());
}

export function expectedAction(state: EngineState): Action {
  return nextAction(state.round) === 'none' ? 'spin' : (nextAction(state.round) as Action);
}

/** Банки до поточного кроку (step однопотоковий і синхронний — модульна змінна безпечна). */
let potsBefore: Pots = emptyPots();

function nextAction(round: RoundState | null): Action | 'none' {
  if (!round) return 'none';
  if (round.salvage) return round.salvage.phase === 'respin' ? 'respin' : 'collect';
  if (round.fs && round.fs.left > 0) return 'freeSpin';
  return 'none';
}

/** Правила поточного кроку (step синхронний — модульна змінна безпечна, як і potsBefore). */
let rules: GameRules = DEFAULT_RULES;

export function step(
  prev: EngineState,
  req: StepRequest,
  provider: OutcomeProvider,
  gameRules: GameRules = DEFAULT_RULES,
): { state: EngineState; result: StepResult } {
  rules = gameRules;
  const state = structuredClone(prev);
  if (state.round?.salvage) state.round.salvage.mods ??= noMods(); // бонус, збережений до появи банок
  const expected = expectedAction(state);
  if (req.action !== expected) {
    throw new EngineError('UNEXPECTED_ACTION', `Expected "${expected}", got "${req.action}"`);
  }
  const bet = req.action === 'spin' ? req.bet ?? 0 : state.round?.bet ?? 0;
  potsBefore = { ...potsFor(state, bet) };
  switch (req.action) {
    case 'spin':
      return spin(state, req, provider);
    case 'freeSpin':
      return freeSpin(state, req, provider);
    case 'respin':
      return respin(state, req, provider);
    case 'collect':
      return collect(state, req);
  }
}

// ───────────────────────────── reel steps ─────────────────────────────

function spin(state: EngineState, req: StepRequest, provider: OutcomeProvider) {
  const bet = req.bet ?? 0;
  if (!BETS.includes(bet)) throw new EngineError('INVALID_BET', `Bet ${bet} is not allowed`);
  if (state.balance < bet) throw new EngineError('INSUFFICIENT_FUNDS', 'Not enough credits');

  state.balance -= bet; // одне списання за платний спін
  state.roundSeq += 1;
  const round: RoundState = {
    id: `R${String(state.roundSeq).padStart(6, '0')}`,
    bet,
    win: 0,
    board: state.lastBoard,
    fs: null,
    salvage: null,
  };
  state.round = round;
  return reelStep(state, round, req, 'base', provider.reels('base'), provider);
}

function freeSpin(state: EngineState, req: StepRequest, provider: OutcomeProvider) {
  const round = state.round!;
  const fs = round.fs!;
  fs.left -= 1; // лічильник списується разом із прийняттям результату
  fs.played += 1;
  return reelStep(state, round, req, 'freeDives', provider.reels('freeDives'), provider);
}

function reelStep(
  state: EngineState,
  round: RoundState,
  req: StepRequest,
  mode: 'base' | 'freeDives',
  reels: ReelBoard,
  provider: OutcomeProvider,
) {
  const before = round.board;
  round.board = reels;
  state.lastBoard = reels;

  // 1) лінійна виплата (не більше за залишок до максимального виграшу)
  const lineWins = evaluateLines(reels, round.bet);
  const lineTotal = capped(round, lineWins.reduce((s, w) => s + w.amount, 0));
  state.balance += lineTotal;
  round.win += lineTotal;
  if (mode === 'freeDives' && round.fs) round.fs.win += lineTotal;

  // 2) запис +8 FS
  const scatter = mapPositions(reels);
  const fsAwarded = new Set(scatter.map((p) => p.c)).size >= SCATTERS_TO_TRIGGER && !round.maxWin ? FREE_DIVES_AWARD : 0;
  if (fsAwarded) {
    if (round.fs) {
      round.fs.left += fsAwarded;
      round.fs.total += fsAwarded;
    } else {
      round.fs = { left: fsAwarded, total: fsAwarded, played: 0, win: 0 };
    }
  }

  // 3) мітки 3 Pots летять у банки — до тригера, тож банка, що наповнилась цим спіном, діє вже в цьому Salvage
  const potHits: PotHit[] = [];
  if (mode === 'base') {
    const pots = potsFor(state, round.bet);
    reels.forEach((col, c) =>
      col.forEach((cell, r) => {
        if (cell.s !== 'PEARL' || !cell.pot) return;
        potHits.push({ c, r, pot: cell.pot });
        pots[cell.pot] = Math.min(POT_SIZE, pots[cell.pot] + 1);
      }),
    );
  }

  // 4) Salvage (після максимального виграшу фічі вже не запускаються)
  let triggers = 0;
  for (const col of reels) for (const cell of col) if (isTriggerSymbol(cell.s)) triggers++;
  const salvageTriggered = triggers >= SALVAGE_TRIGGER && !round.maxWin;
  if (salvageTriggered) round.salvage = startSalvage(reels, mode, round.bet, provider, potsFor(state, round.bet));

  const s = round.salvage;
  return finish(state, round, req, {
    mode,
    boardBefore: before,
    boardAfter: reels,
    lineWins,
    scatter: fsAwarded ? scatter : [],
    fsAwarded,
    salvageTriggered,
    salvageGrid: s ? cloneGrid(s.grid) : null,
    superActive: s?.superActive ?? false,
    superActivated: s?.superSource === 'entry' ? 'entry' : null,
    mysteryReveals: s?.phase === 'collect' ? s.reveals : [],
    fullBoard: s?.phase === 'collect' ? s.fullBoard : false,
    bonusTotal: s?.phase === 'collect' ? s.total : 0,
    roundAward: lineTotal,
    potHits,
  });
}

function mapPositions(reels: ReelBoard): Pos[] {
  const out: Pos[] = [];
  for (const c of SCATTER_REELS) reels[c].forEach((cell, r) => cell.s === 'MAP' && out.push({ c, r }));
  return out;
}

// ───────────────────────────── Salvage ─────────────────────────────

function startSalvage(reels: ReelBoard, origin: 'base' | 'freeDives', bet: number, provider: OutcomeProvider, pots: Pots): SalvageState {
  const grid = emptyGrid();
  let hasBlack = false;
  reels.forEach((col, c) =>
    col.forEach((cell, r) => {
      if (!isTriggerSymbol(cell.s)) return;
      const { pot: _mark, ...clean } = cell; // мітка вже в банці, у Salvage вона не потрібна
      void _mark;
      grid[c][r] = clean;
      if (cell.s === 'BLACK') hasBlack = true;
    }),
  );
  // повні банки вмикають модифікатори й спорожнюються; неповні чекають наступного бонусу
  const mods: SalvageMods = noMods();
  for (const id of POT_IDS) {
    if (pots[id] < POT_SIZE) continue;
    pots[id] = 0;
    if (id === 'extra') mods.extra = true;
    if (id === 'multi') mods.multi = true;
    if (id === 'boost') mods.boost = provider.boost();
  }
  if (mods.boost) {
    for (const col of grid) for (const cell of col) if (cell?.s === 'PEARL') cell.v = (cell.v ?? 0) + mods.boost;
  }
  const s: SalvageState = {
    grid,
    respinsLeft: mods.extra ? RESPINS_EXTRA : RESPINS,
    superActive: hasBlack,
    superSource: hasBlack ? 'entry' : null,
    phase: 'respin',
    origin,
    reveals: [],
    fullBoard: false,
    total: 0,
    respinCount: 0,
    mods,
  };
  if (countFilled(grid) === CELLS) finishSalvage(s, bet, provider); // поле повне вже на вході
  return s;
}

function respin(state: EngineState, req: StepRequest, provider: OutcomeProvider) {
  const round = state.round!;
  const s = round.salvage!;
  const before = cloneGrid(s.grid);
  const empty = allPositions().filter((p) => !s.grid[p.c][p.r]);
  const landed: Landed[] = provider.respin(empty, { superActive: s.superActive, filled: CELLS - empty.length });

  let superActivated: SuperSource | null = null;
  for (const l of landed) {
    s.grid[l.c][l.r] = { ...l.cell };
    if (l.cell.s === 'BLACK' && !s.superActive) {
      s.superActive = true; // перший Super: подвоєння один раз, включно з майбутніми перлинами
      s.superSource = 'respin';
      superActivated = 'respin';
    }
  }
  s.respinCount += 1;
  s.respinsLeft = landed.length > 0 ? (s.mods.extra ? RESPINS_EXTRA : RESPINS) : s.respinsLeft - 1;
  if (countFilled(s.grid) === CELLS || s.respinsLeft === 0) finishSalvage(s, round.bet, provider);

  return finish(state, round, req, {
    mode: 'salvage',
    boardBefore: before,
    boardAfter: cloneGrid(s.grid),
    salvageGrid: cloneGrid(s.grid),
    landed,
    superActive: s.superActive,
    superActivated,
    mysteryReveals: s.phase === 'collect' ? s.reveals : [],
    fullBoard: s.fullBoard,
    bonusTotal: s.phase === 'collect' ? s.total : 0,
    roundAward: 0,
  });
}

/** Респіни закінчились: визначаємо мушлі (згори вниз, зліва направо), повне поле й підсумок. */
function finishSalvage(s: SalvageState, bet: number, provider: OutcomeProvider): void {
  s.phase = 'collect';
  const shells = allPositions()
    .filter((p) => s.grid[p.c][p.r]?.s === 'SHELL')
    .sort(readingOrder);
  s.reveals = shells.map((p): MysteryReveal => {
    const cell = provider.mystery({ superActive: s.superActive });
    if (!(isJackpot(cell.s) || cell.s === 'BLACK')) throw new EngineError('BAD_SCRIPT', `Mystery cannot reveal ${cell.s}`);
    const activatesSuper = cell.s === 'BLACK' && !s.superActive;
    if (activatesSuper) {
      s.superActive = true;
      s.superSource = 'reveal';
    }
    return { ...p, cell, activatesSuper };
  });
  s.fullBoard = countFilled(s.grid) === CELLS;
  // Multi: множники на випадкові звичайні перлини — після розкриття мушель, перед збором
  if (s.mods.multi) {
    const pearls = allPositions().filter((p) => s.grid[p.c][p.r]?.s === 'PEARL');
    s.mods.multiHits = pearls.length ? provider.multi(pearls) : [];
    for (const h of s.mods.multiHits) s.grid[h.c][h.r] = { ...s.grid[h.c][h.r]!, m: h.m };
  }
  s.total = salvageTotalX(applyReveals(s.grid, s.reveals), s.superActive, s.fullBoard) * bet;
}

export function applyReveals(grid: Grid, reveals: MysteryReveal[]): Grid {
  const out = cloneGrid(grid);
  for (const rv of reveals) out[rv.c][rv.r] = { ...rv.cell };
  return out;
}

function collect(state: EngineState, req: StepRequest) {
  const round = state.round!;
  const s = round.salvage!;
  const award = capped(round, s.total); // бонусна виплата фіксується один раз
  state.balance += award;
  round.win += award;
  if (s.origin === 'freeDives' && round.fs) round.fs.win += award;
  const finalGrid = applyReveals(s.grid, s.reveals);
  round.salvage = null;

  return finish(state, round, req, {
    mode: 'salvage',
    boardBefore: cloneGrid(s.grid),
    boardAfter: finalGrid,
    salvageGrid: finalGrid,
    superActive: s.superActive,
    mysteryReveals: s.reveals,
    fullBoard: s.fullBoard,
    bonusTotal: award,
    roundAward: award,
    mods: s.mods,
  });
}

// ───────────────────────────── result ─────────────────────────────

type Partial_ = Pick<StepResult, 'mode' | 'boardBefore' | 'boardAfter' | 'roundAward'> & Partial<StepResult>;

/**
 * Обрізає виплату до залишку максимального виграшу раунду. Якщо межу досягнуто,
 * раунд закінчується: серія Free Dives і Salvage згоряють.
 */
function capped(round: RoundState, amount: number): number {
  const left = Math.max(0, rules.maxWinX * round.bet - round.win);
  if (amount < left) return amount;
  round.maxWin = true;
  if (round.fs) round.fs.left = 0;
  round.salvage = null;
  return left;
}

function finish(state: EngineState, round: RoundState, req: StepRequest, p: Partial_): { state: EngineState; result: StepResult } {
  if (round.maxWin) {
    if (round.fs) round.fs.left = 0;
    round.salvage = null;
  }
  const next = nextAction(round);
  const roundComplete = next === 'none';
  const result: StepResult = {
    roundId: round.id,
    stepId: req.stepId,
    action: req.action,
    mode: p.mode as Mode,
    bet: round.bet,
    boardBefore: cloneGrid(p.boardBefore),
    boardAfter: cloneGrid(p.boardAfter),
    lineWins: p.lineWins ?? [],
    scatter: p.scatter ?? [],
    fsAwarded: p.fsAwarded ?? 0,
    salvageTriggered: p.salvageTriggered ?? false,
    salvageGrid: p.salvageGrid ?? null,
    landed: p.landed ?? [],
    superActive: p.superActive ?? false,
    superActivated: p.superActivated ?? null,
    mysteryReveals: structuredClone(p.mysteryReveals ?? []),
    fullBoard: p.fullBoard ?? false,
    bonusTotal: p.bonusTotal ?? 0,
    freeSpinsLeft: round.fs?.left ?? 0,
    freeSpinsTotal: round.fs?.total ?? 0,
    fsWin: round.fs?.win ?? 0,
    respinsLeft: round.salvage?.respinsLeft ?? 0,
    roundAward: p.roundAward,
    roundWin: round.win,
    balanceAfter: state.balance,
    next,
    roundComplete,
    maxWin: Boolean(round.maxWin) && p.roundAward > 0,
    potsBefore,
    pots: { ...potsFor(state, round.bet) },
    potHits: p.potHits ?? [],
    mods: structuredClone(p.mods ?? round.salvage?.mods ?? null),
  };
  if (roundComplete) state.round = null;
  return { state, result };
}
