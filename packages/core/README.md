# @slotkit/core

Game time and shared runtime for slot clients. No rendering and no DOM widgets, so any game or other `@slotkit` package can depend on it.

## What's inside

| Export | Purpose |
| --- | --- |
| `wait(ms)`, `play(timeline)` | Promises driven by the GSAP ticker, not `setTimeout`. Pausing or scaling GSAP pauses and scales the game. `play()` also resolves if the timeline is killed, so a flow never hangs on a dead tween. |
| `Episode` | A skippable sequence (win presentation, bonus intro). `skip()` jumps every running wait or timeline to its end. |
| `Signal<T>` | A one-shot promise that you resolve from outside, for example a button press that ends a screen. |
| `runtime`, `SPEED_PROFILES` | Current speed profile (normal, quick, turbo) and the reduced-motion flag. The game writes these; reels, screens and animations read them. |
| `createMoneyFormat({ currency, locale })` | `formatMoney` / `formatMoneyShort` for integer cents. The locale is a function, so a language switch takes effect right away. |
| `diagnostics`, `installErrorTraps()`, `diagnosticsReport(extra)` | A ring buffer of recent events and errors, plus a text report a player can copy and send when something goes wrong. |

## Example

```ts
import { Episode, runtime, SPEED_PROFILES, createMoneyFormat } from '@slotkit/core';

runtime.profile = SPEED_PROFILES.quick;
const { formatMoney } = createMoneyFormat({ currency: 'EUR', locale: () => 'en-GB' });

const ep = new Episode();
await ep.play(bigWinTimeline); // a click can call ep.skip()
await ep.wait(runtime.profile.smallWin);
console.log(formatMoney(1240)); // €12.40
```

## Notes

- Money is always integer cents. Floats never reach the formatter.
- `gsap` is a peer dependency. The game decides `lagSmoothing` and whether to drive the ticker manually.
