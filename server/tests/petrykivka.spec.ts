/**
 * Petrykivka Bloom через HTTP API того самого сервера: сесія, ідемпотентні кроки, бонус до кінця,
 * журнал сходиться з балансом, ринок UKGC забороняє купівлю, токени двох ігор не змішуються.
 * Сховище — у пам’яті завжди, Postgres — коли задано DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RandomOutcomeProvider } from '../../games/petrykivka-bloom/src/engine/outcome';
import { START_BALANCE } from '../../games/petrykivka-bloom/src/shared/config';
import type { StepResult } from '../../games/petrykivka-bloom/src/shared/types';
import { RandomOutcomeProvider as AbyssalProvider } from '../../games/abyssal-tide/src/engine/outcome';
import { buildApp } from '../src/app';
import { PgRepository } from '../src/pg';
import { MemoryRepository, type Repository } from '../src/repo';
import { GameService } from '../src/service';
import { PetrykivkaService, storageId, type PbLaunchResponse, type PbRoundRecord, type PbSnapshot } from '../src/petrykivka';

let seq = 0;
const pid = () => `pb-player-${Date.now().toString(36)}-${++seq}`;
const sid = () => `pb-${Date.now().toString(36)}-${++seq}`;

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

describe.each(suites)('Petrykivka Bloom API (%s)', (_name, makeRepo) => {
  let app: FastifyInstance;
  let repo: Repository;
  let pb: PetrykivkaService;

  beforeAll(async () => {
    repo = await makeRepo();
    // сид 10466: перший же спін запускає фриспіни (той самий, що в демо-сценарії «Free spins»)
    pb = new PetrykivkaService(repo, new RandomOutcomeProvider(10466));
    app = await buildApp(new GameService(repo, new AbyssalProvider(1)), { petrykivka: pb });
  });
  afterAll(async () => {
    await app.close();
    await repo.close();
  });

  const launch = async (jurisdiction?: string) => {
    const playerId = pid();
    const res = await app.inject({ method: 'POST', url: '/api/petrykivka-bloom/launch', payload: { playerId, ...(jurisdiction ? { jurisdiction } : {}) } });
    expect(res.statusCode).toBe(200);
    return { playerId, ...(res.json() as PbLaunchResponse) };
  };
  const call = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url: `/api/petrykivka-bloom${url}`, payload, headers: { authorization: `Bearer ${token}` } });

  it('запуск: стартовий баланс, сітка 7×7, правила ринку', async () => {
    const l = await launch();
    expect(l.game).toBe('petrykivka-bloom');
    expect(l.snapshot.balance).toBe(START_BALANCE);
    expect(l.snapshot.lastGrid).toHaveLength(49);
    expect(l.rules.maxWinX).toBe(5000);
  });

  it('раунд із бонусом до кінця: повтор кроку не списує вдруге, журнал = баланс, раунд в історії', async () => {
    const { token, playerId } = await launch();
    const first = sid();
    const spin = (await call(token, 'POST', '/play', { stepId: first, action: 'spin', bet: 100 })).json() as StepResult;
    const again = (await call(token, 'POST', '/play', { stepId: first, action: 'spin', bet: 100 })).json() as StepResult;
    expect(again).toEqual(spin);
    let last = spin;
    let steps = 1;
    while (last.next === 'freeSpin') {
      const r = await call(token, 'POST', '/play', { stepId: sid(), action: 'freeSpin' });
      expect(r.statusCode).toBe(200);
      last = r.json() as StepResult;
      steps++;
    }
    expect(steps).toBeGreaterThan(10);
    const snap = (await call(token, 'GET', '/session')).json() as PbSnapshot;
    expect(snap.balance).toBe(last.balanceAfter);
    expect(snap.round).toBeNull();
    expect(START_BALANCE + (await pb.ledgerTotal(storageId(playerId)))).toBe(snap.balance);
    const hist = (await call(token, 'GET', '/history')).json() as PbRoundRecord[];
    expect(hist[0].roundId).toBe(spin.roundId);
    expect(hist[0].features).toContain('freeSpins');
    expect(hist[0].steps).toHaveLength(steps);
    expect(hist[0].win).toBe(last.roundWin);
  });

  it('неочікувана дія — 409, ставка поза списком — 400, без токена — 401', async () => {
    const { token } = await launch();
    expect((await call(token, 'POST', '/play', { stepId: sid(), action: 'freeSpin' })).statusCode).toBe(409);
    expect((await call(token, 'POST', '/play', { stepId: sid(), action: 'spin', bet: 25 })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/petrykivka-bloom/session' })).statusCode).toBe(401);
  });

  it('UKGC: купівля бонусу заборонена на сервері, не лише в інтерфейсі', async () => {
    const uk = await launch('ukgc');
    const r = await call(uk.token, 'POST', '/play', { stepId: sid(), action: 'spin', bet: 100, buy: true });
    expect(r.statusCode).toBe(400);
    const def = await launch();
    const ok = (await call(def.token, 'POST', '/play', { stepId: sid(), action: 'spin', bet: 100, buy: true })).json() as StepResult;
    expect(ok.cost).toBe(10_000);
    expect(ok.next).toBe('freeSpin');
  });

  it('токени двох ігор не змішуються', async () => {
    const { token } = await launch();
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    const ab = await app.inject({ method: 'POST', url: '/api/launch', payload: { playerId: pid() } });
    const abToken = (ab.json() as { token: string }).token;
    expect((await call(abToken, 'GET', '/session')).statusCode).toBe(401);
  });
});
