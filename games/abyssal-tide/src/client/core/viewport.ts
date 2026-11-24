/**
 * Екран: компонування, масштаб HUD, безпечні зони й поля на наддовгих моніторах.
 *
 * - Портрет (висота більша за ширину) — керування рядком під полем, як у мобільних слотах 3 Oaks.
 *   Альбом — стовпчик праворуч, і на телефоні теж: раніше вузький альбомний телефон отримував
 *   «портретний» HUD, і поле зменшувалося до мініатюри.
 * - `--k` — масштаб кнопок керування: на 1080p вони більші, на телефоні в альбомі менші.
 *   `--kb` — масштаб смуги з балансом: його не стискаємо так сильно, щоб суми лишались читабельними.
 * - Безпечні зони (`env(safe-area-inset-*)`): виріз камери на iPhone в альбомі й «домашня» смужка.
 * - На моніторах ширших за 21:10 керування тримається біля гри, а не на краю екрана (`--inset-x`).
 *
 * Модуль пише `data-layout` і CSS-змінні в `<html>`; CSS і розкладка сцени читають звідти.
 */
export type Layout = 'portrait' | 'landscape';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportInfo {
  w: number;
  h: number;
  layout: Layout;
  /** Масштаб кнопок керування. */
  k: number;
  /** Масштаб смуги балансу. */
  kb: number;
  /** Бокове поле на наддовгих моніторах (з кожного боку). */
  insetX: number;
  safe: Insets;
}

/** Ширше за 21:10 — далі гра не розтягується, з боків лишається тло. */
export const MAX_ASPECT = 2.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let probe: HTMLDivElement | null = null;

/** Безпечні зони читаємо з прихованого елемента: інакше env() із JS не дістати. */
function readSafe(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

/** Чиста частина: компонування й масштаби за розміром екрана (тестується без DOM). */
export function computeViewport(w: number, h: number, safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): ViewportInfo {
  const layout: Layout = h > w ? 'portrait' : 'landscape';
  const k =
    layout === 'portrait'
      ? clamp(Math.min(w / 400, h / 800), 0.78, 1.4)
      : clamp(Math.min(w / 1440, h / 820), 0.6, 1.8);
  const kb = clamp(k, 0.8, 1.5);
  const insetX = layout === 'landscape' && w > h * MAX_ASPECT ? Math.round((w - h * MAX_ASPECT) / 2) : 0;
  return { w, h, layout, k: round(k), kb: round(kb), insetX, safe };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function measureViewport(): ViewportInfo {
  return computeViewport(window.innerWidth, window.innerHeight, readSafe());
}

/** Записує компонування й масштаби в <html>. */
export function applyViewport(v: ViewportInfo = measureViewport()): ViewportInfo {
  const root = document.documentElement;
  root.dataset.layout = v.layout;
  root.style.setProperty('--k', String(v.k));
  root.style.setProperty('--kb', String(v.kb));
  root.style.setProperty('--inset-x', `${v.insetX}px`);
  return v;
}

/**
 * Стежить за розміром: resize, поворот і visualViewport (панелі Safari з’являються й ховаються).
 * На iOS після повороту розміри оновлюються із запізненням, тому після orientationchange міряємо ще раз.
 */
export function watchViewport(onChange: (v: ViewportInfo) => void): () => void {
  let raf = 0;
  let last = '';
  const run = () => {
    raf = 0;
    const v = applyViewport();
    const key = `${v.w}x${v.h}:${v.safe.top},${v.safe.right},${v.safe.bottom},${v.safe.left}`;
    if (key === last) return;
    last = key;
    onChange(v);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(run);
  };
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => {
    schedule();
    window.setTimeout(schedule, 350);
  });
  return run;
}
