/**
 * Шар «кіно» над грою: камера, світіння, ударна хвиля, вхід у бонус і великий виграш.
 * Правил не знає й результатів не змінює — лише показує те, що вже вирішив рушій.
 *
 * Якість: `high` — фільтри (bloom, glow, zoom blur, shockwave) і всі частинки;
 * `low` — для слабких телефонів і «менше руху»: ті самі події, але без дорогих фільтрів.
 */
import gsap from 'gsap';
import { AdvancedBloomFilter, ShockwaveFilter, ZoomBlurFilter } from 'pixi-filters';
import { Container, Graphics, MeshRope, Point, Sprite, Text, type Filter } from 'pixi.js';
import { PALETTE, type Art } from '../art';
import { Scene, type Rect } from './Scene';
import { ray, softDot } from './paint';

export type Quality = 'high' | 'low';

/** `?fx=low|high` перекриває автовибір; «менше руху» й слабкий телефон — low. */
export function pickQuality(search = location.search): Quality {
  const forced = new URLSearchParams(search).get('fx');
  if (forced === 'low' || forced === 'high') return forced;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3)) return 'low';
  return 'high';
}

export class Fx {
  readonly scene: Scene;
  /** Камера: батько світу гри; її масштаб і зсув — поверх розкладки. */
  readonly cam = new Container();
  /** Ефекти в координатах екрана: шторка, промені, феєрверк пелюсток. */
  readonly screen = new Container();
  private readonly bloom: AdvancedBloomFilter | null;
  private readonly shock: ShockwaveFilter | null;
  private readonly zoom: ZoomBlurFilter | null;
  private w = 1;
  private h = 1;
  private shakeTween: gsap.core.Tween | null = null;
  private readonly offset = { x: 0, y: 0 };

  constructor(
    private readonly art: Art,
    readonly quality: Quality,
  ) {
    const rich = quality === 'high';
    this.scene = new Scene(art, rich);
    this.bloom = rich ? new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0, brightness: 1, blur: 6, quality: 4 }) : null;
    this.shock = rich ? new ShockwaveFilter({ center: { x: 0, y: 0 }, amplitude: 22, wavelength: 140, speed: 900, brightness: 1.15, radius: -1, time: 0 }) : null;
    this.zoom = rich ? new ZoomBlurFilter({ strength: 0, center: { x: 0, y: 0 }, innerRadius: 60 }) : null;
    this.setFilters();
  }

  get rich(): boolean {
    return this.quality === 'high';
  }

  layout(w: number, h: number, board: Rect, sheenParent: Container, sheenRect: Rect): void {
    this.w = w;
    this.h = h;
    this.cam.pivot.set(w / 2, h / 2);
    this.cam.position.set(w / 2 + this.offset.x, h / 2 + this.offset.y);
    this.scene.layout(w, h, board, sheenParent, sheenRect);
  }

  /** Фільтри на камері живуть лише тоді, коли щось роблять: кожен прохід коштує кадру. */
  private setFilters(): void {
    const list: Filter[] = [];
    if (this.bloom && this.bloom.bloomScale > 0.01) list.push(this.bloom);
    if (this.shock && this.shock.time > 0 && this.shock.time < 1.2) list.push(this.shock);
    if (this.zoom && this.zoom.strength > 0.005) list.push(this.zoom);
    this.cam.filters = list.length ? list : null;
  }

  /** Короткий спалах світіння на виграші; сила — від розміру виграшу. */
  glow(strength = 0.8, duration = 0.9): void {
    this.scene.sweep();
    if (!this.bloom) return;
    gsap.killTweensOf(this.bloom);
    gsap.fromTo(
      this.bloom,
      { bloomScale: strength },
      { bloomScale: 0, duration, ease: 'power2.out', onUpdate: () => this.setFilters(), onComplete: () => this.setFilters() },
    );
    this.setFilters();
  }

  /** Ударна хвиля від точки на екрані (великий кластер вибухнув). */
  shockwave(x: number, y: number): void {
    if (!this.shock) return;
    const sh = this.shock;
    sh.center = { x, y };
    gsap.killTweensOf(sh);
    gsap.fromTo(sh, { time: 0.001 }, { time: 1.2, duration: 1.1, ease: 'none', onUpdate: () => this.setFilters(), onComplete: () => this.setFilters() });
  }

  /** Камера «наступає» на точку й повертається. */
  punch(x: number, y: number, amount = 0.035, duration = 0.5): void {
    const dx = (x - this.w / 2) * amount;
    const dy = (y - this.h / 2) * amount;
    gsap.killTweensOf(this.cam.scale);
    gsap.timeline()
      .to(this.cam.scale, { x: 1 + amount, y: 1 + amount, duration: duration * 0.35, ease: 'power2.out' }, 0)
      .to(this.cam.pivot, { x: this.w / 2 + dx, y: this.h / 2 + dy, duration: duration * 0.35, ease: 'power2.out' }, 0)
      .to(this.cam.scale, { x: 1, y: 1, duration: duration * 0.65, ease: 'power2.inOut' })
      .to(this.cam.pivot, { x: this.w / 2, y: this.h / 2, duration: duration * 0.65, ease: 'power2.inOut' }, '<');
  }

  /** Тремтіння: сила в пікселях, швидко згасає. */
  shake(power = 8, duration = 0.45): void {
    this.shakeTween?.kill();
    const st = { p: power };
    this.shakeTween = gsap.to(st, {
      p: 0,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        this.offset.x = (Math.random() - 0.5) * 2 * st.p;
        this.offset.y = (Math.random() - 0.5) * 2 * st.p;
        this.cam.position.set(this.w / 2 + this.offset.x, this.h / 2 + this.offset.y);
      },
      onComplete: () => {
        this.offset.x = this.offset.y = 0;
        this.cam.position.set(this.w / 2, this.h / 2);
      },
    });
  }

  /**
   * Вхід у бонус: камера наїжджає на тарілку з розмиттям руху, розписані кола заливають екран,
   * під ними сцена стає нічною, пензель пише «FREE SPINS» — і кола розходяться, відкриваючи поле.
   */
  async bonusEntry(at: { x: number; y: number }, spins: number, setNight: () => void): Promise<void> {
    const { w, h } = this;
    const tl = gsap.timeline();
    const cover = Math.hypot(w, h);
    // 1) наїзд на тарілку
    tl.to(this.cam.scale, { x: 1.9, y: 1.9, duration: 0.75, ease: 'power3.in' }, 0);
    tl.to(this.cam.pivot, { x: at.x, y: at.y, duration: 0.75, ease: 'power2.inOut' }, 0);
    if (this.zoom) {
      this.zoom.center = { x: at.x, y: at.y };
      tl.to(this.zoom, { strength: 0.22, duration: 0.75, ease: 'power2.in', onUpdate: () => this.setFilters() }, 0);
    }
    // 2) розписані кола з точки тарілки до країв екрана
    const rings = new Container();
    rings.position.set(at.x, at.y);
    const colors = [PALETTE.red, PALETTE.ochre, PALETTE.green, PALETTE.cobalt];
    const ringGfx = colors.map((c, k) => {
      const g = new Graphics().circle(0, 0, 100).fill(c);
      g.scale.set(0);
      rings.addChild(g);
      tl.to(g.scale, { x: (cover / 100) * (1 - k * 0.04), y: (cover / 100) * (1 - k * 0.04), duration: 0.6, ease: 'power2.in' }, 0.45 + k * 0.09);
      return g;
    });
    this.screen.addChild(rings);
    // 3) під покриттям: камера на місце, ніч, назва бонусу
    const title = new Container();
    tl.call(
      () => {
        if (this.zoom) this.zoom.strength = 0;
        this.setFilters();
        this.cam.scale.set(1);
        this.cam.pivot.set(w / 2, h / 2);
        setNight();
        this.titleCard(title, spins);
        this.screen.addChild(title);
      },
      [],
      1.25,
    );
    tl.to({}, { duration: 1.25 }, 1.25);
    // 4) кола розходяться від центру, відкриваючи нічне поле
    tl.call(() => {
      rings.position.set(w / 2, h / 2);
      ringGfx.reverse().forEach((g, k) => gsap.to(g.scale, { x: 0, y: 0, duration: 0.55, delay: k * 0.07, ease: 'power2.inOut' }));
      gsap.to(title, { alpha: 0, duration: 0.4, delay: 0.25 });
    }, [], 2.5);
    tl.to({}, { duration: 0.9 }, 2.5);
    await tl.then();
    rings.destroy({ children: true });
    title.destroy({ children: true });
  }

  /** «FREE SPINS» і кількість, пензель підкреслює. */
  private titleCard(c: Container, spins: number): void {
    const { w, h } = this;
    const k = Math.min(w / 900, h / 600, 1.4);
    const big = new Text({
      text: 'FREE SPINS',
      style: {
        fontFamily: 'Fira Sans Condensed, system-ui, sans-serif',
        fontWeight: '800',
        fontSize: 96,
        letterSpacing: 8,
        fill: PALETTE.cream,
        dropShadow: { color: PALETTE.red, distance: 6, angle: Math.PI / 2, blur: 0, alpha: 1 },
      },
    });
    big.anchor.set(0.5);
    const num = new Text({
      text: String(spins),
      style: { fontFamily: 'Fira Sans Condensed, system-ui, sans-serif', fontWeight: '800', fontSize: 150, fill: PALETTE.ochre, stroke: { color: PALETTE.lacquer, width: 8 } },
    });
    num.anchor.set(0.5);
    num.y = -130;
    const N = 40;
    const pts = Array.from({ length: N }, () => new Point(-300, 80));
    const rope = new MeshRope({ texture: this.art.brush, points: pts, textureScale: 0 });
    // орнамент тарілки: кільця крапок, як на рамці поля, і світло в центрі
    const glow = new Sprite(softDot('#ffffff'));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.alpha = 0.16;
    glow.scale.set(720 / 128);
    glow.y = -40;
    const ornament = new Graphics();
    ornament.circle(0, 0, 318).stroke({ width: 3, color: PALETTE.ochre, alpha: 0.7 });
    for (const [R, n, r, color] of [
      [340, 52, 6, PALETTE.ochre],
      [362, 64, 4, PALETTE.red],
      [296, 40, 3.5, PALETTE.cream],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ornament.circle(Math.cos(a) * R, Math.sin(a) * R, r).fill(color);
      }
    }
    ornament.y = -40;
    // кільця мають уміститись на екрані (у альбомній орієнтації висота менша за ширину)
    const fit = Math.min(1, (0.47 * Math.min(w, h)) / (370 * k));
    c.addChild(glow, ornament, rope, big, num);
    gsap.fromTo(ornament, { alpha: 0, rotation: -0.4 }, { alpha: 1, rotation: 0, duration: 0.9, ease: 'power3.out' });
    gsap.fromTo(ornament.scale, { x: 0.7 * fit, y: 0.7 * fit }, { x: fit, y: fit, duration: 0.9, ease: 'power3.out' });
    glow.scale.set((720 / 128) * fit);
    c.position.set(w / 2, h / 2 + 40 * k);
    c.scale.set(k);
    const st = { p: 0 };
    gsap.fromTo(big, { alpha: 0, y: 30 }, { alpha: 1, y: 0, duration: 0.45, ease: 'power2.out' });
    gsap.fromTo(num.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.6, ease: 'back.out(2.4)', delay: 0.15 });
    gsap.to(st, {
      p: 1,
      duration: 0.7,
      delay: 0.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        for (let i = 0; i < N; i++) {
          const t = (i / (N - 1)) * st.p;
          pts[i].set(-320 + t * 640, 82 + Math.sin(t * Math.PI) * -12);
        }
      },
    });
  }

  /**
   * Великий виграш: промені обертаються, з низу б’є фонтан пелюсток, світіння пульсує.
   * Повертає функцію зупинки — її викликає потік, коли гравець закрив картку виграшу.
   */
  celebrate(tier: 1 | 2 | 3): () => void {
    const { w, h } = this;
    const layer = new Container();
    this.screen.addChild(layer);
    const rays = new Container();
    rays.position.set(w / 2, h * 0.45);
    const tex = ray();
    const n = 10 + tier * 4;
    for (let k = 0; k < n; k++) {
      const r = new Sprite(tex);
      r.anchor.set(0.5, 1);
      r.rotation = (k / n) * Math.PI * 2;
      r.scale.set(1.2, Math.hypot(w, h) / 1024);
      r.blendMode = 'add';
      r.alpha = 0.3;
      rays.addChild(r);
    }
    rays.alpha = 0;
    layer.addChild(rays);
    gsap.to(rays, { alpha: 1, duration: 0.5 });
    const spin = gsap.to(rays, { rotation: Math.PI * 2, duration: 18, repeat: -1, ease: 'none' });
    const glowDot = new Sprite(softDot('#ffd97a'));
    glowDot.anchor.set(0.5);
    glowDot.blendMode = 'add';
    glowDot.position.copyFrom(rays.position);
    glowDot.scale.set(Math.max(w, h) / 256);
    glowDot.alpha = 0.35;
    layer.addChild(glowDot);

    const colors = [0xd7261e, 0xf2b630, 0x3f8f3a, 0x2457a6, 0xf5efe3];
    const count = this.rich ? 26 + tier * 14 : 12;
    const fountain = gsap.timeline({ repeat: -1 });
    fountain.call(() => {
      for (let k = 0; k < count / 6; k++) this.petal(layer, colors[(Math.random() * colors.length) | 0]);
    });
    fountain.to({}, { duration: 0.16 });
    const pulse = this.bloom ? gsap.to({}, { duration: 0.6, repeat: -1, onRepeat: () => this.glow(0.5 + tier * 0.25, 0.55) }) : null;
    this.shake(4 + tier * 3, 0.6);
    this.glow(1 + tier * 0.4, 1);
    return () => {
      fountain.kill();
      pulse?.kill();
      gsap.to(layer, {
        alpha: 0,
        duration: 0.5,
        onComplete: () => {
          spin.kill();
          for (const ch of layer.children) gsap.killTweensOf(ch);
          layer.destroy({ children: true });
        },
      });
    };
  }

  private petal(layer: Container, tint: number): void {
    const s = new Sprite(this.art.petal);
    s.anchor.set(0.5);
    s.tint = tint;
    s.scale.set(0.4 + Math.random() * 0.5);
    s.position.set(this.w / 2 + (Math.random() - 0.5) * this.w * 0.3, this.h + 20);
    layer.addChild(s);
    const vx = (Math.random() - 0.5) * this.w * 0.9;
    const up = this.h * (0.75 + Math.random() * 0.45);
    const dur = 1.4 + Math.random() * 0.8;
    // одна шкала на пелюстку: знищуємо її лише тоді, коли всі її рухи закінчились
    gsap
      .timeline({ onComplete: () => void (s.destroyed || s.destroy()) })
      .to(s, { x: s.x + vx, rotation: (Math.random() - 0.5) * 12, duration: dur, ease: 'none' }, 0)
      .to(s, { y: s.y - up, duration: dur * 0.45, ease: 'power2.out' }, 0)
      .to(s, { y: this.h + 40, duration: dur * 0.55, ease: 'power2.in' }, dur * 0.45);
  }
}
