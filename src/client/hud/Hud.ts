import type { ScenarioId } from '../../server/showcase';
import { BonusScreen } from './BonusScreen';
import gsap from 'gsap';
import { BETS, LINES } from '../../shared/config';
import { JACKPOTS, PAYTABLE, type PayingId, type SymbolId } from '../../shared/symbols';
import type { RoundRecord } from '../../server/protocol';
import type { Art } from '../art/textures';
import { formatMoney } from '../core/format';
import { t, type TKey } from '../core/i18n';
import { settings, type Speed } from '../core/settings';
import { AutoplayPanel, BetPanel, bindSpinButton, Popovers, type AutoConfig } from '@slotkit/controls';
import { renderPaytable } from '@slotkit/paytable';

const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  spin: '<svg class="i-spin" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M38 17A16 16 0 0 0 9 19"/><path d="M38 7v10H28"/><path d="M10 31a16 16 0 0 0 29-2"/><path d="M10 41V31h10"/></svg>',
  stop: '<svg class="i-stop" viewBox="0 0 48 48"><rect x="13" y="13" width="22" height="22" rx="5" fill="currentColor"/></svg>',
  skip: '<svg class="i-skip" viewBox="0 0 48 48" fill="currentColor"><path d="M9 12l15 12-15 12zM24 12l15 12-15 12z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  normal: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l10 7-10 7z"/></svg>',
  quick: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/></svg>',
  turbo: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/** 75 000 мс → «1:15», понад годину — «1:02:05». */
export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type SpinState = 'idle' | 'spinning' | 'skip' | 'busy' | 'disabled';
type Tab = 'paytable' | 'history' | 'settings' | 'showcase';

export interface HudHandlers {
  /** Натискання «Спін» (кнопка миші/пальцем або пробіл): спін, стоп або пропуск. */
  spinDown(): void;
  /** Відпускання «Спін»: кінець затиснутого режиму. */
  spinUp(): void;
  setBet(value: number): void;
  speed(): void;
  auto(config: AutoConfig | null): void;
  menuOpened(): void;
  showcase(id: ScenarioId): void;
  replay(roundId: string): void;
  exitSpecial(): void;
  resetDemo(): void;
  history(): RoundRecord[];
  unlockAudio(): void;
  /** Повний звіт діагностики (стан, журнал переходів, помилки) для кнопки «Копіювати». */
  diagnostics(): string;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

/**
 * DOM-HUD за схемою 3 Oaks: керування стовпчиком праворуч (спін, автогра, ставка),
 * перемикач швидкості й звук угорі, тонка інформаційна смуга знизу (баланс і виграш).
 * Ставка обирається в панелі, що відкривається з кнопки ставки. Ігрова логіка сюди не потрапляє.
 */
export class Hud {
  readonly root: HTMLElement;
  readonly spinBtn: HTMLButtonElement;
  readonly bar: HTMLElement;
  readonly controls: HTMLElement;
  private readonly menu: HTMLDialogElement;
  private readonly betBtn: HTMLButtonElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly betPanel: BetPanel;
  private readonly autoPanel: AutoplayPanel;
  private readonly popovers: Popovers;
  private readonly values = { balance: 0, win: 0 };
  private bet = 10;
  private betEnabled = true;
  private autoLeft: number | null = null;
  private noticeTimer = 0;

  constructor(
    private readonly art: Art,
    private readonly h: HudHandlers,
  ) {
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <button class="tool" id="btn-menu" type="button">${ICON.menu}</button>
      <div class="tools">
        <button class="tool" id="btn-speed" type="button"></button>
        <button class="tool" id="btn-sound" type="button"></button>
      </div>
      <div class="ribbon" role="status"><span class="txt"></span><button type="button"></button></div>
      <div class="controls">
        <button id="btn-spin" type="button" data-state="idle">${ICON.spin}${ICON.stop}${ICON.skip}<span class="fs"></span></button>
        <button class="tool" id="btn-auto" type="button" aria-pressed="false" aria-haspopup="dialog">${ICON.auto}<span class="count"></span></button>
        <button class="bet" id="btn-bet" type="button" aria-haspopup="dialog"><small></small><strong></strong></button>
      </div>
      <div class="popover" id="bet-panel" hidden></div>
      <div class="popover" id="auto-panel" hidden></div>

      <div class="bar">
        <div class="meter balance"><small></small><strong>0</strong></div>
        <div class="mid">
          <div class="message" aria-live="polite"></div>
          <div class="session" hidden><span class="net"></span><span class="time"></span></div>
        </div>
        <div class="meter win"><small></small><strong>0</strong></div>
      </div>
      <div class="notice" role="alert"></div>
      <pre class="debug" aria-hidden="true" hidden></pre>
      <dialog class="menu"></dialog>`;
    this.bonus = new BonusScreen(this.root);
    this.spinBtn = $(this.root, '#btn-spin');
    this.bar = $(this.root, '.bar');
    this.controls = $(this.root, '.controls');
    this.menu = $(this.root, 'dialog.menu');
    this.betBtn = $(this.root, '#btn-bet');
    this.autoBtn = $(this.root, '#btn-auto');
    // на ринках без автогри й прискорення кнопок просто немає (UKGC RTS 8, 14E)
    this.autoBtn.hidden = !settings.jurisdiction.allowAutoplay;
    $(this.root, '#btn-speed').hidden = !settings.jurisdiction.allowSpeedUp;
    // панелі ставки й автогри — з @slotkit/controls; гра дає значення, формат грошей і реакції
    this.betPanel = new BetPanel($(this.root, '#bet-panel'), {
      values: BETS,
      format: formatMoney,
      onPick: (v) => {
        this.h.setBet(v);
        this.closePopovers();
        this.betBtn.focus();
      },
    });
    this.autoPanel = new AutoplayPanel($(this.root, '#auto-panel'), {
      initial: settings.prefs.auto,
      onStart: (cfg: AutoConfig) => {
        settings.set('auto', cfg);
        this.closePopovers();
        this.h.auto(cfg);
        this.spinBtn.focus();
      },
    });
    this.popovers = new Popovers([
      { panel: this.betPanel.el, trigger: this.betBtn },
      { panel: this.autoPanel.el, trigger: this.autoBtn },
    ]);

    // «Спін» реагує на натискання, а не на click: так працюють і quick stop, і утримання
    bindSpinButton(this.spinBtn, {
      beforeDown: () => {
        this.h.unlockAudio();
        this.closePopovers();
      },
      down: () => this.h.spinDown(),
      up: () => this.h.spinUp(),
    });

    $(this.root, '#btn-speed').addEventListener('click', () => this.h.speed());
    $(this.root, '#btn-sound').addEventListener('click', () => {
      this.h.unlockAudio();
      settings.set('muted', !settings.prefs.muted);
    });
    $(this.root, '#btn-menu').addEventListener('click', () => this.openMenu('paytable'));
    this.betBtn.addEventListener('click', () => {
      if (this.betEnabled) this.popovers.toggle(this.betPanel.el);
    });
    this.autoBtn.addEventListener('click', () => {
      this.h.unlockAudio();
      if (this.autoLeft !== null) this.h.auto(null);
      else this.popovers.toggle(this.autoPanel.el);
    });
    $(this.root, '.ribbon button').addEventListener('click', () => this.h.exitSpecial());
    this.menu.addEventListener('close', () => this.spinBtn.focus());
    this.menu.addEventListener('click', (e) => {
      if (e.target === this.menu) this.menu.close();
    });

    settings.on(() => this.refreshStatic());
    this.refreshStatic();
  }

  private lastLang = settings.prefs.lang;

  /** Тексти, що залежать від мови й налаштувань. */
  refreshStatic(): void {
    const p = settings.prefs;
    const langChanged = p.lang !== this.lastLang;
    this.lastLang = p.lang;
    $(this.root, '#btn-menu').setAttribute('aria-label', t('menu'));
    const sound = $(this.root, '#btn-sound');
    sound.innerHTML = p.muted ? ICON.muted : ICON.sound;
    sound.setAttribute('aria-label', t('sound'));
    sound.setAttribute('aria-pressed', String(!p.muted));
    $(this.root, '.balance small').textContent = t('balance');
    $(this.root, '.win small').textContent = t('win');
    $(this.betBtn, 'small').textContent = t('bet');
    const speedKey: Record<Speed, TKey> = { normal: 'speedNormal', quick: 'speedQuick', turbo: 'speedTurbo' };
    const speed = $(this.root, '#btn-speed');
    speed.innerHTML = ICON[p.speed];
    speed.dataset.speed = p.speed;
    speed.setAttribute('aria-label', `${t('speed')}: ${t(speedKey[p.speed])}`);
    speed.title = `${t('speed')}: ${t(speedKey[p.speed])}`;
    this.betPanel.setTitle(t('totalBet'));
    this.autoPanel.setLabels({
      title: t('auto'),
      stopOnFeature: t('autoStopFeature'),
      stopOnAnyWin: t('autoStopAnyWin'),
      singleWin: t('autoSingleWin'),
      balanceUp: t('autoBalanceUp'),
      balanceDown: t('autoBalanceDown'),
      start: t('autoStart'),
      currency: '€',
    });
    this.autoPanel.render();
    this.betPanel.render(this.bet);
    this.setAuto(this.autoLeft);
    this.updateSpinLabel();
    if (langChanged) {
      $(this.root, '.balance strong').textContent = formatMoney(this.values.balance);
      $(this.root, '.win strong').textContent = formatMoney(this.values.win);
      $(this.betBtn, 'strong').textContent = formatMoney(this.bet);
    }
    if (this.menu.open && langChanged) this.renderMenu(this.currentTab);
  }

  setBalance(v: number, animate = false): void {
    this.count('balance', v, animate);
  }

  setWin(v: number, animate = false): void {
    this.count('win', v, animate);
  }

  private count(key: 'balance' | 'win', v: number, animate: boolean): void {
    const el = $(this.root, `.${key} strong`);
    const from = this.values[key];
    this.values[key] = v;
    gsap.killTweensOf(el);
    if (!animate || v <= from) {
      el.textContent = formatMoney(v);
      return;
    }
    const o = { v: from };
    gsap.to(o, { v, duration: Math.min(1, 0.3 + (v - from) / 500), ease: 'power1.out', onUpdate: () => void (el.textContent = formatMoney(o.v)) });
    gsap.fromTo(el, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
    if (key === 'win') {
      const meter = el.closest('.meter')!;
      meter.classList.remove('lit');
      void (meter as HTMLElement).offsetWidth; // перезапуск CSS-анімації
      meter.classList.add('lit');
    }
  }

  setBet(bet: number): void {
    this.bet = bet;
    $(this.betBtn, 'strong').textContent = formatMoney(bet);
    this.betPanel.render(bet);
  }

  setBetEnabled(on: boolean): void {
    this.betEnabled = on;
    this.betBtn.disabled = !on;
    if (!on) this.closePopovers();
  }

  closePopovers(): void {
    this.popovers.closeAll();
  }

  /** Повідомлення в центрі смуги — лише стан фічі (Free Dives 3 з 8), без підказок. */
  setMessage(html: string): void {
    $(this.root, '.message').innerHTML = html;
  }

  /** Чистий результат і час сесії (UKGC RTS 2E, 13C); null — сховати. */
  setSession(net: number | null, ms = 0): void {
    const el = $(this.root, '.session');
    el.hidden = net === null;
    if (net === null) return;
    const sign = net > 0 ? '+' : net < 0 ? '−' : '';
    $(el, '.net').innerHTML = `${t('sessionNet')} <b>${sign}${formatMoney(Math.abs(net))}</b>`;
    $(el, '.time').innerHTML = `${t('sessionTime')} <b>${formatDuration(ms)}</b>`;
  }

  private spinState: SpinState = 'idle';

  setSpinState(s: SpinState): void {
    this.spinState = s;
    this.spinBtn.dataset.state = s;
    this.spinBtn.disabled = s === 'disabled';
    this.updateSpinLabel();
  }

  /** Затиснутий «Спін»: безперервні турбо-спіни. */
  setHolding(on: boolean): void {
    this.spinBtn.classList.toggle('holding', on);
  }

  private updateSpinLabel(): void {
    const label = this.spinState === 'spinning' ? t('stop') : this.spinState === 'skip' ? t('skip') : t('spin');
    this.spinBtn.setAttribute('aria-label', label);
    this.spinBtn.title = this.spinState === 'idle' ? t('holdHint') : '';
  }

  /** Номер поточного занурення в серії (або null поза серією). */
  setFreeDives(current: number | null, total = 0): void {
    $(this.root, '#btn-spin .fs').textContent = current === null ? '' : `${current}/${total}`;
  }

  setAuto(left: number | null): void {
    this.autoLeft = left;
    this.autoBtn.setAttribute('aria-pressed', String(left !== null));
    this.autoBtn.setAttribute('aria-label', left === null ? t('auto') : t('autoStop'));
    $(this.autoBtn, '.count').textContent = left === null ? '' : String(left);
  }

  setAutoEnabled(on: boolean): void {
    this.autoBtn.disabled = !on && this.autoLeft === null;
    if (!on) this.autoPanel.el.hidden = true;
  }

  onLayoutChange: () => void = () => undefined;

  get ribbonHeight(): number {
    const r = $(this.root, '.ribbon');
    return r.classList.contains('on') ? r.getBoundingClientRect().bottom + 6 : 0;
  }

  ribbon(text: string | null, button = ''): void {
    const r = $(this.root, '.ribbon');
    r.classList.toggle('on', text !== null);
    requestAnimationFrame(() => this.onLayoutChange());
    if (text !== null) {
      $(r, '.txt').textContent = text;
      $(r, 'button').textContent = button;
    }
  }

  /** Повідомлення з дією: брак коштів, втрата зв’язку. */
  /** Оверлей стан-машини (DOM: читається навіть тоді, коли канва не перемальовується). */
  setDebug(text: string | null): void {
    const el = $(this.root, '.debug');
    el.hidden = text === null;
    if (text !== null) el.textContent = text;
  }

  notice(text: string, actions: { label: string; primary?: boolean; run: () => void }[] = [], ms = 0): void {
    const n = $(this.root, '.notice');
    n.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    n.append(p);
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      if (a.primary) b.classList.add('primary');
      b.addEventListener('click', () => {
        this.hideNotice();
        a.run();
      });
      n.append(b);
    }
    n.classList.add('on');
    clearTimeout(this.noticeTimer);
    if (ms) this.noticeTimer = window.setTimeout(() => this.hideNotice(), ms);
    (n.querySelector('button.primary') as HTMLButtonElement | null)?.focus();
  }

  hideNotice(): void {
    $(this.root, '.notice').classList.remove('on');
  }

  /** Екрани старту й кінця бонусів. */
  readonly bonus: BonusScreen;

  get menuOpen(): boolean {
    return this.menu.open;
  }

  get popoverOpen(): boolean {
    return this.popovers.open;
  }

  // ───────────────────────────── menu ─────────────────────────────

  private currentTab: Tab = 'paytable';

  openMenu(tab: Tab): void {
    this.h.menuOpened();
    this.closePopovers();
    this.renderMenu(tab);
    if (!this.menu.open) this.menu.showModal();
  }

  closeMenu(): void {
    if (this.menu.open) this.menu.close();
  }

  private renderMenu(tab: Tab): void {
    this.currentTab = tab;
    const tabs: [Tab, TKey][] = [['paytable', 'paytable'], ['history', 'history'], ['settings', 'settings'], ['showcase', 'showBonus']];
    this.menu.innerHTML = `
      <div class="menu-shell">
        <div class="menu-head" role="tablist">
          ${tabs.map(([id, key]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === tab}">${t(key)}</button>`).join('')}
          <button type="button" class="close" aria-label="${t('close')}">${ICON.close}</button>
        </div>
        <div class="menu-body"><div role="tabpanel">${this.panel(tab)}</div></div>
      </div>`;
    this.menu.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((b) => b.addEventListener('click', () => this.renderMenu(b.dataset.tab as Tab)));
    $(this.menu, '.close').addEventListener('click', () => this.menu.close());
    this.bindPanel(tab);
    ($(this.menu, `[data-tab="${tab}"]`) as HTMLButtonElement).focus();
  }

  private panel(tab: Tab): string {
    switch (tab) {
      case 'paytable':
        return this.paytable();
      case 'history':
        return this.historyPanel();
      case 'settings':
        return this.settingsPanel();
      case 'showcase':
        return `<div class="scenarios">
          ${([1, 2, 3, 4] as const)
            .map((n) => `<div class="scenario"><b>${t(`scenario${n}` as TKey)}</b><p>${t(`scenario${n}Sub` as TKey)}</p><button type="button" data-scenario="${n}">${t('play')}</button></div>`)
            .join('')}
          </div><p class="note">${t('showcase')}. ${t('demoNote')}</p>`;
    }
  }

  /** Таблиця виплат — модель даних для @slotkit/paytable; суми одразу в євро для поточної ставки. */
  private paytable(): string {
    const img = (id: SymbolId) => `<img alt="" src="${this.art.previews[id]}">`;
    const money = (x: number) => formatMoney(x * this.bet);
    const paying: [PayingId, string][] = [['NAUTILUS', 'Nautilus'], ['HELMET', 'Diving helmet'], ['COMPASS', 'Compass'], ['R1', 'Trident rune'], ['R2', 'Wave rune'], ['R3', 'Eye rune'], ['R4', 'Anchor rune']];
    const pot = (id: 'extra' | 'boost' | 'multi', name: string, text: string, level: number) =>
      `<div class="pt-pot ${id}"><span class="jar ${id}"><i style="height:${level}%"></i></span><div><b>${name}</b><p>${text}</p></div></div>`;
    return renderPaytable({
      note: t('paysAtBet', { bet: formatMoney(this.bet) }),
      sections: [
        { kind: 'text', title: t('ptHowToWin'), paragraphs: [t('ptHowToWinText')] },
        {
          kind: 'pays',
          title: t('symbols'),
          symbols: paying.map(([id, name]) => ({
            image: this.art.previews[id],
            name,
            pays: PAYTABLE[id].map((x, i) => ({ label: t('ptInLine', { n: i + 3 }), amount: money(x) })),
          })),
        },
        {
          kind: 'cards',
          title: t('bonusSymbols'),
          cards: [
            { art: img('WILD'), name: 'Wild', text: t('rulesWild').split('.')[0] + '.' },
            { art: img('MAP'), name: 'Scatter', text: t('ptMapText') },
            { art: img('PEARL'), name: 'Pearl', text: t('pearlPays') },
            { art: `<span class="marked">${img('PEARL')}<i class="dot extra"></i></span>`, name: t('ptMarkedPearl'), text: t('ptMarkedPearlText') },
            { art: img('BLACK'), name: 'Super', text: t('blackPays') },
            { art: img('SHELL'), name: 'Sealed shell', text: t('shellPays') },
            ...(['JP1', 'JP2', 'JP3', 'JP4'] as const).map((id) => ({
              art: img(id),
              name: `${JACKPOTS[id].key[0].toUpperCase()}${JACKPOTS[id].key.slice(1)}`,
              text: t('jackpotPays', { v: JACKPOTS[id].value }),
              amount: money(JACKPOTS[id].value),
            })),
          ],
        },
        {
          kind: 'html',
          title: '3 Pots',
          intro: t('ptPotsText'),
          html: `<div class="pt-pots">${pot('extra', 'Extra', t('ptPotExtra'), 100)}${pot('boost', 'Boost', t('ptPotBoost'), 60)}${pot('multi', 'Multi', t('ptPotMulti'), 30)}</div>`,
        },
        {
          kind: 'steps',
          title: t('ptSalvageSteps'),
          steps: [t('ptStep1'), t('ptStep2'), t('ptStep3'), t('ptStep4'), t('ptStep5')],
          after: [t('rulesSuper'), t('rulesMystery')],
        },
        { kind: 'text', title: t('freeDives'), paragraphs: [t('rulesScatter')] },
        { kind: 'lines', title: t('lines'), lines: LINES, rows: 3 },
      ],
      footnote: [
        t('ptMaxWin', { x: settings.jurisdiction.rules.maxWinX.toLocaleString(settings.prefs.lang === 'uk' ? 'uk-UA' : 'en-GB') }),
        settings.jurisdiction.id === 'ukgc' ? t('ptUkRules') : '',
        t('rulesMath'),
        t('demoNote'),
        settings.jurisdiction.allowSpeedUp ? t('keyboardHint') : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  private historyPanel(): string {
    const rounds = this.h.history();
    if (!rounds.length) return `<p class="empty">${t('noHistory')}</p>`;
    const feat: Record<string, TKey> = { freeDives: 'featFreeDives', salvage: 'featSalvage', super: 'featSuper', fullBoard: 'featFullBoard', bigWin: 'featBigWin' };
    return `<ul class="history">${rounds
      .map((r) => {
        const time = new Date(r.startedAt).toLocaleTimeString(settings.prefs.lang === 'uk' ? 'uk-UA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `<li><span class="id">${time}<br>${r.roundId}</span><span>${t('bet')} ${formatMoney(r.bet)}</span>
          <span class="chips">${r.features.map((f) => `<span class="chip">${t(feat[f])}</span>`).join('')}</span>
          <span class="w">${formatMoney(r.win)}</span>
          <button type="button" data-replay="${r.roundId}">${t('replay')}</button></li>`;
      })
      .join('')}</ul>`;
  }

  private settingsPanel(): string {
    const p = settings.prefs;
    const seg = (name: string, options: [string, TKey][], current: string) =>
      `<span class="seg" role="group">${options.map(([v, k]) => `<button type="button" data-set="${name}" data-v="${v}" aria-pressed="${v === current}">${t(k)}</button>`).join('')}</span>`;
    return `<div class="settings">
      <div class="row"><span>${t('speed')}</span>${seg('speed', [['normal', 'speedNormal'], ['quick', 'speedQuick'], ['turbo', 'speedTurbo']], p.speed)}</div>
      <label class="row"><span>${t('music')}</span><input type="range" min="0" max="1" step="0.05" value="${p.music}" data-range="music"></label>
      <label class="row"><span>${t('effects')}</span><input type="range" min="0" max="1" step="0.05" value="${p.sfx}" data-range="sfx"></label>
      <label class="check"><input type="checkbox" data-check="muted" ${p.muted ? 'checked' : ''}>${t('mute')}</label>
      <div class="row"><span>${t('motion')}</span>${seg('motion', [['system', 'motionSystem'], ['reduced', 'motionReduced'], ['full', 'motionFull']], p.motion)}</div>
      <div class="row"><span>${t('rulesMarket')}</span>${seg('jurisdiction', [['default', 'jurDefault'], ['ukgc', 'jurUk']], settings.jurisdiction.id)}</div>
      <p class="note">${t('jurNote')}</p>
      <div class="row"><span>${t('language')}</span><span class="seg" role="group"><button type="button" data-set="lang" data-v="en" aria-pressed="${p.lang === 'en'}">English</button><button type="button" data-set="lang" data-v="uk" aria-pressed="${p.lang === 'uk'}">Українська</button></span></div>
      <label class="check"><input type="checkbox" data-check="startScreen" ${p.startScreen ? 'checked' : ''}>${t('startSetting')}</label>
      <label class="check"><input type="checkbox" data-check="netFail" ${p.netFail ? 'checked' : ''}>${t('netSim')}</label>
      <label class="check"><input type="checkbox" data-check="debug" ${p.debug ? 'checked' : ''}>${t('debugOverlay')}</label>
      <button type="button" class="plain" data-diag>${t('copyDiagnostics')}</button>
      <button type="button" class="danger" data-reset>${t('resetDemo')}</button>
    </div>`;
  }

  private bindPanel(tab: Tab): void {
    if (tab === 'showcase') {
      this.menu.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((b) =>
        b.addEventListener('click', () => {
          this.h.unlockAudio();
          this.menu.close();
          this.h.showcase(Number(b.dataset.scenario) as ScenarioId);
        }),
      );
    }
    if (tab === 'history') {
      this.menu.querySelectorAll<HTMLButtonElement>('[data-replay]').forEach((b) =>
        b.addEventListener('click', () => {
          this.h.unlockAudio();
          this.menu.close();
          this.h.replay(b.dataset.replay!);
        }),
      );
    }
    if (tab === 'settings') {
      this.menu.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) =>
        b.addEventListener('click', () => {
          if (b.dataset.set === 'jurisdiction') {
            // ринок фіксується на запуск, як параметр від оператора: зберегти й перезапустити гру
            settings.set('jurisdiction', b.dataset.v as 'default');
            const url = new URL(location.href);
            url.searchParams.delete('jurisdiction');
            location.replace(url.toString());
            return;
          }
          settings.set(b.dataset.set as 'speed', b.dataset.v as Speed);
          b.parentElement!.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        }),
      );
      this.menu.querySelectorAll<HTMLInputElement>('[data-range]').forEach((inp) =>
        inp.addEventListener('input', () => settings.set(inp.dataset.range as 'music', Number(inp.value))),
      );
      this.menu.querySelectorAll<HTMLInputElement>('[data-check]').forEach((inp) =>
        inp.addEventListener('change', () => settings.set(inp.dataset.check as 'muted', inp.checked)),
      );
      const diag = this.menu.querySelector<HTMLButtonElement>('[data-diag]');
      diag?.addEventListener('click', () => {
        const text = this.h.diagnostics();
        const done = () => {
          diag.textContent = t('copied');
          setTimeout(() => (diag.textContent = t('copyDiagnostics')), 1600);
        };
        navigator.clipboard?.writeText(text).then(done, () => {
          // без доступу до буфера — показуємо звіт, щоб його можна було виділити вручну
          const pre = document.createElement('pre');
          pre.className = 'diag-dump';
          pre.textContent = text;
          diag.after(pre);
        });
      });
      this.menu.querySelector('[data-reset]')?.addEventListener('click', () => {
        this.menu.close();
        this.h.resetDemo();
      });
    }
  }
}
