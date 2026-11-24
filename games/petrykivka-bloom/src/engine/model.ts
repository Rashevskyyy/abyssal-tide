/**
 * Математична модель: ваги символів і параметри «Мазка».
 * Значення підібрані симуляцією (`npm run sim`) під RTP 96,5 %; звіт і спосіб підбору — у docs/MATH.uk.md.
 */
import type { SymbolId } from '../shared/symbols';
import type { DrawMode } from '../shared/types';

export type Weights = readonly (readonly [SymbolId, number])[];

const paying = (h: [number, number, number, number], l: [number, number, number, number]) =>
  [
    ['ROOSTER', h[0]],
    ['FIREBIRD', h[1]],
    ['KALYNA', h[2]],
    ['MALLOW', h[3]],
    ['SEED', l[0]],
    ['COMB', l[1]],
    ['CURL', l[2]],
    ['LEAF', l[3]],
  ] as const;

/** Ваги однакові для всіх стовпців; тарілка не частіше одної на стовпець (див. outcome.ts). */
export const WEIGHTS: Readonly<Record<DrawMode, Weights>> = {
  base: [...paying([26, 30, 34, 38], [73, 79, 85, 91]), ['PLATE', 3.32]],
  ante: [...paying([26, 30, 34, 38], [73, 79, 85, 91]), ['PLATE', 3.9]],
  // у фриспінах низьких символів більше: довші каскади, квітки ростуть
  free: [...paying([18, 22, 26, 30], [93.5, 103.5, 113.5, 123.5]), ['PLATE', 4]],
};

/** Імовірність «Мазка» перед спіном основної гри. */
export const STROKE_CHANCE = 0.04;
/** Частка клітинок мазка, що одразу стають квітками ×2. */
export const STROKE_BLOOM_CHANCE = 0.15;
/** Найбільше клітинок в одному мазку. */
export const STROKE_MAX_CELLS = 12;
