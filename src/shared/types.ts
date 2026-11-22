import type { SymbolId, PayingId } from './symbols';
import type { POT_IDS } from './config';

/** Банка 3 Pots: extra (+1 респін), boost (+номінал усім перлинам), multi (множники перлинам). */
export type PotId = (typeof POT_IDS)[number];
/** Заповненість банок: 0…POT_SIZE мітки. */
export type Pots = Record<PotId, number>;

export const COLS = 5;
export const ROWS = 3;
export const CELLS = COLS * ROWS;

/**
 * Клітина поля. `v` — номінал звичайної перлини у ставках (1/2/3/5/10, у Salvage — разом із Boost).
 * `pot` — кольорова мітка 3 Pots на перлині барабанів бази; `m` — множник Multi в Salvage.
 */
export interface Cell {
  s: SymbolId;
  v?: number;
  pot?: PotId;
  m?: number;
}

/** Позиція: c — барабан 0..4, r — ряд 0..2 згори вниз. */
export interface Pos {
  c: number;
  r: number;
}

/** Поле індексується [барабан][ряд]. У Salvage порожня клітина — null. */
export type Grid = (Cell | null)[][];
export type ReelBoard = Cell[][];

export type Mode = 'base' | 'freeDives' | 'salvage';
export type Action = 'spin' | 'freeSpin' | 'respin' | 'collect';

export interface LineWin {
  line: number; // 0..24
  symbol: PayingId;
  count: 3 | 4 | 5;
  positions: Pos[];
  pay: number; // у ставках
  amount: number; // у кредитах
}

export interface Landed extends Pos {
  cell: Cell;
}

export interface MysteryReveal extends Pos {
  cell: Cell;
  activatesSuper: boolean;
}

export type SuperSource = 'entry' | 'respin' | 'reveal';

export interface MultiHit extends Pos {
  m: number;
}

/** Модифікатори Salvage від повних банок. Boost уже доданий до номіналів перлин сітки. */
export interface SalvageMods {
  extra: boolean;
  boost: number; // 0 — Boost не активний; інакше +стільки ставок кожній перлині на старті
  multi: boolean;
  multiHits: MultiHit[]; // визначаються, коли респіни закінчились
}

/** Мітка, що впала на барабанах і полетіла в банку. */
export interface PotHit extends Pos {
  pot: PotId;
}

export interface FreeDivesState {
  left: number;
  total: number;
  played: number;
  win: number; // кредити серії, включно з вкладеними бонусами
}

export interface SalvageState {
  grid: Grid; // до розкриття мушель
  respinsLeft: number;
  superActive: boolean;
  superSource: SuperSource | null;
  phase: 'respin' | 'collect';
  origin: 'base' | 'freeDives';
  reveals: MysteryReveal[]; // заповнюється, коли респіни закінчились
  fullBoard: boolean;
  total: number; // кредити бонусу; визначено на фазі collect, зараховується кроком collect
  respinCount: number;
  mods: SalvageMods;
}

export interface RoundState {
  id: string;
  bet: number;
  win: number;
  board: ReelBoard; // останнє поле барабанів раунду
  fs: FreeDivesState | null;
  salvage: SalvageState | null;
  /** Досягнуто максимального виграшу: раунд закінчено, решта фіч згоріла. */
  maxWin?: boolean;
}

export interface EngineState {
  balance: number;
  roundSeq: number;
  round: RoundState | null;
  lastBoard: ReelBoard;
  /** Банки 3 Pots окремо для кожної ставки (ключ — ставка в центах). */
  pots: Record<string, Pots>;
}

export interface StepRequest {
  stepId: string;
  action: Action;
  bet?: number;
}

/** Контракт кроку (GDD §5) + похідні прапорці для зручності клієнта. */
export interface StepResult {
  roundId: string;
  stepId: string;
  action: Action;
  mode: Mode;
  bet: number;
  boardBefore: Grid;
  boardAfter: Grid;
  lineWins: LineWin[];
  scatter: Pos[];
  fsAwarded: number;
  salvageTriggered: boolean;
  salvageGrid: Grid | null;
  landed: Landed[];
  superActive: boolean;
  superActivated: SuperSource | null;
  mysteryReveals: MysteryReveal[];
  fullBoard: boolean;
  bonusTotal: number;
  freeSpinsLeft: number;
  freeSpinsTotal: number;
  fsWin: number;
  respinsLeft: number;
  roundAward: number; // кредити, зараховані саме цим кроком
  roundWin: number; // накопичено за раунд
  balanceAfter: number;
  next: Action | 'none';
  roundComplete: boolean;
  /** Цей крок досяг максимального виграшу: виплату обрізано, раунд закінчено. */
  maxWin: boolean;
  /** Банки ставки раунду до і після кроку (до — для анімації й replay). */
  potsBefore: Pots;
  pots: Pots;
  /** Мітки, що впали цим кроком (лише спін бази). */
  potHits: PotHit[];
  /** Модифікатори поточного Salvage (від кроку тригера до збору). */
  mods: SalvageMods | null;
}

export const posKey = (p: Pos): string => `${p.c}:${p.r}`;

/** Порядок «згори вниз, зліва направо» — рядок за рядком. */
export const readingOrder = (a: Pos, b: Pos): number => a.r - b.r || a.c - b.c;

export const allPositions = (): Pos[] => {
  const out: Pos[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push({ c, r });
  return out;
};

export const cloneGrid = <T extends Grid>(g: T): T => g.map((col) => col.map((cell) => (cell ? { ...cell } : null))) as T;

export const emptyGrid = (): Grid => Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => null));

export const emptyPots = (): Pots => ({ extra: 0, boost: 0, multi: 0 });
export const noMods = (): SalvageMods => ({ extra: false, boost: 0, multi: false, multiHits: [] });
