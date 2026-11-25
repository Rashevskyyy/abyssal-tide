/**
 * Сітка 7×7 на PixiJS: символи, бутони й квітки під ними, «Мазок» і анімації каскадів.
 * Нічого не рахує — лише програє `StepResult`, який віддав рушій.
 */
import gsap from 'gsap';
import { GlowFilter } from 'pixi-filters';
import { Container, Graphics, MeshRope, Point, Sprite, Text, type Texture } from 'pixi.js';
import type { Episode } from '@slotkit/core';
import { fallPlan } from '../engine/grid';
import { COLS, ROWS, multiplierOf } from '../shared/config';
import type { SymbolId } from '../shared/symbols';
import type { ClusterWin, Grid, Spots, Stroke, Tumble } from '../shared/types';
import { PALETTE, type Art } from './art';
import type { Sound } from './sound';
import { softDot, sparkle } from './fx/paint';

/** Прибрати символ разом з його анімаціями (щоб твін не писав у знищений спрайт). */
const kill = (s: Sprite | null | undefined): void => {
  if (!s) return;
  gsap.killTweensOf(s);
  gsap.killTweensOf(s.scale);
  s.destroy();
};

/** Що сталося на полі — для камери й світла (координати — на екрані). */
export interface BoardEvents {
  /** Кластери засвітились: центр найбільшого, сумарний множник, виграш каскаду в ставках. */
  win?(e: { x: number; y: number; cells: number; multiplier: number; winX: number }): void;
  /** Символи вибухнули: центр і скільки клітинок. */
  burst?(e: { x: number; y: number; cells: number }): void;
}

export const CELL = 92;
export const BOARD = CELL * COLS;
export const FRAME = 26;

const TINT: Record<SymbolId, number> = {
  ROOSTER: 0xd7261e,
  FIREBIRD: 0xf2b630,
  KALYNA: 0xd7261e,
  MALLOW: 0xd7261e,
  SEED: 0xf2b630,
  COMB: 0x2457a6,
  CURL: 0xd7261e,
  LEAF: 0x3f8f3a,
  PLATE: 0xf5efe3,
};

const center = (i: number): { x: number; y: number } => ({
  x: (i % COLS) * CELL + CELL / 2,
  y: Math.floor(i / COLS) * CELL + CELL / 2,
});

class SpotView {
  readonly flower: Sprite;
  readonly bud: Sprite;
  /** М’яке світло під квіткою: що більший множник, то яскравіше. */
  readonly glow: Sprite;
  readonly badge = new Container();
  private readonly badgeText: Text;
  level = 0;

  constructor(art: Art, i: number, back: Container, front: Container, glowTex: Texture) {
    const { x, y } = center(i);
    this.glow = new Sprite(glowTex);
    this.glow.anchor.set(0.5);
    this.glow.position.set(x, y);
    this.glow.blendMode = 'add';
    this.glow.tint = 0xf2b630;
    this.glow.visible = false;
    back.addChild(this.glow);
    this.flower = new Sprite(art.flower);
    this.flower.anchor.set(0.5);
    this.flower.position.set(x, y);
    this.flower.visible = false;
    this.bud = new Sprite(art.bud);
    this.bud.anchor.set(0.5, 0.9);
    this.bud.width = this.bud.height = 30;
    this.bud.position.set(x + CELL / 2 - 16, y + CELL / 2 - 6);
    this.bud.visible = false;
    back.addChild(this.flower, this.bud);
    const plate = new Graphics().roundRect(-21, -12, 42, 24, 12).fill(PALETTE.ochre).stroke({ width: 2, color: PALETTE.lacquer });
    this.badgeText = new Text({
      text: '',
      style: { fontFamily: 'Fira Sans Condensed, system-ui, sans-serif', fontWeight: '800', fontSize: 17, fill: PALETTE.lacquer },
    });
    this.badgeText.anchor.set(0.5);
    this.badge.addChild(plate, this.badgeText);
    this.badge.position.set(x - CELL / 2 + 24, y - CELL / 2 + 15);
    this.badge.visible = false;
    front.addChild(this.badge);
  }

  set(level: number): void {
    this.level = level;
    const mult = multiplierOf(level);
    this.bud.visible = level === 1;
    this.flower.visible = level >= 2;
    this.badge.visible = level >= 2;
    this.glow.visible = level >= 2;
    if (level >= 2) {
      this.glow.scale.set((CELL / 128) * (0.9 + level * 0.12));
      this.glow.alpha = Math.min(0.85, 0.18 + level * 0.09);
      const s = (0.5 + Math.min(level, 8) * 0.05) * (CELL / 160) * 1.25;
      this.flower.scale.set(s);
      this.flower.alpha = 0.45 + level * 0.06;
      this.badgeText.text = `×${mult}`;
    }
    this.bud.scale.set(30 / 64);
  }

  /** Поява бутона чи ріст квітки: короткий «поп». */
  pop(tl: gsap.core.Timeline, at: number): void {
    const target = this.level >= 2 ? this.flower : this.bud;
    const sx = target.scale.x;
    tl.fromTo(target.scale, { x: sx * 0.2, y: sx * 0.2 }, { x: sx, y: sx, duration: 0.35, ease: 'back.out(2.2)' }, at);
    if (this.level >= 2) tl.fromTo(this.badge.scale, { x: 1.8, y: 1.8 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' }, at + 0.05);
  }
}

export class BoardView extends Container {
  private readonly symbolsLayer = new Container();
  private readonly fx = new Container();
  private readonly sprites: (Sprite | null)[] = new Array(ROWS * COLS).fill(null);
  private readonly spots: SpotView[] = [];
  private grid: Grid = [];
  /** 1 — звичайна швидкість, менше — турбо. */
  speed = 1;
  reducedMotion = false;
  /** Дорогі ефекти (фільтри світіння): лише на якості high. */
  rich = true;
  events: BoardEvents = {};
  /** Шар у рамці для відблиску лаку (його малює сцена). */
  readonly lacquer = new Container();
  private readonly outlines = new Container();
  private readonly sparkleTex = sparkle();
  private animating = false;

  constructor(
    private readonly art: Art,
    private readonly sound: Sound,
    private readonly money: (cents: number) => string,
  ) {
    super();
    const frame = new Graphics()
      .roundRect(-FRAME, -FRAME, BOARD + FRAME * 2, BOARD + FRAME * 2, 34)
      .fill(PALETTE.lacquer)
      .stroke({ width: 3, color: 0x3a2e24 });
    this.addChild(frame);
    // орнамент рамки: крапки червоні й жовті, як край розписної дошки
    const dots = new Graphics();
    const n = 28;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const along = t * BOARD;
      const color = k % 2 ? PALETTE.red : PALETTE.ochre;
      dots.circle(along + BOARD / n / 2, -FRAME / 2, 3).fill(color);
      dots.circle(along + BOARD / n / 2, BOARD + FRAME / 2, 3).fill(color);
      dots.circle(-FRAME / 2, along + BOARD / n / 2, 3).fill(color);
      dots.circle(BOARD + FRAME / 2, along + BOARD / n / 2, 3).fill(color);
    }
    this.addChild(dots);
    const cells = new Container();
    for (let i = 0; i < ROWS * COLS; i++) {
      const s = new Sprite(art.cell);
      s.width = s.height = CELL;
      s.position.set((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
      cells.addChild(s);
    }
    this.addChild(cells);
    const back = new Container();
    const front = new Container();
    const glowTex = softDot('#ffffff');
    for (let i = 0; i < ROWS * COLS; i++) this.spots.push(new SpotView(art, i, back, front, glowTex));
    const mask = new Graphics().rect(0, 0, BOARD, BOARD).fill(0xffffff);
    this.symbolsLayer.mask = mask;
    const lacquerMask = new Graphics().roundRect(-FRAME, -FRAME, BOARD + FRAME * 2, BOARD + FRAME * 2, 34).fill(0xffffff);
    this.lacquer.mask = lacquerMask;
    this.addChildAt(this.lacquer, 1);
    this.addChild(lacquerMask, back, mask, this.symbolsLayer, front, this.outlines, this.fx);
    this.idle();
  }

  /** Точка поля в координатах екрана. */
  private global(x: number, y: number): { x: number; y: number } {
    const p = this.toGlobal(new Point(x, y));
    return { x: p.x, y: p.y };
  }

  /**
   * Поки поле стоїть, символи живуть: час від часу високий символ хитається, на ньому спалахує іскра.
   */
  private idle(): void {
    gsap.delayedCall(1.6 + Math.random() * 1.8, () => {
      if (!this.animating && !this.reducedMotion && this.visible && !document.hidden) {
        const high = this.sprites
          .map((s, i) => ({ s, i }))
          .filter(({ s, i }) => s && ['ROOSTER', 'FIREBIRD', 'KALYNA', 'MALLOW', 'PLATE'].includes(this.grid[i]));
        const pick = high[(Math.random() * high.length) | 0];
        if (pick?.s) {
          const s = pick.s;
          const base = s.rotation;
          gsap.timeline().to(s, { rotation: base + 0.09, duration: 0.18, ease: 'sine.out' }).to(s, { rotation: base - 0.06, duration: 0.22 }).to(s, { rotation: base, duration: 0.25, ease: 'sine.inOut' });
          const sp = new Sprite(this.sparkleTex);
          sp.anchor.set(0.5);
          sp.blendMode = 'add';
          sp.position.set(s.x + CELL * 0.22, s.y - CELL * 0.22);
          sp.scale.set(0);
          this.fx.addChild(sp);
          gsap.timeline({ onComplete: () => sp.destroy() })
            .to(sp.scale, { x: 0.7, y: 0.7, duration: 0.25, ease: 'back.out(3)' })
            .to(sp, { rotation: 1.2, duration: 0.6 }, 0)
            .to(sp, { alpha: 0, duration: 0.3 }, 0.3);
        }
      }
      this.idle();
    });
  }

  /**
   * Контур кластера: обхід зовнішніх країв його клітинок, мазок вохрою зі світінням.
   */
  private outline(cells: number[], tl: gsap.core.Timeline): Graphics {
    const set = new Set(cells);
    const g = new Graphics();
    const pad = 3;
    for (const i of cells) {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const x0 = c * CELL + pad;
      const y0 = r * CELL + pad;
      const x1 = (c + 1) * CELL - pad;
      const y1 = (r + 1) * CELL - pad;
      if (r === 0 || !set.has(i - COLS)) g.moveTo(x0, y0).lineTo(x1, y0);
      if (r === ROWS - 1 || !set.has(i + COLS)) g.moveTo(x0, y1).lineTo(x1, y1);
      if (c === 0 || !set.has(i - 1)) g.moveTo(x0, y0).lineTo(x0, y1);
      if (c === COLS - 1 || !set.has(i + 1)) g.moveTo(x1, y0).lineTo(x1, y1);
    }
    g.stroke({ width: 5, color: 0xf2b630, cap: 'round', join: 'round' });
    if (this.rich) g.filters = [new GlowFilter({ distance: 14, outerStrength: 2.4, innerStrength: 0.4, color: 0xffc24a, quality: 0.25 })];
    g.alpha = 0;
    this.outlines.addChild(g);
    tl.to(g, { alpha: 1, duration: this.t(0.16) }, 0);
    tl.to(g, { alpha: 0.55, duration: this.t(0.18), yoyo: true, repeat: 1 }, this.t(0.16));
    return g;
  }

  private t(seconds: number): number {
    return seconds * this.speed;
  }

  private makeSprite(id: SymbolId, i: number, rowOffset = 0): Sprite {
    const s = new Sprite(this.art.symbols[id]);
    s.anchor.set(0.5);
    s.width = s.height = CELL - 8;
    const { x, y } = center(i);
    s.position.set(x, y + rowOffset * CELL);
    this.symbolsLayer.addChild(s);
    return s;
  }

  setGrid(grid: Grid): void {
    this.grid = grid.slice();
    for (let i = 0; i < grid.length; i++) {
      kill(this.sprites[i]);
      this.sprites[i] = this.makeSprite(grid[i], i);
    }
  }

  setSpots(spots: Spots): void {
    spots.forEach((lv, i) => this.spots[i].set(lv));
  }

  /** Старі символи падають униз за край сітки (початок спіну). */
  async clearOut(ep: Episode): Promise<void> {
    this.animating = true;
    const tl = gsap.timeline();
    this.sprites.forEach((s, i) => {
      if (!s) return;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      tl.to(s, { y: s.y + BOARD + CELL, duration: this.t(0.32), ease: 'power2.in' }, this.t(c * 0.035 + (ROWS - 1 - r) * 0.012));
    });
    await ep.play(tl);
    this.sprites.forEach((s, i) => {
      kill(s);
      this.sprites[i] = null;
    });
  }

  /**
   * Нова сітка падає згори: стовпці один за одним, у стовпці — знизу вгору.
   * Якщо дві тарілки вже лягли, решта стовпців затримується й падає повільніше — очікування третьої.
   */
  async dropIn(grid: Grid, ep: Episode): Promise<void> {
    this.grid = grid.slice();
    const tl = gsap.timeline();
    let plates = 0;
    let extra = 0;
    let waiting = false;
    for (let c = 0; c < COLS; c++) {
      if (plates >= 2 && !waiting && !this.reducedMotion) {
        waiting = true;
        const at = this.t(c * 0.06 + 0.35);
        const glow = new Graphics().roundRect(c * CELL, 0, (COLS - c) * CELL, BOARD, 18).fill({ color: 0xf2b630, alpha: 1 });
        glow.alpha = 0;
        this.fx.addChild(glow);
        tl.to(glow, { alpha: 0.16, duration: this.t(0.3), yoyo: true, repeat: 3, ease: 'sine.inOut', onComplete: () => glow.destroy() }, at);
        tl.call(() => this.sound.anticipate(this.t(1)), [], at);
        extra = this.t(1.1);
      }
      for (let r = 0; r < ROWS; r++) {
        const i = r * COLS + c;
        const s = this.makeSprite(grid[i], i, -ROWS - 1);
        this.sprites[i] = s;
        const slow = waiting ? 1.5 : 1;
        tl.to(s, { y: center(i).y, duration: this.t(0.42 * slow), ease: 'bounce.out' }, this.t(c * 0.06 + (ROWS - 1 - r) * 0.025) + extra);
        if (grid[i] === 'PLATE') plates++;
      }
    }
    tl.call(() => this.sound.land(), [], this.t(0.25));
    await ep.play(tl);
    this.animating = false;
  }

  /** «Мазок»: пензель веде криву через сітку, слідом розпускаються бутони. */
  async stroke(stroke: Stroke, ep: Episode, spotsAfter: Spots): Promise<void> {
    const [[x0, y0], [x1, y1], [x2, y2]] = stroke.points;
    const px = (v: number) => v * CELL + CELL / 2;
    const curve = (t: number) => {
      const u = 1 - t;
      return new Point(px(u * u * x0 + 2 * u * t * x1 + t * t * x2), px(u * u * y0 + 2 * u * t * y1 + t * t * y2));
    };
    const N = 48;
    const points = Array.from({ length: N }, () => curve(0));
    const rope = new MeshRope({ texture: this.art.brush, points, textureScale: 0 });
    rope.alpha = 0.92;
    this.fx.addChild(rope);
    const state = { p: 0 };
    const order = new Map(stroke.cells.map((cell, k) => [cell, k]));
    const shown = new Set<number>();
    this.sound.brush(this.t(0.9));
    const tl = gsap.timeline();
    tl.to(state, {
      p: 1,
      duration: this.t(0.9),
      ease: 'power1.inOut',
      onUpdate: () => {
        for (let k = 0; k < N; k++) {
          const pt = curve((k / (N - 1)) * state.p);
          points[k].set(pt.x, pt.y);
        }
        // бутон з’являється, коли пензель доходить до його клітинки
        const reached = Math.floor(state.p * stroke.cells.length);
        for (const [cell, k] of order) {
          if (k <= reached && !shown.has(cell)) {
            shown.add(cell);
            this.spots[cell].set(spotsAfter[cell]);
            const pop = gsap.timeline();
            this.spots[cell].pop(pop, 0);
            this.sound.bud(spotsAfter[cell]);
          }
        }
      },
    });
    tl.to(rope, { alpha: 0, duration: this.t(0.45) }, '+=0.15');
    await ep.play(tl);
    for (const cell of stroke.cells) this.spots[cell].set(spotsAfter[cell]);
    rope.destroy();
  }

  /** Один каскад: підсвітка й виплата → вибух і ріст квіток → падіння й нові символи. */
  async tumble(t: Tumble, ep: Episode, celebrate: boolean): Promise<void> {
    this.animating = true;
    // 1) підсвітка кластерів і суми
    const hl = gsap.timeline();
    const lines: Graphics[] = [];
    if (celebrate) {
      const top = t.clusters.reduce((a, b) => (b.cells.length * b.multiplier > a.cells.length * a.multiplier ? b : a));
      const pts = top.cells.map(center);
      const cx = pts.reduce((s2, p2) => s2 + p2.x, 0) / pts.length;
      const cy = pts.reduce((s2, p2) => s2 + p2.y, 0) / pts.length;
      const g = this.global(cx, cy);
      const winX = t.clusters.reduce((s2, c) => s2 + c.units * c.multiplier, 0) / 20;
      this.events.win?.({ ...g, cells: top.cells.length, multiplier: Math.max(...t.clusters.map((c) => c.multiplier)), winX });
    }
    for (const cl of t.clusters) {
      if (celebrate) lines.push(this.outline(cl.cells, hl));
      // без святкування (UKGC, виграш не більший за ставку) символи не підстрибують, сума з’являється тихо
      if (celebrate) {
        for (const i of cl.cells) {
          const s = this.sprites[i]!;
          const base = s.scale.x;
          hl.to(s.scale, { x: base * 1.14, y: base * 1.14, duration: this.t(0.18), yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
        }
      } else {
        hl.to({}, { duration: this.t(0.36) }, 0);
      }
      this.winLabel(cl, hl, celebrate);
    }
    if (celebrate) this.sound.cluster(t.clusters);
    await ep.play(hl);
    await ep.wait(this.t(0.25) * 1000);

    for (const g of lines) gsap.to(g, { alpha: 0, duration: 0.2, onComplete: () => g.destroy() });
    // 2) вибух: символи розлітаються пелюстками, клітинки ростуть
    const boom = gsap.timeline();
    if (celebrate && t.removed.length >= 8) {
      const pts = t.removed.map(center);
      const g = this.global(pts.reduce((s2, p2) => s2 + p2.x, 0) / pts.length, pts.reduce((s2, p2) => s2 + p2.y, 0) / pts.length);
      boom.call(() => this.events.burst?.({ ...g, cells: t.removed.length }), [], this.t(0.12));
    }
    for (const i of t.removed) {
      const s = this.sprites[i]!;
      boom.to(s.scale, { x: 0, y: 0, duration: this.t(0.22), ease: 'back.in(2)' }, 0);
      if (!this.reducedMotion) this.petals(i, this.grid[i], boom);
    }
    boom.call(
      () => {
        for (const i of t.removed) {
          this.spots[i].set(t.spots[i]);
        }
      },
      [],
      this.t(0.2),
    );
    for (const i of t.removed) {
      boom.call(() => this.spots[i].pop(gsap.timeline(), 0), [], this.t(0.2));
    }
    boom.call(() => this.sound.grow(Math.max(...t.removed.map((i) => t.spots[i]))), [], this.t(0.2));
    await ep.play(boom);
    for (const i of t.removed) {
      kill(this.sprites[i]);
      this.sprites[i] = null;
    }

    // 3) падіння: що лишилось, опускається; згори — нові символи
    const removed = new Set(t.removed);
    const fall = gsap.timeline();
    const next: (Sprite | null)[] = this.sprites.slice();
    for (const m of fallPlan(removed)) {
      const from = m.from * COLS + m.col;
      const to = m.to * COLS + m.col;
      const s = this.sprites[from]!;
      next[to] = s;
      if (next[from] === s) next[from] = null;
      fall.to(s, { y: center(to).y, duration: this.t(0.3 + (m.to - m.from) * 0.03), ease: 'bounce.out' }, this.t(m.col * 0.03));
    }
    t.refill.forEach((fresh, c) => {
      fresh.forEach((id, k) => {
        const i = k * COLS + c;
        const s = this.makeSprite(id, i, -fresh.length - 0.3);
        next[i] = s;
        fall.to(s, { y: center(i).y, duration: this.t(0.36 + fresh.length * 0.03), ease: 'bounce.out' }, this.t(c * 0.03 + 0.06));
      });
    });
    fall.call(() => this.sound.land(), [], this.t(0.22));
    for (let i = 0; i < next.length; i++) this.sprites[i] = next[i];
    this.grid = t.grid.slice();
    await ep.play(fall);
    this.animating = false;
  }

  /** Координати клітинки на екрані — для камери (наприклад, наїзд на тарілку). */
  cellOnScreen(i: number): { x: number; y: number } {
    const { x, y } = center(i);
    return this.global(x, y);
  }

  /** Тарілки на фінальній сітці: пульс; три й більше — запуск бонусу. */
  async plates(cells: number[], ep: Episode, trigger: boolean): Promise<void> {
    if (!cells.length) return;
    const tl = gsap.timeline();
    cells.forEach((i, k) => {
      const s = this.sprites[i]!;
      const base = s.scale.x;
      tl.to(s.scale, { x: base * 1.25, y: base * 1.25, duration: this.t(0.2), yoyo: true, repeat: trigger ? 3 : 1, ease: 'sine.inOut' }, this.t(k * 0.12));
      tl.call(() => this.sound.plate(k), [], this.t(k * 0.12));
      if (trigger) tl.to(s, { rotation: Math.PI * 2, duration: this.t(0.8), ease: 'power2.inOut' }, this.t(k * 0.12));
    });
    await ep.play(tl);
  }

  private winLabel(cl: ClusterWin, tl: gsap.core.Timeline, pop: boolean): void {
    const pts = cl.cells.map(center);
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const text = cl.multiplier > 1 ? `${this.money(cl.amount)}  ×${cl.multiplier}` : this.money(cl.amount);
    const label = new Text({
      text,
      style: {
        fontFamily: 'Fira Sans Condensed, system-ui, sans-serif',
        fontWeight: '800',
        fontSize: 30,
        fill: PALETTE.cream,
        stroke: { color: PALETTE.lacquer, width: 6 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.fx.addChild(label);
    if (pop) tl.fromTo(label.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: this.t(0.25), ease: 'back.out(2)' }, 0);
    else tl.fromTo(label, { alpha: 0 }, { alpha: 0.85, duration: this.t(0.2) }, 0);
    tl.to(label, { y: y - 26, alpha: 0, duration: this.t(0.5), onComplete: () => label.destroy() }, this.t(0.75));
  }

  private petals(i: number, id: SymbolId, tl: gsap.core.Timeline): void {
    const { x, y } = center(i);
    for (let k = 0; k < 4; k++) {
      const p = new Sprite(this.art.petal);
      p.anchor.set(0.5);
      p.tint = k % 2 ? TINT[id] : 0xf2b630;
      p.position.set(x, y);
      p.rotation = Math.random() * Math.PI * 2;
      this.fx.addChild(p);
      const a = (k / 4) * Math.PI * 2 + Math.random();
      const d = 30 + Math.random() * 30;
      tl.to(p, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 24, rotation: p.rotation + 3, alpha: 0, duration: this.t(0.55), ease: 'power2.out', onComplete: () => p.destroy() }, 0);
    }
  }

  textureOf(id: SymbolId): Texture {
    return this.art.symbols[id];
  }
}
