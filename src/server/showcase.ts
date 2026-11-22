import { board, landing, type Script } from '../engine/scripted';
import { ScriptedOutcomeProvider } from '../engine/scripted';
import { POT_SIZE, START_BALANCE } from '../shared/config';
import { LocalResultSource } from './LocalResultSource';
import { MemoryStore } from './storage';

const E: never[] = [];

/**
 * Сценарії «Показати бонус». Результати записані наперед, але правила застосовує той самий рушій,
 * тож показ гарантовано узгоджений з реальною грою (виплати, лічильники, порядок подій).
 */
export type ScenarioId = 1 | 2 | 3 | 4;

export const SCENARIOS: Record<ScenarioId, Script> = {
  // 1. Прямий Super (чорна перлина на 5-му барабані після очікування), респіни до повного поля,
  //    дві мушлі: Trench і друга чорна перлина (зберігає власний номінал), Tide Crown.
  1: {
    reels: [
      board([
        'P2 R3 P1 C  R1',
        'R2 P5 W  P3 B ',
        'P1 R2 R2 H  N ',
      ]),
    ],
    respins: [
      E,
      landing(['P2', 1, 0]),
      E,
      landing(['S', 4, 0], ['P2', 2, 2]),
      E,
      E,
      landing(['J2', 0, 1]),
      landing(['P5', 3, 0], ['S', 1, 2]),
      E,
      landing(['P1', 2, 1], ['P10', 3, 2]),
      landing(['P3', 4, 2]),
    ],
    mysteries: ['J3', 'B'],
  },
  // 2. Три карти + шість перлин: спершу Salvage, потім 8 Free Dives з великим виграшем
  //    і вкладеним Salvage, де друга мушля відкриває Super.
  2: {
    reels: [
      board([
        'P1 M  P2 R4 P1',
        'R1 P3 R2 M  P2',
        'P5 R3 M  C  H ',
      ]),
      board(['C  H  C  N  H', 'H  C  N  H  C', 'N  N  H  C  N']),
      board(['N  N  W  N  N', 'N  W  N  H  N', 'H  N  N  W  C']),
      board(['H  C  N  H  C', 'C  P2 C  N  H', 'N  H  H  C  N']),
      board(['P2 H  P1 C  P3', 'C  P1 N  P5 H', 'P1 N  C  H  N']),
      board(['C  C  C  H  N', 'H  N  H  C  H', 'N  H  N  N  C']),
      board(['H  N  C  C  H', 'N  C  H  N  C', 'C  H  N  H  N']),
      board(['W  H  H  H  C', 'C  N  C  N  H', 'N  C  N  C  N']),
      board(['C  N  H  C  N', 'H  H  N  N  H', 'N  C  C  H  C']),
    ],
    respins: [
      // Salvage із базового спіну
      E,
      landing(['P2', 1, 2]),
      E,
      E,
      E,
      // вкладений Salvage на 4-му зануренні
      E,
      landing(['S', 1, 0]),
      landing(['P3', 3, 0], ['S', 4, 1]),
      E,
      E,
      E,
    ],
    mysteries: ['J1', 'B'],
  },
  // 4. 3 Pots: банки майже повні, мітки на спіні-тригері доливають усі три —
  //    Extra (4 респіни), Boost +2 кожній перлині, Multi ×3 і ×2 наприкінці.
  4: {
    reels: [
      board([
        'P2x R3 P1b C   R1',
        'R2  P5  W  P3m P2',
        'P1  R2  R2 H   P2m',
      ]),
    ],
    boosts: [2],
    respins: [E, landing(['P3', 1, 0]), E, landing(['S', 3, 2]), E, E, E, E],
    mysteries: ['J2'],
    multis: [[{ c: 1, r: 1, m: 3 }, { c: 4, r: 2, m: 2 }]],
  },
  // 3. Ліхтарі Wild через усе поле — великий виграш.
  3: {
    reels: [
      board([
        'N  W  N  N  W',
        'W  N  W  H  N',
        'N  W  N  W  N',
      ]),
    ],
  },
};

/** Банки на старті показу 4: одна мітка до повної Extra й Boost, дві — до Multi. */
const SCENARIO_POTS: Partial<Record<ScenarioId, { extra: number; boost: number; multi: number }>> = {
  4: { extra: POT_SIZE - 1, boost: POT_SIZE - 1, multi: POT_SIZE - 2 },
};

export function createShowcaseSource(id: ScenarioId, bet: number): LocalResultSource {
  const pots = SCENARIO_POTS[id];
  return new LocalResultSource({
    store: new MemoryStore(),
    provider: new ScriptedOutcomeProvider(SCENARIOS[id]),
    key: `abyssal-tide/showcase/${id}`,
    kind: 'showcase',
    startBalance: START_BALANCE,
    seedPots: pots ? { [String(bet)]: pots } : undefined,
  });
}
