import gsap from 'gsap';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FULL_BOARD_AWARD, isJackpot, type JackpotId } from '../../shared/symbols';
import { COLS, ROWS, allPositions, readingOrder, type Cell, type Grid, type Landed, type MultiHit, type MysteryReveal, type Pos } from '../../shared/types';
import { cellValue } from '../../shared/values';
import { FIELD, type Art } from '../art/textures';
import type { AudioEngine } from '../audio/AudioEngine';
import { FONT_STENCIL, FONT_UI } from '../core/fonts';
import { formatMoney } from '../core/format';
import { settings } from '../core/settings';
import { Episode, Signal, play, wait } from '@slotkit/core';
import { SymbolView } from './SymbolView';
import type { Fx } from './Fx';
import { POT_STYLE, potToken } from './Jars';

const W = FIELD.cellW;
const H = FIELD.cellH;
const center = (p: Pos) => ({ x: p.c * W + W / 2, y: p.r * H + H / 2 });

/**
 * Порожня клітина під час респіну: міні-барабан, що крутиться лише у вільних клітинах.
 * Дві «плитки» йдуть безперервною стрічкою, швидкість розганяється й гаситься твінами — без ривків.
 */
/**
 * Обертання вільної клітини в респіні — маленький барабан, що котиться до гравця.
 * Чотири плитки на колі: позиція й висота плитки — проєкція кута (y = R·sin θ, висота ∝ cos θ),
 * прозорість теж ∝ cos θ. Плитка змінює символ лише тоді, коли вона «за барабаном» і невидима,
 * тож нічого не з’являється й не зникає різко — без масок і без мерехтіння.
 */
class Spinner extends Container {
  private static readonly R = 50;
  private static readonly SIZE = 116; // R і SIZE підібрані так, щоб плитка не виходила за клітину
  private static readonly OMEGA = 11; // рад/с на повній швидкості
  private readonly tiles: { sp: Sprite; back: boolean }[] = [];
  private phase = 0;
  private omega = 0;
  private running = false;

  constructor(private readonly art: Art) {
    super();
    for (let i = 0; i < 4; i++) {
      const sp = new Sprite(art.symbols.PEARL.blur);
      sp.anchor.set(0.5);
      this.tiles.push({ sp, back: true });
      this.addChild(sp);
    }
    this.visible = false;
  }

  start(): void {
    gsap.killTweensOf(this);
    this.visible = true;
    this.running = true;
    this.alpha = 1;
    this.phase = Math.random() * Math.PI * 2;
    for (const t of this.tiles) this.pick(t.sp);
    this.omega = 0;
    gsap.to(this, { omega: Spinner.OMEGA, duration: 0.16, ease: 'power1.in' });
    this.layout();
  }

  update(dtMs: number): void {
    if (!this.visible) return;
    this.phase += (this.omega * dtMs) / 1000;
    this.layout();
  }

  private layout(): void {
    const { R, SIZE } = Spinner;
    this.tiles.forEach((t, i) => {
      // плитки йдуть зверху вниз: кут росте → sin росте
      const th = this.phase + (i * Math.PI) / 2;
      const c = Math.cos(th);
      const back = c <= 0.02;
      if (back && !t.back) this.pick(t.sp); // сховалася за барабан — можна змінити символ
      t.back = back;
      t.sp.visible = !back && t.sp.texture !== null;
      if (back) return;
      t.sp.y = R * Math.sin(th);
      t.sp.width = SIZE;
      t.sp.height = SIZE * c;
      t.sp.alpha = 0.72 * Math.pow(c, 1.3);
    });
  }

  stop(): void {
    this.running = false;
    gsap.to(this, { omega: Spinner.OMEGA * 0.35, duration: 0.12, ease: 'power2.out' });
    gsap.to(this, { alpha: 0, duration: 0.16, onComplete: () => void (this.visible = this.running) });
  }

  private pick(t: Sprite): void {
    const roll = Math.random();
    // порожніх плиток немає: між перлинами — блідий контур мушлі чи бирки, тож ритм рівний
    const id = roll < 0.5 ? 'PEARL' : roll < 0.75 ? 'SHELL' : roll < 0.88 ? 'BLACK' : 'JP1';
    t.texture = this.art.symbols[id].blur;
  }
}

/** Заголовок бонусу, лічильник спроб і сума над полем. */
export class SalvageHud extends Container {
  private readonly title: Text;
  private readonly pips: Graphics[] = [];
  readonly total: Text;
  private readonly totalBox = new Container();
  private value = 0;

  constructor() {
    super();
    this.title = new Text({
      text: 'SALVAGE',
      style: { fontFamily: FONT_STENCIL, fontWeight: '900', fontSize: 62, fill: '#F4F8FF', letterSpacing: 4 },
    });
    this.title.anchor.set(0, 0.5);
    this.addChild(this.title);
    for (let i = 0; i < 3; i++) {
      // лічильник спроб — три «отвори» на бирці: світлі, поки спроба є
      const g = new Graphics();
      g.circle(0, 0, 13).stroke({ color: 0xf4f8ff, width: 3 });
      g.circle(0, 0, 8).fill(0xf4f8ff);
      g.y = 0;
      this.pips.push(g);
      this.addChild(g);
    }
    const box = new Graphics().roundRect(-130, -32, 260, 64, 8).fill({ color: 0xff5b4a });
    box.circle(-112, 0, 4.5).fill({ color: 0xf4f8ff });
    this.totalBox.rotation = -0.025;
    this.total = new Text({
      text: '0',
      style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 40, fill: '#FFFFFF' },
    });
    this.total.anchor.set(0.5);
    this.totalBox.addChild(box, this.total);
    this.addChild(this.totalBox);
    this.visible = false;
  }

  layout(width: number): void {
    this.title.x = 0;
    this.pips.forEach((p, i) => (p.x = this.title.width + 34 + i * 36));
    this.totalBox.x = width - 130;
  }

  /** Центр лічильника суми в глобальних координатах (для перельотів у шарі збору). */
  totalGlobal(): { x: number; y: number } {
    return this.totalBox.getGlobalPosition();
  }

  setTitle(deep: boolean): void {
    this.title.text = deep ? 'DEEP SALVAGE' : 'SALVAGE';
    this.layout(FIELD.cellW * COLS);
  }

  private lastPulse: gsap.core.Tween | null = null;

  /** Кількість вогників-спроб: 3 або 4 з банкою Extra. Новий вогник «вистрибує». */
  setMaxRespins(n: number, animate = false): void {
    while (this.pips.length < n) {
      const g = new Graphics();
      g.circle(0, 0, 13).stroke({ color: 0xf4f8ff, width: 3 });
      g.circle(0, 0, 8).fill(0xf4f8ff);
      this.pips.push(g);
      this.addChild(g);
      if (animate && !settings.reducedMotion) gsap.fromTo(g.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(4)' });
    }
    while (this.pips.length > n) this.pips.pop()!.destroy();
    this.layout(FIELD.cellW * COLS);
  }

  /** Центр ряду вогників у глобальних координатах — сюди виливається банка Extra. */
  pipsGlobal(): { x: number; y: number } {
    const last = this.pips[this.pips.length - 1];
    return last.getGlobalPosition();
  }

  setRespins(n: number, flash = false): void {
    // останній шанс: єдиний вогник стає кораловим і пульсує
    this.lastPulse?.kill();
    this.lastPulse = null;
    this.pips.forEach((p, i) => {
      const on = i < n;
      p.tint = 0xffffff;
      gsap.to(p, { alpha: on ? 1 : 0.28, duration: 0.15 });
      if (flash && on) gsap.fromTo(p.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)', delay: i * 0.04 });
      else if (!flash) p.scale.set(1);
    });
    if (n === 1) {
      const p = this.pips[0];
      p.tint = 0xff6b5b;
      if (!settings.reducedMotion) this.lastPulse = gsap.fromTo(p.scale, { x: 1, y: 1 }, { x: 1.3, y: 1.3, duration: 0.25, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  }

  setTotal(v: number): void {
    this.value = v;
    this.total.text = formatMoney(v);
  }

  showTotal(on: boolean): void {
    gsap.killTweensOf(this.totalBox);
    if (on) gsap.fromTo(this.totalBox, { alpha: 0 }, { alpha: 1, duration: 0.25 });
    else this.totalBox.alpha = 0;
  }

  add(v: number): void {
    this.setTotal(this.value + v);
    gsap.fromTo(this.total.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.2, ease: 'back.out(2)', overwrite: true });
  }
}

export class SalvageBoard extends Container {
  private readonly sockets: Sprite[][] = [];
  private readonly cells: SymbolView[][] = [];
  private readonly spinners: Spinner[][] = [];
  private readonly flash: Sprite[][] = [];
  private readonly ring: Sprite;
  private grid: Grid = [];
  private superActive = false;
  bet = 1;
  /** Фіксована нагорода з’явилася на полі (посадка або розкриття мушлі). */
  onJackpot: (id: JackpotId) => void = () => undefined;
  /** Скільки клітин заповнено (null — бонус закінчився): рядок нагород показує поступ до повного поля. */
  onFill: (filled: number | null) => void = () => undefined;

  private get filledCount(): number {
    return allPositions().filter((p) => this.grid[p.c]?.[p.r]).length;
  }

  constructor(
    art: Art,
    private readonly fx: Fx,
    private readonly hud: SalvageHud,
    private readonly audio: AudioEngine,
  ) {
    super();
    for (let c = 0; c < COLS; c++) {
      this.sockets.push([]);
      this.cells.push([]);
      this.spinners.push([]);
      this.flash.push([]);
      for (let r = 0; r < ROWS; r++) {
        const { x, y } = center({ c, r });
        const sock = new Sprite(art.fx.socket);
        sock.anchor.set(0.5);
        sock.width = W - 4;
        sock.height = H - 4;
        sock.position.set(x, y);
        const sp = new Spinner(art);
        sp.position.set(x, y);
        const fl = new Sprite(art.fx.dot);
        fl.anchor.set(0.5);
        fl.width = fl.height = 230;
        fl.alpha = 0;
        fl.position.set(x, y);
        const v = new SymbolView(art.pack);
        v.position.set(x, y);
        v.visible = false;
        this.sockets[c].push(sock);
        this.spinners[c].push(sp);
        this.flash[c].push(fl);
        this.cells[c].push(v);
      }
    }
    for (const list of [this.sockets, this.spinners, this.cells, this.flash]) for (const col of list) this.addChild(...col);
    this.ring = new Sprite(art.fx.ring);
    this.ring.anchor.set(0.5);
    this.ring.alpha = 0;
    this.addChild(this.ring);
    this.visible = false;
  }

  update(dt: number): void {
    if (!this.visible) return;
    for (const col of this.spinners) for (const s of col) s.update(dt);
  }

  /** Показати поле Salvage: перлини стоять там само, де впали на барабанах. */
  show(grid: Grid, bet: number, superActive: boolean): void {
    this.grid = grid.map((col) => col.map((c) => (c ? { ...c } : null)));
    this.bet = bet;
    this.superActive = superActive;
    this.visible = true;
    this.alpha = 1;
    for (const p of allPositions()) {
      const cell = this.grid[p.c][p.r];
      const v = this.cells[p.c][p.r];
      v.set(cell, bet, superActive);
      v.alpha = 1;
      v.scale.set(1);
      this.sockets[p.c][p.r].alpha = 1;
      this.spinners[p.c][p.r].visible = false;
    }
    this.onFill(this.filledCount);
  }

  /**
   * Boost: коралова хвиля проходить полем зліва направо, і кожна стартова перлина отримує +boost ставок —
   * номінал на бирці перераховується з «+€…» над перлиною.
   */
  async applyBoost(boost: number, ep: Episode): Promise<void> {
    const targets = allPositions()
      .filter((p) => this.grid[p.c][p.r]?.s === 'PEARL')
      .sort((a, b) => a.c - b.c || a.r - b.r);
    const tl = gsap.timeline();
    targets.forEach((p, i) => {
      const at = ep.skipped ? 0 : 0.1 + p.c * 0.12 + i * 0.02;
      tl.add(() => {
        const cell = this.grid[p.c][p.r]!;
        cell.v = (cell.v ?? 0) + boost;
        const v = this.cells[p.c][p.r];
        v.set(cell, this.bet, this.superActive);
        if (ep.skipped) return;
        v.pop(0.8);
        this.audio.sfx('boostHit', i / Math.max(1, targets.length - 1));
        const { x, y } = center(p);
        this.fx.burst(x, y, 8, POT_STYLE.boost.color);
        this.floatLabel(`+${formatMoney(boost * this.bet * (this.superActive ? 2 : 1))}`, x, y - 70, '#FF5B4A');
      }, at);
      if (!ep.skipped && !settings.reducedMotion) tl.fromTo(this.flash[p.c][p.r], { alpha: 0.7 }, { alpha: 0, duration: 0.35, immediateRender: false }, at);
    });
    tl.to({}, { duration: ep.skipped ? 0 : 0.5 });
    await ep.play(tl);
  }

  /**
   * Multi: з банки вилітають жетони «×m» і падають на перлини; номінал перлини множиться.
   * from — отвір банки Multi в глобальних координатах.
   */
  async applyMulti(hits: MultiHit[], from: { x: number; y: number }, ep: Episode): Promise<void> {
    for (const h of hits) {
      const cell = this.grid[h.c][h.r];
      if (!cell) continue;
      const v = this.cells[h.c][h.r];
      const { x, y } = center(h);
      if (!ep.skipped) {
        const start = this.fx.toLocal(from);
        const token = new Container();
        const sp = new Sprite(potToken('multi'));
        sp.anchor.set(0.5);
        sp.width = sp.height = 62;
        const label = new Text({ text: `×${h.m}`, style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 28, fill: '#0B2A5E' } });
        label.anchor.set(0.5);
        token.addChild(sp);
        // гліф жетона замінюємо на конкретний множник
        sp.visible = true;
        token.addChild(new Graphics().circle(0, 0, 22).fill({ color: POT_STYLE.multi.color }), label);
        token.position.set(start.x, start.y);
        this.fx.addChild(token);
        this.audio.sfx('potFly', 0.8);
        const o = { t: 0 };
        const cx = (start.x + x) / 2;
        const cy = Math.min(start.y, y) - 160;
        const tl = gsap.timeline({ onComplete: () => token.destroy({ children: true }) });
        tl.to(o, {
          t: 1,
          duration: settings.reducedMotion ? 0.2 : 0.55,
          ease: 'power1.in',
          onUpdate: () => {
            const t = o.t;
            token.x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cx + t * t * x;
            token.y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cy + t * t * y;
            token.rotation = t * 6;
            if (!settings.reducedMotion && Math.random() < 0.7) this.fx.trail(token.x, token.y, POT_STYLE.multi.color);
          },
        });
        await ep.play(tl);
      }
      cell.m = h.m;
      v.set(cell, this.bet, this.superActive);
      if (!ep.skipped) {
        v.pop(1.2);
        this.audio.sfx('multiHit', h.m / 5);
        this.fx.burst(x, y, 14, POT_STYLE.multi.color);
        this.floatLabel(`×${h.m}`, x, y - 64, '#F5C451', 54);
        await ep.wait(280);
      }
    }
  }

  /** Короткий напис над клітиною (+€…, ×3), що спливає і тане. */
  private floatLabel(text: string, x: number, y: number, color: string, size = 34): void {
    const t = new Text({ text, style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: size, fill: color, stroke: { color: '#061A40', width: 5, join: 'round' } } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fx.addChild(t);
    gsap
      .timeline({ onComplete: () => t.destroy() })
      .fromTo(t.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' })
      .to(t, { y: y - 46, alpha: 0, duration: 0.6, ease: 'sine.in' }, 0.45);
  }

  fadeInSockets(ms: number): Promise<void> {
    const tl = gsap.timeline();
    for (const p of allPositions()) {
      const s = this.sockets[p.c][p.r];
      tl.fromTo(s, { alpha: 0 }, { alpha: 1, duration: ms / 1000 }, (p.c + p.r) * 0.03);
    }
    return play(tl);
  }

  hide(): void {
    this.visible = false;
    this.onFill(null);
  }

  cellView(p: Pos): SymbolView {
    return this.cells[p.c][p.r];
  }

  /** Анімація одного респіну. Квік-стоп зупиняє всі вільні клітини одразу. */
  async respin(landed: Landed[], quick: Signal, lastChance = false): Promise<void> {
    const prof = settings.profile;
    const empty = allPositions().filter((p) => !this.grid[p.c][p.r]);
    for (const p of empty) this.spinners[p.c][p.r].start();
    this.audio.sfx('respinSpin');
    const lastOne = empty.length === 1;
    const raceQuick = (ms: number) => Promise.race([wait(ms), quick.promise]);
    // останній шанс: серцебиття, поки клітини крутяться, і трохи довше обертання
    let beat: gsap.core.Tween | null = null;
    if (lastChance && !quick.done) {
      const pulse = () => {
        this.audio.sfx('heartbeat');
        beat = gsap.delayedCall(0.5, pulse);
      };
      pulse();
    }
    const stopBeat = () => {
      beat?.kill();
      beat = null;
    };
    if (lastOne && !quick.done) {
      // остання вільна клітина — коротке очікування з променем
      const p = empty[0];
      const fl = this.flash[p.c][p.r];
      if (settings.reducedMotion) fl.alpha = 0.5;
      else gsap.to(fl, { alpha: 0.8, duration: 0.3, yoyo: true, repeat: 3 });
      this.audio.sfx('anticipation');
      await raceQuick(prof.respinSpin + prof.anticipation);
      this.audio.stopAnticipation();
      gsap.killTweensOf(fl);
      gsap.to(fl, { alpha: 0, duration: 0.15 });
    } else {
      await raceQuick(prof.respinSpin + (lastChance ? 350 : 0));
    }
    stopBeat();
    const byCol = new Map<number, Pos[]>();
    for (const p of empty) byCol.set(p.c, [...(byCol.get(p.c) ?? []), p]);
    const cols = [...byCol.keys()].sort((a, b) => a - b);
    const settles: Promise<void>[] = [];
    for (let i = 0; i < cols.length; i++) {
      if (i > 0) await raceQuick(prof.respinInterval);
      for (const p of byCol.get(cols[i])!) {
        this.spinners[p.c][p.r].stop();
        const hit = landed.find((l) => l.c === p.c && l.r === p.r);
        if (hit) settles.push(this.land(hit.cell, p));
      }
      this.audio.sfx('reelStop', 0.5);
    }
    await Promise.all(settles);
  }

  private land(cell: Cell, p: Pos): Promise<void> {
    this.grid[p.c][p.r] = { ...cell };
    const v = this.cells[p.c][p.r];
    v.set(cell, this.bet, this.superActive);
    v.alpha = 1;
    const { y } = center(p);
    const settle = settings.profile.landSettle / 1000;
    this.audio.sfx(cell.s === 'BLACK' ? 'superLand' : 'lock', this.filledCount / 15);
    this.onFill(this.filledCount);
    if (isJackpot(cell.s)) this.onJackpot(cell.s);
    const tl = gsap.timeline();
    // м’яке «осідання» за ~160 мс, далі один спалах фіксації
    tl.fromTo(v, { y: y - 26, alpha: 0.5 }, { y, alpha: 1, duration: settle, ease: 'power2.out' });
    if (!settings.reducedMotion) tl.fromTo(this.flash[p.c][p.r], { alpha: 0.8 }, { alpha: 0, duration: 0.4 }, settle);
    // поп символу запускається колбеком, а не вкладається в цей таймлайн: SymbolView керує своїми
    // ефектами сам (set() їх скидає), і чужий таймлайн не повинен від них залежати
    tl.add(() => void v.pop(0.6), settle);
    return play(tl);
  }

  /** Хвиля Super від чорної перлини: номінали звичайних перлин подвоюються за ~650 мс. */
  async superWave(origin: Pos, ep?: Episode): Promise<void> {
    this.superActive = true;
    const ms = settings.profile.superWave;
    const o = center(origin);
    const src = this.cells[origin.c][origin.r];
    this.audio.sfx('super');
    const tl = gsap.timeline();
    tl.to(src.scale, { x: 1.2, y: 1.2, duration: 0.15, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
    if (!settings.reducedMotion) {
      this.ring.position.set(o.x, o.y);
      tl.fromTo(this.ring, { width: 40, height: 40, alpha: 1 }, { width: W * 11, height: W * 11, alpha: 0, duration: ms / 1000, ease: 'power1.out' }, 0.12);
    }
    const maxD = Math.hypot(W * COLS, H * ROWS);
    for (const p of allPositions()) {
      const cell = this.grid[p.c][p.r];
      if (!cell || cell.s !== 'PEARL') continue;
      const v = this.cells[p.c][p.r];
      const c = center(p);
      const at = 0.12 + (Math.hypot(c.x - o.x, c.y - o.y) / maxD) * (ms / 1000) * 0.85;
      if (settings.reducedMotion) {
        tl.add(() => v.updateValue(this.bet, true), at);
        continue;
      }
      // «переворот» перлини, коли хвиля до неї доходить: номінал змінюється на ребрі
      tl.to(v.scale, { x: 0.05, duration: 0.09, ease: 'sine.in' }, at);
      tl.add(() => v.updateValue(this.bet, true), at + 0.09);
      tl.to(v.scale, { x: 1, duration: 0.12, ease: 'back.out(2)' }, at + 0.09);
      if (!settings.reducedMotion) tl.fromTo(this.flash[p.c][p.r], { alpha: 0.7 }, { alpha: 0, duration: 0.3, immediateRender: false }, at);
    }
    tl.add(() => {
      for (const p of allPositions()) this.cells[p.c][p.r].updateValue(this.bet, true);
    });
    await (ep ? ep.play(tl) : play(tl));
  }

  /** Розкриття мушель по черзі. */
  async reveal(reveals: MysteryReveal[], ep: Episode): Promise<void> {
    for (const rv of reveals) {
      const v = this.cells[rv.c][rv.r];
      const { x, y } = center(rv);
      const tl = gsap.timeline();
      if (!ep.skipped) {
        if (!settings.reducedMotion) {
          tl.to(v, { x: x - 5, duration: 0.04, yoyo: true, repeat: 3, ease: 'sine.inOut' });
          tl.set(v, { x });
        }
        tl.add(() => {
          v.showArt('SHELL_OPEN');
          this.audio.sfx('reveal');
        });
        tl.fromTo(this.flash[rv.c][rv.r], { alpha: 1 }, { alpha: 0, duration: 0.4 });
        tl.to(v.sprite, { alpha: 0, duration: 0.14 }, '+=0.05');
      }
      tl.add(() => {
        if (isJackpot(rv.cell.s)) this.onJackpot(rv.cell.s);
        this.grid[rv.c][rv.r] = { ...rv.cell };
        v.set(rv.cell, this.bet, this.superActive);
        v.sprite.alpha = 1;
        v.y = y;
      });
      if (!ep.skipped) tl.add(() => void v.pop(1));
      await ep.play(tl);
      if (rv.activatesSuper) await this.superWave(rv, ep);
      else if (ep.skipped) v.updateValue(this.bet, this.superActive);
      await ep.wait(settings.profile.reveal);
    }
    if (ep.skipped) for (const p of allPositions()) this.cells[p.c][p.r].updateValue(this.bet, this.superActive);
  }

  /** Збір: номінали перелітають до лічильника у порядку клітин. */
  async collect(fullBoard: boolean, ep: Episode): Promise<number> {
    const order = allPositions().filter((p) => this.grid[p.c][p.r]).sort(readingOrder);
    this.hud.setTotal(0);
    this.hud.showTotal(true);
    const target = this.fx.toLocal(this.hud.totalGlobal());
    const flights: Promise<void>[] = [];
    let sum = 0;
    for (const p of order) {
      const cell = this.grid[p.c][p.r]!;
      const value = cellValue(cell, this.superActive) * this.bet;
      sum += value;
      if (ep.skipped) continue;
      const from = this.toGlobal(center(p));
      const local = this.fx.toLocal(from);
      // номінал летить коралевою биркою до суми
      const txt = new Container();
      const label = new Text({ text: formatMoney(value), style: { fontFamily: FONT_UI, fontWeight: '700', fontSize: 30, fill: '#FFFFFF' } });
      label.anchor.set(0.5);
      const w = label.width + 22;
      txt.addChild(new Graphics().roundRect(-w / 2, -21, w, 42, 6).fill({ color: 0xff5b4a }), label);
      txt.position.set(local.x, local.y);
      this.fx.addChild(txt);
      const view = this.cells[p.c][p.r];
      gsap.to(view, { alpha: 0.45, duration: 0.2 });
      this.audio.sfx('collect', 0.4 + Math.min(0.6, order.indexOf(p) / order.length));
      const tl = gsap.timeline({ onComplete: () => txt.destroy({ children: true }) });
      tl.to(txt, { x: target.x, y: target.y, duration: 0.38, ease: 'power2.in' });
      tl.to(txt.scale, { x: 0.6, y: 0.6, duration: 0.38 }, 0);
      tl.add(() => this.hud.add(value));
      flights.push(ep.play(tl));
      await ep.wait(settings.profile.collectStep);
    }
    await Promise.all(flights);
    if (fullBoard) {
      // нагороду за повне поле показано перед збором; тут вона додається до лічильника один раз
      const award = FULL_BOARD_AWARD * this.bet;
      sum += award;
      if (!ep.skipped) {
        this.audio.sfx('win');
        this.hud.add(award);
        await ep.wait(350);
      }
    }
    this.hud.setTotal(sum);
    return sum;
  }
}
