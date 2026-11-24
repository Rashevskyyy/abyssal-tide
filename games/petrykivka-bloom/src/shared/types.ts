import type { PayingSymbol, SymbolId } from './symbols';

/** Сітка 7×7 рядок за рядком: індекс = r * 7 + c, r = 0 — верхній рядок. */
export type Grid = SymbolId[];
/** Рівні клітинок (0 — порожня, 1 — бутон, 2+ — квітка). */
export type Spots = number[];

export type Mode = 'base' | 'free';
/** Таблиця символів: звичайна база, база з ante bet, фриспіни. */
export type DrawMode = 'base' | 'ante' | 'free';
export type Action = 'spin' | 'freeSpin';

/** «Мазок»: квадратична крива Безьє в координатах сітки (0…6) і клітинки, де лишились бутони. */
export interface Stroke {
  points: [[number, number], [number, number], [number, number]];
  /** Клітинки по ходу пензля, у порядку малювання. */
  cells: number[];
  /** Ті з них, що одразу стали квітками ×2. */
  blooms: number[];
}

export interface ClusterWin {
  symbol: PayingSymbol;
  /** Клітинки кластера за зростанням індексу. */
  cells: number[];
  /** Виплата в 1/20 ставки до множника. */
  units: number;
  /** Сума множників під кластером або 1, якщо їх немає. */
  multiplier: number;
  /** Центи. */
  amount: number;
}

export interface Tumble {
  clusters: ClusterWin[];
  /** Усі клітинки, що вибухнули (за зростанням). */
  removed: number[];
  /** Нові символи для кожного стовпця, згори вниз; порожній масив — стовпець не змінився. */
  refill: SymbolId[][];
  /** Сітка після падіння й поповнення. */
  grid: Grid;
  /** Рівні клітинок після росту. */
  spots: Spots;
  /** Виграш каскаду, центи (до обмеження max win). */
  win: number;
}

export interface FreeSpinsState {
  left: number;
  total: number;
  win: number;
  spots: Spots;
  /** Гарантований «Мазок» на старті бонусу вже був. */
  stroked: boolean;
}

export interface RoundState {
  id: string;
  bet: number;
  ante: boolean;
  bought: boolean;
  win: number;
  fs: FreeSpinsState | null;
  maxWin?: boolean;
}

export interface EngineState {
  balance: number;
  roundSeq: number;
  round: RoundState | null;
  lastGrid: Grid;
}

export interface StepRequest {
  stepId: string;
  action: Action;
  bet?: number;
  ante?: boolean;
  buy?: boolean;
}

export interface StepResult {
  roundId: string;
  stepId: string;
  action: Action;
  mode: Mode;
  bet: number;
  ante: boolean;
  bought: boolean;
  /** Скільки списано цим кроком, центи. */
  cost: number;
  stroke: Stroke | null;
  /** Рівні клітинок на початку кроку (до «Мазка»). */
  spotsBefore: Spots;
  /** Сітка, що впала на початку кроку. */
  grid: Grid;
  tumbles: Tumble[];
  finalGrid: Grid;
  /** Тарілки на фінальній сітці. */
  plates: number[];
  fsAwarded: number;
  freeSpinsLeft: number;
  freeSpinsTotal: number;
  fsWin: number;
  /** Виграш цього кроку після обмеження max win. */
  stepWin: number;
  roundWin: number;
  balanceAfter: number;
  next: Action | 'none';
  roundComplete: boolean;
  maxWin: boolean;
}

export const cellOf = (c: number, r: number): number => r * 7 + c;
export const colOf = (i: number): number => i % 7;
export const rowOf = (i: number): number => Math.floor(i / 7);
