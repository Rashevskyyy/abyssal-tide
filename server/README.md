# Abyssal Tide game server

The server runs the same pure engine as the offline demo (`games/abyssal-tide/src/engine`, `step(state, request, provider)`) behind an HTTP API shaped like a remote game server (RGS). It adds what a browser cannot do on its own:

- **Server-side RNG.** It uses `crypto.getRandomValues`, with no recoverable seed and unbiased integer ranges. The client only plays back results.
- **Transactions.** Every request from a player is one Postgres transaction that starts with `SELECT … FOR UPDATE` on that player's state row. The step, the finished round, the ledger entries and the new engine state are committed together or not at all.
- **Idempotency.** Steps are stored by `(player, stepId)`. Repeating any earlier `stepId` (a double click, or a retry after a timeout) returns the stored result without a second debit. Two identical requests sent at the same moment are serialised by the row lock, so only one of them commits.
- **A ledger.** Bets, wins and demo top-ups are recorded as entries. The tests check that the start balance plus the ledger total equals the balance.
- **Market rules.** The jurisdiction chosen at launch sets the maximum win cap that the engine applies.

## API

All bodies are JSON. Every endpoint except `/api/launch` needs `Authorization: Bearer <token>`. Errors return `{ code, message }`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/launch` | `{ playerId, jurisdiction? }` | `{ token, snapshot, history, rules }` |
| GET | `/api/session` | | snapshot: balance, unfinished round, last board, pots |
| POST | `/api/play` | `{ stepId, action, bet? }` | `StepResult` |
| GET | `/api/history` | | last 30 rounds with their steps (for replay) |
| POST | `/api/topup` | | snapshot (demo only, between rounds) |
| POST | `/api/reset` | | snapshot (demo only) |
| GET | `/health` | | `{ ok: true }` |

Engine errors map to statuses: `UNAUTHORIZED` 401, `INSUFFICIENT_FUNDS` 402, `UNEXPECTED_ACTION` 409, `INVALID_BET` 422. Bodies are validated with JSON schemas, and invalid ones return 400.

The contract types live in `games/abyssal-tide/src/server/api.ts` and are shared with the client (`games/abyssal-tide/src/server/RemoteResultSource.ts`).

## Run

```bash
docker compose up --build          # Postgres + server + the game at http://localhost:8080
# or, with your own Postgres:
DATABASE_URL=postgres://user:pass@localhost:5432/abyssal npm run server
# without DATABASE_URL the server keeps everything in memory
```

Open the game against a running server with `?server=http://localhost:8787`, or build it with `VITE_SERVER_URL`. If the server cannot be reached, the game falls back to the offline demo and shows a notice.

## Schema

`players`, `sessions` (token, jurisdiction), `game_state` (engine state as `jsonb`), `steps` (primary key `player_id, step_id`), `rounds` (history and replay), `ledger`. The SQL is in `src/pg.ts` and is applied on start.

## Tests

```bash
npm test                 # API scenarios against in-memory storage
npm run test:pg          # the same scenarios against Postgres (DATABASE_URL, defaults to localhost:5433)
```

The scenarios cover launch, auth and validation, a single debit for a repeated `stepId`, two identical requests arriving at the same moment, error statuses, a Salvage round interrupted by a new session and finished afterwards (with history and a balanced ledger), and top-up and reset rules.
