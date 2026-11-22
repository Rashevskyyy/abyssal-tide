/**
 * Сховище сервера. Два варіанти з однаковою поведінкою:
 * `MemoryRepository` — для тестів і запуску без бази, `PgRepository` — Postgres (pg.ts).
 *
 * Усі зміни гравця йдуть через `withPlayer`: усередині — одна транзакція й блокування гравця,
 * тож два одночасні запити (подвійний клік, повтор після таймауту) виконуються по черзі.
 */
import type { EngineState, StepResult } from '../../src/shared/types';
import type { JurisdictionId } from '../../src/shared/jurisdiction';
import type { RoundRecord } from '../../src/server/protocol';
import type { RoundInProgress } from '../../src/server/records';

export interface PlayerState {
  engine: EngineState;
  /** Кроки незавершеного раунду (для запису в історію, коли раунд закінчиться). */
  current: RoundInProgress | null;
  lastResult: StepResult | null;
}

/** Рух коштів — журнал для аудиту: ставка, виграш, поповнення демо. */
export interface LedgerEntry {
  kind: 'bet' | 'win' | 'topup';
  amount: number; // центи; ставка — від’ємна
  balanceAfter: number;
  stepId?: string;
  roundId?: string;
}

export interface SessionInfo {
  playerId: string;
  jurisdiction: JurisdictionId;
}

/** Операції всередині транзакції гравця. */
export interface PlayerTx {
  readonly state: PlayerState;
  /** Будь-який раніше зафіксований крок із цим stepId (не лише останній). */
  findStep(stepId: string): Promise<StepResult | null>;
  saveStep(result: StepResult): Promise<void>;
  saveRound(record: RoundRecord): Promise<void>;
  ledger(entries: LedgerEntry[]): Promise<void>;
  saveState(state: PlayerState): Promise<void>;
  /** Демо «почати заново»: історія, кроки й журнал гравця стираються. */
  clear(): Promise<void>;
}

export interface Repository {
  /** Створює гравця з початковим станом, якщо його ще немає. */
  ensurePlayer(playerId: string, initial: PlayerState): Promise<void>;
  createSession(playerId: string, jurisdiction: JurisdictionId): Promise<string>;
  session(token: string): Promise<SessionInfo | null>;
  read(playerId: string): Promise<PlayerState>;
  history(playerId: string, limit: number): Promise<RoundRecord[]>;
  withPlayer<T>(playerId: string, fn: (tx: PlayerTx) => Promise<T>): Promise<T>;
  /** Сума журналу гравця — для перевірки, що баланс зійшовся. */
  ledgerTotal(playerId: string): Promise<number>;
  close(): Promise<void>;
}

export class NotFoundError extends Error {}

export function newToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString('base64url');
}

// ───────────────────────────── в пам’яті ─────────────────────────────

interface MemPlayer {
  state: string; // JSON — як у базі: жодних спільних посилань між викликами
  steps: Map<string, string>;
  rounds: RoundRecord[];
  ledger: LedgerEntry[];
  lock: Promise<unknown>;
}

export class MemoryRepository implements Repository {
  private readonly players = new Map<string, MemPlayer>();
  private readonly sessions = new Map<string, SessionInfo>();

  async ensurePlayer(playerId: string, initial: PlayerState): Promise<void> {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, { state: JSON.stringify(initial), steps: new Map(), rounds: [], ledger: [], lock: Promise.resolve() });
    }
  }

  async createSession(playerId: string, jurisdiction: JurisdictionId): Promise<string> {
    const token = newToken();
    this.sessions.set(token, { playerId, jurisdiction });
    return token;
  }

  async session(token: string): Promise<SessionInfo | null> {
    return this.sessions.get(token) ?? null;
  }

  async read(playerId: string): Promise<PlayerState> {
    return JSON.parse(this.player(playerId).state) as PlayerState;
  }

  async history(playerId: string, limit: number): Promise<RoundRecord[]> {
    return structuredClone(this.player(playerId).rounds.slice(0, limit));
  }

  async ledgerTotal(playerId: string): Promise<number> {
    return this.player(playerId).ledger.reduce((s, e) => s + e.amount, 0);
  }

  async withPlayer<T>(playerId: string, fn: (tx: PlayerTx) => Promise<T>): Promise<T> {
    const p = this.player(playerId);
    const run = p.lock.then(async () => {
      // зміни збираються окремо й застосовуються лише після успіху — як COMMIT
      const pending: { state?: string; steps: [string, string][]; rounds: RoundRecord[]; ledger: LedgerEntry[]; clear: boolean } = {
        steps: [],
        rounds: [],
        ledger: [],
        clear: false,
      };
      const tx: PlayerTx = {
        state: JSON.parse(p.state) as PlayerState,
        findStep: async (id) => {
          const raw = pending.steps.find(([k]) => k === id)?.[1] ?? (pending.clear ? undefined : p.steps.get(id));
          return raw ? (JSON.parse(raw) as StepResult) : null;
        },
        saveStep: async (r) => void pending.steps.push([r.stepId, JSON.stringify(r)]),
        saveRound: async (rec) => void pending.rounds.push(structuredClone(rec)),
        ledger: async (e) => void pending.ledger.push(...e),
        saveState: async (s) => void (pending.state = JSON.stringify(s)),
        clear: async () => void (pending.clear = true),
      };
      const out = await fn(tx);
      if (pending.clear) {
        p.steps.clear();
        p.rounds = [];
        p.ledger = [];
      }
      for (const [k, v] of pending.steps) p.steps.set(k, v);
      p.rounds = [...pending.rounds.reverse(), ...p.rounds];
      p.ledger.push(...pending.ledger);
      if (pending.state) p.state = pending.state;
      return out;
    });
    p.lock = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {}

  private player(id: string): MemPlayer {
    const p = this.players.get(id);
    if (!p) throw new NotFoundError(`Unknown player ${id}`);
    return p;
  }
}
