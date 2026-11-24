import type { GameRules } from '../shared/config';
import { TOP_UP_AMOUNT, BETS } from '../shared/config';
import { EngineError, initialState, step } from '../engine/engine';
import type { OutcomeProvider } from '../engine/outcome';
import type { EngineState, Pots, StepRequest, StepResult } from '../shared/types';
import { SourceError, type LiveSource, type RoundRecord, type SessionSnapshot } from './protocol';
import type { KeyValueStore } from './storage';
import { appendStep, toRecord, type RoundInProgress } from './records';

interface PersistedSession {
  version: 1;
  engine: EngineState;
  lastResult: StepResult | null;
  current: RoundInProgress | null;
  history: RoundRecord[];
}

export interface LocalSourceOptions {
  store: KeyValueStore;
  provider: OutcomeProvider;
  key?: string;
  kind?: 'live' | 'showcase';
  startBalance?: number;
  /** Імітація мережі: затримка відповіді, мс. */
  latency?: readonly [number, number];
  /** Частка запитів, що «губляться» (половина до обробки, половина після). */
  failRate?: number;
  historyLimit?: number;
  now?: () => number;
  /** Банки нової сесії (показ бонусу 3 Pots). */
  seedPots?: Record<string, Pots>;
  /** Правила оператора/юрисдикції (максимальний виграш). */
  rules?: GameRules;
}

/**
 * Локальний «сервер» для офлайн-демо.
 * - Запис результату та балансу атомарний: один `store.set` на крок.
 * - Повторний stepId повертає збережений результат і не змінює баланс.
 * - Сесія переживає перезавантаження сторінки.
 */
export class LocalResultSource implements LiveSource {
  readonly kind: 'live' | 'showcase';
  failRate: number;
  private readonly key: string;
  private session_: PersistedSession;

  constructor(private readonly opts: LocalSourceOptions) {
    this.kind = opts.kind ?? 'live';
    this.key = opts.key ?? 'abyssal-tide/session/v3'; // v3: суми в центах EUR, ставки як у 3 Oaks
    this.failRate = opts.failRate ?? 0;
    this.session_ = this.load();
  }

  async session(): Promise<SessionSnapshot> {
    await this.delay();
    return this.snapshot();
  }

  snapshot(): SessionSnapshot {
    const s = this.session_;
    return structuredClone({
      balance: s.engine.balance,
      round: s.engine.round,
      lastBoard: s.engine.lastBoard,
      lastResult: s.lastResult,
      pots: s.engine.pots ?? {},
    });
  }

  async request(req: StepRequest): Promise<StepResult> {
    await this.delay();
    const roll = Math.random();
    if (roll < this.failRate / 2) throw new SourceError('NETWORK', 'Request lost before reaching the server', true);

    const current = this.load();
    if (current.lastResult && current.lastResult.stepId === req.stepId) {
      return structuredClone(current.lastResult); // ідемпотентний повтор
    }

    let out: { state: EngineState; result: StepResult };
    try {
      out = step(current.engine, req, this.opts.provider, this.opts.rules);
    } catch (e) {
      if (e instanceof EngineError) throw new SourceError(e.code, e.message, false);
      throw e;
    }

    const next = this.commit(current, out.state, out.result);
    this.session_ = next;

    if (roll < this.failRate) throw new SourceError('NETWORK', 'Response lost after the step was committed', true);
    return structuredClone(out.result);
  }

  /** Поповнення демо-балансу — лише поза раундом. */
  async topUp(amount = TOP_UP_AMOUNT): Promise<SessionSnapshot> {
    await this.delay();
    const s = this.load();
    if (s.engine.round) throw new SourceError('UNEXPECTED_ACTION', 'Cannot top up during a round');
    s.engine.balance += amount;
    this.persist(s);
    return this.snapshot();
  }

  history(): RoundRecord[] {
    return structuredClone(this.session_.history);
  }

  async reset(): Promise<void> {
    this.opts.store.remove(this.key);
    this.session_ = this.load();
  }

  private commit(prev: PersistedSession, engine: EngineState, result: StepResult): PersistedSession {
    const next: PersistedSession = {
      version: 1,
      engine,
      lastResult: result,
      current: prev.current,
      history: prev.history,
    };
    next.current = appendStep(prev.current, result, prev.engine.balance, this.now());
    if (result.roundComplete && next.current) {
      next.history = [toRecord(next.current, result), ...prev.history].slice(0, this.opts.historyLimit ?? 30);
      next.current = null;
    }
    this.persist(next);
    return next;
  }

  private persist(s: PersistedSession): void {
    this.opts.store.set(this.key, JSON.stringify(s)); // один запис — атомарна фіксація кроку
    this.session_ = s;
  }

  private load(): PersistedSession {
    const raw = this.opts.store.get(this.key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PersistedSession;
        if (parsed.version === 1 && parsed.engine) {
          parsed.engine.pots ??= {}; // сесія, збережена до появи 3 Pots
          return parsed;
        }
      } catch {
        /* пошкоджений запис — починаємо заново */
      }
    }
    const engine = initialState(this.opts.startBalance);
    if (this.opts.seedPots) engine.pots = structuredClone(this.opts.seedPots);
    const fresh: PersistedSession = {
      version: 1,
      engine,
      lastResult: null,
      current: null,
      history: [],
    };
    return fresh;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private delay(): Promise<void> {
    const [min, max] = this.opts.latency ?? [0, 0];
    if (max <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
  }
}

export const isValidBet = (bet: number): boolean => BETS.includes(bet);
