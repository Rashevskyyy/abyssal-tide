/**
 * Офлайн-джерело результатів: той самий рушій у браузері, стан сесії в localStorage.
 * Перезавантаження сторінки посеред бонусу продовжує його з того ж місця.
 */
import type { GameRules } from '@slotkit/rules';
import { expectedAction, initialState, step } from '../engine/engine';
import type { OutcomeProvider } from '../engine/outcome';
import { BETS, CELLS, TOP_UP_AMOUNT } from '../shared/config';
import type { EngineState, StepRequest, StepResult } from '../shared/types';

const KEY = 'petrykivka-bloom:session:v1';

function valid(s: unknown): s is EngineState {
  const v = s as EngineState;
  return !!v && typeof v.balance === 'number' && Array.isArray(v.lastGrid) && v.lastGrid.length === CELLS && typeof v.roundSeq === 'number';
}

export class LocalSource {
  state: EngineState;
  private seq = 0;

  constructor(
    private readonly provider: OutcomeProvider,
    private readonly rules: GameRules,
  ) {
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      saved = null;
    }
    this.state = valid(saved) ? saved : initialState();
  }

  get next() {
    return expectedAction(this.state);
  }

  play(req: Omit<StepRequest, 'stepId'>): StepResult {
    const out = step(this.state, { ...req, stepId: `L${Date.now().toString(36)}${(this.seq++).toString(36)}` }, this.provider, this.rules);
    this.state = out.state;
    this.save();
    return out.result;
  }

  /** Демо-кредити: поповнення, коли не вистачає на найменшу ставку. */
  topUp(): void {
    if (this.state.balance >= BETS[0]) return;
    this.state.balance += TOP_UP_AMOUNT;
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // приватний режим Safari тощо — гра йде без збереження
    }
  }
}
