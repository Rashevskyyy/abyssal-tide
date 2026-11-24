import type { StepRequest, StepResult } from '../shared/types';
import { SourceError, type ResultSource, type RoundRecord, type SessionSnapshot } from './protocol';

/** Replay записаного раунду: віддає збережені кроки по черзі й не запускає RNG. */
export class ReplaySource implements ResultSource {
  readonly kind = 'replay' as const;
  private cursor = 0;

  constructor(private readonly record: RoundRecord) {}

  async session(): Promise<SessionSnapshot> {
    const first = this.record.steps[0];
    return {
      balance: this.record.balanceBefore,
      round: null,
      lastBoard: first.boardBefore as SessionSnapshot['lastBoard'],
      lastResult: null,
      // банки на початку записаного раунду (старі записи без банок — порожні)
      pots: { [String(this.record.bet)]: first.potsBefore ?? { extra: 0, boost: 0, multi: 0 } },
    };
  }

  get bet(): number {
    return this.record.bet;
  }

  async request(req: StepRequest): Promise<StepResult> {
    const next = this.record.steps[this.cursor];
    if (!next) throw new SourceError('REPLAY_END', 'Replay has no more steps');
    if (next.action !== req.action) throw new SourceError('UNEXPECTED_ACTION', `Replay expected ${next.action}, got ${req.action}`);
    this.cursor += 1;
    return structuredClone(next);
  }
}
