/**
 * Пошук сидів для демо-сценаріїв меню «Show features»: `npx tsx scripts/find-scenarios.ts [скільки сидів]`.
 * Сценарій — це сид RNG: той самий рушій із тим самим сидом дає той самий раунд, тож демо
 * показує справжню гру, а не намальовану. Знайдені сиди вписуються в src/client/scenarios.ts.
 */
import { expectedAction, initialState, step } from '../src/engine/engine';
import { RandomOutcomeProvider } from '../src/engine/outcome';
import type { StepResult } from '../src/shared/types';

const BET = 100;
const limit = Number(process.argv[2] ?? 200_000);

function play(seed: number): StepResult[] {
  const p = new RandomOutcomeProvider(seed);
  let s = initialState(10_000_000);
  const out: StepResult[] = [];
  do {
    const r = step(s, { stepId: String(out.length), action: expectedAction(s), bet: BET }, p);
    s = r.state;
    out.push(r.result);
  } while (!out.at(-1)!.roundComplete);
  return out;
}

const topMult = (steps: StepResult[]) =>
  Math.max(0, ...steps.flatMap((r) => r.tumbles.flatMap((t) => t.clusters.map((c) => c.multiplier))));
const topLevel = (steps: StepResult[]) => Math.max(0, ...steps.flatMap((r) => r.tumbles.flatMap((t) => t.spots)));

const found: Record<string, { seed: number; note: string }> = {};
for (let seed = 1; seed <= limit && Object.keys(found).length < 3; seed++) {
  const p = new RandomOutcomeProvider(seed);
  // дешевий відсів: лише перший спін
  const first = step(initialState(10_000_000), { stepId: '0', action: 'spin', bet: BET }, p).result;
  const x = first.stepWin / BET;
  if (!found.chain && !first.stroke && first.tumbles.length >= 7 && x >= 15 && x <= 80 && topMult([first]) >= 4) {
    found.chain = { seed, note: `${first.tumbles.length} tumbles, ${x}× bet, top ×${topMult([first])}` };
  }
  if (!found.stroke && first.stroke && first.tumbles.length >= 3 && x >= 8 && x <= 60 && topMult([first]) >= 4 && !first.fsAwarded) {
    found.stroke = { seed, note: `${first.stroke.cells.length} buds, ${first.tumbles.length} tumbles, ${x}× bet, top ×${topMult([first])}` };
  }
  if (!found.bonus && first.fsAwarded) {
    const all = play(seed);
    const win = all.at(-1)!.roundWin / BET;
    if (topLevel(all) >= 8 && win >= 250 && win <= 2000 && all.length <= 22) {
      found.bonus = { seed, note: `${first.plates.length} plates, ${all.length - 1} free spins, ${win}× bet, top ×${topMult(all)}` };
    }
  }
}
console.log(found);
