import gsap from 'gsap';
import { Container, Sprite, type Texture } from 'pixi.js';
import type { Art } from '../art/textures';
import { settings } from '../core/settings';
import { play } from '@slotkit/core';

export type SceneName = 'surface' | 'route' | 'seabed';
const DEPTH: Record<SceneName, number> = { surface: 0, route: 1, seabed: 2 };

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  phase: number;
  life: number;
}

interface SceneSpec {
  bg: Texture;
  algae: number;
  bubbles: number;
  bubbleSpeed: number;
  current: number; // горизонтальна течія
  snow: number;
  plankton: number;
  fish: number;
}

class Scene extends Container {
  readonly bg: Sprite;
  private readonly algae: Sprite[] = [];
  private readonly fish: Particle[] = [];
  private readonly parts: Particle[] = [];
  private readonly plankton: Particle[] = [];
  private w = 1;
  private h = 1;
  private t = Math.random() * 100;

  constructor(
    private readonly art: Art,
    private readonly spec: SceneSpec,
  ) {
    super();
    this.bg = new Sprite(spec.bg);
    this.addChild(this.bg);
    for (let i = 0; i < spec.fish; i++) {
      const s = new Sprite(art.fx.fish);
      s.anchor.set(0.5);
      s.alpha = 0.13;
      this.fish.push({ s, vx: 0, vy: 0, phase: Math.random() * 10, life: 0 });
      this.addChild(s);
    }
    // водорості-фотограми, як в альбомі Анни Аткінс: великі, бліді, трохи розмиті
    for (let i = 0; i < spec.algae; i++) {
      const s = new Sprite(art.fx.algae);
      s.anchor.set(0.5, 1);
      s.alpha = 0.1 + (i % 3) * 0.04;
      this.algae.push(s);
      this.addChild(s);
    }
    const addParts = (n: number, tex: Texture, list: Particle[]) => {
      for (let i = 0; i < n; i++) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        list.push({ s, vx: 0, vy: 0, phase: Math.random() * 10, life: Math.random() });
        this.addChild(s);
      }
    };
    addParts(spec.bubbles, art.fx.bubble, this.parts);
    addParts(spec.snow, art.fx.dot, this.parts);
    addParts(spec.plankton, art.fx.dot, this.plankton);

  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const k = Math.max(w / this.bg.texture.width, h / this.bg.texture.height);
    this.bg.scale.set(k);
    this.bg.position.set((w - this.bg.texture.width * k) / 2, (h - this.bg.texture.height * k) / 2);
    this.algae.forEach((k2, i) => {
      const left = i % 2 === 0;
      const slot = Math.floor(i / 2);
      k2.x = left ? 40 + slot * 120 : w - 40 - slot * 120;
      k2.y = h + 30;
      k2.height = h * (0.6 + ((i * 37) % 30) / 100);
      k2.scale.x = k2.scale.y * (left ? 1 : -1) * (0.9 + (i % 2) * 0.2);
    });
    for (const p of [...this.parts, ...this.plankton]) this.respawn(p, true);
    for (const f of this.fish) this.respawnFish(f, true);
  }

  private respawn(p: Particle, anywhere = false): void {
    const isBubble = p.s.texture === this.art.fx.bubble;
    p.s.x = Math.random() * this.w;
    if (isBubble) {
      const size = 6 + Math.random() * 18;
      p.s.width = p.s.height = size;
      p.s.y = anywhere ? Math.random() * this.h : this.h + 20;
      p.s.alpha = 0.25 + Math.random() * 0.35;
      p.vy = -(this.spec.bubbleSpeed * (0.6 + Math.random() * 0.8)) * (size / 14);
      p.vx = this.spec.current * (0.5 + Math.random());
    } else if (this.plankton.includes(p)) {
      p.s.width = p.s.height = 4 + Math.random() * 6;
      p.s.y = Math.random() * this.h;
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = (Math.random() - 0.5) * 6;
    } else {
      // морський «сніг»
      p.s.width = p.s.height = 2 + Math.random() * 4;
      p.s.y = anywhere ? Math.random() * this.h : -10;
      p.vy = 8 + Math.random() * 14;
      p.vx = this.spec.current * 0.3 + (Math.random() - 0.5) * 6;
      p.s.alpha = 0.25 + Math.random() * 0.35;
    }
  }

  private respawnFish(f: Particle, anywhere = false): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    f.vx = dir * (30 + Math.random() * 50);
    f.s.scale.set((0.35 + Math.random() * 0.45) * dir, Math.abs(0.35 + Math.random() * 0.45));
    f.s.scale.x = -Math.abs(f.s.scale.y) * dir;
    f.s.x = anywhere ? Math.random() * this.w : dir > 0 ? -80 : this.w + 80;
    f.s.y = this.h * (0.15 + Math.random() * 0.6);
  }

  update(dtMs: number): void {
    if (!this.visible) return;
    const dt = dtMs / 1000;
    const calm = settings.reducedMotion ? 0.35 : 1;
    this.t += dt;
    this.algae.forEach((k, i) => (k.skew.x = Math.sin(this.t * 0.6 + i) * 0.05 * calm));
    for (const p of this.parts) {
      p.s.x += (p.vx + Math.sin(this.t * 1.5 + p.phase) * 6) * dt * calm;
      p.s.y += p.vy * dt * calm;
      if (p.s.y < -30 || p.s.y > this.h + 30 || p.s.x < -40 || p.s.x > this.w + 40) this.respawn(p);
    }
    for (const p of this.plankton) {
      p.s.x += p.vx * dt * calm;
      p.s.y += p.vy * dt * calm;
      p.s.alpha = 0.15 + 0.4 * Math.max(0, Math.sin(this.t * 1.3 + p.phase));
      if (p.s.y < -10 || p.s.y > this.h + 10 || p.s.x < -10 || p.s.x > this.w + 10) this.respawn(p);
    }
    for (const f of this.fish) {
      f.s.x += f.vx * dt * calm;
      f.s.y += Math.sin(this.t * 1.1 + f.phase) * 8 * dt;
      if (f.s.x < -120 || f.s.x > this.w + 120) this.respawnFish(f);
    }
  }
}

/** Три середовища (поверхня, маршрут Free Dives, морське дно) і «камера», що занурюється між ними. */
export class Environment extends Container {
  private readonly scenes: Record<SceneName, Scene>;
  current: SceneName = 'surface';
  private h = 1;

  constructor(art: Art) {
    super();
    this.scenes = {
      surface: new Scene(art, { bg: art.env.surface, algae: 4, bubbles: 22, bubbleSpeed: 40, current: 4, snow: 0, plankton: 0, fish: 3 }),
      route: new Scene(art, { bg: art.env.route, algae: 2, bubbles: 34, bubbleSpeed: 70, current: 28, snow: 20, plankton: 10, fish: 7 }),
      seabed: new Scene(art, { bg: art.env.seabed, algae: 2, bubbles: 6, bubbleSpeed: 25, current: 2, snow: 50, plankton: 30, fish: 1 }),
    };
    for (const name of ['seabed', 'route', 'surface'] as SceneName[]) {
      const s = this.scenes[name];
      s.visible = name === 'surface';
      this.addChild(s);
    }
  }

  resize(w: number, h: number): void {
    this.h = h;
    for (const s of Object.values(this.scenes)) s.resize(w, h);
  }

  update(dt: number): void {
    for (const s of Object.values(this.scenes)) s.update(dt);
  }

  set(name: SceneName): void {
    for (const [n, s] of Object.entries(this.scenes)) {
      s.visible = n === name;
      s.y = 0;
      s.alpha = 1;
    }
    this.current = name;
  }

  /** Перехід: «камера» опускається або піднімається. Reduced motion — плавне перетікання. */
  async go(to: SceneName, ms: number): Promise<void> {
    const from = this.current;
    if (from === to) return;
    const a = this.scenes[from];
    const b = this.scenes[to];
    b.visible = true;
    this.addChild(b);
    this.current = to;
    if (settings.reducedMotion) {
      b.alpha = 0;
      b.y = 0;
      await play(gsap.to(b, { alpha: 1, duration: ms / 1000, ease: 'sine.inOut' }));
    } else {
      const down = DEPTH[to] > DEPTH[from];
      b.y = down ? this.h : -this.h;
      b.alpha = 1;
      const tl = gsap.timeline();
      tl.to(a, { y: down ? -this.h : this.h, duration: ms / 1000, ease: 'power2.inOut' }, 0);
      tl.to(b, { y: 0, duration: ms / 1000, ease: 'power2.inOut' }, 0);
      await play(tl);
    }
    a.visible = false;
    a.y = 0;
  }
}
