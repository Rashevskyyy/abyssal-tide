import { formatMoney } from '../core/format';
import { settings } from '../core/settings';

export interface BonusChip {
  pot: 'extra' | 'boost' | 'multi';
  label: string;
  text: string;
}

export interface BonusScreenOptions {
  kind: 'salvage' | 'freeDives' | 'salvageEnd' | 'freeDivesEnd';
  title: string;
  subtitle?: string;
  /** Підсумок бонусу — рахується з нуля на екрані кінця. */
  amount?: number;
  chips?: BonusChip[];
  rules?: string[];
  button: string;
  /** Через скільки мс екран закриється сам (0 — чекає на гравця). */
  autoMs: number;
}

/**
 * Екрани старту й кінця бонусу (як «Press to start» / «Total win» у 3 Oaks).
 * Паперова картка поверх поля: назва бонусу штампом, правила, активні банки, підсумок.
 * Закривається кнопкою, тапом по екрану, пробілом/Enter або сам за таймером (автогра, турбо).
 */
export class BonusScreen {
  private readonly el: HTMLElement;
  private finish: (() => void) | null = null;
  private timer = 0;
  private countRaf = 0;
  /** Лише для тестів і знімків: екрани не закриваються самі. */
  holdForTests = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'bonus-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    root.append(this.el);
    this.el.addEventListener('click', (e) => {
      // тап будь-де закриває, крім галочок і посилань (їх немає, але залишаємо на майбутнє)
      if ((e.target as HTMLElement).closest('input, a')) return;
      this.close();
    });
  }

  get open(): boolean {
    return this.finish !== null;
  }

  show(o: BonusScreenOptions): Promise<void> {
    this.close();
    const chips = (o.chips ?? [])
      .map((c) => `<li class="chip ${c.pot}"><b>${c.label}</b><span>${c.text}</span></li>`)
      .join('');
    const rules = (o.rules ?? []).map((r) => `<li>${r}</li>`).join('');
    this.el.className = `bonus-screen ${o.kind}`;
    this.el.innerHTML = `
      <div class="bonus-card">
        <h2>${o.title}</h2>
        ${o.subtitle ? `<p class="sub">${o.subtitle}</p>` : ''}
        ${o.amount !== undefined ? `<p class="amount">${formatMoney(0)}</p>` : ''}
        ${chips ? `<ul class="chips">${chips}</ul>` : ''}
        ${rules ? `<ul class="rules">${rules}</ul>` : ''}
        <button type="button" class="go">${o.button}</button>
        ${o.autoMs ? `<i class="auto" style="animation-duration:${o.autoMs}ms"></i>` : ''}
      </div>`;
    this.el.setAttribute('aria-label', o.title);
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.el.querySelector<HTMLButtonElement>('.go')!.focus({ preventScroll: true });
    if (o.amount !== undefined) this.countUp(o.amount);
    return new Promise((resolve) => {
      this.finish = resolve;
      if (o.autoMs && !this.holdForTests) this.timer = window.setTimeout(() => this.close(), o.autoMs);
    });
  }

  close(): void {
    const done = this.finish;
    if (!done) return;
    this.finish = null;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.countRaf);
    const amount = this.el.querySelector<HTMLElement>('.amount');
    if (amount?.dataset.final) amount.textContent = amount.dataset.final;
    this.el.classList.remove('in');
    this.el.classList.add('out');
    setTimeout(() => {
      if (this.finish) return; // уже відкрито наступний екран
      this.el.hidden = true;
      this.el.classList.remove('out');
    }, 260);
    done();
  }

  private countUp(target: number): void {
    const el = this.el.querySelector<HTMLElement>('.amount')!;
    el.dataset.final = formatMoney(target);
    if (settings.reducedMotion || target <= 0) {
      el.textContent = el.dataset.final;
      return;
    }
    const dur = Math.min(1800, 600 + Math.log10(1 + target / 100) * 500);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = formatMoney(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) this.countRaf = requestAnimationFrame(tick);
      else el.classList.add('done');
    };
    this.countRaf = requestAnimationFrame(tick);
  }
}
