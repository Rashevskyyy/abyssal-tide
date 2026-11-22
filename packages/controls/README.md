# @slotkit/controls

DOM controls for a slot bottom bar, modelled on how 3 Oaks games behave. They have no framework, no canvas and no game state: each widget renders into an element you give it and reports back through callbacks.

| Export | Purpose |
| --- | --- |
| `bindSpinButton(btn, { down, up, beforeDown })` | Reacts on press, not on click, so the same button gives spin, quick stop and hold-to-turbo. Keyboard and assistive-tech clicks count as a press and release. Returns an unbind function. |
| `BetPanel` | A grid of bet levels with the current one marked. `render(current)`, `setTitle()`. |
| `AutoplayPanel` | Round counts plus stop conditions: on feature, on any win, single win above, balance up by, balance down by. `setLabels()` for i18n, `render()`, `read()`. |
| `shouldStopAutoplay(cfg, progress)` | A pure check run after each round. Tested without a DOM. |
| `parseMoneyInput`, `moneyInputValue` | Converts "2,50" and "2.5" to cents and back. Empty or zero disables the condition. |
| `Popovers` | Opens one panel at a time, keeps `aria-expanded` in sync, moves focus into the panel, and closes on outside press or Escape. |

## Example

```ts
import '@slotkit/controls/controls.css';
import { BetPanel, AutoplayPanel, Popovers, bindSpinButton } from '@slotkit/controls';

const bet = new BetPanel(betEl, { values: BETS, format: formatMoney, onPick: (v) => game.setBet(v) });
const auto = new AutoplayPanel(autoEl, { initial: savedAuto, onStart: (cfg) => game.startAuto(cfg) });
const pops = new Popovers([{ panel: bet.el, trigger: betBtn }, { panel: auto.el, trigger: autoBtn }]);

bindSpinButton(spinBtn, { down: () => game.spinDown(), up: () => game.spinUp() });
betBtn.onclick = () => pops.toggle(bet.el);
```

## Styling

`controls.css` uses `sk-` classes and reads the game's CSS custom properties (`--ink`, `--paper`, `--mat`, `--mat-line`, `--ink-soft`, `--mono`) with fallbacks. To restyle, override the variables rather than the selectors.

On short screens (height up to 700 px) the panels use compact rows so autoplay fits without scrolling. On a phone held sideways (landscape, height up to 520 px), the autoplay panel switches to two columns: round counts and Start on the left, stop conditions on the right.
