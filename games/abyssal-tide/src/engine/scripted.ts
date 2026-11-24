import type { SymbolId } from '../shared/symbols';
import { COLS, ROWS, type Cell, type Landed, type MultiHit, type PotId, type Pos, type ReelBoard } from '../shared/types';
import type { OutcomeProvider } from './outcome';

/**
 * Нотація клітин для сценаріїв і тестів:
 *   R1..R4, C (компас), H (шолом), N (наутилус), W (wild), M (карта),
 *   P1/P2/P3/P5/P10 (перлина з номіналом), J1..J4 (фіксовані), B (чорна перлина), S (мушля), . (порожньо)
 *   Мітка 3 Pots — суфікс перлини: P2x (Extra), P2b (Boost), P2m (Multi).
 */
const POT_SUFFIX: Record<string, PotId> = { x: 'extra', b: 'boost', m: 'multi' };
const TOKENS: Record<string, SymbolId> = {
  R1: 'R1', R2: 'R2', R3: 'R3', R4: 'R4', C: 'COMPASS', H: 'HELMET', N: 'NAUTILUS', W: 'WILD', M: 'MAP',
  B: 'BLACK', S: 'SHELL', J1: 'JP1', J2: 'JP2', J3: 'JP3', J4: 'JP4',
};

export function parseCell(token: string): Cell | null {
  if (token === '.') return null;
  const pearl = /^P(\d+)([xbm])?$/.exec(token);
  if (pearl) return pearl[2] ? { s: 'PEARL', v: Number(pearl[1]), pot: POT_SUFFIX[pearl[2]] } : { s: 'PEARL', v: Number(pearl[1]) };
  const s = TOKENS[token];
  if (!s) throw new Error(`Unknown cell token "${token}"`);
  return { s };
}

/** Три рядки по п’ять токенів → поле [барабан][ряд]. */
export function board(rows: [string, string, string]): ReelBoard {
  const parsed = rows.map((row) => row.trim().split(/\s+/));
  if (parsed.length !== ROWS || parsed.some((r) => r.length !== COLS)) throw new Error('Board must be 3 rows × 5 cells');
  const out: ReelBoard = [];
  for (let c = 0; c < COLS; c++) {
    out.push(
      parsed.map((row) => {
        const cell = parseCell(row[c]);
        if (!cell) throw new Error('Reel board cannot contain empty cells');
        return cell;
      }),
    );
  }
  return out;
}

/** Респін у нотації: [['P2', 1, 0]] — токен, барабан, ряд. */
export const landing = (...items: [string, number, number][]): Landed[] =>
  items.map(([t, c, r]) => {
    const cell = parseCell(t);
    if (!cell) throw new Error('Landing cannot be empty');
    return { c, r, cell };
  });

export interface Script {
  reels?: ReelBoard[];
  respins?: Landed[][];
  mysteries?: string[];
  /** Значення Boost для кожного Salvage з повною банкою Boost. */
  boosts?: number[];
  /** Влучання Multi для кожного Salvage з повною банкою Multi. */
  multis?: MultiHit[][];
}

/** Сценарний провайдер: віддає наперед записані результати, перевіряючи їх коректність. */
export class ScriptedOutcomeProvider implements OutcomeProvider {
  private reelQueue: ReelBoard[];
  private respinQueue: Landed[][];
  private mysteryQueue: Cell[];
  private boostQueue: number[];
  private multiQueue: MultiHit[][];

  constructor(script: Script) {
    this.reelQueue = [...(script.reels ?? [])];
    this.respinQueue = [...(script.respins ?? [])];
    this.mysteryQueue = (script.mysteries ?? []).map((t) => parseCell(t)!);
    this.boostQueue = [...(script.boosts ?? [])];
    this.multiQueue = [...(script.multis ?? [])];
  }

  get exhausted(): boolean {
    return (
      this.reelQueue.length === 0 &&
      this.respinQueue.length === 0 &&
      this.mysteryQueue.length === 0 &&
      this.boostQueue.length === 0 &&
      this.multiQueue.length === 0
    );
  }

  boost(): number {
    const next = this.boostQueue.shift();
    if (next === undefined) throw new Error('Script: no more boost values');
    return next;
  }

  multi(pearls: Pos[]): MultiHit[] {
    const next = this.multiQueue.shift();
    if (!next) throw new Error('Script: no more multi hits');
    for (const h of next) {
      if (!pearls.some((p) => p.c === h.c && p.r === h.r)) throw new Error(`Script: multi target ${h.c}:${h.r} is not a pearl`);
    }
    return next;
  }

  reels(): ReelBoard {
    const next = this.reelQueue.shift();
    if (!next) throw new Error('Script: no more reel results');
    return next;
  }

  respin(empty: Pos[]): Landed[] {
    const next = this.respinQueue.shift();
    if (!next) throw new Error('Script: no more respin results');
    for (const l of next) {
      if (!empty.some((p) => p.c === l.c && p.r === l.r)) throw new Error(`Script: cell ${l.c}:${l.r} is not empty`);
    }
    return next;
  }

  mystery(): Cell {
    const next = this.mysteryQueue.shift();
    if (!next) throw new Error('Script: no more mystery results');
    return next;
  }
}
