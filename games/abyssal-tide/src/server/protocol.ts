import type { EngineErrorCode } from '../engine/engine';
import type { Pots, ReelBoard, RoundState, StepRequest, StepResult } from '../shared/types';

/** Що клієнт отримує при старті або відновленні. */
export interface SessionSnapshot {
  balance: number;
  round: RoundState | null; // активний раунд, якщо гру перервано посередині
  lastBoard: ReelBoard;
  lastResult: StepResult | null;
  /** Банки 3 Pots для всіх ставок, на яких грали (ключ — ставка в центах). */
  pots: Record<string, Pots>;
}

export type Feature = 'freeDives' | 'salvage' | 'super' | 'fullBoard' | 'bigWin';

export interface RoundRecord {
  roundId: string;
  bet: number;
  startedAt: number;
  balanceBefore: number;
  balanceAfter: number;
  win: number;
  features: Feature[];
  steps: StepResult[];
}

/**
 * Джерело результатів. Клієнт тільки програє дані, які воно повертає:
 * живий RNG, сценарний показ бонусу і replay історії реалізують один і той самий інтерфейс.
 */
export interface ResultSource {
  readonly kind: 'live' | 'showcase' | 'replay';
  session(): Promise<SessionSnapshot>;
  request(req: StepRequest): Promise<StepResult>;
}

/**
 * Живе джерело гри: локальний «сервер» в браузері (офлайн-демо) або справжній сервер через HTTP.
 * GameFlow працює з будь-яким із них однаково.
 */
export interface LiveSource extends ResultSource {
  readonly kind: 'live' | 'showcase';
  /** Імітація втрат мережі (лише локальне джерело; у справжнього мережа своя). */
  failRate: number;
  /** Останній відомий стан без запиту. */
  snapshot(): SessionSnapshot;
  history(): RoundRecord[];
  topUp(): Promise<SessionSnapshot>;
  reset(): Promise<void>;
}

export type SourceErrorCode = EngineErrorCode | 'NETWORK' | 'REPLAY_END' | 'UNAUTHORIZED' | 'BAD_REQUEST';

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}
