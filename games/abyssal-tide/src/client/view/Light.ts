/**
 * Світло під водою — шар показу поверх середовища:
 *  - промені з поверхні, що гойдаються й мерехтять;
 *  - каустика (сітка сонячних відблисків) на фоні й ледь помітно на самому відбитку;
 *  - тінь під рамою, щоб поле стояло над глибиною, а не лежало на ній;
 *  - «камера» зі світом гри: брижі води (shockwave), засвітка (bloom), розмиття руху при зануренні.
 * Сила світла залежить від глибини: на поверхні яскраво, у Free Dives тьмяніше, на дні — ледь-ледь.
 * Правила гри про цей шар нічого не знають.
 */
import gsap from 'gsap';
import { AdvancedBloomFilter, ShockwaveFilter, ZoomBlurFilter } from 'pixi-filters';
import { Container, Rectangle, Sprite, Texture, TilingSprite, type Filter } from 'pixi.js';
import type { Art } from '../art/textures';
import { settings } from '../core/settings';
import type { SceneName } from './Environment';

export type Quality = 'high' | 'low';

/** Якість ефектів: ?fx=low|high перекриває; слабкий телефон — low. Reduced motion перевіряється на льоту. */
export function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('fx');
  if (q === 'low' || q === 'high') return q;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && ((navigator.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3)) return 'low';
  return 'high';
}

const LIGHT: Record<SceneName, number> = { surface: 1, route: 0.62, seabed: 0.3 };
const PAPER = 0xe8f4ff;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/**
 * Безшовна каустика: яскраві тонкі лінії там, де дві найближчі «комірки» Вороного майже рівновіддалені
 * (F2 − F1 мале). Відстані — на торі, тож текстура повторюється без шва.
 */
function causticTexture(size = 256, cells = 13, seed = 11): Texture {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: cells }, () => [rnd() * size, rnd() * size]);
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // хвиляста деформація простору: прямі ребра комірок стають кривими, як справжні відблиски;
      // періоди синусів ділять розмір, тож шов лишається безшовним
      const wx = x + 9 * Math.sin((TAU * 2 * y) / size) + 4 * Math.sin((TAU * 3 * (x + y)) / size);
      const wy = y + 9 * Math.sin((TAU * 2 * x) / size + 1.3) + 4 * Math.cos((TAU * 3 * (x - y)) / size);
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of pts) {
        let dx = Math.abs((((wx - px) % size) + size) % size);
        let dy = Math.abs((((wy - py) % size) + size) % size);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.max(0, 1 - e / 11);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  // м’якшимо лінії, малюючи 3×3 копії, щоб розмиття не порушило шов
  const [c2, g2] = canvas(size, size);
  g2.filter = 'blur(1.4px)';
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) g2.drawImage(c, ox * size, oy * size);
  return Texture.from(c2);
}

/** Промінь: світла смуга від поверхні, що розширюється й гасне донизу; краї розмиті. */
function rayTexture(): Texture {
  const [c, g] = canvas(200, 1024);
  const l = g.createLinearGradient(0, 0, 0, 1024);
  l.addColorStop(0, 'rgba(255,255,255,0.95)');
  l.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  l.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = l;
  g.filter = 'blur(16px)';
  g.beginPath();
  g.moveTo(74, 0);
  g.lineTo(126, 0);
  g.lineTo(178, 1024);
  g.lineTo(22, 1024);
  g.closePath();
  g.fill();
  return Texture.from(c);
}

/** М’яка тінь під прямокутником рами (сам прямокутник потім закриває рама). */
function shadowTexture(w: number, h: number, pad: number): Texture {
  const [c, g] = canvas(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2));
  // розмитий прямокутник, трохи зсунутий донизу: поле «висить» над глибиною
  g.filter = `blur(${Math.round(pad * 0.32)}px)`;
  g.fillStyle = 'rgba(1, 8, 26, 0.75)';
  g.beginPath();
  g.roundRect(pad - 6, pad + pad * 0.3, w + 12, h, 18);
  g.fill();
  return Texture.from(c);
}

/** Кругле м’яке світло (для спалаху за полем). */
function glowTexture(): Texture {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

interface Ray {
  s: Sprite;
  base: number;
  phase: number;
  width: number;
}

export class Light {
  /** Між середовищем і полем: промені й каустика фону. */
  readonly back = new Container();
  /** Камера: у ній живе світ гри (поле, рама, банки). */
  readonly cam = new Container();
  /** Над світом: бульбашки свята. */
  readonly front = new Container();
  /** Відблиски на відбитку — додається в поле над символами. */
  readonly print: TilingSprite;
  readonly quality: Quality;
  private readonly rays: Ray[] = [];
  private readonly rayLayer = new Container();
  private readonly causLayer = new Container();
  private readonly caus: TilingSprite[] = [];
  private readonly halo: Sprite;
  private readonly bubbleTex: Texture;
  private readonly causTex: Texture;
  private shadowSprite: Sprite | null = null;
  private readonly bloom: AdvancedBloomFilter | null;
  private readonly shock: ShockwaveFilter | null;
  private readonly zoom: ZoomBlurFilter | null;
  private readonly level = { v: LIGHT.surface, boost: 0 };
  private w = 1;
  private h = 1;
  private t = Math.random() * 50;
  private readonly pointer = { x: 0, y: 0 };
  private readonly parallax = { x: 0, y: 0 };

  constructor(art: Art, quality = pickQuality()) {
    this.quality = quality;
    const rich = quality === 'high';
    this.bubbleTex = art.fx.bubble;
    this.causTex = causticTexture();
    // фон: два шари каустики рухаються в різні боки — сітка «дихає», як справжні відблиски
    for (let i = 0; i < (rich ? 2 : 1); i++) {
      const c = new TilingSprite({ texture: this.causTex, width: 16, height: 16 });
      c.blendMode = 'add';
      c.tint = PAPER;
      c.alpha = i ? 0.55 : 0.8;
      this.caus.push(c);
      this.causLayer.addChild(c);
    }
    const rayTex = rayTexture();
    for (let i = 0; i < (rich ? 7 : 4); i++) {
      const s = new Sprite(rayTex);
      s.anchor.set(0.5, 0);
      s.blendMode = 'add';
      s.tint = 0xd8ecff;
      this.rays.push({ s, base: 0.2 + (i % 3) * 0.05, phase: i * 1.7, width: 0.7 + ((i * 37) % 10) / 10 });
      this.rayLayer.addChild(s);
    }
    this.halo = new Sprite(glowTexture());
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.halo.tint = PAPER;
    this.halo.alpha = 0;
    this.back.addChild(this.causLayer, this.rayLayer, this.halo);
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';

    this.print = new TilingSprite({ texture: this.causTex, width: 16, height: 16 });
    this.print.blendMode = 'add';
    this.print.tint = PAPER;
    this.print.tileScale.set(1.25);
    this.print.eventMode = 'none';

    // поріг високий: на ціанотипії багато білого паперу, світитись мають лише найсвітліші місця
    this.bloom = rich ? new AdvancedBloomFilter({ threshold: 0.8, bloomScale: 0, brightness: 1, blur: 6, quality: 4 }) : null;
    this.shock = rich ? new ShockwaveFilter({ center: { x: 0, y: 0 }, amplitude: 18, wavelength: 150, speed: 620, brightness: 1.08, radius: -1, time: 0 }) : null;
    this.zoom = rich ? new ZoomBlurFilter({ strength: 0, center: { x: 0, y: 0 }, innerRadius: 80 }) : null;

    window.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX / Math.max(1, this.w) - 0.5;
      this.pointer.y = e.clientY / Math.max(1, this.h) - 0.5;
    });
  }

  get rich(): boolean {
    return this.quality === 'high';
  }

  private get calm(): boolean {
    return settings.reducedMotion;
  }

  /** Тінь під рамою: текстура під розмір рами, кладеться у світ першою. */
  shadow(w: number, h: number): Sprite {
    const pad = 90;
    if (!this.shadowSprite) {
      this.shadowSprite = new Sprite(shadowTexture(w, h, pad));
      this.shadowSprite.alpha = 1;
      this.shadowSprite.eventMode = 'none';
    }
    this.shadowSprite.pivot.set(pad, pad);
    return this.shadowSprite;
  }

  /** Розміри поля для відблисків на відбитку. */
  setPrintSize(w: number, h: number): void {
    this.print.width = w;
    this.print.height = h;
  }

  layout(w: number, h: number, field: { x: number; y: number; w: number; h: number }): void {
    this.w = w;
    this.h = h;
    for (const c of this.caus) {
      c.width = w + 80;
      c.height = h + 80;
      c.position.set(-40, -40);
    }
    const n = this.rays.length;
    this.rays.forEach((r, i) => {
      r.s.x = w * (0.06 + (i / Math.max(1, n - 1)) * 0.9) + ((i * 53) % 40) - 20;
      r.s.y = -h * 0.06;
      r.s.scale.set(Math.max(0.6, w / 1280) * r.width * 1.4, (h * 1.15) / 1024);
    });
    this.halo.position.set(field.x + field.w / 2, field.y + field.h / 2);
    this.halo.scale.set((Math.max(field.w, field.h) * 2.2) / 128);
    this.cam.pivot.set(w / 2, h / 2);
    this.cam.position.set(w / 2, h / 2);
    // фільтри камери працюють у прямокутнику екрана: центр брижів = координати на екрані
    this.cam.filterArea = new Rectangle(0, 0, w, h);
  }

  /** Сила світла за глибиною; перехід — разом із зануренням. */
  setScene(name: SceneName, instant = false): void {
    gsap.killTweensOf(this.level, 'v');
    if (instant) this.level.v = LIGHT[name];
    else gsap.to(this.level, { v: LIGHT[name], duration: 1.1, ease: 'sine.inOut' });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const move = this.calm ? 0 : 1;
    this.t += dt * move;
    const t = this.t;
    const lv = this.level.v + this.level.boost;
    this.parallax.x += (this.pointer.x - this.parallax.x) * 0.04;
    this.parallax.y += (this.pointer.y - this.parallax.y) * 0.04;
    this.rayLayer.position.set(-this.parallax.x * 22 * move, 0);
    this.causLayer.position.set(-this.parallax.x * 10 * move, -this.parallax.y * 6 * move);
    for (const r of this.rays) {
      r.s.rotation = r.base + Math.sin(t * 0.22 + r.phase) * 0.035;
      r.s.alpha = 0.55 + 0.45 * Math.sin(t * 0.5 + r.phase * 2.1);
    }
    this.rayLayer.alpha = 0.34 * lv;
    const [a, b] = this.caus;
    a.tilePosition.set(t * 11, t * 5);
    a.tileScale.set(1.7 + Math.sin(t * 0.31) * 0.08);
    if (b) {
      b.tilePosition.set(-t * 8 + 40, t * 9);
      b.tileScale.set(2.3 + Math.cos(t * 0.27) * 0.1);
    }
    this.causLayer.alpha = 0.11 * lv;
    this.print.tilePosition.set(t * 7, -t * 4);
    this.print.alpha = 0.055 * Math.min(1.4, lv);
  }

  /** Фільтри на камері — лише поки щось роблять: кожен прохід коштує кадру. */
  private setFilters(): void {
    const list: Filter[] = [];
    if (this.bloom && this.bloom.bloomScale > 0.01) list.push(this.bloom);
    if (this.shock && this.shock.time > 0 && this.shock.time < 1.6) list.push(this.shock);
    if (this.zoom && this.zoom.strength > 0.004) list.push(this.zoom);
    this.cam.filters = list.length ? list : null;
  }

  /** Точка екрана → координати всередині області фільтра (вона рухається разом із камерою). */
  private local(x: number, y: number): { x: number; y: number } {
    const o = this.cam.toGlobal({ x: 0, y: 0 });
    return { x: x - Math.max(0, o.x), y: y - Math.max(0, o.y) };
  }

  /** Брижі води від точки на екрані. */
  ripple(x: number, y: number, amplitude = 18, duration = 1.3): void {
    if (!this.shock || this.calm) return;
    const sh = this.shock;
    sh.center = this.local(x, y);
    sh.amplitude = amplitude;
    gsap.killTweensOf(sh);
    gsap.fromTo(sh, { time: 0.001 }, { time: 1.6, duration, ease: 'none', onUpdate: () => this.setFilters(), onComplete: () => this.setFilters() });
  }

  /** «Засвітка»: білі символи на ціанотипії світяться, як переекспонований відбиток. */
  exposure(strength = 0.8, duration = 0.9): void {
    gsap.killTweensOf(this.level, 'boost');
    gsap.fromTo(this.level, { boost: strength * 0.6 }, { boost: 0, duration: duration * 1.2, ease: 'power2.out' });
    if (!this.bloom) return;
    gsap.killTweensOf(this.bloom);
    gsap.fromTo(
      this.bloom,
      { bloomScale: Math.min(0.55, strength * 0.3) },
      { bloomScale: 0, duration, ease: 'power2.out', onUpdate: () => this.setFilters(), onComplete: () => this.setFilters() },
    );
  }

  /** Камера коротко «підпливає» до точки. */
  punch(x: number, y: number, amount = 0.035, duration = 0.6): void {
    if (this.calm) return;
    gsap.killTweensOf(this.cam.scale);
    gsap.killTweensOf(this.cam.pivot);
    const { w, h } = this;
    const tx = w / 2 + (x - w / 2) * 0.3;
    const ty = h / 2 + (y - h / 2) * 0.3;
    gsap
      .timeline()
      .to(this.cam.scale, { x: 1 + amount, y: 1 + amount, duration: duration * 0.35, ease: 'sine.out' }, 0)
      .to(this.cam.pivot, { x: tx, y: ty, duration: duration * 0.35, ease: 'sine.out' }, 0)
      .to(this.cam.scale, { x: 1, y: 1, duration: duration * 0.65, ease: 'sine.inOut' })
      .to(this.cam.pivot, { x: w / 2, y: h / 2, duration: duration * 0.65, ease: 'sine.inOut' }, '<');
  }

  /** Занурення (dir 1) чи підйом (−1): камера пірнає до поля з розмиттям руху. */
  dive(x: number, y: number, dir: 1 | -1, seconds: number): void {
    if (this.calm) return;
    const k = dir > 0 ? 0.1 : -0.05;
    gsap.killTweensOf(this.cam.scale);
    gsap
      .timeline()
      .to(this.cam.scale, { x: 1 + k, y: 1 + k, duration: seconds * 0.45, ease: 'power2.in' })
      .to(this.cam.scale, { x: 1, y: 1, duration: seconds * 0.55, ease: 'power2.out' });
    if (!this.zoom) return;
    const z = this.zoom;
    z.center = this.local(x, y);
    gsap.killTweensOf(z);
    gsap
      .timeline({ onUpdate: () => this.setFilters(), onComplete: () => this.setFilters() })
      .to(z, { strength: dir > 0 ? 0.2 : 0.1, duration: seconds * 0.45, ease: 'power2.in' })
      .to(z, { strength: 0, duration: seconds * 0.55, ease: 'power2.out' });
  }

  /**
   * Великий виграш: світло з поверхні розгорається, за полем спалах, від поля брижі,
   * знизу б’ють стовпи бульбашок, засвітка пульсує. Повертає функцію зупинки.
   */
  celebrate(x: number, y: number, tier: 1 | 2 | 3): () => void {
    gsap.killTweensOf(this.level, 'boost');
    gsap.to(this.level, { boost: 0.8 + tier * 0.35, duration: 0.6, ease: 'power2.out' });
    gsap.killTweensOf(this.halo);
    gsap.to(this.halo, { alpha: 0.18 + tier * 0.06, duration: 0.5 });
    this.ripple(x, y, 26 + tier * 6, 1.6);
    this.exposure(0.9 + tier * 0.3, 1.1);
    this.punch(x, y, 0.03 + tier * 0.01, 0.8);
    const loops: gsap.core.Animation[] = [];
    if (!this.calm) {
      const per = this.rich ? 3 + tier : 2;
      loops.push(
        gsap.to({}, { duration: 0.12, repeat: -1, onRepeat: () => { for (let i = 0; i < per; i++) this.bubble(); } }),
      );
      if (this.bloom) loops.push(gsap.to({}, { duration: 0.9, repeat: -1, onRepeat: () => this.exposure(0.45 + tier * 0.15, 0.8) }));
      if (this.shock && tier >= 2) loops.push(gsap.to({}, { duration: 1.5, repeat: -1, onRepeat: () => this.ripple(x, y, 12 + tier * 4, 1.4) }));
    }
    return () => {
      loops.forEach((l) => l.kill());
      gsap.to(this.level, { boost: 0, duration: 0.8, ease: 'sine.inOut' });
      gsap.to(this.halo, { alpha: 0, duration: 0.6 });
    };
  }

  /** Бульбашка стовпом знизу: розгойдується й прискорюється, поки летить угору. */
  private bubble(): void {
    const s = new Sprite(this.bubbleTex);
    s.anchor.set(0.5);
    const size = 8 + Math.random() * 30;
    s.width = s.height = size;
    const column = [0.12, 0.3, 0.5, 0.7, 0.88][(Math.random() * 5) | 0];
    s.position.set(this.w * column + (Math.random() - 0.5) * 70, this.h + size);
    s.alpha = 0.5 + Math.random() * 0.35;
    this.front.addChild(s);
    const dur = 1.3 + Math.random() * 1.1;
    gsap
      .timeline({ onComplete: () => void (s.destroyed || s.destroy()) })
      .to(s, { y: -size - 40, duration: dur, ease: 'power1.in' }, 0)
      .to(s, { x: `+=${(Math.random() - 0.5) * 90}`, duration: dur, ease: 'sine.inOut' }, 0);
  }
}
