import { describe, expect, it } from 'vitest';
import { IDLE_GRID } from '../src/engine/engine';
import { collapse, fallPlan, findClusters } from '../src/engine/grid';
import { strokeCells } from '../src/engine/outcome';
import { background, gridWith } from './helpers';

describe('кластери', () => {
  it('на фоні й на стартовій сітці кластерів немає', () => {
    expect(findClusters(background())).toEqual([]);
    expect(IDLE_GRID).toHaveLength(49);
    expect(findClusters(IDLE_GRID)).toEqual([]);
  });

  it('5 клітинок буквою L — кластер, 4 — ні', () => {
    const g = gridWith({ 0: 'ROOSTER', 7: 'ROOSTER', 14: 'ROOSTER', 15: 'ROOSTER', 16: 'ROOSTER', 40: 'SEED', 41: 'SEED', 47: 'SEED', 48: 'SEED' });
    expect(findClusters(g)).toEqual([{ symbol: 'ROOSTER', cells: [0, 7, 14, 15, 16] }]);
  });

  it('діагональ не з’єднує', () => {
    const g = gridWith({ 0: 'KALYNA', 8: 'KALYNA', 16: 'KALYNA', 24: 'KALYNA', 32: 'KALYNA', 40: 'KALYNA' });
    expect(findClusters(g)).toEqual([]);
  });

  it('тарілки не утворюють кластер', () => {
    const g = gridWith({ 0: 'PLATE', 1: 'PLATE', 2: 'PLATE', 3: 'PLATE', 4: 'PLATE' });
    expect(findClusters(g)).toEqual([]);
  });

  it('два кластери одного символу платять окремо', () => {
    const left = { 0: 'ROOSTER', 1: 'ROOSTER', 2: 'ROOSTER', 7: 'ROOSTER', 8: 'ROOSTER' } as const;
    const right = { 46: 'ROOSTER', 47: 'ROOSTER', 48: 'ROOSTER', 41: 'ROOSTER', 40: 'ROOSTER' } as const;
    const found = findClusters(gridWith({ ...left, ...right }));
    expect(found.map((c) => c.cells)).toEqual([
      [0, 1, 2, 7, 8],
      [40, 41, 46, 47, 48],
    ]);
  });
});

describe('падіння', () => {
  it('символи над прибраними опускаються, згори стають нові', () => {
    const g = background();
    const removed = new Set([48, 41]); // дві нижні клітинки стовпця 6
    const { grid, refill } = collapse(g, removed, (_c, n) => Array.from({ length: n }, () => 'PLATE' as const));
    expect(refill[6]).toEqual(['PLATE', 'PLATE']);
    expect(refill.slice(0, 6).every((r) => r.length === 0)).toBe(true);
    // колишні рядки 0…4 стовпця 6 тепер у рядках 2…6
    for (let r = 0; r < 5; r++) expect(grid[(r + 2) * 7 + 6]).toBe(g[r * 7 + 6]);
    expect([grid[6], grid[13]]).toEqual(['PLATE', 'PLATE']);
    expect(fallPlan(removed)).toEqual([
      { col: 6, from: 4, to: 6 },
      { col: 6, from: 3, to: 5 },
      { col: 6, from: 2, to: 4 },
      { col: 6, from: 1, to: 3 },
      { col: 6, from: 0, to: 2 },
    ]);
  });
});

describe('мазок', () => {
  it('крива проходить усі стовпці зліва направо, клітинки без повторів', () => {
    const cells = strokeCells([[0, 3], [3, -1], [6, 5]]);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells.length).toBeGreaterThanOrEqual(7);
    expect(cells.length).toBeLessThanOrEqual(12);
    expect(cells[0] % 7).toBe(0);
    expect(new Set(cells.map((i) => i % 7)).size).toBe(7);
  });
});
