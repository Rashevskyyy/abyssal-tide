# @slotkit/board

A PixiJS v8 reel board for line slots. Reels stop strictly left to right and support quick stop and anticipation. Symbols animate through motion presets, and win lines are drawn by hand in pencil. The board knows nothing about pays or the math: it receives the final grid and a stop plan.

## Pieces

| Export | Purpose |
| --- | --- |
| `ReelSet` | Columns of `Reel`s with strips per game mode (`setMode('freeDives')`). `spin()`, `stop(board, plan)`, `requestQuickStop()`, `washAway()`. |
| `StopPlan` | Per-reel delays and anticipation flags. The game computes these from the outcome, and the board only plays them. |
| `SymbolView` | One symbol with land pop, win, throb, glint, lock flash, dim and spin blur. Every animation runs on an inner `body` layer and starts from a reset, so effects never fight or leave a half-scaled sprite. |
| `SymbolPack` | Interface for the art: textures (normal + blurred), a `MotionPreset` per symbol, which ones are bonus symbols, glow colour and FX textures. |
| `WinPresenter` | Shows all winning lines, then cycles them one by one while the board is idle. |
| `pencilLine`, `pencilLoop` | Wobbly hand-drawn strokes for paylines and anticipation brackets. |

## Extending a symbol

A game subclasses `SymbolView` to add its own decorations, such as value tags on cash symbols or collect marks:

```ts
class GameSymbol extends SymbolView<SymbolId, Cell> {
  protected override decorate(ctx: { bet: number }) {
    this.tag.text = this.cell?.v ? formatMoney(this.cell.v * ctx.bet) : '';
  }
  protected override onBlur(on: boolean) {
    this.tag.alpha = on ? 0.35 : 1;
  }
}

const reels = new ReelSet({
  cols: 5, rows: 3, cellW: 200, cellH: 180,
  strips: { base: BASE_STRIPS, freeDives: FS_STRIPS },
  createSymbol: () => new GameSymbol(pack),
  keepBright: isTriggerSymbol,
});
```

## Motion presets

`pulse`, `swing`, `float`, `roll`, `flicker`, `unfold`, `soft`. A pack assigns one to each symbol, so the compass swings and the helmet floats without any game code. All timings come from `runtime.profile` in `@slotkit/core`. When `runtime.reducedMotion` is set, wins fall back to a glow with no movement.
