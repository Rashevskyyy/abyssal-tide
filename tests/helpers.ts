import { initialState, step } from '../src/engine/engine';
import { ScriptedOutcomeProvider, type Script } from '../src/engine/scripted';
import type { Action, EngineState, StepResult } from '../src/shared/types';

let seq = 0;
export const sid = (): string => `t-${++seq}`;

/** Програти послідовність дій проти сценарію; повертає результати та фінальний стан. */
export function play(script: Script, actions: Action[], opts: { bet?: number; state?: EngineState } = {}) {
  const provider = new ScriptedOutcomeProvider(script);
  let state = opts.state ?? initialState();
  const results: StepResult[] = [];
  for (const action of actions) {
    const out = step(state, { stepId: sid(), action, bet: opts.bet ?? 100 }, provider);
    state = out.state;
    results.push(out.result);
  }
  return { state, results, last: results[results.length - 1], provider };
}

/** Грати, поки рушій просить наступну дію (з обмеженням). */
export function playOut(script: Script, opts: { bet?: number; state?: EngineState; max?: number } = {}) {
  const provider = new ScriptedOutcomeProvider(script);
  let state = opts.state ?? initialState();
  const results: StepResult[] = [];
  let action: Action = 'spin';
  for (let i = 0; i < (opts.max ?? 200); i++) {
    const out = step(state, { stepId: sid(), action, bet: opts.bet ?? 100 }, provider);
    state = out.state;
    results.push(out.result);
    if (out.result.next === 'none') break;
    action = out.result.next;
  }
  return { state, results, last: results[results.length - 1], provider };
}
