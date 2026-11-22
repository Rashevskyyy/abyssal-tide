/**
 * Панель ставки як у 3 Oaks: сітка рівнів (наприклад, 16 значень від €0.25 до €50),
 * поточний рівень залитий. Значення — цілі центи; формат грошей передає гра.
 */
export interface BetPanelOptions {
  values: readonly number[];
  format(cents: number): string;
  onPick(cents: number): void;
}

export class BetPanel {
  private readonly title: HTMLElement;
  private readonly grid: HTMLElement;
  private current = 0;

  constructor(
    readonly el: HTMLElement,
    private readonly opts: BetPanelOptions,
  ) {
    el.classList.add('sk-panel', 'sk-bet');
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<h3></h3><div class="sk-choices"></div>';
    this.title = el.querySelector('h3')!;
    this.grid = el.querySelector('.sk-choices')!;
    this.grid.addEventListener('click', (e) => {
      const v = Number((e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v);
      if (v) opts.onPick(v);
    });
  }

  setTitle(text: string): void {
    this.title.textContent = text;
    this.el.setAttribute('aria-label', text);
  }

  render(current = this.current): void {
    this.current = current;
    this.grid.innerHTML = this.opts.values
      .map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === current}">${this.opts.format(v)}</button>`)
      .join('');
  }
}
