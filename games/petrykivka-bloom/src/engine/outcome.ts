import { createRng, type Rng } from '@slotkit/rules';
import { COLS, ROWS } from '../shared/config';
import type { SymbolId } from '../shared/symbols';
import type { DrawMode, Grid, Mode, Stroke } from '../shared/types';
import { STROKE_BLOOM_CHANCE, STROKE_CHANCE, STROKE_MAX_CELLS, WEIGHTS, type Weights } from './model';

/**
 * Джерело випадковості для рушія. Правила не знають, звідки результат:
 * RNG у грі й на сервері, сценарій у демо й тестах.
 */
export interface OutcomeProvider {
  /** Нова сітка 7×7 рядок за рядком. */
  grid(mode: DrawMode): Grid;
  /** `count` нових символів для стовпця, згори вниз. `kept` — символи, що лишились у ньому. */
  refill(col: number, count: number, mode: DrawMode, kept: readonly SymbolId[]): SymbolId[];
  /** «Мазок» перед спіном: у базі — випадково, у фриспінах — лише `forced` на старті бонусу. */
  stroke(mode: Mode, forced: boolean): Stroke | null;
}

const withoutPlate = (w: Weights): Weights => w.filter(([s]) => s !== 'PLATE');

export class RandomOutcomeProvider implements OutcomeProvider {
  private readonly rng: Rng;
  private readonly noPlate: Record<DrawMode, Weights>;

  constructor(
    seed?: number | Rng,
    private readonly weights: Readonly<Record<DrawMode, Weights>> = WEIGHTS,
  ) {
    this.rng = typeof seed === 'object' ? seed : createRng(seed);
    this.noPlate = { base: withoutPlate(weights.base), ante: withoutPlate(weights.ante), free: withoutPlate(weights.free) };
  }

  grid(mode: DrawMode): Grid {
    const g: Grid = new Array(COLS * ROWS);
    for (let c = 0; c < COLS; c++) {
      const col = this.column(ROWS, mode, false);
      for (let r = 0; r < ROWS; r++) g[r * COLS + c] = col[r];
    }
    return g;
  }

  refill(_col: number, count: number, mode: DrawMode, kept: readonly SymbolId[]): SymbolId[] {
    return this.column(count, mode, kept.includes('PLATE'));
  }

  stroke(mode: Mode, forced: boolean): Stroke | null {
    if (!forced && (mode === 'free' || this.rng.next() >= STROKE_CHANCE)) return null;
    return randomStroke(this.rng);
  }

  /** Тарілка — не більше одної на стовпець: друга перетягується з таблиці без неї. */
  private column(count: number, mode: DrawMode, hasPlate: boolean): SymbolId[] {
    const out: SymbolId[] = [];
    let plate = hasPlate;
    for (let i = 0; i < count; i++) {
      const s = this.rng.pick(plate ? this.noPlate[mode] : this.weights[mode]);
      if (s === 'PLATE') plate = true;
      out.push(s);
    }
    return out;
  }
}

/**
 * Мазок — квадратична крива Безьє зліва направо через усю сітку. Клітинки беруться
 * вздовж кривої в порядку малювання, тож клієнт розкладає бутони слідом за пензлем.
 */
export function randomStroke(rng: Rng): Stroke {
  const y0 = 0.5 + rng.next() * 5;
  const y2 = 0.5 + rng.next() * 5;
  const y1 = -1 + rng.next() * 8;
  const points: Stroke['points'] = [
    [0, round2(y0)],
    [3, round2(y1)],
    [6, round2(y2)],
  ];
  const cells = strokeCells(points);
  const blooms = cells.filter(() => rng.next() < STROKE_BLOOM_CHANCE);
  return { points, cells, blooms };
}

/** Клітинки під кривою, без повторів, не більше STROKE_MAX_CELLS. */
export function strokeCells(points: Stroke['points']): number[] {
  const [[x0, y0], [x1, y1], [x2, y2]] = points;
  const cells: number[] = [];
  for (let k = 0; k <= 120; k++) {
    const t = k / 120;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    const c = clamp(Math.round(x), 0, COLS - 1);
    const r = clamp(Math.round(y), 0, ROWS - 1);
    const i = r * COLS + c;
    if (!cells.includes(i)) cells.push(i);
    if (cells.length >= STROKE_MAX_CELLS) break;
  }
  return cells;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
