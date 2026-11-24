import { ReelSet, WinPresenter } from '@slotkit/board';
import type { CyanotypePack } from '@slotkit/symbols-cyanotype';
import { BASE_STRIPS, FREE_STRIPS } from '../../engine/model';
import { LINES } from '../../shared/config';
import { isTriggerSymbol, type SymbolId } from '../../shared/symbols';
import { COLS, ROWS, type Cell } from '../../shared/types';
import { FIELD } from '../art/textures';
import { FONT_UI } from '../core/fonts';
import { formatMoney } from '../core/format';
import { SymbolView } from './SymbolView';

/** Поле барабанів Abyssal Tide на @slotkit/board. */
export type GameReels = ReelSet<SymbolId, Cell, SymbolView>;
export type GameWins = WinPresenter<SymbolId, Cell, SymbolView>;

const FILLER_VALUES = [1, 1, 1, 2, 2, 3, 5, 10];

export function createReels(pack: CyanotypePack): { reels: GameReels; wins: GameWins } {
  const reels: GameReels = new ReelSet<SymbolId, Cell, SymbolView>({
    cols: COLS,
    rows: ROWS,
    cellW: FIELD.cellW,
    cellH: FIELD.cellH,
    strips: { base: BASE_STRIPS, freeDives: FREE_STRIPS },
    // перлина-заповнювач під час обертання отримує випадковий номінал
    filler: (s) => (s === 'PEARL' ? { s, v: FILLER_VALUES[Math.floor(Math.random() * FILLER_VALUES.length)] } : { s }),
    createSymbol: () => new SymbolView(pack),
    keepBright: (s) => isTriggerSymbol(s),
  });
  const wins: GameWins = new WinPresenter(reels, { lines: LINES, cellW: FIELD.cellW, cellH: FIELD.cellH, format: formatMoney, font: FONT_UI });
  return { reels, wins };
}
