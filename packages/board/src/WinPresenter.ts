import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { runtime, wait } from '@slotkit/core';
import type { ReelSet } from './Reels';
import type { SymbolView } from './SymbolView';
import type { BoardCell, WinLine } from './types';
import { CORAL_HEX, pencilLine, pencilLoop } from './pencil';

export interface WinPresenterOptions {
  /** Лінії гри: для кожної — номер ряду на кожному барабані. */
  lines: readonly (readonly number[])[];
  cellW: number;
  cellH: number;
  /** Сума лінії на бирці. */
  format(amount: number): string;
  font: string;
  /** Колір олівця (за замовчуванням кораловий). */
  ink?: number;
}

/**
 * Показ виграшів «кораловим олівцем»: дослідник обводить символи комбінації й проводить лінію.
 * Яскрава лінія — лише до останнього символу комбінації; далі тонкий пунктир, щоб було видно,
 * що решта клітин лінії у виграш не входить.
 */
export class WinPresenter<Id extends string, C extends BoardCell<Id>, V extends SymbolView<Id, C>> extends Container {
  private readonly ink = new Graphics();
  private readonly pill = new Container();
  private readonly pillBg = new Graphics();
  private readonly amountText: Text;
  private cycleTl: gsap.core.Timeline | null = null;
  private drawTween: gsap.core.Tween | null = null;
  private active_: WinLine[] = [];
  private readonly W: number;
  private readonly H: number;
  private readonly color: number;
  /** Сплеск бульбашок у клітині виграшного символу (підключає GameView). */
  onBurst: (x: number, y: number, delay: number) => void = () => undefined;
  /** Викликається разом із clear() — прибрати центральну суму. */
  onClear: () => void = () => undefined;

  constructor(
    private readonly reels: ReelSet<Id, C, V>,
    private readonly opts: WinPresenterOptions,
  ) {
    super();
    this.W = opts.cellW;
    this.H = opts.cellH;
    this.color = opts.ink ?? CORAL_HEX;
    this.amountText = new Text({ text: '', style: { fontFamily: opts.font, fontWeight: '700', fontSize: 28, fill: '#FFFFFF' } });
    this.amountText.anchor.set(0.5);
    this.pill.addChild(this.pillBg, this.amountText);
    this.pill.visible = false;
    this.addChild(this.ink, this.pill);
  }

  get active(): boolean {
    return this.active_.length > 0;
  }

  /** Усі виграшні лінії разом; олівець «домальовує» їх за ~300 мс. */
  async showAll(wins: WinLine[]): Promise<void> {
    const { W, H } = this;
    this.clear();
    this.active_ = wins;
    if (!wins.length) return;
    const winning = new Map<string, { c: number; r: number }>();
    for (const w of wins) for (const p of w.positions) winning.set(`${p.c}:${p.r}`, p);
    // хвиля зліва направо разом з олівцем: символи «оживають» по черзі, з кожного — бульбашки
    const stagger = runtime.reducedMotion ? 0 : 0.07;
    this.reels.forEachSymbol((s, c, r) => {
      if (winning.has(`${c}:${r}`)) {
        s.startWin(undefined, c * stagger);
        this.onBurst(c * W + W / 2, r * H + H / 2, c * stagger);
      } else s.dim(true);
    });
    this.animateDraw((p) => {
      wins.forEach((w) => this.drawLine(w, p));
      for (const pos of winning.values()) this.drawLoop(pos.c, pos.r, p);
    }, 0.4);
    await wait(runtime.profile.smallWin);
  }

  /** Циклічний показ по одній лінії (у стані спокою). */
  startCycle(): void {
    if (this.active_.length < 2) return;
    this.cycleTl?.kill();
    const tl = gsap.timeline({ repeat: -1 });
    const step = runtime.profile.lineCycle / 1000;
    this.active_.forEach((w, i) => tl.add(() => this.focus(w), i * step));
    tl.add(() => undefined, this.active_.length * step);
    this.cycleTl = tl;
  }

  private focus(w: WinLine): void {
    const { W, H } = this;
    const keys = new Set(w.positions.map((p) => `${p.c}:${p.r}`));
    this.reels.forEachSymbol((s, c, r) => {
      const on = keys.has(`${c}:${r}`);
      if (on) s.startWin();
      else s.stopWin();
      s.dim(!on);
    });
    this.animateDraw((p) => {
      this.drawLine(w, p);
      for (const pos of w.positions) this.drawLoop(pos.c, pos.r, p);
    });
    // сума лінії — коралова бирка по центру останнього символу комбінації
    const last = w.positions[w.positions.length - 1];
    this.amountText.text = this.opts.format(w.amount);
    const pw = this.amountText.width + 30;
    this.pillBg.clear().roundRect(-pw / 2, -22, pw, 44, 6).fill({ color: this.color });
    this.pillBg.circle(-pw / 2 + 10, 0, 3.2).fill({ color: 0xf4f8ff });
    this.amountText.x = 5;
    this.pill.position.set(last.c * W + W / 2, last.r * H + H / 2);
    this.pill.rotation = (w.line % 3 - 1) * 0.04;
    this.pill.visible = true;
  }

  clear(): void {
    this.onClear();
    this.cycleTl?.kill();
    this.cycleTl = null;
    this.drawTween?.kill();
    this.drawTween = null;
    this.active_ = [];
    this.ink.clear();
    this.pill.visible = false;
    this.reels.forEachSymbol((s) => {
      s.stopWin();
      s.dim(false);
    });
  }

  private animateDraw(draw: (progress: number) => void, duration = 0.3): void {
    this.drawTween?.kill();
    const prog = { p: runtime.reducedMotion ? 1 : 0 };
    const render = () => {
      this.ink.clear();
      draw(prog.p);
    };
    render();
    if (prog.p < 1) this.drawTween = gsap.to(prog, { p: 1, duration, ease: 'power1.out', onUpdate: render });
  }

  private drawLine(w: WinLine, progress: number): void {
    const { W, H } = this;
    const rows = this.opts.lines[w.line];
    const pts = rows.map((r, c) => ({ x: c * W + W / 2, y: r * H + H / 2 }));
    const end = w.positions.length - 1;
    // пунктирний «хвіст» після комбінації
    if (progress >= 1) {
      for (let c = end; c < pts.length - 1; c++) {
        const a = pts[c];
        const b = pts[c + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 60; d < len - 50; d += 20) {
          const t0 = d / len;
          const t1 = Math.min(1, (d + 8) / len);
          this.ink.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
        }
      }
      this.ink.stroke({ width: 3, color: this.color, alpha: 0.55, cap: 'round' });
    }
    pencilLine(this.ink, [{ x: -18, y: pts[0].y }, ...pts.slice(0, end + 1)], w.line * 7 + 3, progress, this.color, 5);
  }

  /** Обведення символу від руки. */
  private drawLoop(c: number, r: number, progress: number): void {
    const { W, H } = this;
    pencilLoop(this.ink, c * W + W / 2, r * H + H / 2, W * 0.44, H * 0.44, c * 13 + r * 7 + 1, progress, this.color, 4);
  }
}
