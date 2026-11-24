/**
 * Потік гри: спін → «Мазок» → падіння сітки → каскади → тарілки → бонус або кінець раунду.
 * Результат кроку вже пораховано рушієм; потік лише програє його й оновлює HUD у потрібні моменти.
 */
import { Episode, wait } from '@slotkit/core';
import type { Jurisdiction } from '@slotkit/rules';
import { applyStroke } from '../engine/engine';
import { BIG_WIN_X, BUY_COST_X, BETS, DEFAULT_BET, EPIC_WIN_X, MEGA_WIN_X, anteCost } from '../shared/config';
import type { StepResult } from '../shared/types';
import type { BoardView } from './BoardView';
import type { Hud } from './Hud';
import type { LocalSource } from './source';
import type { Sound } from './sound';

const PREFS = 'petrykivka-bloom:prefs:v1';

export class Flow {
  private busy = false;
  private ep: Episode | null = null;
  private lastStart = 0;
  bet: number;
  ante: boolean;
  readonly sessionStart = Date.now();
  readonly sessionBalance: number;

  constructor(
    private readonly view: BoardView,
    private readonly hud: Hud,
    private readonly source: LocalSource,
    private readonly sound: Sound,
    private readonly market: Jurisdiction,
    private readonly money: (cents: number) => string,
  ) {
    const prefs = readPrefs();
    this.bet = BETS.includes(prefs.bet ?? 0) ? prefs.bet! : DEFAULT_BET;
    this.ante = !!prefs.ante;
    this.sessionBalance = source.state.balance;
  }

  /** Стартовий стан: сітка, баланс; незавершений бонус продовжується. */
  async start(): Promise<void> {
    const s = this.source.state;
    this.view.setGrid(s.lastGrid);
    this.hud.setBet(this.bet, this.ante);
    this.hud.setBalance(s.balance);
    this.hud.setWin(0);
    const fs = s.round?.fs;
    if (fs && fs.left > 0) {
      this.view.setSpots(fs.spots);
      this.hud.freeSpins(true, fs.total - fs.left, fs.total, fs.win);
      await this.hud.card({ title: 'Free spins in progress', body: `${fs.left} spins left. The flowers on the board stay with you.`, ok: 'Continue', tone: 'free' });
      await this.freeSpins();
    }
  }

  setBet(v: number): void {
    if (this.busy) return;
    this.bet = v;
    this.hud.setBet(v, this.ante);
    savePrefs({ bet: v, ante: this.ante });
  }

  setAnte(on: boolean): void {
    if (this.busy) return;
    this.ante = on;
    this.hud.setBet(this.bet, on);
    savePrefs({ bet: this.bet, ante: on });
  }

  /** Натискання «Спін»: новий раунд або, під час показу, пропуск анімацій (де ринок дозволяє). */
  async spin(): Promise<void> {
    this.sound.unlock();
    if (this.busy) {
      if (this.market.allowSpeedUp) this.ep?.skip();
      return;
    }
    if (this.source.next !== 'spin') return;
    const cost = this.ante ? anteCost(this.bet) : this.bet;
    if (this.source.state.balance < cost) return this.lowBalance();
    const gap = this.market.minCycleMs - (performance.now() - this.lastStart);
    if (gap > 0) return; // UKGC: кнопка ще неактивна
    await this.round({ ante: this.ante });
  }

  async buy(): Promise<void> {
    this.sound.unlock();
    if (this.busy || !this.market.allowBonusBuy || this.source.next !== 'spin') return;
    const price = this.bet * BUY_COST_X;
    if (this.source.state.balance < price) return this.lowBalance();
    const ok = await this.hud.card({
      title: 'Buy free spins?',
      body: `10 free spins start straight away, with a Stroke on the first one.`,
      amount: this.money(price),
      ok: 'Buy',
      cancel: 'Cancel',
      tone: 'free',
    });
    if (ok) await this.round({ buy: true });
  }

  private async round(req: { ante?: boolean; buy?: boolean }): Promise<void> {
    this.setBusy(true);
    this.lastStart = performance.now();
    try {
      const res = this.source.play({ action: 'spin', bet: this.bet, ...req });
      this.hud.setBalance(res.balanceAfter - res.stepWin);
      this.hud.setWin(0);
      if (!res.bought) await this.present(res);
      this.hud.setBalance(res.balanceAfter);
      if (res.next === 'freeSpin') {
        await this.bonusIntro(res);
        await this.freeSpins();
      } else {
        await this.finishRound(res);
      }
    } finally {
      this.setBusy(false);
      this.hud.holdSpin(this.market.minCycleMs - (performance.now() - this.lastStart));
    }
  }

  private async freeSpins(): Promise<void> {
    this.setBusy(true);
    try {
      let last: StepResult | null = null;
      while (this.source.next === 'freeSpin') {
        const res = this.source.play({ action: 'freeSpin' });
        const totalBefore = res.freeSpinsTotal - res.fsAwarded;
        const spinNo = totalBefore - (res.freeSpinsLeft + 1 - res.fsAwarded) + 1;
        this.hud.freeSpins(true, spinNo, totalBefore, res.fsWin - res.stepWin);
        await this.present(res);
        this.hud.freeSpins(true, spinNo, res.freeSpinsTotal, res.fsWin);
        this.hud.setBalance(res.balanceAfter);
        if (res.fsAwarded) {
          this.sound.fanfare();
          await this.hud.card({ title: `+${res.fsAwarded} free spins`, body: '3 plates landed during the bonus.', ok: 'Continue', autoMs: 2500, tone: 'free' });
        }
        last = res;
        await wait(250 * this.view.speed);
      }
      if (last) await this.bonusSummary(last);
    } finally {
      this.hud.freeSpins(false);
      this.view.setSpots(new Array(49).fill(0));
      this.setBusy(false);
    }
  }

  /** Програвання одного кроку на полі. */
  private async present(res: StepResult): Promise<void> {
    const ep = (this.ep = new Episode());
    const celebrate = this.market.celebrateAtOrBelowStake || res.stepWin > (res.cost || res.bet);
    this.sound.quiet = !celebrate;
    await this.view.clearOut(ep);
    this.view.setSpots(res.spotsBefore);
    if (res.stroke) {
      const after = res.spotsBefore.slice();
      applyStroke(after, res.stroke);
      await this.view.stroke(res.stroke, ep, after);
    }
    await this.view.dropIn(res.grid, ep);
    let shown = 0;
    const baseWin = res.mode === 'free' ? res.fsWin - res.stepWin : 0;
    for (const t of res.tumbles) {
      await this.view.tumble(t, ep, celebrate);
      shown = Math.min(res.stepWin, shown + t.win);
      this.hud.setWin(res.mode === 'free' ? baseWin + shown : shown, res.mode === 'free' ? 'Bonus win' : 'Win');
    }
    await this.view.plates(res.plates, ep, res.fsAwarded > 0);
    if (res.maxWin) {
      await this.hud.card({ title: 'Maximum win', body: 'The round ends at 5,000× bet.', amount: this.money(res.roundWin), ok: 'Collect' });
    } else if (celebrate && res.mode === 'base' && res.stepWin >= BIG_WIN_X * res.bet) {
      await this.bigWin(res.stepWin, res.bet);
    }
    this.ep = null;
  }

  private async bigWin(win: number, bet: number): Promise<void> {
    const x = win / bet;
    const title = x >= EPIC_WIN_X ? 'Epic win' : x >= MEGA_WIN_X ? 'Mega win' : 'Big win';
    this.sound.fanfare();
    await this.hud.countUp(title, win, this.market.allowSpeedUp ? 1600 : 2600);
  }

  private async bonusIntro(res: StepResult): Promise<void> {
    this.sound.fanfare();
    this.hud.freeSpins(true, 0, res.freeSpinsTotal, 0);
    await this.hud.card({
      title: `${res.freeSpinsTotal} free spins`,
      body: res.bought ? 'Bought bonus. It starts with a Stroke.' : 'Flowers stay on the board until the bonus ends, and the first spin starts with a Stroke.',
      ok: 'Start',
      autoMs: 6000,
      tone: 'free',
    });
  }

  private async bonusSummary(last: StepResult): Promise<void> {
    const celebrate = this.market.celebrateAtOrBelowStake || last.roundWin > last.bet;
    if (celebrate) this.sound.fanfare();
    await this.hud.card({
      title: 'Free spins complete',
      body: `${last.freeSpinsTotal} spins played.`,
      amount: this.money(last.fsWin),
      ok: 'Collect',
      autoMs: 8000,
      tone: 'free',
    });
    this.hud.setWin(last.roundWin);
  }

  private async finishRound(res: StepResult): Promise<void> {
    this.hud.setWin(res.stepWin);
  }

  private async lowBalance(): Promise<void> {
    const ok = await this.hud.card({ title: 'Out of demo credits', body: 'Top up with demo credits to keep playing.', ok: 'Top up', cancel: 'Not now' });
    if (ok) {
      this.source.topUp();
      this.hud.setBalance(this.source.state.balance);
    }
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    this.hud.setBusy(b, this.market.allowSpeedUp);
  }

  tickSession(): void {
    this.hud.setSession(this.source.state.balance - this.sessionBalance, Math.floor((Date.now() - this.sessionStart) / 1000));
  }
}

function readPrefs(): { bet?: number; ante?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}');
  } catch {
    return {};
  }
}

function savePrefs(p: { bet: number; ante: boolean }): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    // без збереження налаштувань
  }
}
