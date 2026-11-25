/**
 * Petrykivka Bloom на тому ж сервері: той самий рушій гри (games/petrykivka-bloom/src/engine),
 * те саме сховище, сесії, транзакції й журнал, що й в Abyssal Tide. Маршрути — під /api/petrykivka-bloom/.
 *
 *   POST /api/petrykivka-bloom/launch  { playerId, jurisdiction? }          → PbLaunchResponse
 *   GET  /api/petrykivka-bloom/session                                     → PbSnapshot
 *   POST /api/petrykivka-bloom/play    { stepId, action, bet?, ante?, buy? } → StepResult
 *   GET  /api/petrykivka-bloom/history                                     → PbRoundRecord[]
 *   POST /api/petrykivka-bloom/topup | /reset                               → PbSnapshot
 *
 * Сховище не залежить від гри (стан, кроки й раунди — JSON), тож гравець цієї гри зберігається
 * під ідентифікатором `petrykivka-bloom:<playerId>`: двокрапки немає в дозволених символах playerId,
 * тому стани двох ігор ніколи не змішуються, а дані Abyssal Tide лишаються, як були.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { JURISDICTIONS, isJurisdictionId, type GameRules, type JurisdictionId } from '@slotkit/rules';
import { EngineError, initialState, step } from '../../games/petrykivka-bloom/src/engine/engine';
import type { OutcomeProvider } from '../../games/petrykivka-bloom/src/engine/outcome';
import { BETS, START_BALANCE, TOP_UP_AMOUNT } from '../../games/petrykivka-bloom/src/shared/config';
import type { EngineState, Grid, RoundState, StepRequest, StepResult } from '../../games/petrykivka-bloom/src/shared/types';
import { NotFoundError, type LedgerEntry, type Repository, type SessionInfo } from './repo';

export const GAME_ID = 'petrykivka-bloom';
const PREFIX = `${GAME_ID}:`;
const PLAYER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface PbRoundRecord {
  roundId: string;
  bet: number;
  startedAt: number;
  balanceBefore: number;
  balanceAfter: number;
  win: number;
  features: string[];
  steps: StepResult[];
}

interface PbRoundInProgress {
  roundId: string;
  bet: number;
  startedAt: number;
  balanceBefore: number;
  steps: StepResult[];
}

interface PbPlayerState {
  engine: EngineState;
  current: PbRoundInProgress | null;
  lastResult: StepResult | null;
}

export interface PbSnapshot {
  balance: number;
  round: RoundState | null;
  lastGrid: Grid;
  lastResult: StepResult | null;
}

export interface PbLaunchResponse {
  apiVersion: 1;
  game: typeof GAME_ID;
  token: string;
  snapshot: PbSnapshot;
  history: PbRoundRecord[];
  rules: GameRules;
}

/** Сховище спільне з Abyssal Tide; для цієї гри його записи мають інші типи (див. коментар угорі). */
type PbRepo = Omit<Repository, 'ensurePlayer' | 'read' | 'history' | 'withPlayer'> & {
  ensurePlayer(playerId: string, initial: PbPlayerState): Promise<void>;
  read(playerId: string): Promise<PbPlayerState>;
  history(playerId: string, limit: number): Promise<PbRoundRecord[]>;
  withPlayer<T>(
    playerId: string,
    fn: (tx: {
      readonly state: PbPlayerState;
      findStep(stepId: string): Promise<StepResult | null>;
      saveStep(result: StepResult): Promise<void>;
      saveRound(record: PbRoundRecord): Promise<void>;
      ledger(entries: LedgerEntry[]): Promise<void>;
      saveState(state: PbPlayerState): Promise<void>;
      clear(): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
};

export const storageId = (playerId: string): string => PREFIX + playerId;
export const isPbPlayer = (storedId: string): boolean => storedId.startsWith(PREFIX);

export class PetrykivkaService {
  private readonly repo: PbRepo;

  constructor(
    repo: Repository,
    private readonly provider: OutcomeProvider,
    private readonly opts: { startBalance?: number; historyLimit?: number; now?: () => number } = {},
  ) {
    this.repo = repo as unknown as PbRepo;
  }

  async launch(playerId: string, jurisdiction: JurisdictionId = 'default'): Promise<PbLaunchResponse> {
    const id = storageId(playerId);
    await this.repo.ensurePlayer(id, this.fresh());
    const token = await this.repo.createSession(id, jurisdiction);
    return {
      apiVersion: 1,
      game: GAME_ID,
      token,
      snapshot: await this.snapshot(id),
      history: await this.history(id),
      rules: JURISDICTIONS[jurisdiction].rules,
    };
  }

  async snapshot(id: string): Promise<PbSnapshot> {
    return toSnapshot(await this.repo.read(id));
  }

  history(id: string): Promise<PbRoundRecord[]> {
    return this.repo.history(id, this.opts.historyLimit ?? 30);
  }

  /** Крок гри: повтор із тим самим stepId повертає зафіксований результат без другого списання. */
  async play(session: SessionInfo, req: StepRequest): Promise<StepResult> {
    const market = JURISDICTIONS[session.jurisdiction];
    if (req.buy && !market.allowBonusBuy) throw new EngineError('BAD_REQUEST', 'Bonus buy is not available in this market');
    return this.repo.withPlayer(session.playerId, async (tx) => {
      const done = await tx.findStep(req.stepId);
      if (done) return done;
      const prev = tx.state;
      const { state: engine, result } = step(prev.engine, req, this.provider, market.rules);

      const entries: LedgerEntry[] = [];
      if (result.cost > 0) {
        entries.push({ kind: 'bet', amount: -result.cost, balanceAfter: prev.engine.balance - result.cost, stepId: result.stepId, roundId: result.roundId });
      }
      if (result.stepWin > 0) {
        entries.push({ kind: 'win', amount: result.stepWin, balanceAfter: result.balanceAfter, stepId: result.stepId, roundId: result.roundId });
      }
      let current: PbRoundInProgress | null =
        req.action === 'spin'
          ? { roundId: result.roundId, bet: result.bet, startedAt: this.now(), balanceBefore: prev.engine.balance, steps: [] }
          : prev.current;
      if (current) current = { ...current, steps: [...current.steps, result] };
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

  async topUp(id: string): Promise<PbSnapshot> {
    return this.repo.withPlayer(id, async (tx) => {
      const s = tx.state;
      if (s.engine.round) throw new EngineError('UNEXPECTED_ACTION', 'Cannot top up during a round');
      s.engine.balance += TOP_UP_AMOUNT;
      await tx.ledger([{ kind: 'topup', amount: TOP_UP_AMOUNT, balanceAfter: s.engine.balance }]);
      await tx.saveState(s);
      return toSnapshot(s);
    });
  }

  async reset(id: string): Promise<PbSnapshot> {
    return this.repo.withPlayer(id, async (tx) => {
      const s = this.fresh();
      await tx.clear();
      await tx.saveState(s);
      return toSnapshot(s);
    });
  }

  session(token: string): Promise<SessionInfo | null> {
    return this.repo.session(token);
  }

  ledgerTotal(id: string): Promise<number> {
    return this.repo.ledgerTotal(id);
  }

  private fresh(): PbPlayerState {
    return { engine: initialState(this.opts.startBalance ?? START_BALANCE), current: null, lastResult: null };
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }
}

function toSnapshot(s: PbPlayerState): PbSnapshot {
  return { balance: s.engine.balance, round: s.engine.round, lastGrid: s.engine.lastGrid, lastResult: s.lastResult };
}

function toRecord(r: PbRoundInProgress, last: StepResult): PbRoundRecord {
  const first = r.steps[0];
  const features: string[] = [];
  if (r.steps.some((s) => s.stroke && s.mode === 'base')) features.push('stroke');
  if (r.steps.some((s) => s.mode === 'free')) features.push('freeSpins');
  if (first?.ante) features.push('ante');
  if (first?.bought) features.push('buy');
  if (last.maxWin) features.push('maxWin');
  return {
    roundId: r.roundId,
    bet: r.bet,
    startedAt: r.startedAt,
    balanceBefore: r.balanceBefore,
    balanceAfter: last.balanceAfter,
    win: last.roundWin,
    features,
    steps: r.steps,
  };
}

class PbHttpError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INSUFFICIENT_FUNDS: 402,
  UNEXPECTED_ACTION: 409,
  INVALID_BET: 422,
};

/** Маршрути гри як плагін Fastify під префіксом /api/petrykivka-bloom. */
export function petrykivkaRoutes(service: PetrykivkaService) {
  return async (app: FastifyInstance) => {
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof EngineError || err instanceof PbHttpError) {
        return reply.status(STATUS[err.code] ?? 400).send({ code: err.code, message: err.message });
      }
      if (err instanceof NotFoundError) return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Unknown player' });
      if ((err as { validation?: unknown }).validation) return reply.status(400).send({ code: 'BAD_REQUEST', message: (err as Error).message });
      app.log.error(err);
      return reply.status(500).send({ code: 'NETWORK', message: 'Internal error' });
    });

    const auth = async (req: FastifyRequest) => {
      const h = req.headers.authorization ?? '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      const s = token ? await service.session(token) : null;
      // токен іншої гри тут не діє
      if (!s || !isPbPlayer(s.playerId)) throw new PbHttpError('UNAUTHORIZED', 'Missing or unknown session token');
      req.player = s;
    };

    app.post<{ Body: { playerId: string; jurisdiction?: string } }>(
      '/launch',
      {
        schema: {
          body: {
            type: 'object',
            required: ['playerId'],
            additionalProperties: false,
            properties: { playerId: { type: 'string', pattern: PLAYER_ID.source }, jurisdiction: { type: 'string' } },
          },
        },
      },
      async (req) => {
        const j = req.body.jurisdiction ?? 'default';
        if (!isJurisdictionId(j)) throw new PbHttpError('BAD_REQUEST', `Unknown jurisdiction ${j}`);
        return service.launch(req.body.playerId, j);
      },
    );

    app.get('/session', { onRequest: auth }, async (req) => service.snapshot(req.player.playerId));
    app.get('/history', { onRequest: auth }, async (req) => service.history(req.player.playerId));

    app.post<{ Body: StepRequest }>(
      '/play',
      {
        onRequest: auth,
        schema: {
          body: {
            type: 'object',
            required: ['stepId', 'action'],
            additionalProperties: false,
            properties: {
              stepId: { type: 'string', minLength: 1, maxLength: 64 },
              action: { type: 'string', enum: ['spin', 'freeSpin'] },
              bet: { type: 'integer', enum: [...BETS] },
              ante: { type: 'boolean' },
              buy: { type: 'boolean' },
            },
          },
        },
      },
      async (req) => service.play(req.player, req.body),
    );

    app.post('/topup', { onRequest: auth }, async (req) => service.topUp(req.player.playerId));
    app.post('/reset', { onRequest: auth }, async (req) => service.reset(req.player.playerId));
  };
}
