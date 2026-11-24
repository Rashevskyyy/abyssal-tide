/**
 * HTTP-шар (Fastify): перевірка запитів схемами, токен сесії, помилки рушія → HTTP-статуси.
 * Контракт описаний у src/server/api.ts і спільний із клієнтом.
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { EngineError } from '../../games/abyssal-tide/src/engine/engine';
import { BETS } from '../../games/abyssal-tide/src/shared/config';
import { isJurisdictionId } from '../../games/abyssal-tide/src/shared/jurisdiction';
import type { Action } from '../../games/abyssal-tide/src/shared/types';
import { PLAYER_ID, STATUS, type ApiError } from '../../games/abyssal-tide/src/server/api';
import type { SourceErrorCode } from '../../games/abyssal-tide/src/server/protocol';
import type { GameService } from './service';
import { NotFoundError, type SessionInfo } from './repo';

declare module 'fastify' {
  interface FastifyRequest {
    player: SessionInfo;
  }
}

export interface AppOptions {
  /** Дозволені джерела для CORS: true — будь-яке (демо), рядок — список через кому. */
  corsOrigin?: boolean | string;
  logger?: boolean;
}

class HttpError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const ACTIONS: Action[] = ['spin', 'freeSpin', 'respin', 'collect'];

export async function buildApp(service: GameService, opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 16 * 1024 });
  const origin = typeof opts.corsOrigin === 'string' ? opts.corsOrigin.split(',').map((s) => s.trim()) : (opts.corsOrigin ?? true);
  await app.register(cors, { origin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] });

  app.decorateRequest('player', null as unknown as SessionInfo);

  app.setErrorHandler((err, _req, reply) => {
    let body: ApiError;
    if (err instanceof EngineError || err instanceof HttpError) body = { code: err.code, message: err.message };
    else if (err instanceof NotFoundError) body = { code: 'UNAUTHORIZED', message: 'Unknown player' };
    else if ((err as { validation?: unknown }).validation) body = { code: 'BAD_REQUEST', message: (err as Error).message };
    else {
      app.log.error(err);
      return reply.status(500).send({ code: 'NETWORK', message: 'Internal error' });
    }
    return reply.status(STATUS[body.code] ?? 400).send(body);
  });

  const auth = async (req: FastifyRequest) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const s = token ? await service.repo.session(token) : null;
    if (!s) throw new HttpError('UNAUTHORIZED', 'Missing or unknown session token');
    req.player = s;
  };

  app.get('/health', async () => ({ ok: true }));

  app.post<{ Body: { playerId: string; jurisdiction?: string } }>(
    '/api/launch',
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
      if (!isJurisdictionId(j)) throw new HttpError('BAD_REQUEST', `Unknown jurisdiction ${j}`);
      return service.launch(req.body.playerId, j);
    },
  );

  app.get('/api/session', { onRequest: auth }, async (req) => service.snapshot(req.player.playerId));
  app.get('/api/history', { onRequest: auth }, async (req) => service.history(req.player.playerId));

  app.post<{ Body: { stepId: string; action: Action; bet?: number } }>(
    '/api/play',
    {
      onRequest: auth,
      schema: {
        body: {
          type: 'object',
          required: ['stepId', 'action'],
          additionalProperties: false,
          properties: {
            stepId: { type: 'string', minLength: 1, maxLength: 64 },
            action: { type: 'string', enum: ACTIONS },
            bet: { type: 'integer', enum: [...BETS] },
          },
        },
      },
    },
    async (req) => service.play(req.player, req.body),
  );

  app.post('/api/topup', { onRequest: auth }, async (req) => service.topUp(req.player.playerId));
  app.post('/api/reset', { onRequest: auth }, async (req) => service.reset(req.player.playerId));

  return app;
}
