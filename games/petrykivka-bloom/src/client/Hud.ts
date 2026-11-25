/**
 * HUD у DOM: справжні кнопки, клавіатура, доступність. Панель ставки й поповери — з @slotkit/controls,
 * таблиця виплат — з @slotkit/paytable. HUD не знає правил гри: лише показує й передає натискання.
 */
import { BetPanel, Popovers, bindSpinButton } from '@slotkit/controls';
import { Signal } from '@slotkit/core';
import type { Jurisdiction } from '@slotkit/rules';
import { BETS, BUY_COST_X, anteCost } from '../shared/config';
import { SCENARIOS } from './scenarios';

export interface HudHandlers {
  spin(): void;
  buy(): void;
  setBet(cents: number): void;
  setAnte(on: boolean): void;
  setTurbo(on: boolean): void;
  setMuted(on: boolean): void;
  openRules(): string;
  setMarket(id: 'default' | 'ukgc'): void;
  showcase(id: string): void;
  /** Бонус почався чи скінчився (гра ховає назву над полем, її місце займає смуга бонусу). */
  onMode?(free: boolean): void;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => root.querySelector<T>(sel)!;

export class Hud {
  private readonly root: HTMLElement;
  private readonly balanceEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly winLabel: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly anteBtn: HTMLButtonElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly turboBtn: HTMLButtonElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly sessionEl: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly rules: HTMLElement;
  private readonly betPanel: BetPanel;
  private readonly pops: Popovers;
  private bet = 0;

  constructor(
    private readonly money: (cents: number) => string,
    private readonly market: Jurisdiction,
    private readonly h: HudHandlers,
  ) {
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="bar">
        <div class="meter"><small>Balance</small><b data-balance></b></div>
        <div class="meter"><small data-win-label>Win</small><b data-win></b></div>
        <div class="meter" data-session hidden><small>Session</small><b data-session-v></b></div>
      </div>
      <div class="controls">
        <button type="button" class="chip" data-menu aria-haspopup="dialog">Rules</button>
        <button type="button" class="chip" data-sound aria-pressed="false">Sound on</button>
        <button type="button" class="chip" data-turbo aria-pressed="false">Turbo</button>
        <button type="button" class="feature" data-ante aria-pressed="false"><b>Ante bet</b><small></small></button>
        <button type="button" class="feature" data-buy><b>Buy bonus</b><small></small></button>
        <button type="button" class="bet" data-bet-btn aria-haspopup="dialog"><small>Bet</small><b data-bet></b></button>
        <button type="button" class="spin" data-spin aria-label="Spin"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 18a16 16 0 1 0 2 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M40 6v13H27" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div data-bet-panel></div>`;
    this.balanceEl = $(this.root, '[data-balance]');
    this.winEl = $(this.root, '[data-win]');
    this.winLabel = $(this.root, '[data-win-label]');
    this.betEl = $(this.root, '[data-bet]');
    this.spinBtn = $(this.root, '[data-spin]');
    this.anteBtn = $(this.root, '[data-ante]');
    this.buyBtn = $(this.root, '[data-buy]');
    this.turboBtn = $(this.root, '[data-turbo]');
    this.soundBtn = $(this.root, '[data-sound]');
    this.sessionEl = $(this.root, '[data-session-v]');
    this.banner = document.getElementById('fs-banner')!;
    this.overlay = document.getElementById('overlay')!;
    this.rules = document.getElementById('rules')!;

    this.betPanel = new BetPanel($(this.root, '[data-bet-panel]'), {
      values: BETS,
      format: money,
      onPick: (v) => {
        h.setBet(v);
        this.pops.closeAll();
      },
    });
    this.betPanel.setTitle('Bet');
    this.betPanel.el.hidden = true;
    const betBtn = $<HTMLButtonElement>(this.root, '[data-bet-btn]');
    this.pops = new Popovers([{ panel: this.betPanel.el, trigger: betBtn }]);
    betBtn.onclick = () => this.pops.toggle(this.betPanel.el);

    bindSpinButton(this.spinBtn, { down: () => h.spin(), up: () => undefined });
    this.anteBtn.onclick = () => h.setAnte(this.anteBtn.getAttribute('aria-pressed') !== 'true');
    this.buyBtn.onclick = () => h.buy();
    this.buyBtn.hidden = !market.allowBonusBuy;
    this.turboBtn.hidden = !market.allowSpeedUp;
    this.turboBtn.onclick = () => {
      const on = this.turboBtn.getAttribute('aria-pressed') !== 'true';
      this.turboBtn.setAttribute('aria-pressed', String(on));
      h.setTurbo(on);
    };
    this.soundBtn.onclick = () => {
      const muted = this.soundBtn.getAttribute('aria-pressed') !== 'true';
      this.setMuted(muted);
      h.setMuted(muted);
    };
    $(this.root, '[data-menu]').onclick = () => this.openRules();
    $(this.root, '[data-session]').hidden = !market.showSession;

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"] button')) return;
      e.preventDefault();
      if (!this.overlay.hidden) return this.overlay.querySelector<HTMLButtonElement>('button')?.click();
      h.spin();
    });
  }

  setTurbo(on: boolean): void {
    this.turboBtn.setAttribute('aria-pressed', String(on));
  }

  setMuted(muted: boolean): void {
    this.soundBtn.setAttribute('aria-pressed', String(muted));
    this.soundBtn.textContent = muted ? 'Sound off' : 'Sound on';
  }

  setBalance(cents: number): void {
    this.balanceEl.textContent = this.money(cents);
  }

  private shownWin = 0;
  private winRaf = 0;

  setWin(cents: number, label = 'Win'): void {
    cancelAnimationFrame(this.winRaf);
    this.shownWin = cents;
    this.winLabel.textContent = label;
    this.winEl.textContent = cents ? this.money(cents) : '—';
  }

  /** Виграш росте до нової суми за частку секунди — видно, що каскад щось додав. */
  rollWin(cents: number, label = 'Win'): void {
    cancelAnimationFrame(this.winRaf);
    this.winLabel.textContent = label;
    const from = this.shownWin;
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / 450);
      const v = Math.round(from + (cents - from) * (1 - (1 - p) ** 2));
      this.winEl.textContent = v ? this.money(v) : '—';
      if (p < 1) this.winRaf = requestAnimationFrame(tick);
    };
    this.shownWin = cents;
    tick();
  }

  setBet(cents: number, ante: boolean): void {
    this.bet = cents;
    this.betEl.textContent = this.money(ante ? anteCost(cents) : cents);
    this.betPanel.render(cents);
    this.anteBtn.setAttribute('aria-pressed', String(ante));
    this.anteBtn.querySelector('small')!.textContent = ante ? `On · ${this.money(anteCost(cents))} per spin` : 'Plates come more often';
    this.buyBtn.querySelector('small')!.textContent = this.money(cents * BUY_COST_X);
  }

  /** Під час раунду ставку й фічі не змінюють; «Спін» лишається — він пропускає анімації. */
  setBusy(busy: boolean, canSkip: boolean): void {
    this.root.dataset.busy = String(busy);
    for (const b of [this.anteBtn, this.buyBtn, $<HTMLButtonElement>(this.root, '[data-bet-btn]')]) b.disabled = busy;
    this.spinBtn.disabled = busy && !canSkip;
    this.spinBtn.setAttribute('aria-label', busy ? 'Skip' : 'Spin');
    if (busy) this.pops.closeAll();
  }

  /** UKGC: «Спін» неактивний, доки не минув мінімальний ігровий цикл. */
  holdSpin(ms: number): void {
    if (ms <= 0) return;
    this.spinBtn.disabled = true;
    window.setTimeout(() => {
      if (this.root.dataset.busy !== 'true') this.spinBtn.disabled = false;
    }, ms);
  }

  setSession(netCents: number, seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.sessionEl.textContent = `${netCents >= 0 ? '+' : '−'}${this.money(Math.abs(netCents))} · ${m}:${String(s).padStart(2, '0')}`;
  }

  /** Смуга бонусу над полем: номер фриспіну (0 — ще не почався), усього, виграш бонусу. */
  freeSpins(on: boolean, spinNo = 0, total = 0, win = 0): void {
    if (document.documentElement.dataset.mode !== (on ? 'free' : 'base')) this.h.onMode?.(on);
    document.documentElement.dataset.mode = on ? 'free' : 'base';
    this.banner.hidden = !on;
    if (!on) return;
    const count = spinNo ? `Free spin <b>${spinNo}</b> of ${total}` : `<b>${total}</b> free spins`;
    this.banner.innerHTML = `${count}<span>${win ? this.money(win) : ''}</span>`;
  }

  /** Повноекранна картка (вхід у бонус, підсумок, великий виграш, купівля). Повертає вибір гравця. */
  async card(opts: { title: string; body: string; amount?: string; ok: string; cancel?: string; autoMs?: number; tone?: 'free' | 'win' | 'big' }): Promise<boolean> {
    const done = new Signal<boolean>();
    this.overlay.dataset.tone = opts.tone ?? 'win';
    this.overlay.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="card-title">
        <h2 id="card-title">${opts.title}</h2>
        ${opts.amount ? `<p class="amount">${opts.amount}</p>` : ''}
        <p>${opts.body}</p>
        <div class="actions">${opts.cancel ? `<button type="button" data-no>${opts.cancel}</button>` : ''}<button type="button" data-ok>${opts.ok}</button></div>
      </div>`;
    this.overlay.hidden = false;
    $<HTMLButtonElement>(this.overlay, '[data-ok]').onclick = () => done.fire(true);
    const no = this.overlay.querySelector<HTMLButtonElement>('[data-no]');
    if (no) no.onclick = () => done.fire(false);
    $<HTMLButtonElement>(this.overlay, '[data-ok]').focus();
    const timer = opts.autoMs ? window.setTimeout(() => done.fire(true), opts.autoMs) : 0;
    const ok = await done.promise;
    window.clearTimeout(timer);
    this.overlay.hidden = true;
    this.spinBtn.focus();
    return ok;
  }

  /** Лічильник великого виграшу в картці: суми ростуть до фінальної. */
  async countUp(title: string, cents: number, ms: number): Promise<void> {
    const shown = this.card({ title, body: 'Tap to continue', amount: this.money(0), ok: 'Collect', autoMs: ms + 2200, tone: 'big' });
    const amount = this.overlay.querySelector('.amount')!;
    const start = performance.now();
    const tick = () => {
      if (this.overlay.hidden) return;
      const p = Math.min(1, (performance.now() - start) / ms);
      amount.textContent = this.money(Math.round(cents * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await shown;
  }

  openRules(): void {
    this.rules.innerHTML = `<div class="sheet">
        <header><h2>Petrykivka Bloom</h2><button type="button" data-close aria-label="Close rules">Close</button></header>
        <section class="showcase">
          <h3>See the features</h3>
          <p>Real rounds from fixed seeds, played on a temporary balance. Your session is not touched.</p>
          <div>${SCENARIOS.map((sc) => `<button type="button" data-scenario="${sc.id}"><b>${sc.title}</b><small>${sc.text}</small></button>`).join('')}</div>
        </section>
        <div class="market"><span>Market rules</span>
          <button type="button" data-market="default" aria-pressed="${this.market.id === 'default'}">Default</button>
          <button type="button" data-market="ukgc" aria-pressed="${this.market.id === 'ukgc'}">UK (UKGC)</button>
        </div>
        ${this.h.openRules()}
      </div>`;
    this.rules.hidden = false;
    const close = () => {
      this.rules.hidden = true;
      this.spinBtn.focus();
    };
    $<HTMLButtonElement>(this.rules, '[data-close]').onclick = close;
    this.rules.querySelectorAll<HTMLButtonElement>('[data-market]').forEach((b) => {
      b.onclick = () => this.h.setMarket(b.dataset.market as 'default' | 'ukgc');
    });
    this.rules.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((b) => {
      b.onclick = () => {
        close();
        this.h.showcase(b.dataset.scenario!);
      };
    });
    this.rules.onkeydown = (e) => e.key === 'Escape' && close();
    $<HTMLButtonElement>(this.rules, '[data-close]').focus();
  }

  /** Позначка демо-сценарію над полем; null — сценарій закінчився. */
  showcase(title: string | null): void {
    const el = document.getElementById('showcase-badge')!;
    el.hidden = !title;
    if (title) el.innerHTML = `<b>${title}</b> showcase · temporary balance`;
  }

  get currentBet(): number {
    return this.bet;
  }
}
