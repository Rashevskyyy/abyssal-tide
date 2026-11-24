/**
 * HTTP API сервера через app.inject (без мережі). Один набір сценаріїв для двох сховищ:
 * у пам’яті — завжди, Postgres — коли задано DATABASE_URL (npm run test:pg).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { board, landing, ScriptedOutcomeProvider, type Script } from '../../games/abyssal-tide/src/engine/scripted';
import { START_BALANCE } from '../../games/abyssal-tide/src/shared/config';
import type { StepResult } from '../../games/abyssal-tide/src/shared/types';
import type { LaunchResponse } from '../../games/abyssal-tide/src/server/api';
import type { OutcomeProvider } from '../../games/abyssal-tide/src/engine/outcome';
import type { RoundRecord, SessionSnapshot } from '../../games/abyssal-tide/src/server/protocol';
import { buildApp } from '../src/app';
import { PgRepository } from '../src/pg';
import { MemoryRepository, type Repository } from '../src/repo';
import { GameService } from '../src/service';

const NOTHING = board(['R1 R2 R3 C  R4', 'R2 R3 H  R4 R1', 'N  R1 R2 R3 C ']);
const SIX = board(['P1 R1 P2 C  P2', 'R2 P3 H  P5 R4', 'N  R1 P1 R2 C ']);

/** Провайдер, якому кожен тест підкладає свій сценарій. */
class SwitchProvider implements OutcomeProvider {
  inner: OutcomeProvider = new ScriptedOutcomeProvider({ reels: [] });
  use(script: Script) {
    this.inner = new ScriptedOutcomeProvider(script);
  }
  reels(mode: 'base' | 'freeDives') {
    return this.inner.reels(mode);
  }
  respin(...a: Parameters<OutcomeProvider['respin']>) {
    return this.inner.respin(...a);
  }
  mystery(ctx: { superActive: boolean }) {
    return this.inner.mystery(ctx);
  }
  boost() {
    return this.inner.boost();
  }
  multi(...a: Parameters<OutcomeProvider['multi']>) {
    return this.inner.multi(...a);
  }
}

let seq = 0;
const sid = () => `s-${Date.now().toString(36)}-${++seq}`;
const pid = () => `player-${Date.now().toString(36)}-${++seq}`;

const suites: [string, () => Promise<Repository> | Repository][] = [['memory', () => new MemoryRepository()]];
if (process.env.DATABASE_URL) {
  suites.push([
    'postgres',
    async () => {
      const r = new PgRepository(process.env.DATABASE_URL!);
      await r.migrate();
      return r;
    },
  ]);
}

describe.each(suites)('server API (%s)', (_name, makeRepo) => {
  let app: FastifyInstance;
  let repo: Repository;
  const provider = new SwitchProvider();

  beforeAll(async () => {
    repo = await makeRepo();
    app = await buildApp(new GameService(repo, provider));
  });
  afterAll(async () => {
    await app.close();
    await repo.close();
  });

  const launch = async (playerId = pid()) => {
    const res = await app.inject({ method: 'POST', url: '/api/launch', payload: { playerId } });
    expect(res.statusCode).toBe(200);
    return { playerId, ...(res.json() as LaunchResponse) };
  };
  const call = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const play = (token: string, body: { stepId: string; action: string; bet?: number }) => call(token, 'POST', '/api/play', body);

  it('launch creates a player with the demo balance and a session token', async () => {
    const l = await launch();
    expect(l.token.length).toBeGreaterThan(20);
    expect(l.snapshot.balance).toBe(START_BALANCE);
    expect(l.snapshot.round).toBeNull();
    expect(l.history).toEqual([]);
    expect(l.rules.maxWinX).toBeGreaterThan(0);
  });

  it('rejects requests without a valid token and malformed bodies', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    expect((await call('nope', 'GET', '/api/session')).json().code).toBe('UNAUTHORIZED');
    expect((await app.inject({ method: 'POST', url: '/api/launch', payload: { playerId: 'x' } })).statusCode).toBe(400);
    const { token } = await launch();
    expect((await play(token, { stepId: sid(), action: 'spin', bet: 123 })).statusCode).toBe(400);
  });

  it('one paid spin debits once; repeating the stepId returns the same result without a second debit', async () => {
    provider.use({ reels: [NOTHING] });
    const { token, playerId } = await launch();
    const stepId = sid();
    const a = (await play(token, { stepId, action: 'spin', bet: 100 })).json() as StepResult;
    const b = (await play(token, { stepId, action: 'spin', bet: 100 })).json() as StepResult;
    expect(b).toEqual(a);
    expect(a.balanceAfter).toBe(START_BALANCE - 100);
    const snap = (await call(token, 'GET', '/api/session')).json() as SessionSnapshot;
    expect(snap.balance).toBe(START_BALANCE - 100);
    expect(START_BALANCE + (await repo.ledgerTotal(playerId))).toBe(snap.balance);
  });

  it('two identical requests at the same moment commit one step', async () => {
    provider.use({ reels: [NOTHING] });
    const { token } = await launch();
    const stepId = sid();
    const [a, b] = await Promise.all([play(token, { stepId, action: 'spin', bet: 200 }), play(token, { stepId, action: 'spin', bet: 200 })]);
    expect(a.json()).toEqual(b.json());
    expect(((await call(token, 'GET', '/api/session')).json() as SessionSnapshot).balance).toBe(START_BALANCE - 200);
    expect(((await call(token, 'GET', '/api/history')).json() as RoundRecord[]).length).toBe(1);
  });

  it('engine errors become HTTP statuses', async () => {
    const { token } = await launch();
    expect((await play(token, { stepId: sid(), action: 'respin' })).statusCode).toBe(409);
    expect((await play(token, { stepId: sid(), action: 'respin' })).json().code).toBe('UNEXPECTED_ACTION');
  });

  it('a Salvage round survives a new session mid-bonus and lands in history with a balanced ledger', async () => {
    provider.use({ reels: [SIX], respins: [[], [], []], mysteries: [] });
    const first = await launch();
    const spin = (await play(first.token, { stepId: sid(), action: 'spin', bet: 100 })).json() as StepResult;
    expect(spin.salvageTriggered).toBe(true);
    await play(first.token, { stepId: sid(), action: 'respin' });

    // «перезавантаження»: новий запуск того самого гравця бачить незавершений бонус
    const again = await launch(first.playerId);
    expect(again.snapshot.round?.salvage?.phase).toBe('respin');
    let next = again.snapshot.round ? 'respin' : 'none';
    let last: StepResult | null = null;
    while (next !== 'none') {
      last = (await play(again.token, { stepId: sid(), action: next })).json() as StepResult;
      next = last.next;
    }
    expect(last!.roundComplete).toBe(true);
    const hist = (await call(again.token, 'GET', '/api/history')).json() as RoundRecord[];
    expect(hist[0].roundId).toBe(spin.roundId);
    expect(hist[0].steps.at(-1)!.action).toBe('collect');
    expect(hist[0].features).toContain('salvage');
    expect(START_BALANCE + (await repo.ledgerTotal(first.playerId))).toBe(last!.balanceAfter);
  });

  it('top-up and reset work only between rounds', async () => {
    provider.use({ reels: [SIX], respins: [landing(['P1', 1, 0])] });
    const { token } = await launch();
    await play(token, { stepId: sid(), action: 'spin', bet: 100 });
    expect((await call(token, 'POST', '/api/topup')).statusCode).toBe(409);
    const reset = (await call(token, 'POST', '/api/reset')).json() as SessionSnapshot;
    expect(reset.balance).toBe(START_BALANCE);
    expect(reset.round).toBeNull();
    expect(((await call(token, 'POST', '/api/topup')).json() as SessionSnapshot).balance).toBeGreaterThan(START_BALANCE);
    expect((await call(token, 'GET', '/api/history')).json()).toEqual([]);
  });
});
