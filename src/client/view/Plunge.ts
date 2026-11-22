import gsap from 'gsap';
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Art } from '../art/textures';
import { settings } from '../core/settings';
import { play } from '@slotkit/core';

/**
 * Перехід між глибинами на весь екран: «засвітка» паперу (як експозиція ціанотипії),
 * три кола-хвилі від поля, потік бульбашок і поштовх сцени. Вниз (у бонус) бульбашки б’ють угору
 * швидко й густо; вгору (повернення) — рідше й повільніше.
 */
export class Plunge extends Container {
  private readonly flash = new Graphics();
  private readonly rings: Sprite[] = [];
  private readonly bubbles = new Container();
  private w = 1;
  private h = 1;

  constructor(private readonly art: Art) {
    super();
    for (let i = 0; i < 3; i++) {
      const r = new Sprite(art.fx.ring);
      r.anchor.set(0.5);
      r.alpha = 0;
      this.rings.push(r);
    }
    this.flash.alpha = 0;
    this.addChild(this.bubbles, ...this.rings, this.flash);
    this.eventMode = 'none';
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.flash.clear().rect(0, 0, w, h).fill({ color: 0xf4f8ff });
  }

  /** dir: 1 — занурення (у бонус), -1 — підйом. origin — центр поля в глобальних координатах. */
  async play(dir: 1 | -1, origin: { x: number; y: number }, seconds: number, world?: Container): Promise<void> {
    const tl = gsap.timeline();
    if (settings.reducedMotion) {
      tl.fromTo(this.flash, { alpha: 0 }, { alpha: 0.35, duration: 0.12, yoyo: true, repeat: 1 });
      await play(tl);
      return;
    }
    // 1) засвітка
    tl.fromTo(this.flash, { alpha: 0 }, { alpha: dir > 0 ? 0.7 : 0.45, duration: 0.09, ease: 'power2.out' }, 0);
    tl.to(this.flash, { alpha: 0, duration: 0.45, ease: 'power2.in' }, 0.1);
    // 2) хвилі від поля
    const reach = Math.hypot(this.w, this.h) / 64; // текстура кільця ~128 px
    this.rings.forEach((r, i) => {
      r.position.set(origin.x, origin.y);
      tl.fromTo(r.scale, { x: 0.3, y: 0.3 }, { x: reach, y: reach, duration: 0.8 + i * 0.12, ease: 'power2.out' }, 0.04 + i * 0.11);
      tl.fromTo(r, { alpha: 0.85 }, { alpha: 0, duration: 0.8 + i * 0.12, ease: 'power1.in' }, 0.04 + i * 0.11);
    });
    // 3) бульбашки
    const n = dir > 0 ? 46 : 22;
    for (let i = 0; i < n; i++) {
      const b = new Sprite(this.art.fx.bubble);
      b.anchor.set(0.5);
      const sz = 10 + Math.random() * (dir > 0 ? 46 : 30);
      b.width = b.height = sz;
      b.position.set(Math.random() * this.w, this.h + sz + Math.random() * this.h * 0.4);
      b.alpha = 0.75;
      this.bubbles.addChild(b);
      const dur = (dir > 0 ? 0.55 : 1.1) + Math.random() * 0.5;
      tl.to(b, { y: -sz - Math.random() * 120, x: `+=${(Math.random() - 0.5) * 60}`, duration: dur * Math.max(0.6, seconds), ease: 'power1.in', onComplete: () => b.destroy() }, Math.random() * 0.25);
    }
    // 4) поштовх сцени: коротке «наближення» і назад
    if (world) {
      const s0 = world.scale.x;
      const x0 = world.x;
      const y0 = world.y;
      const k = dir > 0 ? 1.045 : 0.97;
      const o = { k: 1 };
      tl.to(o, {
        k,
        duration: 0.16,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
        onUpdate: () => {
          // масштаб навколо центру поля, щоб сцена «пірнала» у бік гравця
          world.scale.set(s0 * o.k);
          world.position.set(origin.x - (origin.x - x0) * o.k, origin.y - (origin.y - y0) * o.k);
        },
        onComplete: () => {
          world.scale.set(s0);
          world.position.set(x0, y0);
        },
      }, 0);
    }
    await play(tl);
  }
}
