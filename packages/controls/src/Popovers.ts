/**
 * Панелі над кнопками (ставка, автогра): одна відкрита за раз, aria-expanded на кнопці,
 * закриття кліком повз панель або Esc.
 */
export class Popovers {
  constructor(private readonly items: { panel: HTMLElement; trigger: HTMLElement }[]) {
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.items.some((i) => i.panel.contains(t) || i.trigger.contains(t))) this.closeAll();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  }

  get open(): boolean {
    return this.items.some((i) => !i.panel.hidden);
  }

  toggle(panel: HTMLElement): void {
    const willOpen = panel.hidden;
    this.closeAll();
    if (!willOpen) return;
    panel.hidden = false;
    this.items.find((i) => i.panel === panel)?.trigger.setAttribute('aria-expanded', 'true');
    panel.querySelector<HTMLElement>('[aria-pressed="true"], button')?.focus({ preventScroll: true });
  }

  closeAll(): void {
    for (const i of this.items) {
      i.panel.hidden = true;
      i.trigger.setAttribute('aria-expanded', 'false');
    }
  }
}
