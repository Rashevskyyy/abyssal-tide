/**
 * Запуск сервера.
 *   PORT          — порт (8787)
 *   DATABASE_URL  — Postgres; без нього сервер працює в пам’яті (для швидкої перевірки)
 *   CORS_ORIGIN   — дозволені джерела через кому (за замовчуванням будь-яке — це демо)
 */
import { RandomOutcomeProvider } from '../../games/abyssal-tide/src/engine/outcome';
import { createCryptoRng } from '../../games/abyssal-tide/src/engine/rng';
import { buildApp } from './app';
import { PgRepository } from './pg';
import { MemoryRepository, type Repository } from './repo';
import { GameService } from './service';
import { PetrykivkaService } from './petrykivka';
import { RandomOutcomeProvider as PbOutcomeProvider } from '../../games/petrykivka-bloom/src/engine/outcome';

const port = Number(process.env.PORT ?? 8787);
const dbUrl = process.env.DATABASE_URL;

let repo: Repository;
if (dbUrl) {
  const pg = new PgRepository(dbUrl);
  await pg.migrate();
  repo = pg;
} else {
  console.warn('DATABASE_URL is not set — using in-memory storage (data is lost on restart)');
  repo = new MemoryRepository();
}

// RNG на сервері — криптографічний, без сиду; клієнт результат лише показує
const service = new GameService(repo, new RandomOutcomeProvider(createCryptoRng()));
const petrykivka = new PetrykivkaService(repo, new PbOutcomeProvider(createCryptoRng()));
const app = await buildApp(service, { corsOrigin: process.env.CORS_ORIGIN || true, logger: true, petrykivka });

const stop = async () => {
  await app.close();
  await repo.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ port, host: '0.0.0.0' });
