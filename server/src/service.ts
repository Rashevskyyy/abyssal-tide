/**
 * Логіка сервера поверх рушія. Рушій той самий, що й в офлайн-демо в браузері (src/engine) —
 * чиста функція step(), тож правила не дублюються; сервер додає лише сесії, транзакції й журнал.
 */
import { EngineError, initialState, step } from '../../games/abyssal-tide/src/engine/engine';
import type { OutcomeProvider } from '../../games/abyssal-tide/src/engine/outcome';
import { START_BALANCE, TOP_UP_AMOUNT } from '../../games/abyssal-tide/src/shared/config';
import { JURISDICTIONS, type JurisdictionId } from '../../games/abyssal-tide/src/shared/jurisdiction';
import type { StepRequest, StepResult } from '../../games/abyssal-tide/src/shared/types';
import type { RoundRecord, SessionSnapshot } from '../../games/abyssal-tide/src/server/protocol';
import { appendStep, toRecord } from '../../games/abyssal-tide/src/server/records';
import { API_VERSION, type LaunchResponse } from '../../games/abyssal-tide/src/server/api';
import type { LedgerEntry, PlayerState, Repository, SessionInfo } from './repo';

export interface ServiceOptions {
  startBalance?: number;
  historyLimit?: number;
  now?: () => number;
}

export class GameService {
  constructor(
    readonly repo: Repository,
    private readonly provider: OutcomeProvider,
    private readonly opts: ServiceOptions = {},
  ) {}

  /** Запуск гри: гравець (новий чи наявний), сесія з токеном, стан для відновлення. */
  async launch(playerId: string, jurisdiction: JurisdictionId = 'default'): Promise<LaunchResponse> {
    await this.repo.ensurePlayer(playerId, fresh(this.opts.startBalance));
    const token = await this.repo.createSession(playerId, jurisdiction);
    return {
      apiVersion: API_VERSION,
      token,
      snapshot: await this.snapshot(playerId),
      history: await this.history(playerId),
      rules: JURISDICTIONS[jurisdiction].rules,
    };
  }

  async snapshot(playerId: string): Promise<SessionSnapshot> {
    return toSnapshot(await this.repo.read(playerId));
  }

  history(playerId: string): Promise<RoundRecord[]> {
    return this.repo.history(playerId, this.opts.historyLimit ?? 30);
  }

  /**
   * Один крок гри. Повтор із тим самим stepId (подвійний клік, втрачена відповідь) повертає
   * вже зафіксований результат і не списує ставку вдруге. Крок, раунд, журнал і стан —
   * в одній транзакції: або все, або нічого.
   */
  async play(session: SessionInfo, req: StepRequest): Promise<StepResult> {
    return this.repo.withPlayer(session.playerId, async (tx) => {
      const done = await tx.findStep(req.stepId);
      if (done) return done;

      const prev = tx.state;
      const { state: engine, result } = step(prev.engine, req, this.provider, JURISDICTIONS[session.jurisdiction].rules);

      const entries: LedgerEntry[] = [];
      if (req.action === 'spin') {
        entries.push({ kind: 'bet', amount: -result.bet, balanceAfter: prev.engine.balance - result.bet, stepId: result.stepId, roundId: result.roundId });
      }
      if (result.roundAward > 0) {
        entries.push({ kind: 'win', amount: result.roundAward, balanceAfter: result.balanceAfter, stepId: result.stepId, roundId: result.roundId });
      }

      let current = appendStep(prev.current, result, prev.engine.balance, this.now());
      await tx.saveStep(result);
      await tx.ledger(entries);
      if (result.roundComplete && current) {
        await tx.saveRound(toRecord(current, result));
        current = null;
      }
      await tx.saveState({ engine, current, lastResult: result });
      return result;
    });
  }

  /** Поповнення демо-балансу — лише поза раундом. */
  async topUp(playerId: string): Promise<SessionSnapshot> {
    return this.repo.withPlayer(playerId, async (tx) => {
      const s = tx.state;
      if (s.engine.round) throw new EngineError('UNEXPECTED_ACTION', 'Cannot top up during a round');
      s.engine.balance += TOP_UP_AMOUNT;
      await tx.ledger([{ kind: 'topup', amount: TOP_UP_AMOUNT, balanceAfter: s.engine.balance }]);
      await tx.saveState(s);
      return toSnapshot(s);
    });
  }

  /** Демо «почати заново»: новий баланс, порожні банки й історія. */
  async reset(playerId: string): Promise<SessionSnapshot> {
    return this.repo.withPlayer(playerId, async (tx) => {
      const s = fresh(this.opts.startBalance);
      await tx.clear();
      await tx.saveState(s);
      return toSnapshot(s);
    });
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }
}

/** Новий гравець: стартовий баланс демо. Журнал рахує зміни від нього: баланс = старт + сума журналу. */
function fresh(startBalance = START_BALANCE): PlayerState {
  return { engine: initialState(startBalance), current: null, lastResult: null };
}

export function toSnapshot(s: PlayerState): SessionSnapshot {
  return {
    balance: s.engine.balance,
    round: s.engine.round,
    lastBoard: s.engine.lastBoard,
    lastResult: s.lastResult,
    pots: s.engine.pots ?? {},
  };
}
