# Petrykivka Bloom

A 7×7 cluster slot with tumbles and **bloom multipliers**, painted in the style of Petrykivka decorative painting. It is the second game in the [slotkit](../../README.md) monorepo: the market rules, controls and paytable come from the shared `@slotkit/*` packages, and the grid engine, math and client are new.

Status: playable demo. The engine, math and client are done. Next: the game server, a case study page and a final pass on art and sound.

| Free spins: flowers stay on the board | The Stroke paints buds before a spin |
|---|---|
| ![Mid-bonus board with ×2 to ×16 flowers](docs/screenshots/bonus-flowers.jpg) | ![A brush stroke crossing the empty board](docs/screenshots/stroke.jpg) |
| **Phone, portrait** | **Rules on a phone** |
| <img src="docs/screenshots/phone.jpg" alt="Portrait layout" width="260"> | <img src="docs/screenshots/rules-phone.jpg" alt="Paytable on a phone" width="260"> |

## How it plays

- **Clusters.** 5 or more matching symbols touching up, down, left or right win. Winners burst, the symbols above fall and new ones drop in. The tumbles go on while clusters form.
- **Bloom multipliers.** A cell where a winner bursts gets a bud. The next win there opens a ×2 flower, and every further win doubles it, up to ×128. The flowers under a cluster add up and multiply its pay. In the base game they clear after the spin; in free spins they stay until the bonus ends.
- **The Stroke.** About one base spin in 25 starts with a brush stroke across the board that leaves buds on its path, some of them opened into ×2 flowers. Every bonus starts with one.
- **Free spins.** 3, 4, 5 or 6–7 painted plates give 10, 12, 15 or 20 spins; 3 more during the bonus add 5.
- **Ante bet** (×1.25 per spin) makes the bonus about 1.55 times more frequent. **Bonus buy** starts 10 spins for 100× bet. Both keep the RTP.

## What it shows

- **The whole spin comes from one pure call.** `step(state, request, provider, rules)` returns the starting grid, the Stroke, every tumble (clusters, pays, multipliers, burst cells, refills, cell levels) and the final plates. The client only plays this list back, so the same engine runs in the browser, in tests and in the simulation, and can run on the server unchanged.
- **Grid geometry kept apart from rules.** `engine/grid.ts` finds clusters with a flood fill and collapses columns; `fallPlan()` tells the client which symbol fell from which row.
- **Math tuned by simulation.** A multi-threaded simulator (`worker_threads`) reports the RTP with a 95% confidence interval, the base and bonus shares, frequencies and the win distribution. The RTP was split into a low-variance base part and bonus values by length to tune the weights. See [docs/MATH.uk.md](docs/MATH.uk.md).
- **Money in whole cents.** Pays are stored in twentieths of the bet and bets are multiples of 20 cents, so no win is ever rounded.
- **Market rules from `@slotkit/rules`.** `?jurisdiction=ukgc` (or *Rules → UK (UKGC)*) applies at least 2.5 s between spins, no turbo or skipping, no bonus buy, no celebration of wins at or below the stake, and the session result and time on screen.
- **Art and sound in code.** Every symbol is built from the basic Petrykivka brush strokes (the seed, the comb, the curl) on Canvas 2D, each with its own silhouette so the board reads without colour. The Stroke is a PixiJS `MeshRope` along a Bézier curve. Sound is synthesised with WebAudio on a D-minor pentatonic scale: plucked strings, bells and a brush swish.
- **Layouts for every screen.** The board and the controls sit side by side on a monitor or a phone held sideways, and stack on a portrait phone. Short landscape screens get a compact control column. A bonus in progress continues after a page reload.

## What it reuses

| From the kit | New in this game |
|---|---|
| `@slotkit/rules`: RNG, max win cap, market profiles | 7×7 grid engine: clusters, tumbles, bloom levels, the Stroke |
| `@slotkit/core`: game time, skippable episodes, money format | Board view: falling symbols, flowers, MeshRope stroke |
| `@slotkit/controls`: bet panel, spin button, popovers | Math model and simulator |
| `@slotkit/paytable`: rules and pays as data | Petrykivka symbol art and sound |

## Run

From the repository root:

```bash
npm install
npm run dev -w @games/petrykivka-bloom      # http://localhost:5173
npm test                                    # all unit tests, this game's are in games/petrykivka-bloom/tests
npm run sim -w @games/petrykivka-bloom -- 10000000 2027 2   # rounds, seed, threads
npm run build -w @games/petrykivka-bloom    # games/petrykivka-bloom/dist/
```

## Layout

```
src/engine/    grid.ts (clusters, collapse), engine.ts (step), outcome.ts (RNG provider, Stroke), model.ts (weights)
src/shared/    config, symbols and paytable, step types
src/client/    art.ts (Canvas brush strokes), BoardView.ts (Pixi), Flow.ts, Hud.ts, rules.ts, sound.ts, source.ts
scripts/       simulate.ts
tests/         grid, engine and math tests
docs/          MATH.uk.md, screenshots
```

Comments and docs are in Ukrainian, like the rest of the repository; this README is in English.
