import { POT_SIZE } from '../../shared/config';
import type { SymbolId } from '../../shared/symbols';
import { settings } from '../core/settings';
import { t } from '../core/i18n';

/**
 * Стартовий екран, як у слотах 3 Oaks: логотип і смуга завантаження, далі — чотири фічі з артом
 * і кнопка «Грати». Галочка «Більше не показувати» пропускає фічі (завантаження видно завжди).
 * Це DOM поверх канви: текст лишається чітким і доступним для читачів екрана.
 */
export class StartScreen {
  private readonly el: HTMLElement;
  private resolveClose: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = root;
    this.el.innerHTML = `
      <div class="start-inner">
        <h1>Abyssal Tide</h1>
        <p class="start-tag"></p>
        <div class="depth" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <div class="start-body" hidden></div>
      </div>`;
    this.text();
  }

  private text(): void {
    (this.el.querySelector('.start-tag') as HTMLElement).textContent = t('startTag');
  }

  /** Поступ завантаження 0…1. */
  progress(p: number): void {
    const bar = this.el.querySelector<HTMLElement>('.depth')!;
    bar.classList.add('known');
    bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    (bar.firstElementChild as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  get open(): boolean {
    return !this.el.classList.contains('done');
  }

  /**
   * Завантаження скінчилось: показати фічі й дочекатися «Грати»
   * (або одразу зникнути, якщо гравець вимкнув стартовий екран).
   */
  ready(previews: Record<SymbolId, string>): Promise<void> {
    if (!settings.prefs.startScreen) {
      this.hide();
      return Promise.resolve();
    }
    const img = (id: SymbolId) => `<img alt="" src="${previews[id]}">`;
    const jar = (cls: string, level: number) => `<span class="jar ${cls}"><i style="height:${Math.round((level / POT_SIZE) * 100)}%"></i></span>`;
    const body = this.el.querySelector<HTMLElement>('.start-body')!;
    body.innerHTML = `
      <div class="start-feats">
        <section><div class="art">${img('PEARL')}${img('SHELL')}</div><h2>Salvage</h2><p>${t('introSalvage')}</p></section>
        <section><div class="art jars">${jar('extra', 30)}${jar('boost', 18)}${jar('multi', 9)}</div><h2>3 Pots</h2><p>${t('introPots')}</p></section>
        <section><div class="art">${img('MAP')}</div><h2>Free Dives</h2><p>${t('introFree')}</p></section>
        <section><div class="art">${img('BLACK')}${img('JP4')}</div><h2>${t('introSuperTitle')}</h2><p>${t('introSuperJackpots')}</p></section>
      </div>
      <div class="start-foot">
        <label class="check"><input type="checkbox" id="start-skip"><span>${t('introDontShow')}</span></label>
        <button type="button" class="play">${t('play')}</button>
      </div>`;
    body.hidden = false;
    this.el.classList.add('ready');
    const play = body.querySelector<HTMLButtonElement>('.play')!;
    play.focus({ preventScroll: true });
    return new Promise((resolve) => {
      this.resolveClose = resolve;
      play.addEventListener('click', () => this.close());
    });
  }

  /** Закрити (кнопка, пробіл, Enter). */
  close(): void {
    if (!this.resolveClose) return;
    const skip = this.el.querySelector<HTMLInputElement>('#start-skip');
    if (skip?.checked) settings.set('startScreen', false);
    const done = this.resolveClose;
    this.resolveClose = null;
    this.hide();
    done();
  }

  private hide(): void {
    this.el.classList.add('done');
    setTimeout(() => (this.el.hidden = true), 450);
  }
}
