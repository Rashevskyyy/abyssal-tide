/**
 * Postgres-сховище. Стан рушія — jsonb (рушій сам його серіалізує й перевіряє);
 * кроки, раунди й журнал коштів — окремі таблиці для історії, replay і аудиту.
 *
 * Кожен запит гравця — транзакція з `SELECT … FOR UPDATE` на рядку стану:
 * два одночасні запити того самого гравця виконуються по черзі, а повтор із тим самим stepId
 * після блокування знаходить уже зафіксований крок і повертає його без другого списання.
 */
import pg from 'pg';
import type { StepResult } from '../../games/abyssal-tide/src/shared/types';
import type { JurisdictionId } from '../../games/abyssal-tide/src/shared/jurisdiction';
import type { RoundRecord } from '../../games/abyssal-tide/src/server/protocol';
import { newToken, NotFoundError, type PlayerState, type PlayerTx, type Repository, type SessionInfo } from './repo';

export const SCHEMA = `
create table if not exists players (
  id          text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists sessions (
  token         text primary key,
  player_id     text not null references players(id) on delete cascade,
  jurisdiction  text not null default 'default',
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

-- стан рушія гравця: баланс, активний раунд, банки 3 Pots
create table if not exists game_state (
  player_id      text primary key references players(id) on delete cascade,
  engine         jsonb not null,
  current_round  jsonb,
  last_result    jsonb,
  updated_at     timestamptz not null default now()
);

-- кожен зафіксований крок: ідемпотентність за (гравець, stepId)
create table if not exists steps (
  player_id   text not null references players(id) on delete cascade,
  step_id     text not null,
  round_id    text not null,
  action      text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, step_id)
);

create table if not exists rounds (
  player_id       text not null references players(id) on delete cascade,
  round_id        text not null,
  bet             integer not null,
  win             integer not null,
  balance_before  integer not null,
  balance_after   integer not null,
  features        text[] not null,
  record          jsonb not null,
  started_at      timestamptz not null,
  finished_at     timestamptz not null default now(),
  primary key (player_id, round_id)
);
create index if not exists rounds_recent on rounds (player_id, finished_at desc);

-- журнал коштів: ставка (−), виграш (+), поповнення демо (+)
create table if not exists ledger (
  id             bigserial primary key,
  player_id      text not null references players(id) on delete cascade,
  kind           text not null check (kind in ('bet', 'win', 'topup')),
  amount         integer not null,
  balance_after  integer not null,
  step_id        text,
  round_id       text,
  created_at     timestamptz not null default now()
);
create index if not exists ledger_player on ledger (player_id, id);
`;

export class PgRepository implements Repository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  /**
   * Схема під advisory lock: кілька процесів (два екземпляри сервера, паралельні тести)
   * можуть стартувати одночасно, а `create table if not exists` сам по собі від гонки не захищає.
   */
  async migrate(): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query('select pg_advisory_lock(727011)');
      await c.query(SCHEMA);
    } finally {
      await c.query('select pg_advisory_unlock(727011)').catch(() => undefined);
      c.release();
    }
  }

  async ensurePlayer(playerId: string, initial: PlayerState): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const ins = await c.query('insert into players (id) values ($1) on conflict do nothing', [playerId]);
      if (ins.rowCount) {
        await c.query('insert into game_state (player_id, engine, current_round, last_result) values ($1, $2, $3, $4)', [
          playerId,
          initial.engine,
          initial.current,
          initial.lastResult,
        ]);
      }
      await c.query('commit');
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  async createSession(playerId: string, jurisdiction: JurisdictionId): Promise<string> {
    const token = newToken();
    await this.pool.query('insert into sessions (token, player_id, jurisdiction) values ($1, $2, $3)', [token, playerId, jurisdiction]);
    return token;
  }

  async session(token: string): Promise<SessionInfo | null> {
    const r = await this.pool.query<{ player_id: string; jurisdiction: JurisdictionId }>(
      'update sessions set last_seen = now() where token = $1 returning player_id, jurisdiction',
      [token],
    );
    return r.rows[0] ? { playerId: r.rows[0].player_id, jurisdiction: r.rows[0].jurisdiction } : null;
  }

  async read(playerId: string): Promise<PlayerState> {
    const r = await this.pool.query('select engine, current_round, last_result from game_state where player_id = $1', [playerId]);
    if (!r.rows[0]) throw new NotFoundError(`Unknown player ${playerId}`);
    return rowToState(r.rows[0]);
  }

  async history(playerId: string, limit: number): Promise<RoundRecord[]> {
    const r = await this.pool.query<{ record: RoundRecord }>(
      'select record from rounds where player_id = $1 order by finished_at desc, round_id desc limit $2',
      [playerId, limit],
    );
    return r.rows.map((x) => x.record);
  }

  async ledgerTotal(playerId: string): Promise<number> {
    const r = await this.pool.query<{ total: string | null }>('select sum(amount) as total from ledger where player_id = $1', [playerId]);
    return Number(r.rows[0]?.total ?? 0);
  }

  async withPlayer<T>(playerId: string, fn: (tx: PlayerTx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const r = await c.query('select engine, current_round, last_result from game_state where player_id = $1 for update', [playerId]);
      if (!r.rows[0]) throw new NotFoundError(`Unknown player ${playerId}`);
      const tx: PlayerTx = {
        state: rowToState(r.rows[0]),
        findStep: async (stepId) => {
          const s = await c.query<{ result: StepResult }>('select result from steps where player_id = $1 and step_id = $2', [playerId, stepId]);
          return s.rows[0]?.result ?? null;
        },
        saveStep: async (res) => {
          await c.query('insert into steps (player_id, step_id, round_id, action, result) values ($1, $2, $3, $4, $5)', [
            playerId,
            res.stepId,
            res.roundId,
            res.action,
            res,
          ]);
        },
        saveRound: async (rec) => {
          await c.query(
            `insert into rounds (player_id, round_id, bet, win, balance_before, balance_after, features, record, started_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))`,
            [playerId, rec.roundId, rec.bet, rec.win, rec.balanceBefore, rec.balanceAfter, rec.features, rec, rec.startedAt],
          );
        },
        ledger: async (entries) => {
          for (const e of entries) {
            await c.query('insert into ledger (player_id, kind, amount, balance_after, step_id, round_id) values ($1, $2, $3, $4, $5, $6)', [
              playerId,
              e.kind,
              e.amount,
              e.balanceAfter,
              e.stepId ?? null,
              e.roundId ?? null,
            ]);
          }
        },
        saveState: async (s) => {
          await c.query('update game_state set engine = $2, current_round = $3, last_result = $4, updated_at = now() where player_id = $1', [
            playerId,
            s.engine,
            s.current,
            s.lastResult,
          ]);
        },
        clear: async () => {
          await c.query('delete from steps where player_id = $1', [playerId]);
          await c.query('delete from rounds where player_id = $1', [playerId]);
          await c.query('delete from ledger where player_id = $1', [playerId]);
        },
      };
      const out = await fn(tx);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToState(row: { engine: PlayerState['engine']; current_round: PlayerState['current']; last_result: PlayerState['lastResult'] }): PlayerState {
  return { engine: row.engine, current: row.current_round, lastResult: row.last_result };
}
