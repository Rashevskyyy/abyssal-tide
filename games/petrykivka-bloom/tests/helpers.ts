import { RandomOutcomeProvider, type OutcomeProvider } from '../src/engine/outcome';
import { PAYING, type SymbolId } from '../src/shared/symbols';
import type { DrawMode, Grid, Mode, Stroke } from '../src/shared/types';

/** Фон без жодного кластера: сусіди по горизонталі різняться на 1, по вертикалі — на 3. */
export const background = (): Grid => Array.from({ length: 49 }, (_, i) => PAYING[(Math.floor(i / 7) * 3 + (i % 7)) % 8]);

/** Сітка з фону з підставленими клітинками. */
export function gridWith(cells: Record<number, SymbolId>): Grid {
  const g = background();
  for (const [i, s] of Object.entries(cells)) g[Number(i)] = s;
  return g;
}

/** Сценарій: сітки й мазки за чергою, поповнення — з RNG із сидом (тести дивляться на перший каскад). */
export class ScriptedProvider implements OutcomeProvider {
  private readonly rest: RandomOutcomeProvider;
  constructor(
    private readonly grids: Grid[],
    private readonly strokes: (Stroke | null)[] = [],
    seed = 1,
  ) {
    this.rest = new RandomOutcomeProvider(seed);
  }
  grid(_mode: DrawMode): Grid {
    const g = this.grids.shift();
    if (!g) throw new Error('Script ran out of grids');
    return g.slice();
  }
  refill(col: number, count: number, mode: DrawMode, kept: readonly SymbolId[]): SymbolId[] {
    return this.rest.refill(col, count, mode, kept).map((s) => (s === 'PLATE' ? 'LEAF' : s));
  }
  stroke(_mode: Mode, forced: boolean): Stroke | null {
    const s = this.strokes.shift();
    if (s === undefined) return forced ? { points: [[0, 0], [3, 0], [6, 0]], cells: [0], blooms: [] } : null;
    return s;
  }
}
