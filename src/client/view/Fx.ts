import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Pos } from '../../shared/types';
import { EPIC_WIN_X, MEGA_WIN_X } from '../../shared/config';
import { FIELD, type Art } from '../art/textures';
import type { AudioEngine } from '../audio/AudioEngine';
import { FONT_STENCIL, FONT_UI } from '../core/fonts';
import { formatMoney } from '../core/format';
import { t } from '../core/i18n';
import { PROFILES, settings } from '../core/settings';
import { Episode, Signal, play } from '@slotkit/core';
import { CORAL_HEX, PAPER_HEX, PRUSSIAN_HEX, pencilLine } from '@slotkit/board';

const FW = FIELD.cellW * FIELD.cols;
const FH = FIELD.cellH * FIELD.rows;
const CORAL = '#FF5B4A';

/**
 * «Гумовий штамп»: рамка й трафаретні літери коралом, фарба лягає нерівно.
 * Малюється в canvas, щоб потертості (вирізи шуму) не зачіпали сцену під штампом.
 */
const stampCache = new Map<string, Texture>();
function stampTexture(title: string, sub = ''): Texture {
  const key = `${title}|${sub}`;
  const cached = stampCache.get(key);
  if (cached) return cached;
  const k = 2;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `900 ${110 * k}px ${FONT_STENCIL}`;
  const tw = probe.measureText(title).width;
  probe.font = `700 ${50 * k}px ${FONT_UI}`;
  const sw = sub ? probe.measureText(sub).width : 0;
  const w = Math.ceil(Math.max(tw, sw) + 90 * k);
  const h = Math.ceil((sub ? 230 : 160) * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = CORAL;
  ctx.fillStyle = CORAL;
  ctx.lineWidth = 7 * k;
  ctx.beginPath();
  ctx.roundRect(5 * k, 5 * k, w - 10 * k, h - 10 * k, 18 * k);
  ctx.stroke();
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.roundRect(16 * k, 16 * k, w - 32 * k, h - 32 * k, 10 * k);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${110 * k}px ${FONT_STENCIL}`;
  ctx.fillText(title, w / 2, (sub ? 88 : 82) * k);
  if (sub) {
    ctx.font = `700 ${50 * k}px ${FONT_UI}`;
    ctx.fillText(sub, w / 2, 172 * k);
  }
  // потертості: дрібні вирізи й кілька «непрогрітих» плям
  ctx.globalCompositeOperation = 'destination-out';
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 900; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, (0.6 + rnd() * 2.2) * k, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (20 + rnd() * 50) * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = Texture.from(c);
  stampCache.set(key, tex);
  return tex;
}

/** Ефекти поверх поля (у системі координат поля). */
export class Fx extends Container {
  private readonly dim = new Graphics();
  private readonly particles = new Container();

  constructor(
    private readonly art: Art,
    private readonly audio: AudioEngine,
  ) {
    super();
    this.dim.rect(-2000, -2000, 4000 + FW, 4000 + FH).fill({ color: 0x061a40, alpha: 0.7 });
    this.dim.alpha = 0;
    this.addChild(this.dim, this.particles);
  }

  private stamp(title: string, sub = ''): Sprite {
    const s = new Sprite(stampTexture(title, sub));
    s.anchor.set(0.5);
    s.scale.set(0.5);
    s.rotation = -0.07;
    return s;
  }

  /** Удар штампа: великий → на місце, з ледь помітним «розплющенням». */
  private slam(tl: gsap.core.Timeline, s: Sprite, at: number): void {
    if (settings.reducedMotion) {
      tl.fromTo(s, { alpha: 0 }, { alpha: 0.95, duration: 0.15 }, at);
      return;
    }
    tl.fromTo(s, { alpha: 0 }, { alpha: 0.95, duration: 0.08 }, at);
    tl.fromTo(s.scale, { x: 0.95, y: 0.95 }, { x: 0.5, y: 0.5, duration: 0.17, ease: 'power4.in' }, at);
    tl.to(s.scale, { x: 0.515, y: 0.505, duration: 0.08, ease: 'sine.out' }, at + 0.17);
    tl.to(s.scale, { x: 0.5, y: 0.5, duration: 0.12 }, at + 0.25);
  }

  /** Штамп над полем: «8 FREE DIVES», «TIDE CROWN +€50.00». */
  async banner(title: string, sub = '', ms = 1200, ep?: Episode): Promise<void> {
    const s = this.stamp(title.toUpperCase(), sub);
    s.position.set(FW / 2, FH / 2);
    this.addChild(s);
    const k = settings.profile.transition;
    const tl = gsap.timeline({ onComplete: () => s.destroy() });
    tl.to(this.dim, { alpha: 0.55, duration: 0.2 }, 0);
    this.slam(tl, s, 0.05);
    tl.to(s, { alpha: 0, duration: 0.25 }, (ms * k) / 1000);
    tl.to(this.dim, { alpha: 0, duration: 0.25 }, (ms * k) / 1000);
    await (ep ? ep.play(tl) : play(tl));
  }

  /** Великий виграш: перли й бульбашки злітаються, штамп, лічильник до 2 с; skip — одразу підсумок. */
  async bigWin(amount: number, bet: number, ep: Episode): Promise<void> {
    const x = amount / bet;
    const tier = x >= EPIC_WIN_X ? t('epicWin') : x >= MEGA_WIN_X ? t('megaWin') : t('bigWin');
    const box = new Container();
    box.position.set(FW / 2, FH / 2);
    const title = this.stamp(tier.toUpperCase());
    title.y = -78;
    const counter = new Text({
      text: formatMoney(0),
      style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 104, fill: '#F4F8FF', letterSpacing: -1 },
    });
    counter.anchor.set(0.5);
    counter.y = 70;
    // табличка під сумою: «Водолаз» світлий, біла сума на ньому без підкладки не читається
    counter.text = formatMoney(amount);
    const plate = new Graphics()
      .roundRect(-counter.width / 2 - 36, counter.y - 64, counter.width + 72, 128, 10)
      .fill({ color: 0x061a40, alpha: 0.86 })
      .stroke({ color: 0xf4f8ff, alpha: 0.45, width: 2 });
    counter.text = formatMoney(0);
    const reduced = settings.reducedMotion;
    const diver = this.diver(reduced);
    box.addChild(diver.spine, plate, title, counter);
    this.addChild(box);
    this.audio.sfx('bigWin');

    const parts: Sprite[] = [];
    if (!reduced) {
      for (let i = 0; i < 40; i++) {
        const pearl = i % 4 === 0;
        const s = new Sprite(pearl ? this.art.symbols.PEARL.normal : this.art.fx.bubble);
        s.anchor.set(0.5);
        const a = Math.random() * Math.PI * 2;
        const d = 520 + Math.random() * 380;
        s.position.set(FW / 2 + Math.cos(a) * d, FH / 2 + Math.sin(a) * d);
        s.width = s.height = pearl ? 46 : 18 + Math.random() * 34;
        s.alpha = 0;
        parts.push(s);
        this.particles.addChild(s);
      }
    }
    const counterObj = { v: 0 };
    const dur = Math.min(2, 0.9 + x / 120);
    let lastTick = 0;
    const tl = gsap.timeline();
    tl.to(this.dim, { alpha: 1, duration: 0.25 }, 0);
    parts.forEach((p, i) => {
      tl.to(p, { alpha: 0.9, duration: 0.2 }, i * 0.012);
      tl.to(p, { x: FW / 2 + (Math.random() - 0.5) * 80, y: FH / 2 + (Math.random() - 0.5) * 80, duration: 0.7, ease: 'power2.in' }, i * 0.012);
      tl.to(p, { alpha: 0, duration: 0.15 }, 0.65 + i * 0.012);
    });
    this.slam(tl, title, 0.55);
    tl.fromTo(counter, { alpha: 0 }, { alpha: 1, duration: 0.2 }, 0.2);
    tl.to(
      counterObj,
      {
        v: amount,
        duration: dur,
        ease: 'power1.out',
        onUpdate: () => {
          counter.text = formatMoney(counterObj.v);
          const now = performance.now();
          if (now - lastTick > 70) {
            lastTick = now;
            this.audio.sfx('tick');
          }
        },
      },
      0.2,
    );
    tl.add(() => void (counter.text = formatMoney(amount)));
    tl.to({}, { duration: 1.4 });
    await ep.play(tl);
    counter.text = formatMoney(amount);
    if (ep.skipped) diver.skipIntro();
    diver.outro();
    const out = gsap.timeline({
      onComplete: () => {
        diver.stop();
        box.destroy({ children: true });
        this.particles.removeChildren().forEach((p) => p.destroy());
      },
    });
    out.to([plate, title, counter], { alpha: 0, duration: 0.2 }, 0).to(box, { alpha: 0, duration: 0.25 }, 0.2).to(this.dim, { alpha: 0, duration: 0.25 }, 0.2);
    await play(out);
  }

  /**
   * «Водолаз» (Spine): виринає знизу за написом і табличкою, гойдається, поки рахується сума, і опускається.
   * Час Spine іде від тікера GSAP — разом з усім ігровим часом (пропуск, прискорення в тестах, пауза вкладки).
   */
  private diver(reduced: boolean): { spine: Spine; skipIntro(): void; outro(): void; stop(): void } {
    const spine = new Spine({ skeletonData: this.art.diver, autoUpdate: false });
    // шолом над штампом: віконце видно, нагрудник ховається за написом
    spine.scale.set(0.8);
    spine.position.set(0, -40);
    const tick = (_time: number, deltaMs: number) => spine.update((Math.min(deltaMs, 100) / 1000) * gsap.globalTimeline.timeScale());
    if (reduced) {
      // без руху: одна поза петлі, без виринання й бульбашок
      spine.state.setAnimation(0, 'idle', false).timeScale = 0;
      spine.update(0);
    } else {
      spine.state.setAnimation(0, 'intro', false);
      spine.state.addAnimation(0, 'idle', true, 0);
      spine.update(0);
      gsap.ticker.add(tick);
    }
    return {
      spine,
      skipIntro: () => {
        if (!reduced) spine.state.setAnimation(0, 'idle', true);
      },
      outro: () => {
        if (!reduced) spine.state.setAnimation(0, 'outro', false);
      },
      stop: () => gsap.ticker.remove(tick),
    };
  }

  /** Вступ у Free Dives: олівцем проводиться маршрут через карти, потім штамп. */
  /** Маршрут олівцем через карти; назва й правила серії — на екрані старту Free Dives, що йде далі. */
  async freeDivesIntro(count: number, maps: Pos[], ep: Episode): Promise<void> {
    void count;
    const route = new Graphics();
    this.addChild(route);
    const centers = maps.map((p) => ({ x: p.c * FIELD.cellW + FIELD.cellW / 2, y: p.r * FIELD.cellH + FIELD.cellH / 2 }));
    const pts = [{ x: -30, y: FH * 0.8 }, ...centers, { x: FW + 30, y: FH * 0.18 }];
    const tl = gsap.timeline();
    tl.to(this.dim, { alpha: 0.6, duration: 0.3 }, 0);
    if (!settings.reducedMotion) {
      const prog = { p: 0 };
      tl.to(prog, {
        p: 1,
        duration: 0.7,
        ease: 'power1.inOut',
        onUpdate: () => {
          route.clear();
          pencilLine(route, pts, 99, prog.p, PAPER_HEX, 5, 0.9);
        },
      }, 0.1);
    }
    tl.add(() => this.audio.sfx('fsAward'), 0.3);
    // карти підсвічуються по черзі вздовж маршруту
    centers.forEach((c, i) => tl.add(() => this.burst(c.x, c.y, 12), 0.25 + i * 0.18));
    tl.to({}, { duration: 0.45 * settings.profile.transition });
    tl.to(route, { alpha: 0, duration: 0.3 });
    tl.to(this.dim, { alpha: 0, duration: 0.3 }, '<');
    await ep.play(tl);
    route.destroy();
    this.dim.alpha = 0;
  }

  /** Підсумок серії — паперова картка зразка; чекає підтвердження (або skip). */
  async summary(total: number, spins: number, confirm: Signal, ep: Episode): Promise<void> {
    const box = new Container();
    box.position.set(FW / 2, FH / 2);
    box.rotation = -0.02;
    const card = new Graphics()
      .rect(-360, -175, 720, 350)
      .fill({ color: 0xe9eef4 })
      .stroke({ color: PRUSSIAN_HEX, width: 2, alpha: 0.35 });
    // куточки кріплення
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      card.poly([sx * 360, sy * 175, sx * 360 - sx * 44, sy * 175, sx * 360, sy * 175 - sy * 44]).fill({ color: 0xd3dce8 });
    }
    const title = new Text({ text: 'FREE DIVES', style: { fontFamily: FONT_STENCIL, fontWeight: '900', fontSize: 72, fill: '#10357A', letterSpacing: 3 } });
    title.anchor.set(0.5);
    title.y = -100;
    const sub = new Text({ text: t('fsSummarySub', { spins }), style: { fontFamily: FONT_UI, fontWeight: '500', fontSize: 28, fill: '#3A5C93' } });
    sub.anchor.set(0.5);
    sub.y = -38;
    const amount = new Text({ text: formatMoney(0), style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 96, fill: CORAL } });
    amount.anchor.set(0.5);
    amount.y = 62;
    const underline = new Graphics();
    box.addChild(card, title, sub, amount, underline);
    box.alpha = 0;
    this.addChild(box);
    this.audio.sfx('summary');
    const c = { v: 0 };
    const tl = gsap.timeline();
    tl.to(this.dim, { alpha: 0.8, duration: 0.3 }, 0);
    tl.to(box, { alpha: 1, duration: 0.3 }, 0);
    if (!settings.reducedMotion) tl.fromTo(box, { y: FH / 2 + 40 }, { y: FH / 2, duration: 0.45, ease: 'power3.out' }, 0);
    tl.to(c, { v: total, duration: Math.min(1.6, 0.5 + total / 4000), onUpdate: () => void (amount.text = formatMoney(c.v)) }, 0.3);
    const prog = { p: 0 };
    tl.to(prog, {
      p: 1,
      duration: 0.35,
      onUpdate: () => {
        underline.clear();
        pencilLine(underline, [{ x: -amount.width / 2 - 10, y: 122 }, { x: amount.width / 2 + 10, y: 116 }], 5, prog.p, CORAL_HEX, 5);
      },
    });
    await ep.play(tl);
    amount.text = formatMoney(total);
    await Promise.race([confirm.promise, ep.wait(6000)]);
    const out = gsap.timeline();
    out.to(box, { alpha: 0, duration: 0.25 }).to(this.dim, { alpha: 0, duration: 0.25 }, 0);
    await play(out);
    box.destroy({ children: true });
  }

  private winTag: Container | null = null;
  private winTl: gsap.core.Timeline | null = null;

  /**
   * Сума виграшу по центру поля, як у слотах 3 Oaks: коралова бирка росте з нуля й «тикає»,
   * у кінці — удар, сплеск і акорд; потім бирка тримається й тане. Тривалість і розмір — за рівнем виграшу.
   * Повертає проміс завершення відліку; finishWin() одразу показує підсумок.
   */
  countWin(amount: number, bet: number): Promise<void> {
    this.clearWin(true);
    const x = amount / bet;
    const lvl = x < 1 ? 0 : x < 3 ? 1 : x < 10 ? 2 : 3;
    const speed = settings.profile.smallWin / PROFILES.normal.smallWin;
    const dur = [0.55, 0.85, 1.25, 1.7][lvl] * Math.max(0.45, speed);
    const size = [62, 76, 92, 108][lvl];
    this.audio.sfx('win', lvl);

    const tag = new Container();
    tag.position.set(FW / 2, FH / 2);
    tag.rotation = -0.035;
    const text = new Text({
      text: formatMoney(amount),
      style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: size, fill: '#FFFFFF', stroke: { color: '#C23A2C', width: 4, join: 'round' } },
    });
    text.anchor.set(0.5);
    // бирка під фінальну суму — розмір не «дихає», поки цифри ростуть
    const w = text.width + size * 0.9;
    const h = size * 1.42;
    const bg = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 10)
      .fill({ color: CORAL_HEX })
      .roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 6)
      .stroke({ color: PAPER_HEX, width: 2, alpha: 0.75 });
    bg.circle(-w / 2 + 18, 0, 5).fill({ color: PAPER_HEX });
    text.x = 7;
    const shadow = new Graphics().roundRect(-w / 2 + 6, -h / 2 + 10, w, h, 10).fill({ color: 0x041434, alpha: 0.35 });
    tag.addChild(shadow, bg, text);
    this.addChild(tag);
    this.winTag = tag;

    const o = { v: 0 };
    const ticks = Math.max(4, Math.round(dur * 16));
    let lastTick = -1;
    const render = () => {
      text.text = formatMoney(Math.round(o.v));
      const step = Math.floor((o.v / amount) * ticks);
      if (step !== lastTick && step < ticks) {
        lastTick = step;
        this.audio.sfx('countTick', step / ticks);
      }
    };
    const tl = gsap.timeline();
    this.winTl = tl;
    if (settings.reducedMotion) {
      tl.fromTo(tag, { alpha: 0 }, { alpha: 1, duration: 0.15 }, 0);
    } else {
      tl.fromTo(tag, { alpha: 0 }, { alpha: 1, duration: 0.12 }, 0);
      tl.fromTo(tag.scale, { x: 0.55, y: 0.55 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.2)' }, 0);
      tl.to(tag, { rotation: 0.02, duration: dur / 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
      // бульбашки з-під бирки, поки йде відлік
      const n = 4 + lvl * 4;
      for (let i = 0; i < n; i++) tl.add(() => this.bubble(FW / 2 + (Math.random() - 0.5) * w, FH / 2 + h / 3), (dur * i) / n);
    }
    tl.to(o, { v: amount, duration: dur, ease: lvl >= 2 ? 'power1.out' : 'none', onUpdate: render }, 0.05);
    tl.add(() => {
      text.text = formatMoney(amount);
      this.audio.sfx('winEnd', lvl);
      if (!settings.reducedMotion) {
        this.burst(FW / 2, FH / 2, 10 + lvl * 6);
        gsap.fromTo(tag.scale, { x: 1.16, y: 1.16 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
      }
    });
    const done = play(tl);
    // тримається довше для більших виграшів і тане сама, якщо гравець не крутить далі
    const hold = 0.7 + lvl * 0.25;
    void done.then(() => {
      if (this.winTag !== tag) return;
      gsap.to(tag, { alpha: 0, duration: 0.3, delay: hold, onComplete: () => this.winTag === tag && this.clearWin(true) });
      if (!settings.reducedMotion) gsap.to(tag.scale, { x: 0.9, y: 0.9, duration: 0.3, delay: hold });
    });
    return done;
  }

  /** Пропуск: одразу фінальна сума з ударом. */
  finishWin(): void {
    if (this.winTl && this.winTl.progress() < 1) this.winTl.progress(1);
  }

  /** Прибрати бирку (новий спін, вхід у бонус). */
  clearWin(instant = false): void {
    const tag = this.winTag;
    this.winTl?.kill();
    this.winTl = null;
    this.winTag = null;
    if (!tag) return;
    gsap.killTweensOf([tag, tag.scale]);
    if (instant || settings.reducedMotion) tag.destroy({ children: true });
    else gsap.to(tag, { alpha: 0, duration: 0.15, onComplete: () => tag.destroy({ children: true }) });
  }

  /** Бульбашка, що спливає від точки. */
  private bubble(x: number, y: number): void {
    const b = new Sprite(this.art.fx.bubble);
    b.anchor.set(0.5);
    const sz = 14 + Math.random() * 18;
    b.width = b.height = sz;
    b.position.set(x, y);
    b.alpha = 0.8;
    this.particles.addChild(b);
    gsap.to(b, {
      y: y - 120 - Math.random() * 110,
      x: x + (Math.random() - 0.5) * 50,
      alpha: 0,
      duration: 0.9 + Math.random() * 0.5,
      ease: 'sine.out',
      onComplete: () => b.destroy(),
    });
  }

  /** Сума малого виграшу — коралова бирка над полем. */
  popup(amount: number): void {
    const tag = new Container();
    const text = new Text({ text: `+${formatMoney(amount)}`, style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 40, fill: '#FFFFFF' } });
    text.anchor.set(0.5);
    const w = text.width + 36;
    const bg = new Graphics().roundRect(-w / 2, -30, w, 60, 8).fill({ color: CORAL_HEX });
    bg.circle(-w / 2 + 12, 0, 4).fill({ color: PAPER_HEX });
    text.x = 6;
    tag.addChild(bg, text);
    tag.position.set(FW / 2, -16);
    tag.rotation = -0.03;
    this.addChild(tag);
    const ms = settings.profile.smallWin / 1000;
    gsap
      .timeline({ onComplete: () => tag.destroy({ children: true }) })
      .fromTo(tag, { alpha: 0, y: 4 }, { alpha: 1, y: -14, duration: 0.18, ease: 'power2.out' })
      .to(tag, { alpha: 0, duration: 0.2 }, ms);
  }

  /** Цятка шлейфу за жетоном, що летить (тане й зменшується). */
  trail(x: number, y: number, tint: number): void {
    const s = new Sprite(this.art.fx.dot);
    s.anchor.set(0.5);
    s.tint = tint;
    s.width = s.height = 16 + Math.random() * 10;
    s.position.set(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8);
    s.alpha = 0.85;
    this.particles.addChild(s);
    gsap.to(s, { alpha: 0, width: 4, height: 4, duration: 0.4, ease: 'power1.out', onComplete: () => s.destroy() });
  }

  /** Сплеск білих цяток у точці (посадка, розкриття). */
  burst(x: number, y: number, n = 10, tint = 0xffffff): void {
    if (settings.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.art.fx.dot);
      s.anchor.set(0.5);
      s.tint = tint;
      s.width = s.height = 10 + Math.random() * 12;
      s.position.set(x, y);
      this.particles.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 50 + Math.random() * 70;
      gsap.to(s, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 0.5 + Math.random() * 0.3, ease: 'power2.out', onComplete: () => s.destroy() });
    }
  }
}

/** Перехід між глибинами: біла «засвітка» й бульбашки на весь екран. */
export class WaveSweep extends Container {
  private readonly bubbles: Sprite[] = [];
  private readonly band: Sprite;
  private w = 1;
  private h = 1;

  constructor(art: Art) {
    super();
    this.band = new Sprite(art.fx.wave);
    this.band.anchor.set(0.5);
    this.band.alpha = 0;
    this.addChild(this.band);
    for (let i = 0; i < 50; i++) {
      const b = new Sprite(art.fx.bubble);
      b.anchor.set(0.5);
      b.alpha = 0;
      this.bubbles.push(b);
      this.addChild(b);
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  /** dir: 1 — занурення (бульбашки летять угору), -1 — підйом. */
  play(ms: number, dir: 1 | -1): Promise<void> {
    if (settings.reducedMotion) return Promise.resolve();
    const tl = gsap.timeline();
    const d = ms / 1000;
    this.band.width = this.w * 1.8;
    this.band.height = this.h * 0.9;
    this.band.x = this.w / 2;
    tl.fromTo(this.band, { y: dir === 1 ? this.h * 1.5 : -this.h * 0.5, alpha: 0.6 }, { y: dir === 1 ? -this.h * 0.5 : this.h * 1.5, alpha: 0.2, duration: d, ease: 'power1.inOut' }, 0);
    this.bubbles.forEach((b) => {
      const size = 10 + Math.random() * 36;
      b.width = b.height = size;
      b.x = Math.random() * this.w;
      const y0 = dir === 1 ? this.h + 50 + Math.random() * this.h * 0.5 : -50 - Math.random() * this.h * 0.5;
      const y1 = dir === 1 ? -80 : this.h + 80;
      tl.fromTo(b, { y: y0, alpha: 0.7 }, { y: y1, alpha: 0.15, duration: d * (0.6 + Math.random() * 0.4), ease: 'power1.in' }, Math.random() * d * 0.3);
    });
    return play(tl);
  }
}
