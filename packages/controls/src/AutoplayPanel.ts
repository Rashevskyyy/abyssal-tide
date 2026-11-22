import { AUTO_COUNTS, DEFAULT_AUTO, moneyInputValue, parseMoneyInput, type AutoConfig } from './autoplay';

export interface AutoplayLabels {
  title: string;
  stopOnFeature: string;
  stopOnAnyWin: string;
  singleWin: string;
  balanceUp: string;
  balanceDown: string;
  start: string;
  /** Символ валюти в полях сум. */
  currency: string;
}

/**
 * Панель автогри: кількість раундів і умови зупинки (бонус, будь-який виграш,
 * разовий виграш більший за…, баланс зріс / зменшився на…). «Почати» віддає готову AutoConfig.
 */
export class AutoplayPanel {
  private draft: AutoConfig;

  constructor(
    readonly el: HTMLElement,
    private readonly opts: { counts?: readonly number[]; initial?: Partial<AutoConfig>; onStart(cfg: AutoConfig): void },
  ) {
    this.draft = { ...DEFAULT_AUTO, ...opts.initial };
    el.classList.add('sk-panel', 'sk-auto');
    el.setAttribute('role', 'dialog');
    const limit = (k: string) =>
      `<label class="sk-limit"><span></span><span class="sk-money"><i></i><input type="text" inputmode="decimal" data-k="${k}" placeholder="—"></span></label>`;
    el.innerHTML = `
      <h3></h3>
      <div class="sk-choices sk-counts"></div>
      <label class="sk-check"><input type="checkbox" data-k="stopOnFeature"><span></span></label>
      <label class="sk-check"><input type="checkbox" data-k="stopOnAnyWin"><span></span></label>
      ${limit('singleWin')}${limit('balanceUp')}${limit('balanceDown')}
      <button type="button" class="sk-start"></button>`;
    el.querySelector('.sk-counts')!.addEventListener('click', (e) => {
      const n = Number((e.target as HTMLElement).closest<HTMLElement>('[data-n]')?.dataset.n);
      if (!n) return;
      this.draft = { ...this.read(), rounds: n };
      this.render();
    });
    el.querySelector('.sk-start')!.addEventListener('click', () => opts.onStart(this.read()));
    this.render();
  }

  setLabels(l: AutoplayLabels): void {
    this.el.querySelector('h3')!.textContent = l.title;
    this.el.setAttribute('aria-label', l.title);
    const text: Record<string, string> = l as unknown as Record<string, string>;
    this.el.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
      (inp.closest('label')!.querySelector('span') as HTMLElement).textContent = text[inp.dataset.k!];
    });
    this.el.querySelectorAll('.sk-money i').forEach((i) => (i.textContent = l.currency));
    this.el.querySelector('.sk-start')!.textContent = l.start;
  }

  render(): void {
    const d = this.draft;
    this.el.querySelector('.sk-counts')!.innerHTML = (this.opts.counts ?? AUTO_COUNTS)
      .map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === d.rounds}">${n}</button>`)
      .join('');
    this.el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((inp) => {
      inp.checked = Boolean(d[inp.dataset.k as 'stopOnFeature']);
    });
    this.el.querySelectorAll<HTMLInputElement>('input[type="text"]').forEach((inp) => {
      if (document.activeElement !== inp) inp.value = moneyInputValue(d[inp.dataset.k as 'singleWin']);
    });
  }

  read(): AutoConfig {
    const v = (k: string) => this.el.querySelector<HTMLInputElement>(`input[data-k="${k}"]`)!;
    this.draft = {
      rounds: this.draft.rounds,
      stopOnFeature: v('stopOnFeature').checked,
      stopOnAnyWin: v('stopOnAnyWin').checked,
      singleWin: parseMoneyInput(v('singleWin').value),
      balanceUp: parseMoneyInput(v('balanceUp').value),
      balanceDown: parseMoneyInput(v('balanceDown').value),
    };
    return this.draft;
  }
}
