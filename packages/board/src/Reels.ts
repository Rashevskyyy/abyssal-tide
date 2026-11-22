import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { play, runtime, Signal } from '@slotkit/core';
import type { SymbolView } from './SymbolView';
import type { BoardCell, BoardConfig } from './types';
import { pencilLine } from './pencil';

/**
 * Барабан: rows видимих символів + один прихований зверху.
 * Посадка керується твіном пройденої відстані з фіксованою тривалістю (lead),
 * тож момент зупинки детермінований, а барабани гарантовано стають строго по черзі.
 */
/** Ігровий час у мс — час глобальної шкали GSAP (враховує її timeScale). */
const gameNow = (): number => gsap.globalTimeline.time() * 1000;

export class Reel<Id extends string, C extends BoardCell<Id>, V extends SymbolView<Id, C>> extends Container {
  readonly symbols: V[] = [];
  private offset = 0;
  private speed = 0;
  private spinning = false;
  private queue: C[] = [];
  private landingTween: gsap.core.Tween | null = null;
  private landed: Signal | null = null;
  private startTl: gsap.core.Timeline | null = null;
  /** Режим гри — ключ стрічок у config.strips (наприклад, base / freeDives). */
  mode: string;
  /** Дані гри, що передаються символам при set() (наприклад, ставка для бирок номіналів). */
  ctx: unknown = undefined;

  constructor(
    readonly index: number,
    private readonly cfg: BoardConfig<Id, C, V>,
  ) {
    super();
    this.mode = Object.keys(cfg.strips)[0];
    for (let i = 0; i <= cfg.rows; i++) {
      const s = cfg.createSymbol();
      s.x = cfg.cellW / 2;
      this.symbols.push(s);
      this.addChild(s);
    }
    this.layout();
  }

  setColumn(cells: C[], ctx?: unknown): void {
    this.ctx = ctx;
    this.symbols[0].set(this.filler(), ctx);
    cells.forEach((c, r) => this.symbols[r + 1].set(c, ctx));
    this.offset = 0;
    this.layout();
  }

  /** Видимі символи (ряди згори вниз). */
  get visibleSymbols(): V[] {
    return this.symbols.slice(1, this.cfg.rows + 1);
  }

  get isSpinning(): boolean {
    return this.spinning;
  }

  get isIdle(): boolean {
    return !this.spinning && !this.landingTween;
  }

  start(accelMs: number, delayMs = 0): void {
    this.spinning = true;
    this.landed = null;
    this.queue = [];
    const tl = gsap.timeline({ delay: delayMs / 1000 });
    this.startTl = tl;
    // короткий замах угору, потім розгін
    tl.to(this, { offset: -14, duration: 0.08, ease: 'sine.out', onUpdate: () => this.layout() });
    // без «доклацування» в 0: барабан плавно розганяється з точки замаху
    tl.add(() => {
      for (const s of this.symbols) s.setBlur(true);
    });
    tl.to(this, { speed: runtime.profile.spinSpeed * this.cfg.cellH, duration: accelMs / 1000, ease: 'power1.in' });
  }

  update(dtMs: number): void {
    if (!this.spinning || this.landingTween) return;
    this.advance((this.speed * dtMs) / 1000);
  }

  /** Почати посадку на `cells`; проміс резолвиться в момент удару (до осідання). */
  stop(cells: C[], leadMs: number): Promise<void> {
    if (this.landed) return this.landed.promise;
    const signal = new Signal();
    this.landed = signal;
    this.startTl?.kill();
    this.startTl = null;
    for (const s of this.symbols) s.setBlur(true);
    const H = this.cfg.cellH;
    this.queue = [...cells].reverse();
    const distance = (this.cfg.rows + 1) * H - this.offset;
    const proxy = { d: 0 };
    let last = 0;
    this.landingTween = gsap.to(proxy, {
      d: distance,
      duration: leadMs / 1000,
      ease: 'none',
      onUpdate: () => {
        this.advance(proxy.d - last);
        last = proxy.d;
      },
      onComplete: () => {
        // похибка з плаваючою комою може «не дотягнути» останню ротацію — доводимо її явно
        if (this.offset > H / 2) this.advance(H - this.offset + 0.01);
        this.landingTween = null;
        this.spinning = false;
        this.speed = 0;
        this.offset = 0;
        for (const s of this.symbols) s.setBlur(false);
        this.layout();
        signal.fire();
        // осідання
        const settle = runtime.profile.settle / 1000;
        gsap
          .timeline()
          .to(this, { offset: 16, duration: Math.min(0.05, settle * 0.6), ease: 'power1.out', onUpdate: () => this.layout() })
          .to(this, { offset: 0, duration: settle, ease: 'power2.out', onUpdate: () => this.layout() });
      },
    });
    return signal.promise;
  }

  private trembleTw: gsap.core.Tween | null = null;

  /** Барабан в очікуванні дрібно тремтить, поки не зупиниться. */
  tremble(on: boolean): void {
    this.trembleTw?.kill();
    this.trembleTw = null;
    this.pivot.x = 0;
    if (!on || runtime.reducedMotion) return;
    this.trembleTw = gsap.fromTo(this.pivot, { x: -2.5 }, { x: 2.5, duration: 0.035, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  /** Quick stop: прискорити посадку, що вже йде. */
  hurry(): void {
    this.landingTween?.timeScale(3);
  }

  private advance(px: number): void {
    const H = this.cfg.cellH;
    this.offset += px;
    while (this.offset >= H) {
      this.offset -= H;
      const bottom = this.symbols.pop()!;
      this.symbols.unshift(bottom);
      const next = this.queue.shift();
      bottom.set(next ?? this.filler(), this.ctx);
      bottom.setBlur(true);
    }
    this.layout();
  }

  private layout(): void {
    const H = this.cfg.cellH;
    this.symbols.forEach((s, i) => (s.y = (i - 1) * H + this.offset + H / 2));
  }

  private filler(): C {
    const strip = this.cfg.strips[this.mode][this.index];
    const id = strip[Math.floor(Math.random() * strip.length)];
    return this.cfg.filler ? this.cfg.filler(id) : ({ s: id } as C);
  }
}

export interface StopPlan {
  /** Чи вести промінь по барабану i (рішення ухвалює клієнт за вже відомим результатом). */
  anticipate(reel: number): boolean;
  onLanded(reel: number): void;
  onAnticipate(reel: number): void;
}

/**
 * Поле з барабанів: обертання, детермінована зупинка строго по черзі, quick stop,
 * очікування (дужки олівцем, затемнення, тремтіння) і «змивання» символів для переходу в бонус.
 */
export class ReelSet<Id extends string, C extends BoardCell<Id>, V extends SymbolView<Id, C>> extends Container {
  readonly reels: Reel<Id, C, V>[] = [];
  readonly content = new Container();
  /** Очікування: коралові дужки олівцем навколо активного барабана. */
  private readonly beam = new Graphics();
  private readonly dimmers: Graphics[] = [];
  private quick: Signal | null = null;
  private spinStartedAt = 0;

  constructor(private readonly cfg: BoardConfig<Id, C, V>) {
    super();
    const W = cfg.cellW;
    const H = cfg.cellH;
    // маска рівно по вікну поля: прихований верхній символ не «визирає» над полем
    const mask = new Graphics().rect(-12, 0, W * cfg.cols + 24, H * cfg.rows).fill(0xffffff);
    this.addChild(mask);
    this.content.mask = mask;
    this.addChild(this.content);
    for (let c = 0; c < cfg.cols; c++) {
      const reel = new Reel(c, cfg);
      reel.x = c * W;
      this.reels.push(reel);
      this.content.addChild(reel);
      const dim = new Graphics().rect(c * W, 0, W, H * cfg.rows).fill({ color: cfg.shade ?? 0x061a40, alpha: 0.62 });
      dim.alpha = 0;
      this.dimmers.push(dim);
    }
    this.addChild(...this.dimmers);
    this.beam.alpha = 0;
    this.addChild(this.beam);
  }

  setMode(mode: string): void {
    for (const r of this.reels) r.mode = mode;
  }

  /** Поле [барабан][ряд]; ctx передається символам (наприклад, ставка). */
  setBoard(board: C[][], ctx?: unknown): void {
    this.reels.forEach((r, c) => r.setColumn(board[c], ctx));
  }

  setContext(ctx: unknown): void {
    for (const r of this.reels) r.ctx = ctx;
  }

  symbolAt(c: number, r: number): V {
    return this.reels[c].visibleSymbols[r];
  }

  forEachSymbol(fn: (s: V, c: number, r: number) => void): void {
    this.reels.forEach((reel, c) => reel.visibleSymbols.forEach((s, r) => fn(s, c, r)));
  }

  update(dt: number): void {
    for (const r of this.reels) r.update(dt);
  }

  spin(ctx?: unknown): void {
    const p = runtime.profile;
    this.quick = new Signal();
    this.spinStartedAt = gameNow(); // ігровий час: сповільнення/прискорення GSAP діє і тут
    this.reels.forEach((r, i) => {
      if (ctx !== undefined) r.ctx = ctx;
      r.start(p.accel, i * 18);
    });
  }

  requestQuickStop(): void {
    this.quick?.fire();
  }

  get quickRequested(): boolean {
    return !!this.quick?.done;
  }

  /** Зупинка: перша близько firstStop від старту, далі інтервал або промінь очікування. */
  async stop(board: C[][], plan: StopPlan): Promise<void> {
    const p = runtime.profile;
    const lead = Math.max(140, Math.round(p.firstStop * 0.32));
    const quickLead = 110;
    const quickGap = 45;
    const elapsed = gameNow() - this.spinStartedAt;
    await this.waitOrQuick(Math.max(0, p.firstStop - lead - elapsed));

    const landings: Promise<void>[] = [];
    let anticipating = false;
    for (let i = 0; i < this.cfg.cols; i++) {
      const quick = this.quickRequested;
      if (i > 0) {
        if (!quick && plan.anticipate(i)) {
          anticipating = true;
          plan.onAnticipate(i);
          await landings[i - 1];
          this.showBeam(i);
          this.reels[i].tremble(true);
          await this.waitOrQuick(p.anticipation);
        } else {
          await this.waitOrQuick(quick ? quickGap : p.interval);
        }
      }
      if (this.quickRequested) for (const r of this.reels.slice(0, i)) r.hurry();
      const landing = this.reels[i].stop(board[i], this.quickRequested ? quickLead : lead).then(() => {
        this.reels[i].tremble(false);
        plan.onLanded(i);
      });
      landings.push(landing);
    }
    await Promise.all(landings);
    if (anticipating) this.hideBeam();
    await new Promise<void>((r) => gsap.delayedCall(p.settle / 1000, r));
  }

  private waitOrQuick(ms: number): Promise<void> {
    if (ms <= 0 || this.quickRequested) return Promise.resolve();
    return Promise.race([new Promise<void>((r) => gsap.delayedCall(ms / 1000, r)), this.quick!.promise]);
  }

  private showBeam(reel: number): void {
    // зупинені барабани: темнішають лише звичайні символи — перлини лишаються яскравими й «пульсують»;
    // барабани, що ще крутяться після цього, накриває затемнення
    this.dimmers.forEach((d, i) => gsap.to(d, { alpha: i > reel ? 1 : 0, duration: 0.2 }));
    for (let c = 0; c < reel; c++) {
      for (const s of this.reels[c].visibleSymbols) s.dim(!(s.symbol && this.cfg.keepBright?.(s.symbol)));
    }
    // дужки малюються «від руки» за ~250 мс, потім пульсують
    gsap.killTweensOf(this.beam);
    const W = this.cfg.cellW;
    const ink = this.cfg.ink ?? 0xff5b4a;
    const x0 = reel * W + 8;
    const x1 = reel * W + W - 8;
    const h = this.cfg.cellH * this.cfg.rows;
    const draw = (p: number) => {
      this.beam.clear();
      pencilLine(this.beam, [{ x: x0 + 16, y: 6 }, { x: x0, y: 10 }, { x: x0 - 2, y: h - 10 }, { x: x0 + 16, y: h - 6 }], 31 + reel, p, ink, 5);
      pencilLine(this.beam, [{ x: x1 - 16, y: 6 }, { x: x1, y: 12 }, { x: x1 + 2, y: h - 12 }, { x: x1 - 16, y: h - 6 }], 57 + reel, p, ink, 5);
    };
    const prog = { p: 0 };
    this.beam.alpha = 1;
    gsap.to(prog, { p: 1, duration: runtime.reducedMotion ? 0.01 : 0.25, ease: 'power1.out', onUpdate: () => draw(prog.p) });
    if (!runtime.reducedMotion) gsap.to(this.beam, { alpha: 0.55, duration: 0.35, yoyo: true, repeat: -1, delay: 0.3, ease: 'sine.inOut' });
  }

  private hideBeam(): void {
    gsap.killTweensOf(this.beam);
    gsap.to(this.beam, { alpha: 0, duration: 0.2 });
    this.dimmers.forEach((d) => gsap.to(d, { alpha: 0, duration: 0.25 }));
    this.forEachSymbol((s) => s.dim(false));
  }

  /** «Змити» вільні символи течією; залишити бонусні на місцях. */
  washAway(keep: (c: number, r: number) => boolean, ms: number): Promise<void> {
    const tl = gsap.timeline();
    this.forEachSymbol((s, c, r) => {
      if (keep(c, r)) return;
      const delay = (c * 0.05 + r * 0.03) * (ms / 900);
      if (runtime.reducedMotion) {
        tl.to(s, { alpha: 0, duration: ms / 2000 }, delay);
      } else {
        tl.to(s, { x: s.x + 520 + c * 40, y: s.y - 40 + r * 30, rotation: 0.6, alpha: 0, duration: (ms / 1000) * 0.6, ease: 'power2.in' }, delay);
      }
    });
    return play(tl);
  }

  /** Повернути розкладку після змивання. */
  restoreLayout(): void {
    this.reels.forEach((reel) =>
      reel.symbols.forEach((s) => {
        s.x = this.cfg.cellW / 2;
        s.rotation = 0;
        s.alpha = 1;
      }),
    );
  }
}
