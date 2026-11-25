import gsap from 'gsap';
import { Application, Container, Sprite, Text, TilingSprite } from 'pixi.js';
import { isTriggerSymbol } from '../../shared/symbols';
import { COLS, ROWS, type Grid, type Pos, type ReelBoard } from '../../shared/types';
import { FIELD, FRAME_PAD, type Art } from '../art/textures';
import type { AudioEngine } from '../audio/AudioEngine';
import { FONT_MONO } from '../core/fonts';
import { settings } from '../core/settings';
import { play, wait } from '@slotkit/core';
import { Environment, type SceneName } from './Environment';
import { Fx, WaveSweep } from './Fx';
import { Light } from './Light';
import type { Episode } from '@slotkit/core';
import { EPIC_WIN_X, MEGA_WIN_X } from '../../shared/config';
import type { LineWin } from '../../shared/types';
import { createReels, type GameReels, type GameWins } from './Reels';
import { SalvageBoard, SalvageHud } from './SalvageView';
import { Plunge } from './Plunge';
import { JackpotBar } from './JackpotBar';
import { Jars, POT_STYLE, potToken as potTokenTexture } from './Jars';
import type { SymbolView } from './SymbolView';
import { POT_SIZE } from '../../shared/config';
import type { PotId } from '../../shared/types';

const FW = FIELD.cellW * COLS;
const FH = FIELD.cellH * ROWS;
const JP_Y = 128; // під логотипом / панеллю бонусу — рядок фіксованих нагород
/** Банки 3 Pots: колонка ліворуч від рами (широкий екран) або ряд над полем (портрет). */
const JAR_COL_W = 172;
const JAR_ROW_H = 150;
const jarRowY = (tall: boolean) => JP_Y + JackpotBar.height(tall) + 10;
/** Верх рами поля: на портретному екрані нагороди йдуть у два ряди і ще ряд банок, тож поле нижче. */
const topFor = (tall: boolean) => jarRowY(tall) + (tall ? JAR_ROW_H + 12 : 0);
export const DESIGN_W = FW + FRAME_PAD * 2;
const designH = (tall: boolean) => topFor(tall) + FH + FRAME_PAD * 2;
/** Ширина сцени разом із колонкою банок на широкому екрані. */
const designW = (tall: boolean) => DESIGN_W + (tall ? 0 : JAR_COL_W);

/** Сцена гри: середовище, поле в латунній рамі, шари ефектів. Лише показ — без логіки правил. */
export class GameView {
  readonly env: Environment;
  readonly world = new Container();
  readonly field = new Container();
  readonly reels: GameReels;
  readonly wins: GameWins;
  readonly salvageHud = new SalvageHud();
  readonly salvage: SalvageBoard;
  readonly fx: Fx;
  readonly jackpots: JackpotBar;
  readonly jars: Jars;
  /** Найвищий шар сцени — жетони, що летять між полем і банками. */
  private readonly flyLayer = new Container();
  readonly sweep: WaveSweep;
  readonly plunge: Plunge;
  /** Світло під водою й камера з фільтрами (лише показ). */
  readonly light: Light;
  private readonly logo: Sprite;
  private readonly glass: Sprite;
  private readonly frame: Sprite;
  private readonly plate: Text;
  private readonly grain: TilingSprite;
  private shakeTl: gsap.core.Timeline | null = null;
  private readonly fxHolder = new Container();
  private tall = false;
  private glintIn = 2500;
  /** Відблиски на символах між спінами (вмикає GameFlow у стані idle). */
  idleGlints = false;

  constructor(
    readonly app: Application,
    readonly art: Art,
    readonly audio: AudioEngine,
  ) {
    this.env = new Environment(art);
    this.light = new Light(art);
    document.documentElement.dataset.fx = this.light.quality;
    this.sweep = new WaveSweep(art);
    this.plunge = new Plunge(art);

    this.logo = new Sprite(art.logo);
    this.logo.anchor.set(0.5);
    this.logo.width = DESIGN_W * 0.6;
    this.logo.scale.y = this.logo.scale.x;
    this.logo.position.set(DESIGN_W / 2, 58);

    // аркуш ціанотипії під барабанами
    this.glass = new Sprite(art.sheet);
    this.glass.width = FW;
    this.glass.height = FH;

    const board = createReels(art.pack);
    this.reels = board.reels;
    this.wins = board.wins;
    this.fx = new Fx(art, audio);
    this.salvage = new SalvageBoard(art, this.fx, this.salvageHud, audio);
    this.frame = new Sprite(art.frame);
    this.frame.width = DESIGN_W;
    this.frame.height = FH + FRAME_PAD * 2;
    // напис на паспарту, як під музейним відбитком; змінюється з режимом
    this.plate = new Text({ text: '', style: { fontFamily: FONT_MONO, fontWeight: '500', fontSize: 17, fill: '#10357A' } });
    this.plate.anchor.set(0, 0.5);
    this.setPlate('surface');

    // відблиски сонця лягають і на відбиток — над символами, під олівцевими лініями виграшу
    this.light.setPrintSize(FW, FH);
    this.field.addChild(this.glass, this.reels, this.salvage, this.light.print, this.wins);
    this.salvageHud.position.set(FRAME_PAD + 4, 60);
    this.jackpots = new JackpotBar(DESIGN_W, art);
    this.jackpots.position.set(0, JP_Y);
    this.salvage.onJackpot = (id) => this.jackpots.flash(id);
    this.salvage.onFill = (n) => this.jackpots.setProgress(n);
    this.wins.onBurst = (x, y, delay) => void gsap.delayedCall(delay, () => this.fx.burst(x, y, 7));
    this.wins.onClear = () => this.fx.clearWin();
    this.salvageHud.layout(FW);
    this.fxHolder.addChild(this.fx);
    this.jars = new Jars(art, { extra: '4 RESPINS', boost: '+VALUE', multi: '×2 – ×5' });
    const shadow = this.light.shadow(DESIGN_W, FH + FRAME_PAD * 2);
    this.world.addChild(shadow, this.logo, this.salvageHud, this.jackpots, this.jars, this.field, this.frame, this.plate, this.fxHolder, this.flyLayer);
    this.place(false);


    // зерно друку поверх усієї сцени
    this.grain = new TilingSprite({ texture: art.fx.grain, width: 64, height: 64 });
    this.grain.alpha = 0.6;
    this.light.cam.addChild(this.world);
    app.stage.addChild(this.env, this.light.back, this.light.cam, this.light.front, this.sweep, this.grain, this.plunge);
    app.ticker.add((tk) => this.update(tk.deltaMS));
  }

  private update(dt: number): void {
    const capped = Math.min(dt, 50);
    this.env.update(capped);
    this.light.update(capped);
    this.reels.update(capped);
    this.salvage.update(capped);
    this.jars.update(capped);
    if (this.idleGlints && this.reels.visible && !this.wins.active && this.reels.reels.every((r) => r.isIdle)) {
      this.glintIn -= capped;
      if (this.glintIn <= 0) {
        this.glintIn = 1800 + Math.random() * 2600;
        const candidates: import('./SymbolView').SymbolView[] = [];
        this.reels.forEachSymbol((s) => {
          const id = s.symbol;
          if (id && id !== 'R1' && id !== 'R2' && id !== 'R3' && id !== 'R4') candidates.push(s);
        });
        candidates[Math.floor(Math.random() * candidates.length)]?.glint();
      }
    }
  }

  /** Масштаб, з яким поле стане в цю область (за кращим із двох компонувань). */
  fitScale(area: { w: number; h: number }): number {
    const kTall = Math.min(area.w / designW(true), area.h / designH(true));
    const kWide = Math.min(area.w / designW(false), area.h / designH(false));
    return kTall >= kWide * 0.88 ? kTall : kWide;
  }

  /** Поле вписується у вільну від HUD область. */
  layout(screenW: number, screenH: number, area: { x: number; y: number; w: number; h: number }): void {
    this.env.resize(screenW, screenH);
    this.sweep.resize(screenW, screenH);
    this.plunge.resize(screenW, screenH);
    this.grain.width = screenW;
    this.grain.height = screenH;
    // компонування, що дає більше поле; портретне (бирки у два ряди, банки рядком) читається краще,
    // тому його беремо, навіть якщо поле в ньому трохи дрібніше
    const kTall = Math.min(area.w / designW(true), area.h / designH(true));
    const kWide = Math.min(area.w / designW(false), area.h / designH(false));
    this.place(kTall >= kWide * 0.88);
    const h = designH(this.tall);
    const w = designW(this.tall);
    const left = this.tall ? 0 : JAR_COL_W; // колонка банок ліворуч від початку координат сцени
    const k = Math.min(area.w / w, area.h / h);
    this.world.scale.set(k);
    this.world.position.set(area.x + (area.w - w * k) / 2 + left * k, area.y + (area.h - h * k) / 2);
    const f = this.field.getBounds();
    this.light.layout(screenW, screenH, { x: f.x, y: f.y, w: f.width, h: f.height });
  }

  /** Розставляє раму, поле й напис під обране компонування (широке / портретне). */
  private place(tall: boolean): void {
    this.tall = tall;
    this.jackpots.arrange(tall);
    const top = topFor(tall);
    this.frame.position.set(0, top);
    this.light.shadow(DESIGN_W, FH + FRAME_PAD * 2).position.set(0, top);
    this.plate.position.set(FRAME_PAD, top + FH + FRAME_PAD * 1.5);
    this.field.position.set(FRAME_PAD, top + FRAME_PAD);
    this.fxHolder.position.copyFrom(this.field.position);
    if (tall) {
      const gap = 12;
      this.jars.position.set(0, jarRowY(true));
      this.jars.arrange('row', (DESIGN_W - gap * 2) / 3, JAR_ROW_H, gap);
    } else {
      const gap = 12;
      const frameH = FH + FRAME_PAD * 2;
      this.jars.position.set(-JAR_COL_W + 4, top);
      this.jars.arrange('column', JAR_COL_W - 22, (frameH - gap * 2) / 3, gap);
    }
  }

  // ───────────────────────────── 3 Pots ─────────────────────────────

  /**
   * Мітка злітає з перлини в свою банку дугою зі шлейфом; на прильоті банка «ковтає» (+1).
   * Повертає проміс прильоту.
   */
  flyMark(symbol: SymbolView, pot: PotId, delay = 0): Promise<void> {
    const jar = this.jars.jars[pot];
    const from = this.flyLayer.toLocal(symbol.markGlobal());
    const color = POT_STYLE[pot].color;
    const sp = new Sprite(potTokenTexture(pot));
    sp.anchor.set(0.5);
    sp.width = sp.height = 44;
    sp.position.copyFrom(from);
    sp.visible = false;
    this.flyLayer.addChild(sp);
    const o = { t: 0 };
    const dur = (settings.reducedMotion ? 0.25 : 0.62) * Math.max(0.6, settings.profile.transition);
    return new Promise((resolve) => {
      const tl = gsap.timeline({
        delay,
        onComplete: () => {
          sp.destroy();
          jar.gulp();
          this.audio.sfx('potGulp', Math.min(1, jar.level / POT_SIZE));
          if (jar.state === 'full' && Math.round(jar.level) === POT_SIZE) this.audio.sfx('potFull');
          const mouth = this.flyLayer.toLocal(jar.mouthGlobal());
          this.splash(mouth.x, mouth.y, color);
          resolve();
        },
        onInterrupt: () => resolve(),
      });
      tl.add(() => {
        sp.visible = true;
        symbol.hideMark();
        this.audio.sfx('potFly', Math.random());
      });
      if (!settings.reducedMotion) tl.fromTo(sp.scale, { x: sp.scale.x * 1.6, y: sp.scale.y * 1.6 }, { x: sp.scale.x, y: sp.scale.y, duration: 0.18, ease: 'back.out(3)' });
      tl.to(o, {
        t: 1,
        duration: dur,
        ease: 'power1.inOut',
        onUpdate: () => {
          // ціль перераховується щокадру: банка може «дихати» під час прильоту
          const to = this.flyLayer.toLocal(jar.mouthGlobal());
          const cx = (from.x + to.x) / 2 + (to.x < from.x ? -60 : 60);
          const cy = Math.min(from.y, to.y) - 190;
          const t = o.t;
          sp.x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
          sp.y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
          sp.rotation = t * 5;
          const sc = (44 / sp.texture.width) * (1 - t * 0.35);
          sp.scale.set(sc);
          if (!settings.reducedMotion) this.trailDot(sp.x, sp.y, color);
        },
      });
    });
  }

  /** Струмінь з банки до точки (виливання модифікатора). */
  pourStream(fromGlobal: { x: number; y: number }, toGlobal: { x: number; y: number }, pot: PotId, seconds: number): void {
    const color = POT_STYLE[pot].color;
    this.audio.sfx('potPour');
    if (settings.reducedMotion) return;
    const from = this.flyLayer.toLocal(fromGlobal);
    const to = this.flyLayer.toLocal(toGlobal);
    const n = Math.round(seconds * 40);
    for (let i = 0; i < n; i++) {
      const d = new Sprite(this.art.fx.dot);
      d.anchor.set(0.5);
      d.tint = color;
      d.width = d.height = 14 + Math.random() * 16;
      d.position.copyFrom(from);
      d.alpha = 0;
      this.flyLayer.addChild(d);
      const o = { t: 0 };
      const spread = (Math.random() - 0.5) * 80;
      const cx = (from.x + to.x) / 2 + spread;
      const cy = Math.min(from.y, to.y) - 120 - Math.random() * 60;
      gsap.to(o, {
        t: 1,
        delay: (i / n) * seconds,
        duration: 0.45 + Math.random() * 0.15,
        ease: 'power1.in',
        onStart: () => void (d.alpha = 0.9),
        onUpdate: () => {
          const t = o.t;
          d.x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * (to.x + spread * 0.4);
          d.y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
        },
        onComplete: () => d.destroy(),
      });
    }
    gsap.delayedCall(seconds + 0.4, () => {
      const p = this.flyLayer.toLocal(toGlobal);
      this.splash(p.x, p.y, color, 18);
    });
  }

  private trailDot(x: number, y: number, tint: number): void {
    const s = new Sprite(this.art.fx.dot);
    s.anchor.set(0.5);
    s.tint = tint;
    s.width = s.height = 18 + Math.random() * 10;
    s.position.set(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6);
    s.alpha = 0.8;
    this.flyLayer.addChildAt(s, 0);
    gsap.to(s, { alpha: 0, width: 3, height: 3, duration: 0.38, ease: 'power1.out', onComplete: () => s.destroy() });
  }

  private splash(x: number, y: number, tint: number, n = 10): void {
    if (settings.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.art.fx.dot);
      s.anchor.set(0.5);
      s.tint = i % 3 === 0 ? 0xf4f8ff : tint;
      s.width = s.height = 8 + Math.random() * 12;
      s.position.set(x, y);
      this.flyLayer.addChild(s);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const d = 30 + Math.random() * 60;
      gsap.to(s, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, duration: 0.35, ease: 'power2.out' });
      gsap.to(s, { y: `+=${40 + Math.random() * 30}`, alpha: 0, duration: 0.45, delay: 0.3, ease: 'power1.in', onComplete: () => s.destroy() });
    }
  }


  // ───────────────────────────── modes ─────────────────────────────

  showReels(board: ReelBoard, bet: number, mode: 'base' | 'freeDives'): void {
    this.wins.clear(); // нове поле — без олівцевих позначок попереднього раунду
    this.reels.setMode(mode);
    this.reels.restoreLayout();
    this.reels.setBoard(board, bet);
    this.reels.visible = true;
    this.salvage.hide();
    this.salvageHud.visible = false;
    this.logo.alpha = 1;
    this.logo.visible = true;
  }

  /** Суми фіксованих нагород над полем — для поточної ставки. */
  setBet(bet: number): void {
    this.jackpots.setBet(bet);
  }

  setScene(scene: SceneName): void {
    this.env.set(scene);
    this.light.setScene(scene, true);
    this.setPlate(scene);
  }

  /** Підпис на паспарту: «Plate I — Surface» тощо. */
  setPlate(scene: SceneName): void {
    const label: Record<SceneName, string> = { surface: 'Plate I — Surface', route: 'Plate II — Free Dives', seabed: 'Plate III — Salvage' };
    this.plate.text = label[scene];
  }

  /** Вхід у Salvage: фіксація тригера, занурення, течія змиває вільні символи. */
  async enterSalvage(board: ReelBoard, grid: Grid, bet: number, superActive: boolean, fromScene: SceneName): Promise<void> {
    const k = settings.profile.transition;
    // 1) фіксація тригера ~250 мс
    this.reels.forEachSymbol((s, c, r) => {
      if (isTriggerSymbol(board[c][r].s)) s.lockFlash();
      else s.stopWin();
    });
    this.audio.sfx('lock');
    await wait(250);
    // 2) занурення ~900 мс
    this.audio.sfx('whoosh', k);
    this.audio.music('salvage');
    const dive = 900 * k;
    gsap.to(this.logo, { alpha: 0, duration: 0.3 });
    this.setPlate('seabed');
    this.light.setScene('seabed');
    const c = this.fieldCenterGlobal();
    this.light.dive(c.x, c.y, 1, dive / 1000);
    await Promise.all([
      this.env.go('seabed', dive),
      this.sweep.play(dive, 1),
      this.plunge.play(1, this.fieldCenterGlobal(), dive / 1000, this.world),
      this.reels.washAway((c, r) => isTriggerSymbol(board[c][r].s), dive),
      wait(dive * 0.4).then(() => {
        this.salvage.show(grid, bet, superActive);
        this.reels.visible = false;
        return this.salvage.fadeInSockets(dive * 0.5);
      }),
    ]);
    void fromScene;
    // 3) новий лічильник з’являється після зміни фону
    this.logo.visible = false;
    this.salvageHud.setTitle(superActive);
    this.salvageHud.setMaxRespins(3);
    this.salvageHud.setRespins(3);
    this.salvageHud.setTotal(0);
    this.salvageHud.showTotal(false);
    this.salvageHud.visible = true;
    await play(gsap.fromTo(this.salvageHud, { alpha: 0, y: 76 }, { alpha: 1, y: 60, duration: 0.3 }));
  }

  /** Центр поля в глобальних координатах (сюди б’є струмінь Boost). */
  fieldCenterGlobal(): { x: number; y: number } {
    return this.field.toGlobal({ x: FW / 2, y: FH / 2 });
  }

  /** Відновлення посеред бонусу після перезавантаження. */
  restoreSalvage(grid: Grid, bet: number, superActive: boolean, respins: number, maxRespins = 3): void {
    this.env.set('seabed');
    this.light.setScene('seabed', true);
    this.setPlate('seabed');
    this.reels.visible = false;
    this.logo.visible = false;
    this.salvage.show(grid, bet, superActive);
    this.salvageHud.setTitle(superActive);
    this.salvageHud.setMaxRespins(maxRespins);
    this.salvageHud.setRespins(respins);
    this.salvageHud.setTotal(0);
    this.salvageHud.showTotal(false);
    this.salvageHud.alpha = 1;
    this.salvageHud.visible = true;
  }

  /** Повернення: попередній фон, розкладка й лічильники під переходом ~500 мс. */
  async exitSalvage(to: SceneName, board: ReelBoard, bet: number, mode: 'base' | 'freeDives'): Promise<void> {
    const ms = 500 * settings.profile.transition;
    this.audio.sfx('whoosh', 0.6);
    this.audio.music(mode);
    const fade = gsap.timeline();
    fade.to([this.salvage, this.salvageHud], { alpha: 0, duration: ms / 2000 });
    this.setPlate(to);
    this.light.setScene(to);
    const c = this.fieldCenterGlobal();
    this.light.dive(c.x, c.y, -1, ms / 1000);
    await Promise.all([this.env.go(to, ms), this.sweep.play(ms, -1), play(fade), this.plunge.play(-1, this.fieldCenterGlobal(), ms / 1000)]);
    this.salvage.alpha = 1;
    this.showReels(board, bet, mode);
    this.logo.alpha = 0;
    await play(gsap.to(this.logo, { alpha: 1, duration: 0.25 }));
  }

  async goScene(to: SceneName, withSweep = true): Promise<void> {
    const ms = 900 * settings.profile.transition;
    const down = to !== 'surface';
    this.audio.sfx('whoosh', settings.profile.transition);
    this.setPlate(to);
    this.light.setScene(to);
    const c = this.fieldCenterGlobal();
    this.light.dive(c.x, c.y, down ? 1 : -1, ms / 1000);
    await Promise.all([
      this.env.go(to, ms),
      withSweep ? this.sweep.play(ms, down ? 1 : -1) : Promise.resolve(),
      this.plunge.play(down ? 1 : -1, this.fieldCenterGlobal(), ms / 1000, down ? this.world : undefined),
    ]);
  }

  /** Легкий поштовх камери (вимикається в reduced motion). */
  shake(strength = 6): void {
    if (settings.reducedMotion) return;
    this.shakeTl?.progress(1);
    const x0 = this.field.x;
    const tl = gsap.timeline();
    for (let i = 0; i < 5; i++) tl.to(this.field, { x: x0 + (Math.random() - 0.5) * strength * 2, duration: 0.03 });
    tl.to(this.field, { x: x0, duration: 0.05 });
    this.shakeTl = tl;
  }

  /**
   * Світло на виграші: брижі від середини виграшних символів, засвітка й наближення — за розміром виграшу.
   * x — виграш у ставках.
   */
  winLight(wins: LineWin[], x: number): void {
    const cells = wins.flatMap((w) => w.positions);
    if (!cells.length) return;
    const cx = cells.reduce((s, p) => s + this.cellCenter(p).x, 0) / cells.length;
    const cy = cells.reduce((s, p) => s + this.cellCenter(p).y, 0) / cells.length;
    const g = this.field.toGlobal({ x: cx, y: cy });
    this.light.ripple(g.x, g.y, Math.min(24, 8 + x * 2));
    if (x >= 2) this.light.exposure(Math.min(1.1, 0.3 + x * 0.06), 0.8);
    if (x >= 6) this.light.punch(g.x, g.y, 0.025, 0.6);
  }

  /** Подія на все поле (повне поле в Salvage тощо): брижі від центру й засвітка. */
  impact(strength = 1): void {
    const c = this.fieldCenterGlobal();
    this.light.ripple(c.x, c.y, 20 + strength * 8);
    this.light.exposure(0.7 + strength * 0.3, 1);
    this.light.punch(c.x, c.y, 0.03, 0.7);
  }

  /** Великий виграш: світло й бульбашки навколо штампу з сумою. */
  async bigWin(amount: number, bet: number, ep: Episode): Promise<void> {
    const x = amount / bet;
    const c = this.fieldCenterGlobal();
    const stop = this.light.celebrate(c.x, c.y, x >= EPIC_WIN_X ? 3 : x >= MEGA_WIN_X ? 2 : 1);
    try {
      await this.fx.bigWin(amount, bet, ep);
    } finally {
      stop();
    }
  }

  cellCenter(p: Pos): { x: number; y: number } {
    return { x: p.c * FIELD.cellW + FIELD.cellW / 2, y: p.r * FIELD.cellH + FIELD.cellH / 2 };
  }
}
