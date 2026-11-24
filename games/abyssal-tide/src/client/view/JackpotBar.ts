import gsap from 'gsap';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FULL_BOARD_AWARD, JACKPOTS, type JackpotId } from '../../shared/symbols';
import type { Art } from '../art/textures';
import { FONT_MONO, FONT_UI } from '../core/fonts';
import { formatMoney } from '../core/format';
import { settings } from '../core/settings';

type TagId = JackpotId | 'CROWN';

const TAGS: { id: TagId; name: string; x: number }[] = [
  { id: 'JP1', name: 'SHOAL', x: JACKPOTS.JP1.value },
  { id: 'JP2', name: 'REEF', x: JACKPOTS.JP2.value },
  { id: 'JP3', name: 'TRENCH', x: JACKPOTS.JP3.value },
  { id: 'JP4', name: 'ABYSS', x: JACKPOTS.JP4.value },
  { id: 'CROWN', name: 'TIDE CROWN', x: FULL_BOARD_AWARD },
];

/**
 * Рядок фіксованих нагород над полем — як джекпоти в Hold & Win іграх 3 Oaks.
 * Бирки показують суму в євро для поточної ставки; коли нагорода випадає в Salvage, бирка «спалахує».
 * На широкому екрані — один ряд із п’яти бирок; на портретному — два ряди (3 + 2) з більшим шрифтом,
 * бо поле там зменшене і дрібний текст не читається.
 */
export class JackpotBar extends Container {
  private readonly items = new Map<TagId, { box: Container; value: Text; halo: Sprite; maxW: number; w: number; h: number }>();
  private readonly progress = new Graphics();
  private filled: number | null = null;
  private crownPulse: gsap.core.Tween | null = null;
  private bet = 0;
  private tall: boolean | null = null;

  constructor(
    private readonly width_: number,
    private readonly art: Art,
  ) {
    super();
    this.arrange(false);
  }

  /** Висота блоку в одиницях дизайну для обраного компонування. */
  static height(tall: boolean): number {
    return tall ? 2 * 104 + 12 : 62;
  }

  arrange(tall: boolean): void {
    if (this.tall === tall) return;
    this.tall = tall;
    for (const { box, halo } of this.items.values()) gsap.killTweensOf([box.scale, halo]);
    this.crownPulse?.kill();
    this.crownPulse = null;
    this.progress.removeFromParent();
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.items.clear();
    const gap = tall ? 12 : 10;
    const h = tall ? 104 : 62;
    const perRow = tall ? 3 : TAGS.length;
    TAGS.forEach((tag, i) => {
      const row = Math.floor(i / perRow);
      const inRow = tall ? (row === 0 ? 3 : 2) : TAGS.length;
      const col = i - row * perRow;
      const w = (this.width_ - gap * (inRow - 1)) / inRow;
      const box = new Container();
      box.position.set(col * (w + gap) + w / 2, row * (h + gap) + h / 2);
      box.rotation = (i % 2 === 0 ? -1 : 1) * 0.012;
      const halo = new Sprite(this.art.fx.dot);
      halo.anchor.set(0.5);
      halo.width = w * 1.4;
      halo.height = h * 2.2;
      halo.alpha = 0;
      const top = tag.id === 'JP4' || tag.id === 'CROWN';
      const bg = new Graphics()
        .roundRect(-w / 2, -h / 2, w, h, 5)
        .fill({ color: top ? 0x10357a : 0xe9eef4 })
        .stroke({ color: top ? 0xf4f8ff : 0xc3cedc, width: top ? 2 : 1.5, alpha: top ? 0.6 : 1 });
      bg.circle(-w / 2 + 11, -h / 2 + 11, 3.2).fill({ color: top ? 0xe9eef4 : 0x10357a, alpha: 0.5 });
      const name = new Text({
        text: tag.name,
        style: { fontFamily: FONT_MONO, fontWeight: '500', fontSize: tall ? 26 : 16, fill: top ? '#C9D8F0' : '#4A6A9E', letterSpacing: 1 },
      });
      name.anchor.set(0.5);
      name.y = tall ? -24 : -15;
      const value = new Text({ text: '', style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: tall ? 42 : 26, fill: top ? '#FF7A6B' : '#D93D2C' } });
      value.anchor.set(0.5);
      value.y = tall ? 13 : 8; // знизу лишається місце під рисочки заповнення в Salvage
      box.addChild(halo, bg, name, value);
      this.addChild(box);
      this.items.set(tag.id, { box, value, halo, maxW: w - 20, w, h });
    });
    this.items.get('CROWN')!.box.addChild(this.progress);
    if (this.bet) this.setBet(this.bet);
    this.setProgress(this.filled);
  }

  /**
   * Заповненість поля в Salvage — 15 коралових рисок по нижньому краю бирки Tide Crown:
   * видно, скільки лишилось до повного поля. Коли лишається дві клітини чи менше, бирка пульсує. null — сховати.
   */
  setProgress(filled: number | null): void {
    const prev = this.filled;
    this.filled = filled;
    const crown = this.items.get('CROWN')!;
    this.progress.clear();
    if (filled === null) {
      this.pulseCrown(false);
      return;
    }
    const n = 15;
    const pad = 12;
    const gap = 3;
    const sw = (crown.w - pad * 2 - gap * (n - 1)) / n;
    const y = crown.h / 2 - (this.tall ? 12 : 8);
    for (let i = 0; i < n; i++) {
      const x = -crown.w / 2 + pad + i * (sw + gap);
      this.progress.roundRect(x, y, sw, 4, 2).fill({ color: i < filled ? 0xff5b4a : 0xf4f8ff, alpha: i < filled ? 1 : 0.22 });
    }
    if (prev !== null && filled > prev && !settings.reducedMotion) {
      gsap.fromTo(crown.box.scale, { x: 1.05, y: 1.05 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    }
    this.pulseCrown(filled >= n - 2 && filled < n);
  }

  private pulseCrown(on: boolean): void {
    const crown = this.items.get('CROWN')!;
    if (on === !!this.crownPulse) return;
    this.crownPulse?.kill();
    this.crownPulse = null;
    if (!on) {
      gsap.to(crown.halo, { alpha: 0, duration: 0.3 });
      return;
    }
    this.crownPulse = gsap.fromTo(crown.halo, { alpha: 0.1 }, { alpha: settings.reducedMotion ? 0.3 : 0.65, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  setBet(bet: number): void {
    this.bet = bet;
    for (const tag of TAGS) {
      const item = this.items.get(tag.id)!;
      item.value.scale.set(1);
      item.value.text = formatMoney(tag.x * bet);
      if (item.value.width > item.maxW) item.value.scale.set(item.maxW / item.value.width);
    }
  }
  /** Нагорода випала: бирка підстрибує й засвічується. */
  flash(id: TagId): void {
    const item = this.items.get(id);
    if (!item) return;
    gsap.killTweensOf([item.box.scale, item.halo]);
    if (settings.reducedMotion) {
      gsap.fromTo(item.halo, { alpha: 0.5 }, { alpha: 0, duration: 0.8 });
      return;
    }
    gsap.fromTo(item.box.scale, { x: 1.14, y: 1.14 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(3)' });
    gsap.fromTo(item.halo, { alpha: 0.7 }, { alpha: 0, duration: 0.9, ease: 'sine.out' });
  }
}
