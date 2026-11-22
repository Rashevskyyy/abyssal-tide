import gsap from 'gsap';
import { shouldStopAutoplay } from '@slotkit/controls';
import { BETS, BIG_WIN_X } from '../../shared/config';
import { isTriggerSymbol } from '../../shared/symbols';
import { COLS, allPositions, type Action, type Pos, type ReelBoard, type StepResult } from '../../shared/types';
import { SourceError, type LiveSource, type ResultSource, type RoundRecord, type SessionSnapshot } from '../../server/protocol';
import { ReplaySource } from '../../server/ReplaySource';
import { createShowcaseSource, type ScenarioId } from '../../server/showcase';
import type { AudioEngine } from '../audio/AudioEngine';
import { formatMoney } from '../core/format';
import { t } from '../core/i18n';
import { settings, type AutoConfig } from '../core/settings';
import { diagnostics } from '@slotkit/core';
import type { BonusChip, BonusScreenOptions } from '../hud/BonusScreen';
import { countFilled } from '../../shared/values';
import { POT_IDS, POT_SIZE, RESPINS, RESPINS_EXTRA } from '../../shared/config';
import { emptyPots, type Grid, type PotId, type Pots, type SalvageMods } from '../../shared/types';
import { Episode, Signal, wait } from '@slotkit/core';
import { formatDuration, type Hud } from '../hud/Hud';
import type { GameView } from '../view/GameView';
import type { SceneName } from '../view/Environment';

/**
 * Стани клієнта (GDD §3). Кожен перехід проходить через `go()`, який перевіряє таблицю
 * й пише журнал для оверлею налагодження.
 */
export type FlowState =
  | 'loading'
  | 'restoring'
  | 'idle'
  | 'spinning'
  | 'anticipation'
  | 'evaluating'
  | 'bigWin'
  | 'salvageIntro'
  | 'respin'
  | 'reveal'
  | 'collect'
  | 'returning'
  | 'fsIntro'
  | 'freeDives'
  | 'fsSummary';

export const TRANSITIONS: Record<FlowState, FlowState[]> = {
  loading: ['restoring', 'idle'],
  restoring: ['respin', 'reveal', 'freeDives', 'idle'],
  idle: ['spinning'],
  spinning: ['anticipation', 'evaluating'],
  anticipation: ['anticipation', 'evaluating'],
  evaluating: ['bigWin', 'salvageIntro', 'fsIntro', 'freeDives', 'fsSummary', 'idle'],
  bigWin: ['evaluating', 'salvageIntro', 'fsIntro', 'freeDives', 'fsSummary', 'idle', 'returning'],
  salvageIntro: ['respin', 'reveal'],
  respin: ['respin', 'reveal'],
  reveal: ['collect'],
  collect: ['bigWin', 'returning'],
  returning: ['fsIntro', 'freeDives', 'fsSummary', 'idle'],
  fsIntro: ['freeDives'],
  freeDives: ['spinning', 'fsSummary'],
  fsSummary: ['returning'],
};

class Aborted extends Error {}

/** Які банки працюють у цьому бонусі. */
const activePots = (m: SalvageMods): PotId[] => POT_IDS.filter((id) => (id === 'boost' ? m.boost > 0 : m[id]));

/** Активні банки рядками для екрана старту Salvage. */
const potChips = (m: SalvageMods, bet: number): BonusChip[] => [
  ...(m.extra ? [{ pot: 'extra' as const, label: 'EXTRA', text: t('chipExtra') }] : []),
  ...(m.boost ? [{ pot: 'boost' as const, label: 'BOOST', text: t('chipBoost', { v: formatMoney(m.boost * bet) }) }] : []),
  ...(m.multi ? [{ pot: 'multi' as const, label: 'MULTI', text: t('chipMulti') }] : []),
];

/** Сітка з номіналами до Boost — для показу перед анімацією виливання. */
const withoutBoost = (g: Grid, boost: number): Grid =>
  g.map((col) => col.map((c) => (c?.s === 'PEARL' ? { ...c, v: (c.v ?? 0) - boost } : c ? { ...c } : null)));

type Special = { kind: 'replay' | 'showcase'; abort: boolean } | null;

export class GameFlow {
  state: FlowState = 'loading';
  private source: ResultSource;
  private balance = 0;
  private roundBet = settings.prefs.bet;
  private pendingStepId: string | null = null;
  private episode: Episode | null = null;
  private quick: Signal | null = null;
  private nudge: Signal | null = null;
  /** Автогра: налаштування, залишок раундів і баланс на старті (для умов зупинки). */
  private auto: { cfg: AutoConfig; left: number; startBalance: number } | null = null;
  private lastRoundWin = 0;
  /** Сесія для відповідального гравця: чистий результат, час, нагадування (UKGC RTS 2E, 13). */
  private readonly sessionStart = Date.now();
  private sessionNet = 0;
  private realityAt = Infinity;
  private realityOpen = false;
  private roundMaxWin = false;
  /** Початок останньої платної гри (Date.now) — для мінімального ігрового циклу. */
  private cycleStart = 0;
  private cycleTimer = 0;
  /** Затиснутий «Спін»: поки тримають — спіни йдуть один за одним у турбо. */
  private held = false;
  private holding = false;
  private holdTimer: gsap.core.Tween | null = null;
  private special: Special = null;
  private readonly log: string[] = [];
  private pendingScatter: Pos[] = [];
  private stepSeq = 0;
  /** Банки 3 Pots усіх ставок, як їх бачить «сервер» (ключ — ставка в центах). */
  private pots: Record<string, Pots> = {};
  /** Перельоти міток поточного спіну. */
  private markFlights: Promise<void>[] = [];
  private reelMode: 'base' | 'freeDives' = 'base';

  private potsFor(bet: number): Pots {
    return this.pots[String(bet)] ?? emptyPots();
  }

  /**
   * Скільки екран бонусу чекає сам. В автогрі, затиснутому спіні й показі бонусу — коротко,
   * інакше екран чекає на гравця (із запасним таймером, щоб гра ніколи не стояла вічно).
   */
  private screenAutoMs(): number {
    const sp = settings.prefs.speed;
    if (this.auto || this.holding || this.special) return sp === 'turbo' ? 1200 : sp === 'quick' ? 1800 : 2600;
    return sp === 'turbo' ? 3000 : sp === 'quick' ? 6000 : 10_000;
  }

  private async bonusScreen(o: Omit<BonusScreenOptions, 'autoMs'>): Promise<void> {
    this.checkAbort();
    this.awaitingInput = true;
    this.hud.setSpinState('skip');
    try {
      await this.hud.bonus.show({ ...o, autoMs: this.screenAutoMs() });
    } finally {
      this.awaitingInput = false;
    }
    this.checkAbort();
  }

  /** Гра чекає на гравця (екран старту бонусу тощо) — сторож зависань мовчить. */
  awaitingInput = false;
  /** Видимий час без жодного переходу стан-машини, мс. */
  private stallMs = 0;
  private watchdogStage = 0;

  constructor(
    private readonly live: LiveSource,
    private readonly view: GameView,
    private readonly hud: Hud,
    private readonly audio: AudioEngine,
  ) {
    this.source = live;
    settings.on((p) => {
      this.live.failRate = p.netFail ? 0.25 : 0;
      this.audio.setVolumes(p.music, p.sfx, p.muted);
      this.renderDebug();
      if (this.state === 'idle' && !this.special) this.updateIdleMessage();
    });
    this.live.failRate = settings.prefs.netFail ? 0.25 : 0;
  }

  // ───────────────────────────── state ─────────────────────────────

  /** Журнал станів для e2e-тестів (лише додається, обрізається до останніх ~400). */
  readonly trace: FlowState[] = [];

  private go(next: FlowState): void {
    if (next !== this.state && !TRANSITIONS[this.state].includes(next)) {
      console.warn(`[flow] unexpected transition ${this.state} → ${next}`);
    }
    this.view.idleGlints = next === 'idle';
    this.stallMs = 0;
    this.watchdogStage = 0;
    this.log.unshift(`${this.state} → ${next}`);
    this.trace.push(next);
    if (this.trace.length > 400) this.trace.splice(0, 100);
    this.log.length = Math.min(this.log.length, 8);
    this.state = next;
    const busy = !['idle', 'spinning', 'anticipation'].includes(next);
    this.hud.setBetEnabled(next === 'idle' && !this.special);
    this.hud.setAutoEnabled(next === 'idle' && !this.special);
    if (next === 'idle') {
      const left = this.special ? 0 : this.cycleLeftMs();
      this.hud.setSpinState(this.special || left > 0 ? 'busy' : 'idle');
      window.clearTimeout(this.cycleTimer);
      if (left > 0) this.cycleTimer = window.setTimeout(() => this.state === 'idle' && !this.special && this.hud.setSpinState('idle'), left);
    }
    else if (next === 'spinning' || next === 'anticipation' || next === 'respin') this.hud.setSpinState('spinning');
    else if (busy) this.hud.setSpinState('busy');
    this.renderDebug();
  }

  renderDebug(): void {
    if (!settings.prefs.debug) return this.hud.setDebug(null);
    const last = diagnostics.last;
    this.hud.setDebug(
      [
        `state: ${this.state}`,
        `source: ${this.source.kind}`,
        `balance: ${this.balance}`,
        `speed: ${settings.prefs.speed}`,
        ...(last ? [`last ${last.kind}: ${last.message}`] : []),
        '',
        ...this.log,
      ].join('\n'),
    );
  }

  /** Звіт для «Копіювати діагностику» в меню. */
  diagnosticsInfo(): Record<string, unknown> {
    return { state: this.state, source: this.source.kind, balance: this.balance, trace: this.trace.slice(-40), awaitingInput: this.awaitingInput };
  }

  /**
   * Сторож зависань. Рахує лише видимий час (сховану вкладку не карає) і реагує поетапно:
   * 1) тікер GSAP перестав іти, поки вкладка видима — будимо його;
   * 2) 20 с без жодного переходу в активному стані — пропускаємо поточний епізод (як тап «пропуск»);
   * 3) ще 12 с — пропонуємо відновити гру: раунд збережено на «сервері», тож перезавантаження продовжить його.
   * Кожен крок пишеться в діагностику, щоб причину можна було знайти.
   */
  /** Годинник сесії: щосекунди оновлює рядок результату й часу та перевіряє нагадування. */
  startSessionClock(): void {
    const j = settings.jurisdiction;
    if (!j.showSession && j.realityCheckMin === null) return;
    if (j.realityCheckMin !== null) this.realityAt = Date.now() + j.realityCheckMin * 60_000;
    const tick = () => {
      if (j.showSession) this.hud.setSession(this.sessionNet, Date.now() - this.sessionStart);
      const quiet = this.state === 'idle' && !this.special && !this.auto && !this.hud.menuOpen && !this.hud.bonus.open;
      if (Date.now() >= this.realityAt && quiet && !this.realityOpen) this.realityCheck();
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /** Нагадування про час гри: гра чекає, доки гравець не відповість. */
  private realityCheck(): void {
    const j = settings.jurisdiction;
    this.realityOpen = true;
    this.hud.setSpinState('busy');
    const done = () => {
      this.realityOpen = false;
      this.realityAt = Date.now() + (j.realityCheckMin ?? 60) * 60_000;
      this.hud.hideNotice();
      if (this.state === 'idle' && !this.special) this.hud.setSpinState(this.cycleLeftMs() > 0 ? 'busy' : 'idle');
    };
    const net = this.sessionNet;
    const sign = net > 0 ? '+' : net < 0 ? '−' : '';
    this.hud.notice(t('realityCheck', { time: formatDuration(Date.now() - this.sessionStart), net: `${sign}${formatMoney(Math.abs(net))}` }), [
      {
        label: t('viewHistory'),
        run: () => {
          done();
          this.hud.openMenu('history');
        },
      },
      { label: t('keepPlaying'), primary: true, run: done },
    ]);
  }

  /** Раунд завершено: результат сесії, банер максимального виграшу. */
  private async roundSettled(r: StepResult): Promise<void> {
    this.lastRoundWin = r.roundWin;
    if (this.special) return;
    this.sessionNet += r.roundWin - r.bet;
    if (settings.jurisdiction.showSession) this.hud.setSession(this.sessionNet, Date.now() - this.sessionStart);
    if (this.roundMaxWin) {
      this.roundMaxWin = false;
      this.audio.sfx('summary');
      await this.view.fx.banner(t('maxWin'), t('maxWinSub', { x: settings.jurisdiction.rules.maxWinX }), 1800);
    }
  }

  startWatchdog(): void {
    let prev = performance.now();
    let frame = gsap.ticker.frame;
    let frozenMs = 0;
    window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - prev, 2500);
      prev = now;
      if (document.hidden) return;
      if (gsap.ticker.frame === frame) {
        frozenMs += dt;
        if (frozenMs > 2500) {
          diagnostics.add('stall', `GSAP ticker idle in ${this.state} — woken up`);
          gsap.ticker.wake();
          frozenMs = 0;
        }
      } else {
        frame = gsap.ticker.frame;
        frozenMs = 0;
      }
      if (this.state === 'idle' || this.state === 'loading' || this.awaitingInput || this.hud.menuOpen) {
        this.stallMs = 0;
        this.watchdogStage = 0;
        return;
      }
      this.stallMs += dt * gsap.globalTimeline.timeScale(); // у ігровому часі: сповільнена гра не «зависає»
      if (this.stallMs > 20000 && this.watchdogStage === 0) {
        this.watchdogStage = 1;
        diagnostics.add('stall', `no progress in ${this.state} for 20 s — skipping the episode`);
        this.renderDebug();
        this.episode?.skip();
        this.quick?.fire();
        this.nudge?.fire();
        this.view.reels.requestQuickStop();
      } else if (this.stallMs > 32000 && this.watchdogStage === 1) {
        this.watchdogStage = 2;
        diagnostics.add('stall', `still stuck in ${this.state} — offered to restore`);
        this.renderDebug();
        this.hud.notice(t('stuck'), [
          {
            label: t('restoreGame'),
            primary: true,
            run: () => {
              diagnostics.add('recover', `restore from ${this.state}`);
              if (this.special) this.exitSpecial();
              else window.location.reload();
            },
          },
        ]);
      }
    }, 1000);
  }

  private checkAbort(): void {
    if (this.special?.abort) throw new Aborted();
  }

  // ───────────────────────────── boot / recovery ─────────────────────────────

  async boot(): Promise<void> {
    const snap = await this.source.session();
    this.balance = snap.balance;
    this.pots = { ...(snap.pots ?? {}) };
    this.view.jars.set(this.potsFor(snap.round?.bet ?? settings.prefs.bet));
    this.hud.setBalance(snap.balance);
    this.hud.setBet(settings.prefs.bet);
    this.view.setBet(settings.prefs.bet);
    this.hud.setWin(0);
    if (!snap.round) {
      this.view.showReels(snap.lastBoard, settings.prefs.bet, 'base');
      this.view.setScene('surface');
      this.audio.music('base');
      this.go('idle');
      this.updateIdleMessage();
      return;
    }
    this.go('restoring');
    this.hud.notice(t('restored'), [], 3200);
    // відновлений раунд грає далі у фоні — екран завантаження не має його чекати
    void this.resume(snap).catch((e) => this.fail(e));
  }

  /** Відновити останній підтверджений крок без повторного списання. */
  private async resume(snap: SessionSnapshot): Promise<void> {
    const round = snap.round!;
    this.roundBet = round.bet;
    this.hud.setBet(round.bet);
    this.view.setBet(round.bet);
    this.hud.setWin(round.win);
    const last = snap.lastResult!;
    if (round.fs) this.hud.setFreeDives(round.fs.played, round.fs.total);
    if (round.salvage) {
      const s = round.salvage;
      this.view.restoreSalvage(s.grid, round.bet, s.superActive, s.respinsLeft, s.mods?.extra ? RESPINS_EXTRA : RESPINS);
      if (s.mods) this.view.jars.showActive(activePots(s.mods));
      this.audio.music('salvage');
      const origin: 'base' | 'freeDives' = s.origin;
      // множники Multi вже в сітці відновленого бонусу — повторно їх не програємо
      const mods = s.mods ? { ...s.mods, multiHits: [] } : null;
      const cur: StepResult = { ...last, next: s.phase === 'respin' ? 'respin' : 'collect', mysteryReveals: s.reveals, fullBoard: s.fullBoard, bonusTotal: s.total, mods };
      const collected = await this.salvageLoop(cur, origin, round.board);
      if (origin === 'freeDives') {
        this.hud.setFreeDives(collected.freeSpinsTotal - collected.freeSpinsLeft, collected.freeSpinsTotal);
        await this.freeDivesLoop(collected);
      } else {
        await this.afterReelStep(collected, 'base');
      }
    } else if (round.fs && round.fs.left > 0) {
      this.view.showReels(round.board, round.bet, 'freeDives');
      this.view.setScene('route');
      this.audio.music('freeDives');
      this.go('freeDives');
      await this.freeDivesLoop({ ...last, next: 'freeSpin' });
    }
  }

  // ───────────────────────────── input ─────────────────────────────

  onSpinPressed(): void {
    this.audio.unlock();
    if (this.hud.menuOpen) return;
    if (this.hud.bonus.open) return this.hud.bonus.close();
    const j = settings.jurisdiction;
    switch (this.state) {
      case 'idle':
        if (this.special) return;
        if (this.auto) return this.stopAuto();
        if (this.realityOpen) return;
        if (this.cycleLeftMs() > 0) return; // UKGC: наступна гра — не раніше ніж за 2,5 с від початку попередньої
        void this.startRound();
        return;
      case 'spinning':
      case 'anticipation':
        if (j.allowSpeedUp) this.view.reels.requestQuickStop(); // slam stop заборонений у UKGC
        return;
      case 'respin':
        if (j.allowSpeedUp) this.quick?.fire();
        return;
      default:
        this.episode?.skip();
        this.nudge?.fire();
    }
  }

  /** Натискання «Спін»: одразу спін/стоп/пропуск; якщо тримати ~0,4 с — безперервні турбо-спіни. */
  spinDown(): void {
    if (this.held) return;
    this.held = true;
    this.holdTimer?.kill();
    this.holdTimer = null;
    // утримання = безперервні турбо-спіни; там, де кожна гра — окреме натискання, його немає
    if (settings.jurisdiction.allowSpeedUp) this.holdTimer = gsap.delayedCall(0.4, () => {
      if (!this.held || this.special || this.hud.menuOpen) return;
      this.holding = true;
      settings.holdTurbo = true;
      this.hud.setHolding(true);
      if (this.state === 'idle') void this.startRound();
    });
    this.onSpinPressed();
  }

  spinUp(): void {
    this.held = false;
    this.holdTimer?.kill();
    this.holdTimer = null;
    if (!this.holding) return;
    this.holding = false;
    settings.holdTurbo = false; // поточний спін догравається, наступний — з обраною швидкістю
    this.hud.setHolding(false);
  }

  setBet(value: number): void {
    const i = BETS.indexOf(value);
    if (i < 0) return;
    this.changeBet(i - BETS.indexOf(settings.prefs.bet));
  }

  changeBet(delta: number): void {
    if (this.state !== 'idle' || this.special) return;
    const i = BETS.indexOf(settings.prefs.bet);
    const next = BETS[Math.max(0, Math.min(BETS.length - 1, i + delta))];
    if (next === settings.prefs.bet) return;
    settings.set('bet', next);
    this.hud.setBet(next);
    this.view.setBet(next);
    this.view.jars.set(this.potsFor(next), true); // у кожної ставки свої банки
    this.audio.sfx('click');
    this.view.reels.forEachSymbol((s) => s.updateValue(next, false));
    this.view.reels.setContext({ bet: next });
    this.hud.hideNotice();
  }

  cycleSpeed(): void {
    if (!settings.jurisdiction.allowSpeedUp) return;
    const order = ['normal', 'quick', 'turbo'] as const;
    settings.set('speed', order[(order.indexOf(settings.prefs.speed) + 1) % 3]);
    this.audio.sfx('click');
  }

  setAuto(cfg: AutoConfig | null): void {
    if (!cfg) return this.stopAuto();
    if (!settings.jurisdiction.allowAutoplay) return;
    if (this.state !== 'idle' || this.special) return;
    this.auto = { cfg, left: cfg.rounds, startBalance: this.balance };
    this.hud.setAuto(cfg.rounds);
    void this.startRound();
  }

  stopAuto(): void {
    if (!this.auto) return;
    this.auto = null;
    this.hud.setAuto(null);
  }

  /** Скільки ще чекати до можливого старту наступної гри (мінімальний цикл юрисдикції). */
  private cycleLeftMs(): number {
    const min = settings.jurisdiction.minCycleMs;
    return min ? Math.max(0, this.cycleStart + min - Date.now()) : 0;
  }

  /**
   * Мінімальний цикл витрачаємо на обертання: барабани крутяться довше, і до моменту,
   * коли зупиниться останній, цикл майже минув. Кнопка не простоює вимкненою.
   */
  private async holdForMinCycle(): Promise<void> {
    const p = settings.profile;
    const stopSpan = Math.max(140, p.firstStop * 0.32) + (COLS - 1) * p.interval + p.settle + 60;
    const ms = this.cycleLeftMs() - stopSpan;
    if (ms > 0) await wait(ms);
  }

  /** Умови зупинки автогри після завершеного раунду. */
  private autoShouldStop(): boolean {
    const a = this.auto;
    if (!a) return true;
    return shouldStopAutoplay(a.cfg, { left: a.left, startBalance: a.startBalance, balance: this.balance, lastWin: this.lastRoundWin });
  }

  history(): RoundRecord[] {
    return this.live.history();
  }

  async topUp(): Promise<void> {
    if (this.state !== 'idle') return;
    const snap = await this.live.topUp();
    this.balance = snap.balance;
    this.hud.setBalance(snap.balance, true);
    this.audio.sfx('win');
    this.updateIdleMessage();
  }

  async resetDemo(): Promise<void> {
    if (this.state !== 'idle' || this.special) return;
    this.stopAuto();
    await this.live.reset();
    await this.boot();
  }

  // ───────────────────────────── round ─────────────────────────────

  private async startRound(): Promise<void> {
    const bet = this.special ? this.roundBet : settings.prefs.bet;
    if (!this.special && this.balance < bet) {
      this.stopAuto();
      this.audio.sfx('error');
      const lower = [...BETS].reverse().find((b) => b <= this.balance);
      this.hud.notice(t('lowFunds', { bet: formatMoney(bet) }), [
        ...(lower ? [{ label: `${t('lowerBet')} (${formatMoney(lower)})`, run: () => this.changeBet(BETS.indexOf(lower) - BETS.indexOf(bet)) }] : []),
        { label: t('topUp'), primary: true, run: () => void this.topUp() },
      ]);
      return;
    }
    this.hud.hideNotice();
    this.roundBet = bet;
    if (!this.special) this.cycleStart = Date.now();
    try {
      const last = await this.reelStep('spin', 'base');
      await this.afterReelStep(last, 'base');
    } catch (e) {
      if (e instanceof Aborted) throw e;
      this.fail(e);
      return;
    }
    if (!this.special && this.state === 'idle' && this.holding && this.held && !this.hud.menuOpen) {
      await wait(90);
      if (this.state === 'idle' && this.holding && this.held) void this.startRound();
      return;
    }
    if (!this.special && this.state === 'idle' && this.auto) {
      this.auto.left -= 1;
      if (this.autoShouldStop()) return this.stopAuto();
      this.hud.setAuto(this.auto.left);
      await wait(settings.profile.autoNext);
      if (this.state === 'idle' && this.auto && !this.hud.menuOpen) void this.startRound();
      else if (this.hud.menuOpen) this.stopAuto();
    }
  }

  /** Після кроку барабанів: нова серія FS, підсумок або спокій. */
  private async afterReelStep(r: StepResult, mode: 'base' | 'freeDives'): Promise<void> {
    if (mode === 'freeDives') return; // керує цикл серії
    if (r.next === 'freeSpin') {
      await this.freeDivesIntro(r);
      await this.freeDivesLoop(r);
      return;
    }
    await this.roundSettled(r);
    this.go('idle');
    this.updateIdleMessage(r.roundWin);
    if (r.lineWins.length && r.action === 'spin') this.view.wins.startCycle();
  }

  private async request(action: Action): Promise<StepResult> {
    this.checkAbort();
    const stepId = this.pendingStepId ?? `${Date.now().toString(36)}-${(++this.stepSeq).toString(36)}`;
    this.pendingStepId = stepId;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.source.request({ stepId, action, bet: this.roundBet });
        this.pendingStepId = null;
        if (r.pots) this.pots[String(r.bet)] = r.pots;
        if (r.maxWin && !this.special) this.roundMaxWin = true;
        if (attempt > 0) this.hud.hideNotice();
        return r;
      } catch (e) {
        if (!(e instanceof SourceError) || !e.retryable) {
          this.pendingStepId = null;
          throw e;
        }
        // той самий stepId — сервер не спише ставку вдруге
        const retry = new Signal();
        this.hud.notice(t('netError'), [{ label: t('retry'), primary: true, run: () => retry.fire() }]);
        await Promise.race([retry.promise, wait(1600)]);
      }
    }
  }

  /** Один крок барабанів (платний спін або Free Dive) разом з усіма його подіями. */
  private async reelStep(action: 'spin' | 'freeSpin', mode: 'base' | 'freeDives'): Promise<StepResult> {
    this.view.wins.clear();
    this.go('spinning');
    if (mode === 'base') {
      this.hud.setMessage('');
      this.hud.setWin(0);
      this.hud.setBalance(this.balance - this.roundBet); // одне списання, підтверджене відповіддю
    }
    this.view.reels.spin(this.roundBet);
    this.spinTriggers = 0;
    this.markFlights = [];
    this.reelMode = mode;
    const r = await this.request(action);
    if (mode === 'base' && r.potsBefore) this.view.jars.set(r.potsBefore); // банки до спіну, як їх бачить сервер
    if (mode === 'base') this.hud.setBalance(r.balanceAfter - r.roundAward);
    const board = r.boardAfter as ReelBoard;

    // очікування: після п’ятої видимої перлини або двох карт на 2–3 барабанах
    const triggersUpTo = (n: number) => board.slice(0, n).flat().filter((c) => isTriggerSymbol(c.s)).length;
    const mapReels = (n: number) => [1, 2].filter((c) => c < n && board[c].some((x) => x.s === 'MAP')).length;
    let anticipated = -1;
    if (action === 'spin' && !this.special) await this.holdForMinCycle();
    await this.view.reels.stop(board, {
      anticipate: (i) => triggersUpTo(i) >= 5 || (i === 3 && mapReels(3) === 2),
      onAnticipate: (i) => {
        if (anticipated < 0) this.audio.sfx('anticipation');
        anticipated = i;
        this.go('anticipation');
      },
      onLanded: (i) => this.onReelLanded(board, i, anticipated === i),
    });
    this.audio.stopAnticipation();
    // тригер не склався — перлини заспокоюються (при тригері їх підхоплює вхід у Salvage)
    if (!r.salvageTriggered && this.spinTriggers >= 4) this.view.reels.forEachSymbol((s) => s.stopWin());
    // мітки долітають до банок до оцінки спіну (quick stop / turbo не чекають довше ~1 с)
    if (this.markFlights.length) await Promise.race([Promise.all(this.markFlights), wait(1200)]);
    if (mode === 'base' && r.potsBefore) {
      // використані банки показуємо повними до виливання на старті Salvage
      const shown = { ...r.pots };
      if (r.salvageTriggered && r.mods) for (const id of activePots(r.mods)) shown[id] = POT_SIZE;
      this.view.jars.set(shown);
    }
    this.go('evaluating');
    return this.presentReelResult(r, mode, board);
  }

  /** Скільки бонусних символів (перлини, мушлі, нагороди) вже впало за цей спін. */
  private spinTriggers = 0;

  private onReelLanded(board: ReelBoard, i: number, wasAnticipated: boolean): void {
    this.audio.sfx('reelStop', wasAnticipated ? 1 : 0.8);
    board[i].forEach((cell, r) => {
      const s = this.view.reels.symbolAt(i, r);
      if (cell.s === 'MAP') {
        this.audio.sfx('scatterLand');
        s.pop(1);
      } else if (isTriggerSymbol(cell.s)) {
        // кожна наступна перлина за спін звучить вище — чути, як наближається тригер
        if (cell.s === 'BLACK') this.audio.sfx('superLand');
        this.audio.sfx('pearlLand', this.spinTriggers++);
        s.pop(cell.s === 'BLACK' ? 1.2 : 0.8);
        // мітка 3 Pots злітає з перлини в банку (лише в базовій грі)
        if (this.reelMode === 'base' && cell.s === 'PEARL' && cell.pot) this.markFlights.push(this.view.flyMark(s, cell.pot, 0.12));
      } else if (cell.s === 'WILD') {
        this.audio.sfx('wildLand');
        s.pop(0.5);
      }
    });
    if (wasAnticipated) this.audio.stopAnticipation();
    // від чотирьох перлин і поки барабани ще крутяться — усі впалі перлини «пульсують»
    if (this.spinTriggers >= 4 && i < COLS - 1) {
      for (let c = 0; c <= i; c++) {
        board[c].forEach((cell, r) => {
          if (isTriggerSymbol(cell.s)) this.view.reels.symbolAt(c, r).throb();
        });
      }
    }
  }

  /** Розбір результату: лінії → +8 FS → Salvage (порядок одночасних тригерів, GDD §3). */
  private async presentReelResult(r: StepResult, mode: 'base' | 'freeDives', board: ReelBoard): Promise<StepResult> {
    const prof = settings.profile;
    // 1) лінійна виплата
    if (r.lineWins.length) {
      const lineTotal = r.lineWins.reduce((s, w) => s + w.amount, 0);
      const quiet = !settings.jurisdiction.celebrateAtOrBelowStake && r.roundWin <= r.bet;
      if (lineTotal >= r.bet * BIG_WIN_X) {
        this.audio.sfx('win', 3);
        await this.view.wins.showAll(r.lineWins);
        this.go('bigWin');
        this.view.shake(8);
        await this.playEpisode((ep) => this.view.fx.bigWin(lineTotal, r.bet, ep));
        this.go('evaluating');
      } else if (quiet) {
        // UKGC RTS 14F: виграш не більший за ставку не святкуємо — лише лінії й сума в смузі
        await this.interruptible(this.view.wins.showAll(r.lineWins));
      } else {
        // символи оживають хвилею, а сума росте великою биркою по центру поля
        await this.interruptible(Promise.all([this.view.wins.showAll(r.lineWins), this.view.fx.countWin(lineTotal, r.bet)]).then(() => undefined));
        this.view.fx.finishWin();
      }
      this.hud.setWin(r.roundWin, !quiet);
      this.hud.setBalance(r.balanceAfter, true);
    } else {
      this.hud.setBalance(r.balanceAfter);
    }
    this.balance = r.balanceAfter;

    // 2) запис +8 FS
    if (r.fsAwarded) {
      if (this.auto?.cfg.stopOnFeature) this.stopAuto();
      if (mode === 'base') this.pendingScatter = r.scatter;
      this.view.wins.clear();
      for (const p of r.scatter) this.view.reels.symbolAt(p.c, p.r).startWin(0xf2cf7a);
      this.audio.sfx('fsAward');
      if (mode === 'freeDives') {
        await this.playEpisode((ep) => this.view.fx.banner(t('plusFs', { n: r.fsAwarded }), '', 1100, ep));
        this.hud.setFreeDives(r.freeSpinsTotal - r.freeSpinsLeft, r.freeSpinsTotal);
      } else if (r.salvageTriggered) {
        await this.playEpisode((ep) => this.view.fx.banner(t('freeDivesAwarded', { n: r.fsAwarded }), '', 900, ep));
      }
      this.view.reels.forEachSymbol((s) => s.stopWin());
    }

    // 3) Salvage
    if (r.salvageTriggered) {
      if (this.auto?.cfg.stopOnFeature) this.stopAuto();
      this.view.wins.clear();
      return this.runSalvage(r, mode, board);
    }
    void prof;
    return r;
  }

  private interruptible(p: Promise<void>): Promise<void> {
    const n = new Signal();
    this.nudge = n;
    return Promise.race([p, n.promise]).finally(() => {
      if (this.nudge === n) this.nudge = null;
    });
  }

  private async playEpisode(fn: (ep: Episode) => Promise<void>): Promise<void> {
    const ep = new Episode();
    this.episode = ep;
    this.hud.setSpinState('skip');
    try {
      await fn(ep);
    } finally {
      if (this.episode === ep) this.episode = null;
    }
  }

  // ───────────────────────────── Salvage ─────────────────────────────

  private async runSalvage(entry: StepResult, origin: 'base' | 'freeDives', board: ReelBoard): Promise<StepResult> {
    this.go('salvageIntro');
    this.hud.setMessage('');
    const scene: SceneName = origin === 'base' ? 'surface' : 'route';
    const mods = entry.mods;
    // сервер повертає сітку вже з Boost; на екрані спершу показуємо номінали без нього — Boost додасться анімацією
    const shown = mods?.boost ? withoutBoost(entry.salvageGrid!, mods.boost) : entry.salvageGrid!;
    await this.view.enterSalvage(board, shown, entry.bet, false, scene);
    const deep = entry.superActivated === 'entry';
    const extra = !!mods?.extra;
    await this.bonusScreen({
      kind: 'salvage',
      title: deep ? 'Deep Salvage' : 'Salvage',
      subtitle: t('bsSalvageSub', { n: countFilled(entry.salvageGrid!) }),
      chips: mods ? potChips(mods, entry.bet) : [],
      rules: [
        t('bsStayRule'),
        t('bsRespinsRule', { n: extra ? RESPINS_EXTRA : RESPINS }),
        ...(deep ? [t('bsSuperRule')] : []),
        t('bsCrownRule'),
      ],
      button: t('bsStart'),
    });
    if (entry.superActivated === 'entry') {
      const black = allPositions().find((p) => entry.salvageGrid![p.c][p.r]?.s === 'BLACK')!;
      this.view.salvageHud.setTitle(true);
      await this.view.salvage.superWave(black);
    }
    if (mods && activePots(mods).length) await this.playEpisode((ep) => this.activatePots(mods, ep));
    return this.salvageLoop(entry, origin, board);
  }

  /**
   * Повні банки виливаються на старті Salvage по черзі:
   * Extra — у ряд вогників (з’являється четверта спроба), Boost — на поле (+номінал кожній перлині),
   * Multi лише відкривається і чекає кінця бонусу.
   */
  private async activatePots(mods: SalvageMods, ep: Episode): Promise<void> {
    const jars = this.view.jars.jars;
    if (mods.extra) {
      await jars.extra.pour((from, sec) => this.view.pourStream(from, this.view.salvageHud.pipsGlobal(), 'extra', sec));
      this.view.salvageHud.setMaxRespins(RESPINS_EXTRA, true);
      this.view.salvageHud.setRespins(RESPINS_EXTRA, true);
      this.audio.sfx('reset');
      await ep.wait(300);
    }
    if (mods.boost) {
      await jars.boost.pour((from, sec) => this.view.pourStream(from, this.view.fieldCenterGlobal(), 'boost', sec));
      await this.view.salvage.applyBoost(mods.boost, ep);
    }
    if (mods.multi) {
      jars.multi.setState('active');
      this.audio.sfx('potFull');
      await ep.wait(400);
    }
  }

  private async salvageLoop(start: StepResult, origin: 'base' | 'freeDives', board: ReelBoard): Promise<StepResult> {
    const prof = settings.profile;
    let cur = start;
    while (cur.next === 'respin') {
      this.go('respin');
      await wait(prof.autoNext);
      const q = new Signal();
      this.quick = q;
      const res = await this.request('respin');
      await this.view.salvage.respin(res.landed, q, cur.respinsLeft === 1);
      this.quick = null;
      if (res.landed.length) {
        this.view.salvageHud.setRespins(res.mods?.extra ? RESPINS_EXTRA : RESPINS, true);
        this.audio.sfx('reset'); // один звук відновлення на результат
      } else {
        this.view.salvageHud.setRespins(res.respinsLeft);
      }
      if (res.superActivated === 'respin') {
        const black = res.landed.find((l) => l.cell.s === 'BLACK')!;
        this.view.salvageHud.setTitle(true);
        await this.view.salvage.superWave(black); // наступний респін заблоковано до кінця оновлення
      }
      cur = res;
    }

    // розкриття → нагорода за повне поле → збір
    this.go('reveal');
    let sum = 0;
    await this.playEpisode(async (ep) => {
      if (cur.mysteryReveals.length) await this.view.salvage.reveal(cur.mysteryReveals, ep);
      if (cur.mysteryReveals.some((m) => m.activatesSuper)) this.view.salvageHud.setTitle(true);
      // Multi: банка нахиляється й обстрілює перлини множниками
      const hits = cur.mods?.multiHits ?? [];
      if (hits.length) {
        const jar = this.view.jars.jars.multi;
        await jar.pour((from, sec) => this.view.pourStream(from, this.view.fieldCenterGlobal(), 'multi', sec * 0.5));
        await this.view.salvage.applyMulti(hits, jar.mouthGlobal(), ep);
      }
      if (cur.fullBoard) {
        this.view.shake(10);
        await this.view.fx.banner(t('fullBoard'), `+${formatMoney(500 * cur.bet)}`, 1500, ep);
      }
      this.go('collect');
      sum = await this.view.salvage.collect(cur.fullBoard, ep);
    });
    if (sum !== cur.bonusTotal) console.warn(`[flow] collect mismatch: view ${sum} vs server ${cur.bonusTotal}`);
    const collected = await this.request('collect');
    this.balance = collected.balanceAfter;
    this.hud.setWin(collected.roundWin, true);
    this.hud.setBalance(collected.balanceAfter, true);
    if (collected.roundAward >= collected.bet * BIG_WIN_X) {
      this.go('bigWin');
      await this.playEpisode((ep) => this.view.fx.bigWin(collected.roundAward, collected.bet, ep));
    } else {
      const cells = countFilled(collected.salvageGrid ?? cur.salvageGrid ?? []);
      await this.bonusScreen({
        kind: 'salvageEnd',
        title: t('bsSalvageEnd'),
        subtitle: collected.fullBoard ? t('bsSalvageEndCrown') : t('bsSalvageEndSub', { n: cells }),
        amount: collected.roundAward,
        button: t('bsContinue'),
      });
    }
    this.go('returning');
    const toFs = origin === 'freeDives';
    this.view.jars.release(this.potsFor(collected.bet));
    await this.view.exitSalvage(toFs ? 'route' : 'surface', board, collected.bet, toFs ? 'freeDives' : 'base');
    return collected;
  }

  // ───────────────────────────── Free Dives ─────────────────────────────

  private async freeDivesIntro(r: StepResult): Promise<void> {
    this.go('fsIntro');
    const maps: Pos[] = r.scatter.length ? r.scatter : this.pendingScatter;
    this.hud.setMessage('');
    await this.playEpisode((ep) => this.view.fx.freeDivesIntro(r.freeSpinsTotal, maps, ep));
    await this.bonusScreen({
      kind: 'freeDives',
      title: `${r.freeSpinsTotal} Free Dives`,
      subtitle: t('bsFsSub'),
      rules: [t('bsFsRetrigger'), t('bsFsSalvage'), t('bsFsJars')],
      button: t('bsStart'),
    });
    this.audio.music('freeDives');
    await this.view.goScene('route');
    this.view.reels.setMode('freeDives');
    this.go('freeDives');
  }

  private async freeDivesLoop(start: StepResult): Promise<void> {
    let r = start;
    let played = 0;
    while (r.next === 'freeSpin') {
      this.go('freeDives');
      const current = r.freeSpinsTotal - r.freeSpinsLeft + 1;
      this.hud.setMessage(t('freeDivesLeft', { n: current, total: r.freeSpinsTotal }));
      this.hud.setFreeDives(current, r.freeSpinsTotal);
      await this.interruptible(wait(settings.profile.autoNext + 150));
      if (r.freeSpinsLeft === 1 && r.freeSpinsTotal > 1) {
        // останнє занурення серії — короткий штамп, як «Last free spin» у 3 Oaks
        this.audio.sfx('lastDive');
        await this.playEpisode((ep) => this.view.fx.banner(t('lastDive'), '', 650, ep));
      }
      r = await this.reelStep('freeSpin', 'freeDives');
      played += 1;
      if (r.next === 'freeSpin' && r.lineWins.length && r.action === 'freeSpin') await this.interruptible(wait(300));
    }
    // підсумок серії включає вкладені бонуси рівно один раз (fsWin з сервера)
    this.go('fsSummary');
    this.view.wins.clear();
    this.hud.setFreeDives(null);
    this.audio.sfx('summary');
    await this.bonusScreen({
      kind: 'freeDivesEnd',
      title: t('bsFsEnd'),
      subtitle: t('fsSummarySub', { spins: r.freeSpinsTotal || played }),
      amount: r.fsWin,
      button: t('bsContinue'),
    });
    this.go('returning');
    this.audio.music('base');
    await this.view.goScene('surface');
    this.view.reels.setMode('base');
    this.hud.setWin(r.roundWin);
    await this.roundSettled(r);
    this.go('idle');
    this.updateIdleMessage(r.roundWin);
  }

  // ───────────────────────────── replay & showcase ─────────────────────────────

  async replay(roundId: string): Promise<void> {
    const rec = this.live.history().find((h) => h.roundId === roundId);
    if (!rec || this.state !== 'idle' || this.special) return;
    await this.runSpecial(new ReplaySource(rec), 'replay', rec.bet, t('replaying', { id: rec.roundId }), t('exitReplay'));
  }

  async showcase(id: ScenarioId): Promise<void> {
    if (this.state !== 'idle' || this.special) return;
    await this.runSpecial(createShowcaseSource(id, settings.prefs.bet), 'showcase', settings.prefs.bet, t('showcase'), t('exitShowcase'));
  }

  exitSpecial(): void {
    if (!this.special) return;
    this.special.abort = true;
    this.hud.bonus.close();
    this.episode?.skip();
    this.nudge?.fire();
    this.quick?.fire();
    this.view.reels.requestQuickStop();
  }

  private async runSpecial(source: ResultSource, kind: 'replay' | 'showcase', bet: number, label: string, exit: string): Promise<void> {
    this.stopAuto();
    this.view.wins.clear();
    this.special = { kind, abort: false };
    this.source = source;
    this.hud.ribbon(label, exit);
    const snap = await source.session();
    this.balance = snap.balance;
    this.roundBet = bet;
    this.pots = { ...(snap.pots ?? {}) };
    this.view.jars.release(this.potsFor(bet));
    this.hud.setBalance(snap.balance);
    this.hud.setBet(bet);
    this.view.setBet(bet);
    this.hud.setWin(0);
    this.go('idle');
    try {
      await wait(350);
      await this.startRound();
      await wait(900);
    } catch (e) {
      if (!(e instanceof Aborted)) console.error(e);
    } finally {
      await this.restoreLive();
    }
  }

  private async restoreLive(): Promise<void> {
    this.special = null;
    this.source = this.live;
    this.episode = null;
    this.quick = null;
    this.nudge = null;
    this.hud.ribbon(null);
    this.hud.setFreeDives(null);
    const snap = await this.live.session();
    this.balance = snap.balance;
    this.roundBet = settings.prefs.bet;
    this.pots = { ...(snap.pots ?? {}) };
    this.view.jars.release(this.potsFor(settings.prefs.bet));
    this.hud.setBalance(snap.balance);
    this.hud.setBet(settings.prefs.bet);
    this.view.setBet(settings.prefs.bet);
    this.hud.setWin(0);
    this.view.showReels(snap.lastBoard, settings.prefs.bet, 'base');
    this.view.setScene('surface');
    this.audio.music('base');
    this.state = 'idle';
    this.go('idle');
    this.updateIdleMessage();
    this.hud.spinBtn.focus();
  }

  // ───────────────────────────── misc ─────────────────────────────

  private updateIdleMessage(win = 0): void {
    // у спокої смуга мовчить: виграш уже видно в полі «Виграш», підказок «натисни спін» у слотах немає
    void win;
    this.hud.setMessage('');
  }

  private fail(e: unknown): void {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    this.hud.notice(msg, [], 5000);
    this.state = 'idle';
    this.go('idle');
  }
}
