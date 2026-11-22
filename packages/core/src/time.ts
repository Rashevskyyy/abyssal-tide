import gsap from 'gsap';

/**
 * Увесь ігровий час іде через GSAP: анімації й очікування (delayedCall) рахуються одним годинником,
 * тож схована вкладка (без requestAnimationFrame) заморожує їх разом, а пропуск епізоду пропускає обидва.
 */
export const wait = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => void gsap.delayedCall(ms / 1000, resolve));

/**
 * Дочекатися завершення анімації, не затираючи її власні onComplete / onInterrupt.
 * Якщо анімацію вбили (kill) до кінця, проміс теж завершується — інакше потік гри завис би назавжди.
 */
export const play = (tl: gsap.core.Animation): Promise<void> =>
  new Promise((resolve) => {
    if (tl.progress() >= 1) return resolve();
    const own = tl.eventCallback('onComplete') as ((...a: unknown[]) => void) | null;
    tl.eventCallback('onComplete', (...args: unknown[]) => {
      own?.(...args);
      resolve();
    });
    const ownInt = tl.eventCallback('onInterrupt') as ((...a: unknown[]) => void) | null;
    tl.eventCallback('onInterrupt', (...args: unknown[]) => {
      ownInt?.(...args);
      resolve();
    });
  });

/**
 * Пропускний епізод (великий виграш, розкриття, збір).
 * skip() доводить усі зареєстровані таймлайни до кінця, і кожен із них
 * відправляє свій сигнал завершення рівно один раз; наступні кроки епізоду виконуються миттєво.
 */
export class Episode {
  skipped = false;
  private readonly live = new Set<gsap.core.Animation>();
  private readonly waits = new Set<() => void>();

  play(tl: gsap.core.Animation): Promise<void> {
    if (this.skipped) {
      tl.progress(1);
      return Promise.resolve();
    }
    this.live.add(tl);
    return play(tl).then(() => void this.live.delete(tl));
  }

  wait(ms: number): Promise<void> {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.waits.delete(finish);
        call.kill();
        resolve();
      };
      const call = gsap.delayedCall(ms / 1000, finish);
      this.waits.add(finish);
    });
  }

  skip(): void {
    if (this.skipped) return;
    this.skipped = true;
    for (const tl of [...this.live]) tl.progress(1);
    for (const w of [...this.waits]) w();
  }
}

/** Відкладена обіцянка, що резолвиться один раз. */
export class Signal<T = void> {
  private resolveFn!: (v: T) => void;
  private fired = false;
  readonly promise = new Promise<T>((r) => (this.resolveFn = r));
  fire(v: T): void {
    if (this.fired) return;
    this.fired = true;
    this.resolveFn(v);
  }
  get done(): boolean {
    return this.fired;
  }
}
