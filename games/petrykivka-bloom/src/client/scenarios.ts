/**
 * Демо-сценарії: справжній рушій зі знайденим сидом RNG (scripts/find-scenarios.ts),
 * зіграний на тимчасовому балансі. Рекрутер бачить фічі за хвилину, не чекаючи на випадок.
 */
export interface Scenario {
  id: 'chain' | 'stroke' | 'bonus';
  title: string;
  text: string;
  seed: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'chain', title: 'Tumble chain', text: 'Seven tumbles in one spin; the flowers under the clusters grow to ×14.', seed: 291956 },
  { id: 'stroke', title: 'The Stroke', text: 'A brush paints buds across the board before the spin, and the clusters land on them.', seed: 2955 },
  { id: 'bonus', title: 'Free spins', text: 'Three plates start the bonus; flowers stay between spins and reach ×128.', seed: 10466 },
];

export const scenarioById = (id: string | null): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
