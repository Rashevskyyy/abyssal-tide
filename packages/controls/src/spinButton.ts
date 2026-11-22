/**
 * Кнопка «Спін» реагує на натискання, а не на click: так працюють і quick stop, і утримання
 * (затиснута кнопка — безперервні турбо-спіни, як у 3 Oaks). Повертає функцію відв’язки.
 */
export function bindSpinButton(btn: HTMLButtonElement, h: { down(): void; up(): void; beforeDown?(): void }): () => void {
  let held = false;
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    held = true;
    h.beforeDown?.();
    h.down();
  };
  const release = () => {
    if (!held) return;
    held = false;
    h.up();
  };
  const menu = (e: Event) => e.preventDefault();
  // click без вказівника (Enter у допоміжних технологіях) — звичайне натискання
  const click = (e: MouseEvent) => {
    if (e.detail !== 0) return;
    h.beforeDown?.();
    h.down();
    h.up();
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', menu);
  btn.addEventListener('click', click);
  return () => {
    btn.removeEventListener('pointerdown', down);
    btn.removeEventListener('pointerup', release);
    btn.removeEventListener('pointercancel', release);
    btn.removeEventListener('lostpointercapture', release);
    btn.removeEventListener('contextmenu', menu);
    btn.removeEventListener('click', click);
  };
}
