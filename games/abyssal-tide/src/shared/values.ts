import { BLACK_PEARL_VALUE, FULL_BOARD_AWARD, JACKPOTS, SUPER_MULTIPLIER, isJackpot } from './symbols';
import type { Cell, Grid } from './types';

/**
 * Остаточний номінал бонусної клітини у ставках.
 * Super подвоює лише звичайні перлини; чорна перлина і фіксовані символи зберігають власний номінал.
 * Множник Multi (m) теж діє лише на звичайні перлини й множиться з Super.
 */
export function cellValue(cell: Cell, superActive: boolean): number {
  if (cell.s === 'PEARL') return (cell.v ?? 0) * (cell.m ?? 1) * (superActive ? SUPER_MULTIPLIER : 1);
  if (cell.s === 'BLACK') return BLACK_PEARL_VALUE;
  if (isJackpot(cell.s)) return JACKPOTS[cell.s].value;
  return 0; // мушля до розкриття
}

export function countFilled(grid: Grid): number {
  let n = 0;
  for (const col of grid) for (const cell of col) if (cell) n++;
  return n;
}

/** Підсумок бонусу у ставках: сума остаточних клітин + нагорода за повне поле. */
export function salvageTotalX(grid: Grid, superActive: boolean, fullBoard: boolean): number {
  let sum = 0;
  for (const col of grid) for (const cell of col) if (cell) sum += cellValue(cell, superActive);
  return sum + (fullBoard ? FULL_BOARD_AWARD : 0);
}
