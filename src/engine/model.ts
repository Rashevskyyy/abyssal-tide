import type { SymbolId } from '../shared/symbols';
import { createRng } from './rng';

/**
 * Математична модель демо: склад стрічок барабанів і ваги бонусних подій.
 * Числа підібрані симуляцією (`npm run sim`), див. README → Math. Це демо-модель, не сертифікована математика.
 */

type Counts = Partial<Record<SymbolId, number>>;

// Барабани навмисно асиметричні: молодші руни «зміщені» між барабанами, щоб не роздувати лінійні виграші.
export const BASE_REEL_COUNTS: Counts[] = [
  { R1: 14, R2: 14, R3: 3, R4: 3, COMPASS: 7, HELMET: 3, NAUTILUS: 2, WILD: 1, PEARL: 6 },
  { R1: 3, R2: 14, R3: 14, R4: 3, COMPASS: 2, HELMET: 7, NAUTILUS: 3, WILD: 1, MAP: 3, PEARL: 6 },
  { R1: 3, R2: 3, R3: 14, R4: 14, COMPASS: 3, HELMET: 2, NAUTILUS: 7, WILD: 1, MAP: 3, PEARL: 6 },
  { R1: 12, R2: 12, R3: 6, R4: 6, COMPASS: 6, HELMET: 5, NAUTILUS: 4, WILD: 1, MAP: 3, PEARL: 5 },
  { R1: 9, R2: 9, R3: 9, R4: 9, COMPASS: 6, HELMET: 5, NAUTILUS: 4, WILD: 1, PEARL: 4, BLACK: 1 },
];

/** Free Dives: лише старші платні символи, Wild, карти й перлини (щільніше, ніж у базі). */
export const FREE_REEL_COUNTS: Counts[] = [
  { COMPASS: 13, HELMET: 3, NAUTILUS: 2, WILD: 1, PEARL: 4 },
  { COMPASS: 2, HELMET: 13, NAUTILUS: 3, WILD: 1, MAP: 2, PEARL: 4 },
  { COMPASS: 3, HELMET: 2, NAUTILUS: 13, WILD: 1, MAP: 2, PEARL: 4 },
  { COMPASS: 9, HELMET: 6, NAUTILUS: 5, WILD: 1, MAP: 2, PEARL: 4 },
  { COMPASS: 9, HELMET: 6, NAUTILUS: 5, WILD: 1, PEARL: 3, BLACK: 1 },
];

/**
 * Розмір блоку перлин на кожному барабані. Блоки підвищують шанс на 6+ перлин
 * (порівняно з рівномірним розподілом), тож ними й регулюємо частоту Salvage.
 */
export const BASE_PEARL_STACKS = [1, 2, 2, 2, 1];
export const FREE_PEARL_STACKS = [1, 1, 1, 1, 1];
const STACKS: Counts = { PEARL: 2 };

/** Номінал перлини, що впала на барабани (ставки або фіксований символ). */
export const REEL_PEARL_WEIGHTS: readonly (readonly [number | 'JP1' | 'JP2', number])[] = [
  [1, 380],
  [2, 270],
  [3, 160],
  [5, 105],
  [10, 45],
  ['JP1', 32],
  ['JP2', 8],
];

/** Ймовірність, що порожня клітина отримає символ за один респін. */
export const RESPIN_LAND_CHANCE = 0.04;

/** Що саме падає в порожню клітину під час Salvage. */
export const RESPIN_SYMBOL_WEIGHTS: readonly (readonly ['PEARL' | 'SHELL' | 'BLACK' | 'JP1' | 'JP2' | 'JP3' | 'JP4', number])[] = [
  ['PEARL', 800],
  ['SHELL', 120],
  ['JP1', 45],
  ['JP2', 15],
  ['JP3', 4],
  ['JP4', 1],
  ['BLACK', 18],
];

export const RESPIN_PEARL_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 380],
  [2, 280],
  [3, 170],
  [5, 120],
  [10, 50],
];

/** Розкриття мушлі: фіксована нагорода або чорна перлина. */
export const MYSTERY_WEIGHTS: readonly (readonly ['JP1' | 'JP2' | 'JP3' | 'JP4' | 'BLACK', number])[] = [
  ['JP1', 560],
  ['JP2', 270],
  ['JP3', 90],
  ['JP4', 15],
  ['BLACK', 65],
];

/**
 * 3 Pots. Частка звичайних перлин бази з кольоровою міткою і як мітки діляться між банками.
 * Підібрано симуляцією: кожна банка вмикається приблизно в третині бонусів, мітка падає раз на кілька спінів.
 */
export const POT_MARK_CHANCE = 0.16;
export const POT_MARK_WEIGHTS: readonly (readonly ['extra' | 'boost' | 'multi', number])[] = [
  ['extra', 1],
  ['boost', 1],
  ['multi', 1],
];

/** Boost: скільки ставок додається кожній перлині на старті Salvage. */
export const BOOST_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 55],
  [2, 30],
  [3, 12],
  [5, 3],
];

/** Multi: скільки перлин отримують множник і який. */
export const MULTI_COUNT_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 55],
  [2, 33],
  [3, 12],
];
export const MULTI_X_WEIGHTS: readonly (readonly [number, number])[] = [
  [2, 64],
  [3, 27],
  [5, 9],
];

const MAP_MIN_GAP = 3; // щоб на одному барабані не було видно двох карт

/** Детерміновано будує стрічку: перемішування блоків + розведення карт. */
export function buildStrip(counts: Counts, seed: number, stacks: Counts = STACKS): SymbolId[] {
  const rng = createRng(seed);
  const groups: SymbolId[][] = [];
  for (const [symbol, n] of Object.entries(counts) as [SymbolId, number][]) {
    const size = stacks[symbol] ?? 1;
    let left = n;
    while (left > 0) {
      const k = Math.min(size, left);
      groups.push(Array.from({ length: k }, () => symbol));
      left -= k;
    }
  }
  for (let i = groups.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const strip = groups.flat();
  const tooClose = (idx: number): boolean => {
    for (let d = 1; d < MAP_MIN_GAP; d++) {
      if (strip[(idx + d) % strip.length] === 'MAP' || strip[(idx - d + strip.length) % strip.length] === 'MAP') return true;
    }
    return false;
  };
  for (let guard = 0; guard < 10_000; guard++) {
    const bad = strip.findIndex((s, i) => s === 'MAP' && tooClose(i));
    if (bad < 0) break;
    const j = rng.int(strip.length);
    if (strip[j] === 'MAP' || (stacks[strip[j]] ?? 1) > 1) continue;
    [strip[bad], strip[j]] = [strip[j], strip[bad]];
  }
  return strip;
}

export const BASE_STRIPS: SymbolId[][] = BASE_REEL_COUNTS.map((c, i) => buildStrip(c, 0xa11 + i * 97, { PEARL: BASE_PEARL_STACKS[i] }));
export const FREE_STRIPS: SymbolId[][] = FREE_REEL_COUNTS.map((c, i) => buildStrip(c, 0xf5e + i * 131, { PEARL: FREE_PEARL_STACKS[i] }));
