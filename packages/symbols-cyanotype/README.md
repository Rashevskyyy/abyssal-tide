# @slotkit/symbols-cyanotype

A symbol pack for `@slotkit/board` in the style of Anna Atkins' cyanotype photograms: pale silhouettes on Prussian blue, with museum-label plaques and a coral pencil mark on the sealed shell. All artwork is procedural SVG, rasterised at load into a normal and a spin-blurred texture, so the package ships no image files.

## Contents

- 16 symbols: four runes, compass, diving helmet, nautilus, Wild lantern, Scatter map, pearl, black pearl (Super), sealed shell and four jackpot medallions. The open-shell frame is included for reveals.
- A motion preset for each symbol (`MOTION`): runes pulse, the compass swings, the helmet floats, the nautilus rolls, the lantern flickers, the map unfolds, and bonus symbols use a restrained `soft`.
- FX textures for the board: a soft "exposure" glow and a ring for landing ripples.
- `previews`: data URLs of every symbol for DOM use (paytable, start screen).

## Usage

```ts
import { createCyanotypePack } from '@slotkit/symbols-cyanotype';
import { SymbolView } from '@slotkit/board';

await document.fonts.load('500 20px "IBM Plex Mono"');
const pack = await createCyanotypePack({ mono: '"IBM Plex Mono"', stencil: '"Big Shoulders Stencil Display"' });

const s = new SymbolView(pack);
s.set({ s: 'COMPASS' });
s.startWin(); // swings
```

Fonts must be loaded before `createCyanotypePack()`, because the plaques are drawn into the textures.

## Prebuilt atlas and the Spine character

`npm run assets` (from the repo root) builds the files in `assets/`:

1. Headless Chrome (Playwright) renders the same SVG art to PNG.
2. AssetPack packs the symbols into one atlas (`symbols.png` plus a Pixi spritesheet JSON) and compresses it.
3. The parts of the big-win character are packed the same way, then written as a Spine atlas (`diver.atlas`) next to the skeleton (`diver-skeleton.json`).

```ts
import { loadCyanotypeAtlasPack, loadDiverSkeleton } from '@slotkit/symbols-cyanotype';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

const pack = await loadCyanotypeAtlasPack();     // same CyanotypePack, no SVG rasterising at start-up
const diver = new Spine({ skeletonData: await loadDiverSkeleton() });
diver.state.setAnimation(0, 'intro', false);
diver.state.addAnimation(0, 'idle', true, 0);
```

The diver is a diving helmet with portholes, a valve, rising bubbles, two algae fronds and light rays. It has 16 bones, 13 slots and three animations: `intro` (it surfaces with a squash and the fronds whip back), a seamless 2.4-second `idle` loop, and `outro`. The skeleton is generated in code (`src/diver.ts`) in Spine 4.3 JSON format and read by the official runtime, so it can be imported and refined in the Spine editor (the part images are written to `raw-assets/diver{tps}/`). The Spine runtimes need a Spine Editor licence.

The loaders import the assets with Vite's `?url` and `?raw` suffixes.

## Gallery

```bash
npm run gallery          # dev server
npm run gallery:build    # one self-contained HTML in gallery/dist/
```

The gallery shows every symbol on a single print, with buttons for land, win, throb, glint, lock and spin blur. Click a symbol to play its own motion. Below the symbols, the Spine character plays its intro, idle and outro animations.
