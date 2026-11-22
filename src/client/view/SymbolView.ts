import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { SymbolView as BoardSymbolView } from '@slotkit/board';
import type { CyanotypeArt, CyanotypePack } from '@slotkit/symbols-cyanotype';
import type { SymbolId } from '../../shared/symbols';
import type { Cell } from '../../shared/types';
import { cellValue } from '../../shared/values';
import { FONT_UI } from '../core/fonts';
import { formatMoneyShort } from '../core/format';
import { potToken } from './Jars';

/** Що гра передає символу при set(): ставка (для бирки номіналу) і чи діє Super. */
export interface SymbolCtx {
  bet: number;
  superActive?: boolean;
}

/**
 * Символ Abyssal Tide поверх символу з @slotkit/board:
 * коралова бирка-ціна під перлиною (номінал у євро для поточної ставки), напис у чорній перлині
 * і кольорова мітка 3 Pots. Анімації (посадка, виграш, пульс, блиск) — з пакета.
 */
export class SymbolView extends BoardSymbolView<SymbolId, Cell> {
  readonly valueText: Text;
  private readonly valueTag = new Container();
  private readonly valueBg = new Graphics();
  /** Мітка 3 Pots на перлині (кольоровий жетон угорі праворуч). */
  private readonly mark = new Sprite();

  constructor(private readonly cyano: CyanotypePack) {
    super(cyano);
    // номінал — коралова бирка-ціна під перлиною (у чорної перлини — напис усередині кільця)
    this.valueText = new Text({ text: '', style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 30, fill: '#FFFFFF', align: 'center' } });
    this.valueText.anchor.set(0.5);
    this.valueTag.addChild(this.valueBg, this.valueText);
    this.mark.anchor.set(0.5);
    this.mark.position.set(56, -54);
    this.mark.visible = false;
    this.body.addChild(this.valueTag, this.mark);
  }

  /** Сумісний із попереднім API виклик: set(cell, bet, superActive). */
  override set(cell: Cell | null, ctx?: unknown, superActive?: boolean): void {
    super.set(cell, typeof ctx === 'number' ? { bet: ctx, superActive } : ctx);
  }

  protected override decorate(ctx: unknown): void {
    const c = (ctx ?? { bet: 10 }) as SymbolCtx;
    this.updateValue(c.bet, !!c.superActive);
    this.applyMark();
  }

  protected override onBlur(on: boolean): void {
    this.valueTag.alpha = on ? 0.45 : 1;
    this.mark.alpha = on ? 0.45 : 1;
  }

  /** Кадр, якого немає серед символів, — відкрита мушля під час розкриття. */
  showArt(art: CyanotypeArt): void {
    this.setTexture(this.cyano.textureOf(art, this.blurred));
  }

  /** Посадка: карта теж отримує хвилю-кільце, як бонусні символи. */
  override pop(strength = 1, ripple = this.isBonus || this.cell?.s === 'MAP'): gsap.core.Timeline {
    return super.pop(strength, ripple);
  }

  /** Номінал перлини в євро: €0.20, €2 … */
  updateValue(bet: number, superActive: boolean): void {
    const c = this.cell;
    if (!c || (c.s !== 'PEARL' && c.s !== 'BLACK')) {
      this.valueTag.visible = false;
      return;
    }
    const text = formatMoneyShort(cellValue(c, superActive) * bet);
    this.valueText.text = text;
    this.valueTag.visible = true;
    this.valueBg.clear();
    if (c.s === 'BLACK') {
      // напис усередині кільця: кораловий на синьому
      this.valueText.style.fontSize = text.length <= 3 ? 40 : 32;
      this.valueText.style.fill = '#FF6B5B';
      this.valueText.style.stroke = { color: '#0B2A5E', width: 5, join: 'round' };
      this.valueTag.position.set(0, -12);
      return;
    }
    this.valueText.style.fontSize = text.length <= 3 ? 30 : 27;
    this.valueText.style.fill = '#FFFFFF';
    this.valueText.style.stroke = undefined as unknown as Text['style']['stroke'];
    const w = Math.max(64, this.valueText.width + 26);
    // бирка трохи «зім’ята» — кут нахилу залежить від номіналу, щоб поле не було механічним
    this.valueBg.roundRect(-w / 2, -20, w, 40, 6).fill({ color: superActive ? 0xff7a52 : 0xff5b4a });
    this.valueBg.circle(-w / 2 + 10, 0, 3.2).fill({ color: 0xf4f8ff });
    this.valueText.x = 5;
    this.valueTag.position.set(0, 60);
    this.valueTag.rotation = (((c.v ?? 1) % 3) - 1) * 0.04;
  }

  private applyMark(): void {
    const pot = this.cell?.s === 'PEARL' ? this.cell.pot : undefined;
    this.mark.visible = !!pot;
    if (!pot) return;
    this.mark.texture = potToken(pot);
    this.mark.width = this.mark.height = 44;
    this.mark.alpha = this.blurred ? 0.45 : 1;
    this.mark.rotation = 0;
  }

  /** Центр мітки в глобальних координатах (звідти вона злітає в банку). */
  markGlobal(): { x: number; y: number } {
    return this.mark.getGlobalPosition();
  }

  /** Мітка полетіла — на перлині її більше не видно. */
  hideMark(): void {
    this.mark.visible = false;
  }
}
