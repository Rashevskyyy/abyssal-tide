import gsap from 'gsap';
import { Container, Sprite } from 'pixi.js';
import { runtime } from '@slotkit/core';
import type { BoardCell, MotionPreset, SymbolPack } from './types';

/** Колір кільця навколо виграшного символу (кораловий олівець). Можна змінити через winRing. */
const DEFAULT_WIN_RING = 0xff7a6b;

/**
 * Один символ поля.
 * Анімації (посадка, виграш, пульс, блиск, фіксація) рухають лише внутрішній шар `body`
 * і завжди починаються з `resetFx()`, тож вони не конфліктують і не «запам’ятовують» проміжний розмір.
 * Положення самого контейнера (x/y/alpha) належить барабану або полю бонусу.
 *
 * Гра розширює клас: `decorate()` додає власні елементи (бирки номіналів, мітки),
 * `onBlur()` пригашує їх під час обертання.
 */
export class SymbolView<Id extends string = string, C extends BoardCell<Id> = BoardCell<Id>> extends Container {
  readonly body = new Container();
  readonly sprite: Sprite;
  readonly glow: Sprite;
  private readonly ring: Sprite;
  cell: C | null = null;
  winRing = DEFAULT_WIN_RING;
  private fx: gsap.core.Timeline | null = null;
  private blurred_ = false;
  private throbbing = false;

  constructor(protected readonly pack: SymbolPack<Id>) {
    super();
    this.ring = new Sprite(pack.fx.ring);
    this.ring.anchor.set(0.5);
    this.ring.alpha = 0;
    this.glow = new Sprite(pack.fx.dot);
    this.glow.anchor.set(0.5);
    this.glow.width = this.glow.height = pack.size * 1.3;
    this.glow.alpha = 0;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.body.addChild(this.glow, this.sprite);
    this.addChild(this.ring, this.body);
  }

  /** Новий символ у клітині. ctx — довільні дані гри (ставка тощо) для decorate(). */
  set(cell: C | null, ctx?: unknown): void {
    this.resetFx();
    this.cell = cell ? { ...cell } : null;
    this.visible = !!cell;
    if (!cell) return;
    this.applyTexture();
    this.decorate(ctx);
  }

  /** Підмінити картинку без зміни клітини (наприклад, відкрита мушля перед розкриттям). */
  setArt(id: Id): void {
    this.setTexture(this.pack.texture(id, this.blurred_));
  }

  get blurred(): boolean {
    return this.blurred_;
  }

  setBlur(on: boolean): void {
    if (this.blurred_ === on) return;
    this.blurred_ = on;
    if (on) this.resetFx();
    this.applyTexture();
    this.onBlur(on);
  }

  get symbol(): Id | null {
    return this.cell?.s ?? null;
  }

  get isBonus(): boolean {
    return !!this.cell && this.pack.isBonus(this.cell.s);
  }

  /** Розширення для гри: власні елементи символу (викликається після кожного set()). */
  protected decorate(_ctx: unknown): void {
    void _ctx;
  }

  /** Розширення для гри: як пригасити власні елементи під час обертання. */
  protected onBlur(_on: boolean): void {
    void _on;
  }

  private applyTexture(): void {
    if (!this.cell) return;
    this.setTexture(this.pack.texture(this.cell.s, this.blurred_));
  }

  /** Поставити довільну текстуру (кадри, яких немає серед символів, — наприклад, відкрита мушля). */
  protected setTexture(tex: Sprite['texture']): void {
    this.sprite.texture = tex;
    this.sprite.scale.set(this.pack.size / tex.width);
  }

  private get glowTint(): number {
    return this.cell && this.pack.glow ? this.pack.glow(this.cell.s) : 0xf4f8ff;
  }

  private get motion(): MotionPreset {
    return this.cell ? this.pack.motion(this.cell.s) : 'pulse';
  }

  /** Повернути шар анімацій у спокій миттєво (нова текстура, старт обертання). */
  private resetFx(): void {
    this.killFx();
    this.throbbing = false;
    this.body.scale.set(1);
    this.body.rotation = 0;
    this.body.y = 0;
    this.glow.alpha = 0;
    this.ring.alpha = 0;
  }

  private killFx(): void {
    this.fx?.kill();
    this.fx = null;
    gsap.killTweensOf([this.body, this.body.scale, this.glow, this.ring, this.ring.scale]);
  }

  /** Плавно повернути шар у спокій із поточного стану — без стрибка розміру. */
  private settle(duration: number): void {
    this.killFx();
    if (duration <= 0) return this.resetFx();
    gsap.to(this.body.scale, { x: 1, y: 1, duration, ease: 'sine.out' });
    gsap.to(this.body, { rotation: 0, y: 0, duration, ease: 'sine.out' });
    gsap.to(this.glow, { alpha: 0, duration });
    this.ring.alpha = 0;
  }

  /** «Засвітка»: ореол коротко спалахує, як від перевитримки. */
  private sweep(tl: gsap.core.Timeline, at: number, dur = 0.5): void {
    tl.fromTo(this.glow, { alpha: 0.55 }, { alpha: 0.2, duration: dur, ease: 'sine.out' }, at);
  }

  private get busy(): boolean {
    return Math.abs(this.body.scale.x - 1) > 0.01 || Math.abs(this.body.scale.y - 1) > 0.01 || this.body.rotation !== 0 || this.body.y !== 0;
  }

  /** Виграш: власна анімація пресету символу, цикл до stopWin(). delay — хвиля зліва направо. */
  startWin(colorOverride?: number, delay = 0): void {
    if (!this.cell) return;
    // якщо символ ще «дихає» після посадки — спершу м’яко повертаємо його до 1, потім цикл
    const lead = this.busy ? 0.08 : 0;
    this.settle(lead);
    this.throbbing = false;
    const motion = this.motion;
    this.glow.tint = colorOverride ?? this.glowTint;
    const tl = gsap.timeline({ repeat: -1, delay: lead + delay });
    this.fx = tl;
    if (runtime.reducedMotion) {
      // без руху й спалахів: рівне світіння як рамка
      tl.set(this.glow, { alpha: 0.35 });
      tl.to({}, { duration: 1 });
      return;
    }
    const big = motion === 'soft' ? 1.1 : 1.2;
    tl.fromTo(this.body.scale, { x: 1, y: 1 }, { x: big, y: big, duration: 0.2, ease: 'back.out(3)', immediateRender: false }, 0);
    tl.to(this.body.scale, { x: 1, y: 1, duration: 0.55, ease: 'sine.inOut' }, 0.32);
    tl.fromTo(this.glow, { alpha: 0.15 }, { alpha: 0.7, duration: 0.2 }, 0);
    tl.to(this.glow, { alpha: 0.2, duration: 0.55 }, 0.32);
    this.ripple(tl, 0, this.winRing);
    this.sweep(tl, 0.12);
    switch (motion) {
      case 'swing': // стрілка «шукає» північ — коливання всього символу
        tl.to(this.body, { rotation: 0.2, duration: 0.2, ease: 'sine.out' }, 0);
        tl.to(this.body, { rotation: -0.12, duration: 0.25, ease: 'sine.inOut' }, 0.2);
        tl.to(this.body, { rotation: 0, duration: 0.35, ease: 'sine.inOut' }, 0.45);
        break;
      case 'float': // «спливає» і погойдується
        tl.to(this.body, { y: -10, rotation: 0.06, duration: 0.3, ease: 'sine.out' }, 0);
        tl.to(this.body, { y: 0, rotation: 0, duration: 0.5, ease: 'sine.inOut' }, 0.3);
        break;
      case 'roll': // перекочується
        tl.to(this.body, { rotation: -0.16, duration: 0.3, ease: 'sine.out' }, 0);
        tl.to(this.body, { rotation: 0, duration: 0.5, ease: 'back.out(2)' }, 0.3);
        break;
      case 'flicker': // полум’я мерехтить
        for (const [t, a] of [[0.05, 0.6], [0.14, 0.3], [0.22, 0.58], [0.34, 0.32], [0.46, 0.6], [0.6, 0.25]] as const) {
          tl.to(this.glow, { alpha: a, duration: 0.07 }, t);
        }
        tl.to(this.body, { rotation: 0.05, duration: 0.2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.1);
        break;
      case 'unfold': // розгортається
        tl.to(this.body.scale, { x: 1.18, y: 0.92, duration: 0.16, ease: 'sine.out' }, 0);
        tl.to(this.body.scale, { x: 0.96, y: 1.08, duration: 0.16, ease: 'sine.inOut' }, 0.16);
        tl.to(this.body.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }, 0.32);
        break;
      default:
        break;
    }
    tl.to({}, { duration: 0.95 }, 0); // довжина циклу
  }

  /** Зупинити цикл виграшу; символ плавно повертається до спокою (~120 мс). */
  stopWin(): void {
    this.throbbing = false;
    if (!this.fx && this.body.scale.x === 1 && this.glow.alpha === 0) return;
    this.settle(runtime.reducedMotion ? 0 : 0.12);
  }

  /**
   * «Пульс» бонусного символу, поки інші барабани ще крутяться і до тригера близько:
   * символ ритмічно збільшується й світиться, як серце, — до stopWin() або нового символу.
   */
  throb(): void {
    if (!this.cell || this.throbbing) return;
    const busy = Math.abs(this.body.scale.x - 1) > 0.01 || this.glow.alpha > 0.01;
    this.settle(busy ? 0.1 : 0);
    this.throbbing = true;
    this.glow.tint = this.glowTint;
    const tl = gsap.timeline({ repeat: -1, delay: busy ? 0.1 : 0 });
    this.fx = tl;
    if (runtime.reducedMotion) {
      tl.set(this.glow, { alpha: 0.4 });
      tl.to({}, { duration: 1 });
      return;
    }
    tl.to(this.body.scale, { x: 1.09, y: 1.09, duration: 0.14, ease: 'sine.out' }, 0);
    tl.to(this.body.scale, { x: 1, y: 1, duration: 0.32, ease: 'sine.in' }, 0.14);
    tl.fromTo(this.glow, { alpha: 0.2 }, { alpha: 0.7, duration: 0.14 }, 0);
    tl.to(this.glow, { alpha: 0.2, duration: 0.32 }, 0.14);
    tl.to({}, { duration: 0.56 }, 0);
  }

  dim(on: boolean): void {
    gsap.to(this, { alpha: on ? 0.3 : 1, duration: 0.18, overwrite: 'auto' });
  }

  /** Посадка особливого символу: короткий «поп», для бонусних — хвиля-кільце. */
  pop(strength = 1, ripple = this.isBonus): gsap.core.Timeline {
    this.resetFx();
    const tl = gsap.timeline({ onComplete: () => void (this.fx === tl && (this.fx = null)) });
    this.fx = tl;
    if (!this.cell) return tl;
    this.glow.tint = this.glowTint;
    if (runtime.reducedMotion) {
      tl.fromTo(this.glow, { alpha: 0.6 * strength }, { alpha: 0, duration: 0.35 });
      return tl;
    }
    tl.fromTo(this.body.scale, { x: 1 + 0.16 * strength, y: 1 + 0.16 * strength }, { x: 1, y: 1, duration: 0.32, ease: 'back.out(3)' });
    tl.fromTo(this.glow, { alpha: 0.55 * strength }, { alpha: 0, duration: 0.45 }, 0);
    if (ripple) this.ripple(tl, 0);
    return tl;
  }

  /** Фіксація (вхід у бонус): світіння й кільце без зміни розміру. */
  lockFlash(): gsap.core.Timeline {
    this.resetFx();
    const tl = gsap.timeline();
    this.fx = tl;
    this.glow.tint = this.glowTint;
    tl.fromTo(this.glow, { alpha: 0.7 }, { alpha: 0.25, duration: 0.25, ease: 'sine.out' });
    if (!runtime.reducedMotion) {
      this.ripple(tl, 0);
      this.sweep(tl, 0, 0.3);
    }
    return tl;
  }

  /** Відблиск у стані спокою — щоб поле «жило» між спінами. */
  glint(): void {
    if (this.fx || this.blurred_ || runtime.reducedMotion || !this.cell) return;
    const tl = gsap.timeline({ onComplete: () => void (this.fx === tl && (this.fx = null)) });
    this.fx = tl;
    this.sweep(tl, 0, 0.6);
    this.glow.tint = this.glowTint;
    tl.fromTo(this.glow, { alpha: 0 }, { alpha: 0.28, duration: 0.4, yoyo: true, repeat: 1 }, 0);
  }

  private ripple(tl: gsap.core.Timeline, at: number, tint?: number): void {
    const size = this.pack.size;
    this.ring.tint = tint ?? this.glowTint;
    tl.fromTo(this.ring, { alpha: 0.7 }, { alpha: 0, duration: 0.55, ease: 'power1.out' }, at);
    tl.fromTo(this.ring, { width: size * 0.5, height: size * 0.5 }, { width: size * 1.45, height: size * 1.45, duration: 0.55, ease: 'power2.out' }, at);
  }
}
