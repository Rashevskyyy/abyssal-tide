# slotkit

Slot games in TypeScript, PixiJS v8 and GSAP by Oleksii Rashevskyi. Each game has its own rules engine, math and art; they share one kit of packages and one game server. Adding a game means adding a folder under `games/`.

| Game | What it is | Demo |
|---|---|---|
| [Abyssal Tide](games/abyssal-tide/README.md) | 5×3, 25 lines, Free Dives, Hold & Win with 3 Pots, a Spine character, a cyanotype look. Runs offline or against the game server. | [Play](https://rashevskyyy.github.io/slotkit/abyssal-tide/play/index.html) · [Case study](https://rashevskyyy.github.io/slotkit/abyssal-tide/) |
| [Petrykivka Bloom](games/petrykivka-bloom/README.md) | 7×7 cluster pays with tumbles, bloom multipliers up to ×128 and free spins, painted in the Petrykivka folk style. | [Play](https://rashevskyyy.github.io/slotkit/petrykivka-bloom/play/index.html) |

## The kit

| Package | What it does |
|---|---|
| [`@slotkit/rules`](packages/rules/README.md) | Seeded and crypto RNG, the max win cap and market profiles (UK Gambling Commission and default). No DOM. |
| [`@slotkit/core`](packages/core/README.md) | Game time on the GSAP ticker, skippable episodes, speed profiles, money formatting and diagnostics. |
| [`@slotkit/controls`](packages/controls/README.md) | Bet panel, spin button with quick stop and hold, autoplay with stop conditions, popovers. |
| [`@slotkit/paytable`](packages/paytable/README.md) | Paytable and rules as data, rendered the same way for every game and themed with CSS variables. |
| [`@slotkit/board`](packages/board/README.md) | A PixiJS reel board for line slots. |
| [`@slotkit/symbols-cyanotype`](packages/symbols-cyanotype/README.md) | Abyssal Tide's symbol pack and Spine character, with a gallery page. |

The packages are npm workspaces that export TypeScript sources, so games and packages typecheck and build together. None of them knows any game's rules.

The [game server](server/README.md) (Fastify, PostgreSQL, server-side crypto RNG, idempotent steps and a ledger) currently serves Abyssal Tide; Petrykivka Bloom's engine has the same `step()` shape and joins it next.

## Run

```bash
npm install
npm run abyssal                          # Abyssal Tide at http://localhost:5173
npm run dev -w @games/petrykivka-bloom   # Petrykivka Bloom
npm run typecheck
npm test                                 # unit tests of every game, package and the server
npm run server                           # game server on :8787
docker compose up --build                # PostgreSQL + server + Abyssal Tide at http://localhost:8080
```

Each game's README lists its own commands (simulation, assets, video, e2e).

## Layout

```
games/
  abyssal-tide/       5×3 line slot: engine, client, case study site, e2e
  petrykivka-bloom/   7×7 cluster slot: engine, client, math notes
packages/             @slotkit/* shared by the games
server/               game server (RGS-style HTTP API) around a game's engine
site/                 the GitHub Pages front page listing the games
```

CI (`.github/workflows/ci.yml`) typechecks, runs every unit test (the server also against PostgreSQL) and Abyssal Tide's Playwright e2e. On `main` it builds the site: this list at the root, each game in its own folder with the demo in `play/`, and deploys it to GitHub Pages.

Comments and design docs are in Ukrainian; READMEs are in English. Demo credits only, no real money.
