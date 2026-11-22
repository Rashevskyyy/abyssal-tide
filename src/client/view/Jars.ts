import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { POT_IDS, POT_SIZE } from '../../shared/config';
import type { PotId, Pots } from '../../shared/types';
import type { Art } from '../art/textures';
import { FONT_MONO, FONT_STENCIL, FONT_UI } from '../core/fonts';
import { settings } from '../core/settings';
import { play } from '@slotkit/core';

/**
 * 3 Pots — три банки-препарати поруч із полем.
 * Мітка з перлини летить у банку, рідина піднімається; повна банка світиться й чекає Salvage,
 * де виливається у свій модифікатор. Колір банки — колір її мітки на перлинах.
 */
export const POT_STYLE: Record<PotId, { color: number; css: string; ink: string; name: string; glyph: string }> = {
  extra: { color: 0x7fe3f0, css: '#7FE3F0', ink: '#0B2A5E', name: 'EXTRA', glyph: '+1' },
  boost: { color: 0xff5b4a, css: '#FF5B4A', ink: '#FFFFFF', name: 'BOOST', glyph: '+' },
  multi: { color: 0xf5c451, css: '#F5C451', ink: '#0B2A5E', name: 'MULTI', glyph: '×' },
};

const tokenCache = new Map<PotId, Texture>();

/** Текстура мітки-жетона (кружок кольору банки з гліфом), спільна для перлин і перельотів. */
export function potToken(id: PotId): Texture {
  const hit = tokenCache.get(id);
  if (hit) return hit;
  const st = POT_STYLE[id];
  const size = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  g.fillStyle = st.css;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#F4F8FF';
  g.stroke();
  g.fillStyle = st.ink;
  g.font = `700 ${st.glyph.length > 1 ? 40 : 52}px ${FONT_UI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(st.glyph, size / 2, size / 2 + 3);
  const tex = Texture.from(cv);
  tokenCache.set(id, tex);
  return tex;
}

type JarState = 'filling' | 'full' | 'active';

class Jar extends Container {
  private readonly halo: Sprite;
  private readonly glass = new Graphics();
  private readonly liquid = new Graphics();
  private readonly lid = new Graphics();
  private readonly nameText: Text;
  private readonly countText: Text;
  private readonly hintText: Text;
  private readonly stamp = new Container();
  private readonly stampText: Text;
  /** Показаний рівень (дробовий під час анімації). */
  level = 0;
  state: JarState = 'filling';
  private t = Math.random() * 10;
  private bubbles: { x: number; y: number; r: number; v: number }[] = [];
  private nextBubble = 600;
  private box = { x: 0, y: 0, w: 0, h: 0 };
  private haloTw: gsap.core.Tween | null = null;
  /** Поворот «виливання» — навколо дна банки. */
  readonly tilt = new Container();

  constructor(
    readonly id: PotId,
    art: Art,
    hint: string,
  ) {
    super();
    const st = POT_STYLE[id];
    this.halo = new Sprite(art.fx.dot);
    this.halo.anchor.set(0.5);
    this.halo.tint = st.color;
    this.halo.alpha = 0;
    this.nameText = new Text({ text: st.name, style: { fontFamily: FONT_MONO, fontWeight: '500', fontSize: 17, fill: st.css, letterSpacing: 2 } });
    this.nameText.anchor.set(0.5);
    this.countText = new Text({
      text: '',
      style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 22, fill: '#F4F8FF', stroke: { color: '#061A40', width: 4, join: 'round' } },
    });
    this.countText.anchor.set(0.5);
    this.hintText = new Text({ text: hint, style: { fontFamily: FONT_MONO, fontWeight: '500', fontSize: 14, fill: '#C9D8F0' } });
    this.hintText.anchor.set(0.5);
    this.stampText = new Text({ text: 'READY', style: { fontFamily: FONT_STENCIL, fontWeight: '900', fontSize: 26, fill: st.ink, letterSpacing: 2 } });
    this.stampText.anchor.set(0.5);
    const sw = 92;
    this.stamp.addChild(new Graphics().roundRect(-sw / 2, -18, sw, 36, 4).fill({ color: st.color }).stroke({ color: 0xf4f8ff, width: 2 }), this.stampText);
    this.stamp.rotation = -0.18;
    this.stamp.visible = false;
    this.tilt.addChild(this.liquid, this.glass, this.lid, this.countText, this.stamp);
    this.addChild(this.halo, this.tilt, this.nameText, this.hintText);
  }

  setHint(text: string): void {
    this.hintText.text = text;
  }

  layout(w: number, h: number): void {
    // широкий слот (ряд на портреті): склянка ліворуч, написи праворуч великим шрифтом
    const horizontal = w > h * 1.4;
    let b: { x: number; y: number; w: number; h: number };
    if (horizontal) {
      const bh = h - 24;
      const bw = Math.min(bh * 0.72, w * 0.36);
      b = { x: 6, y: 18, w: bw, h: bh - 6 };
    } else {
      const top = 26;
      const bottom = h - 26;
      const bh = bottom - top;
      const bw = Math.min(w * 0.6, bh * 0.78);
      b = { x: (w - bw) / 2, y: top + 10, w: bw, h: bh - 10 };
    }
    this.box = b;
    // дно банки — вісь виливання
    this.tilt.pivot.set(b.x + b.w / 2, b.y + b.h);
    this.tilt.position.set(b.x + b.w / 2, b.y + b.h);
    this.glass.clear();
    this.glass.roundRect(b.x, b.y, b.w, b.h, 14).fill({ color: 0x061a40, alpha: 0.45 }).stroke({ color: 0xf4f8ff, width: 3, alpha: 0.9 });
    // відблиск на склі й мітки рівня
    this.glass.roundRect(b.x + 7, b.y + 10, 5, b.h * 0.55, 3).fill({ color: 0xf4f8ff, alpha: 0.22 });
    for (const f of [0.25, 0.5, 0.75]) {
      const y = b.y + b.h - 6 - f * (b.h - 12);
      this.glass.moveTo(b.x + b.w - 14, y).lineTo(b.x + b.w - 5, y).stroke({ color: 0xf4f8ff, width: 2, alpha: 0.45 });
    }
    this.drawLid(this.state === 'active');
    this.halo.position.set(b.x + b.w / 2, b.y + b.h / 2);
    this.halo.width = b.w * 2.4;
    this.halo.height = b.h * 1.9;
    if (horizontal) {
      const tx = b.x + b.w + 16;
      for (const t of [this.nameText, this.countText, this.hintText]) t.anchor.set(0, 0.5);
      this.nameText.style.fontSize = 26;
      this.countText.style.fontSize = 38;
      this.hintText.style.fontSize = 21;
      this.nameText.position.set(tx, b.y + 14);
      this.countText.position.set(tx, b.y + b.h * 0.52);
      this.hintText.position.set(tx, b.y + b.h - 12);
      // рахунок тепер поруч, а не на склі — його не треба виносити з нахилом банки
      if (this.countText.parent !== this) this.addChild(this.countText);
      this.stamp.position.set(b.x + b.w / 2, b.y + b.h * 0.45);
      this.stamp.scale.set(0.8);
    } else {
      for (const t of [this.nameText, this.countText, this.hintText]) t.anchor.set(0.5);
      this.nameText.style.fontSize = 17;
      this.countText.style.fontSize = 22;
      this.hintText.style.fontSize = 14;
      this.nameText.position.set(w / 2, 11);
      this.hintText.position.set(w / 2, h - 10);
      if (this.countText.parent !== this.tilt) this.tilt.addChildAt(this.countText, 3);
      this.countText.position.set(w / 2, b.y + b.h * 0.55);
      this.stamp.position.set(w / 2, b.y + b.h * 0.3);
      this.stamp.scale.set(1);
    }
    this.renderCount();
  }

  private drawLid(open: boolean): void {
    const b = this.box;
    this.lid.clear();
    // активна банка — кришка знята, отвір світиться кольором банки
    this.lid.visible = !open;
    this.lid.roundRect(b.x - 6, -12, b.w + 12, 14, 4).fill({ color: 0xf4f8ff, alpha: 0.92 });
    this.lid.rect(b.x + 4, -6, b.w - 8, 3).fill({ color: POT_STYLE[this.id].color });
    this.lid.position.set(0, b.y);
  }

  private renderCount(): void {
    const n = Math.round(this.level);
    this.countText.text = this.state === 'active' ? 'ON' : `${n}/${POT_SIZE}`;
  }

  /** Отвір банки в глобальних координатах — сюди летять мітки. */
  mouthGlobal(): { x: number; y: number } {
    const b = this.box;
    return this.tilt.toGlobal({ x: b.x + b.w / 2, y: b.y + 6 });
  }

  centerGlobal(): { x: number; y: number } {
    const b = this.box;
    return this.tilt.toGlobal({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }

  update(dt: number): void {
    this.t += dt / 1000;
    const b = this.box;
    const ix = b.x + 7;
    const iw = b.w - 14;
    const bottom = b.y + b.h - 6;
    const ih = b.h - 14;
    const f = Math.max(0, Math.min(1, this.level / POT_SIZE));
    const g = this.liquid;
    g.clear();
    if (f <= 0.001) return;
    const surface = bottom - f * ih;
    const amp = this.state === 'full' ? 3.2 : 2;
    const speed = this.state === 'full' ? 4.5 : 2.4;
    const pts: number[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const x = ix + (iw * i) / steps;
      const y = surface + Math.sin(this.t * speed + i * 0.8) * amp + Math.sin(this.t * speed * 0.6 + i * 1.7) * amp * 0.5;
      pts.push(x, Math.min(bottom - 2, y));
    }
    pts.push(ix + iw, bottom, ix, bottom);
    g.poly(pts).fill({ color: POT_STYLE[this.id].color, alpha: 0.88 });
    // світла лінія поверхні
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i <= steps * 2; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ color: 0xf4f8ff, width: 2, alpha: 0.55 });
    // бульбашки в рідині
    if (!settings.reducedMotion) {
      this.nextBubble -= dt;
      if (this.nextBubble <= 0) {
        this.nextBubble = (this.state === 'full' ? 250 : 700) + Math.random() * 700;
        this.bubbles.push({ x: ix + 6 + Math.random() * (iw - 12), y: bottom - 4, r: 2 + Math.random() * 3, v: 18 + Math.random() * 22 });
      }
      this.bubbles = this.bubbles.filter((p) => {
        p.y -= (p.v * dt) / 1000;
        if (p.y < surface + 4) return false;
        g.circle(p.x + Math.sin(this.t * 3 + p.y * 0.1) * 1.5, p.y, p.r).stroke({ color: 0xf4f8ff, width: 1.5, alpha: 0.7 });
        return true;
      });
    }
  }

  /** Рівень без анімації (зміна ставки, відновлення). */
  setLevel(n: number, animate: boolean): void {
    gsap.killTweensOf(this, 'level');
    if (!animate || settings.reducedMotion) {
      this.level = n;
      this.renderCount();
    } else {
      gsap.to(this, { level: n, duration: 0.45, ease: 'power2.out', onUpdate: () => this.renderCount() });
    }
    this.setState(n >= POT_SIZE ? 'full' : 'filling');
  }

  /** Мітка влетіла: рівень +1, сплеск і «ковток». */
  gulp(): void {
    const next = Math.min(POT_SIZE, Math.round(this.level) + 1);
    gsap.killTweensOf(this, 'level');
    gsap.to(this, { level: next, duration: 0.3, ease: 'back.out(2)', onUpdate: () => this.renderCount() });
    this.renderCount();
    if (!settings.reducedMotion) {
      gsap.fromTo(this.tilt.scale, { x: 1.08, y: 0.94 }, { x: 1, y: 1, duration: 0.35, ease: 'elastic.out(1, 0.5)' });
      gsap.fromTo(this.countText.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    }
    if (next >= POT_SIZE && this.state !== 'full') this.setState('full', true);
  }

  setState(state: JarState, celebrate = false): void {
    if (this.state === state && !celebrate) return;
    this.state = state;
    this.haloTw?.kill();
    this.haloTw = null;
    this.stamp.visible = state === 'full';
    this.stampText.text = 'READY';
    this.drawLid(state === 'active');
    this.glass.tint = state === 'active' ? POT_STYLE[this.id].color : 0xffffff;
    if (state === 'full' || state === 'active') {
      this.haloTw = gsap.fromTo(
        this.halo,
        { alpha: settings.reducedMotion ? 0.4 : 0.18 },
        { alpha: settings.reducedMotion ? 0.4 : 0.6, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' },
      );
    } else {
      gsap.to(this.halo, { alpha: 0, duration: 0.25 });
    }
    if (celebrate && state === 'full' && !settings.reducedMotion) {
      gsap.fromTo(this.stamp.scale, { x: 2.2, y: 2.2 }, { x: 1, y: 1, duration: 0.22, ease: 'power3.in' });
      gsap.fromTo(this.tilt, { rotation: -0.08 }, { rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' });
    }
    this.renderCount();
  }

  /**
   * Виливання: банка нахиляється, рідина стікає, з отвору б’є струмінь частинок до цілі.
   * Після цього банка «активна» (кришка відкрита, контур у кольорі) до кінця бонусу.
   */
  async pour(stream: (from: { x: number; y: number }, seconds: number) => void): Promise<void> {
    const dur = settings.reducedMotion ? 0.3 : 0.75;
    const tl = gsap.timeline();
    this.stamp.visible = false;
    if (!settings.reducedMotion) {
      tl.to(this.tilt, { rotation: 0.55, duration: 0.22, ease: 'power2.out' });
      tl.add(() => stream(this.mouthGlobal(), dur), 0.12);
    } else {
      tl.add(() => stream(this.mouthGlobal(), dur), 0);
    }
    tl.to(this, { level: 0, duration: dur, ease: 'power1.in', onUpdate: () => this.renderCount() }, 0.12);
    if (!settings.reducedMotion) tl.to(this.tilt, { rotation: 0, duration: 0.35, ease: 'back.out(2)' });
    await play(tl);
    this.setState('active');
  }
}

/** Три банки поруч із полем: колонка ліворуч на широкому екрані, ряд над полем на портретному. */
export class Jars extends Container {
  readonly jars: Record<PotId, Jar>;
  private readonly order: Jar[];

  constructor(art: Art, hints: Record<PotId, string>) {
    super();
    this.jars = {
      extra: new Jar('extra', art, hints.extra),
      boost: new Jar('boost', art, hints.boost),
      multi: new Jar('multi', art, hints.multi),
    };
    this.order = POT_IDS.map((id) => this.jars[id]);
    this.addChild(...this.order);
  }

  /** column: слоти w×h один під одним; row: в один ряд. */
  arrange(mode: 'column' | 'row', w: number, h: number, gap: number): void {
    this.order.forEach((j, i) => {
      j.position.set(mode === 'row' ? i * (w + gap) : 0, mode === 'row' ? 0 : i * (h + gap));
      j.layout(w, h);
    });
  }

  setHints(hints: Record<PotId, string>): void {
    for (const id of POT_IDS) this.jars[id].setHint(hints[id]);
  }

  set(pots: Pots, animate = false): void {
    for (const id of POT_IDS) {
      const j = this.jars[id];
      if (j.state === 'active') continue; // активна банка тримається до кінця бонусу
      j.setLevel(pots[id], animate);
    }
  }

  /** Після бонусу активні банки повертаються до звичайного стану з рівнем із сервера. */
  release(pots: Pots): void {
    for (const id of POT_IDS) {
      const j = this.jars[id];
      if (j.state === 'active') j.setState('filling');
      j.setLevel(pots[id], true);
    }
  }

  /** Відновлення посеред бонусу: використані банки одразу активні й порожні. */
  showActive(active: PotId[]): void {
    for (const id of active) {
      const j = this.jars[id];
      j.level = 0;
      j.setState('active');
    }
  }

  update(dt: number): void {
    for (const j of this.order) j.update(dt);
  }
}
