# @slotkit/rules

Rules every slot in this repository shares, with no DOM and no game logic:

- `createRng(seed)` — a seeded mulberry32 PRNG for demos, simulations and replays; `createCryptoRng()` — `crypto.getRandomValues` with unbiased ranges for the server.
- `GameRules` and `capAward()` — the max win per round in bets, enforced the same way by every engine.
- `JURISDICTIONS` and `resolveJurisdiction()` — market profiles. `ukgc` follows the UK Gambling Commission technical standards: at least 2.5 s per game cycle, no turbo, quick spin, slam stop or autoplay, no celebration of wins at or below the stake, net position and session time on screen, a reality check and no bonus buy.
