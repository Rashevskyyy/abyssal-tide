/**
 * Чиста геометрія сітки 7×7: пошук кластерів і падіння символів.
 * Нічого не знає про виплати чи RNG — лише символи й індекси.
 */
import { COLS, MIN_CLUSTER, ROWS } from '../shared/config';
import { isPaying, type PayingSymbol, type SymbolId } from '../shared/symbols';
import type { Grid } from '../shared/types';

export interface Cluster {
  symbol: PayingSymbol;
  cells: number[];
}

/** Сусіди клітинки по горизонталі й вертикалі (без діагоналей). */
export function neighbours(i: number): number[] {
  const c = i % COLS;
  const r = (i - c) / COLS;
  const out: number[] = [];
  if (r > 0) out.push(i - COLS);
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

const NEIGHBOURS: readonly number[][] = Array.from({ length: COLS * ROWS }, (_, i) => neighbours(i));

/**
 * Усі кластери від MIN_CLUSTER клітинок: заливка (BFS) по однакових символах.
 * Порядок — за найменшим індексом кластера, клітинки всередині — за зростанням.
 */
export function findClusters(grid: Grid): Cluster[] {
  const seen = new Uint8Array(grid.length);
  const out: Cluster[] = [];
  const queue: number[] = [];
  for (let start = 0; start < grid.length; start++) {
    if (seen[start]) continue;
    const symbol = grid[start];
    seen[start] = 1;
    if (!isPaying(symbol)) continue;
    queue.length = 0;
    queue.push(start);
    for (let q = 0; q < queue.length; q++) {
      for (const n of NEIGHBOURS[queue[q]]) {
        if (!seen[n] && grid[n] === symbol) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    if (queue.length >= MIN_CLUSTER) out.push({ symbol, cells: [...queue].sort((a, b) => a - b) });
  }
  return out;
}

/**
 * Прибирає клітинки `removed`: символи над ними падають, згори стають нові.
 * `refill(col, count, kept)` повертає `count` нових символів згори вниз; `kept` — те, що лишилось у стовпці.
 */
export function collapse(
  grid: Grid,
  removed: ReadonlySet<number>,
  refill: (col: number, count: number, kept: readonly SymbolId[]) => SymbolId[],
): { grid: Grid; refill: SymbolId[][] } {
  const next = grid.slice();
  const added: SymbolId[][] = [];
  for (let c = 0; c < COLS; c++) {
    const kept: SymbolId[] = [];
    for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + c;
      if (!removed.has(i)) kept.push(grid[i]);
    }
    const count = ROWS - kept.length;
    const fresh = count > 0 ? refill(c, count, kept) : [];
    if (fresh.length !== count) throw new Error(`Refill for column ${c}: expected ${count}, got ${fresh.length}`);
    const column = [...fresh, ...kept];
    for (let r = 0; r < ROWS; r++) next[r * COLS + c] = column[r];
    added.push(fresh);
  }
  return { grid: next, refill: added };
}

/** Звідки впав кожен символ після `collapse`: для анімації падіння (рядок до → рядок після). */
export function fallPlan(removed: ReadonlySet<number>): { col: number; from: number; to: number }[] {
  const out: { col: number; from: number; to: number }[] = [];
  for (let c = 0; c < COLS; c++) {
    let to = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (removed.has(r * COLS + c)) continue;
      if (to !== r) out.push({ col: c, from: r, to });
      to--;
    }
  }
  return out;
}
