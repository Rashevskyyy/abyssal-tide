/**
 * Сцена за полем: розписна «стіна» з гілками, зерно лаку, віньєтка, пелюстки в повітрі,
 * відблиск на лаку. У фриспінах — нічний кобальт: зорі й повільне сонце променів за полем.
 * Усе на одному тікері GSAP; гілки й пелюстки трохи зсуваються за вказівником — з’являється глибина.
 */
import gsap from 'gsap';
import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { branch, grain, ray, sheen, softDot, sparkle, vignette } from './paint';
import type { Art } from '../art';

interface Petal {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
  depth: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Scene extends Container {
  private readonly night = new Container();
  private readonly day = new Container();
  private readonly branches: Sprite[] = [];
  /** Тепле світло за полем — «сцена», на якій стоїть тарілка. */
  private readonly backGlow: Sprite;
  private readonly grainLayer: TilingSprite;
  private readonly vignetteSprite: Sprite;
  private readonly sheenSprite: Sprite;
  private readonly rays = new Container();
  private readonly stars: Sprite[] = [];
  private readonly petals: Petal[] = [];
  private readonly petalLayer = new Container();
  private w = 1;
  private h = 1;
  private pointer = { x: 0, y: 0 };
  private parallax = { x: 0, y: 0 };
  mode: 'base' | 'free' = 'base';

  constructor(art: Art, rich: boolean) {
    super();
    // нічна сцена бонусу: зорі й промені, спершу прихована
    const rayTex = ray();
    for (let k = 0; k < 18; k++) {
      const r = new Sprite(rayTex);
      r.anchor.set(0.5, 1);
      r.rotation = (k / 18) * Math.PI * 2;
      r.blendMode = 'add';
      r.alpha = 0.16 + (k % 3) * 0.07;
      this.rays.addChild(r);
    }
    const starTex = sparkle();
    for (let k = 0; k < (rich ? 70 : 30); k++) {
      const s = new Sprite(starTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.scale.set(0.1 + Math.random() * 0.22);
      s.alpha = 0.3 + Math.random() * 0.6;
      this.stars.push(s);
      this.night.addChild(s);
    }
    this.night.addChild(this.rays);
    this.night.alpha = 0;

    this.backGlow = new Sprite(softDot('#f2b630'));
    this.backGlow.anchor.set(0.5);
    this.backGlow.blendMode = 'add';
    this.backGlow.alpha = 0.13;
    this.day.addChild(this.backGlow);
    for (let v = 0; v < 2; v++) {
      const b = new Sprite(branch(v));
      b.anchor.set(0.5, 1);
      b.alpha = 0.85;
      this.branches.push(b);
      this.day.addChild(b);
    }
    this.grainLayer = new TilingSprite({ texture: grain(), width: 16, height: 16 });
    this.grainLayer.alpha = 0.05;
    this.vignetteSprite = new Sprite(vignette());
    this.sheenSprite = new Sprite(sheen());
    this.sheenSprite.anchor.set(0.5);
    this.sheenSprite.blendMode = 'add';
    this.sheenSprite.alpha = 0;
    this.addChild(this.night, this.day, this.petalLayer, this.grainLayer, this.vignetteSprite);

    const petalTexes: Texture[] = [art.petal, softDot('#f2b630')];
    for (let k = 0; k < (rich ? 26 : 10); k++) {
      const s = new Sprite(petalTexes[k % 5 === 0 ? 1 : 0]);
      s.anchor.set(0.5);
      s.tint = [0xd7261e, 0xf2b630, 0x3f8f3a, 0xf5efe3][k % 4];
      const depth = 0.4 + Math.random() * 0.8;
      s.scale.set((k % 5 === 0 ? 0.08 : 0.5) * depth);
      s.alpha = 0.25 + depth * 0.35;
      this.petalLayer.addChild(s);
      this.petals.push({ s, vx: (Math.random() - 0.5) * 12, vy: 8 + Math.random() * 16, spin: (Math.random() - 0.5) * 1.2, depth });
    }

    window.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX / Math.max(1, this.w) - 0.5;
      this.pointer.y = e.clientY / Math.max(1, this.h) - 0.5;
    });
    gsap.ticker.add(this.tick);
  }

  /** Сцена знає, де поле: гілки обрамляють його, промені світять з-за нього, відблиск іде по лаку. */
  layout(w: number, h: number, board: Rect, sheenParent: Container, sheenRect: Rect): void {
    this.w = w;
    this.h = h;
    this.grainLayer.width = w;
    this.grainLayer.height = h;
    this.vignetteSprite.width = w;
    this.vignetteSprite.height = h;
    const portrait = h > w * 1.05;
    // гілки виростають з-за рамки поля: ліва — вліво й угору, права — коротша, щоб не лізти під панель
    for (const [i, b] of this.branches.entries()) {
      const bh = portrait ? board.h * (i ? 0.75 : 0.9) : board.h * (i ? 0.82 : 1.05);
      const s = bh / b.texture.height;
      const bw = b.texture.width * s;
      b.scale.set(i ? s : -s, s);
      if (portrait) {
        b.position.set(i ? board.x + board.w - bw * 0.12 : board.x + bw * 0.12, board.y + board.h * (i ? 1.02 : 0.6));
      } else {
        b.position.set(i ? board.x + board.w + bw * 0.16 : board.x - bw * 0.2, board.y + board.h * (i ? 1.0 : 1.04));
      }
      b.alpha = portrait ? 0.5 : 0.9;
    }
    this.backGlow.position.set(board.x + board.w / 2, board.y + board.h / 2);
    this.backGlow.scale.set((board.w * 1.9) / 128);
    this.rays.position.set(board.x + board.w / 2, board.y + board.h / 2);
    const reach = Math.hypot(w, h) * 0.8;
    for (const r of this.rays.children) r.scale.set(1.1, reach / 1024);
    for (const s of this.stars) s.position.set(Math.random() * w, Math.random() * h);
    for (const p of this.petals) p.s.position.set(Math.random() * w, Math.random() * h);
    if (this.sheenSprite.parent !== sheenParent) sheenParent.addChild(this.sheenSprite);
    this.sheenSprite.height = sheenRect.h * 1.6;
    this.sheenSprite.width = sheenRect.w * 0.35;
    this.sheenSprite.position.set(sheenRect.x - sheenRect.w, sheenRect.y + sheenRect.h / 2);
    this.sheenSprite.rotation = 0.35;
    this.sheenRect = sheenRect;
  }

  private sheenRect: Rect = { x: 0, y: 0, w: 1, h: 1 };

  /** Відблиск світла пробігає лаком рамки — раз на кілька секунд і на виграші. */
  sweep(): void {
    const r = this.sheenRect;
    gsap.killTweensOf(this.sheenSprite);
    gsap.fromTo(this.sheenSprite, { x: r.x - r.w * 0.3, alpha: 0 }, { x: r.x + r.w * 1.3, alpha: 1, duration: 1.4, ease: 'power1.inOut', onComplete: () => void (this.sheenSprite.alpha = 0) });
  }

  setMode(mode: 'base' | 'free', instant = false): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const d = instant ? 0 : 1.2;
    gsap.to(this.night, { alpha: mode === 'free' ? 1 : 0, duration: d });
    gsap.to(this.day, { alpha: mode === 'free' ? 0.35 : 1, duration: d });
  }

  private readonly tick = (_t: number, dt: number): void => {
    // дрейф живе в ігровому часі: сповільнення для запису відео сповільнює й пелюстки
    const sec = Math.min(0.05, dt / 1000) * gsap.globalTimeline.timeScale();
    this.parallax.x += (this.pointer.x - this.parallax.x) * 0.04;
    this.parallax.y += (this.pointer.y - this.parallax.y) * 0.04;
    this.day.position.set(-this.parallax.x * 18, -this.parallax.y * 10);
    this.rays.rotation += sec * 0.05;
    for (const p of this.petals) {
      p.s.x += (p.vx + Math.sin(p.s.y * 0.01) * 10) * sec * p.depth;
      p.s.y += p.vy * sec * p.depth;
      p.s.rotation += p.spin * sec;
      const px = -this.parallax.x * 30 * p.depth;
      if (p.s.y > this.h + 20) {
        p.s.y = -20;
        p.s.x = Math.random() * this.w;
      }
      p.s.pivot.x = px / Math.max(0.01, p.s.scale.x);
    }
    if (this.night.alpha > 0) {
      for (const [k, s] of this.stars.entries()) s.alpha = 0.35 + 0.35 * Math.sin(_t * (0.8 + (k % 5) * 0.3) + k);
    }
  };
}
