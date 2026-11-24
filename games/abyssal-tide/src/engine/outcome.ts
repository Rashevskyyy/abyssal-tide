import type { SymbolId } from '../shared/symbols';
import { COLS, ROWS, type Cell, type Landed, type MultiHit, type Pos, type ReelBoard } from '../shared/types';
import {
  BASE_STRIPS,
  BOOST_WEIGHTS,
  FREE_STRIPS,
  MULTI_COUNT_WEIGHTS,
  MULTI_X_WEIGHTS,
  MYSTERY_WEIGHTS,
  POT_MARK_CHANCE,
  POT_MARK_WEIGHTS,
  REEL_PEARL_WEIGHTS,
  RESPIN_LAND_CHANCE,
  RESPIN_PEARL_WEIGHTS,
  RESPIN_SYMBOL_WEIGHTS,
} from './model';
import { createRng, type Rng } from './rng';

export interface RespinContext {
  superActive: boolean;
  filled: number;
}

/**
 * Джерело випадковості для рушія. Правила (рушій) не знають, звідки береться результат:
 * RNG у живій грі, сценарій у «Показати бонус» і тестах.
 */
export interface OutcomeProvider {
  reels(mode: 'base' | 'freeDives'): ReelBoard;
  respin(empty: Pos[], ctx: RespinContext): Landed[];
  mystery(ctx: { superActive: boolean }): Cell;
  /** Boost: +стільки ставок кожній перлині на старті Salvage. */
  boost(): number;
  /** Multi: які перлини (з переданих) отримують множник і який. */
  multi(pearls: Pos[]): MultiHit[];
}

export class RandomOutcomeProvider implements OutcomeProvider {
  private readonly rng: Rng;

  /** Сид (симуляція, тести) або готовий RNG (на сервері — криптографічний). */
  constructor(
    seed?: number | Rng,
    private readonly strips = { base: BASE_STRIPS, freeDives: FREE_STRIPS },
  ) {
    this.rng = typeof seed === 'object' ? seed : createRng(seed);
  }

  reels(mode: 'base' | 'freeDives'): ReelBoard {
    const strips = this.strips[mode];
    const board: ReelBoard = [];
    for (let c = 0; c < COLS; c++) {
      const strip = strips[c];
      const stop = this.rng.int(strip.length);
      const col: Cell[] = [];
      for (let r = 0; r < ROWS; r++) col.push(this.materialize(strip[(stop + r) % strip.length], mode));
      board.push(col);
    }
    return board;
  }

  respin(empty: Pos[]): Landed[] {
    const landed: Landed[] = [];
    for (const p of empty) {
      if (this.rng.next() >= RESPIN_LAND_CHANCE) continue;
      const kind = this.rng.pick(RESPIN_SYMBOL_WEIGHTS);
      const cell: Cell = kind === 'PEARL' ? { s: 'PEARL', v: this.rng.pick(RESPIN_PEARL_WEIGHTS) } : { s: kind };
      landed.push({ ...p, cell });
    }
    return landed;
  }

  mystery(): Cell {
    return { s: this.rng.pick(MYSTERY_WEIGHTS) };
  }

  boost(): number {
    return this.rng.pick(BOOST_WEIGHTS);
  }

  multi(pearls: Pos[]): MultiHit[] {
    const pool = [...pearls];
    const n = Math.min(pool.length, this.rng.pick(MULTI_COUNT_WEIGHTS));
    const out: MultiHit[] = [];
    for (let i = 0; i < n; i++) {
      const [p] = pool.splice(this.rng.int(pool.length), 1);
      out.push({ c: p.c, r: p.r, m: this.rng.pick(MULTI_X_WEIGHTS) });
    }
    return out;
  }

  private materialize(s: SymbolId, mode: 'base' | 'freeDives'): Cell {
    if (s !== 'PEARL') return { s };
    const v = this.rng.pick(REEL_PEARL_WEIGHTS);
    if (typeof v !== 'number') return { s: v };
    // мітки 3 Pots — лише на звичайних перлинах бази
    if (mode === 'base' && this.rng.next() < POT_MARK_CHANCE) return { s: 'PEARL', v, pot: this.rng.pick(POT_MARK_WEIGHTS) };
    return { s: 'PEARL', v };
  }
}
