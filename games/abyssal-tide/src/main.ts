import '@slotkit/controls/controls.css';
import '@slotkit/paytable/paytable.css';
import './styles.css';
import 'pixi.js/unsafe-eval';
import gsap from 'gsap';
import { Application } from 'pixi.js';
import { RandomOutcomeProvider } from './engine/outcome';
import { LocalResultSource } from './server/LocalResultSource';
import { RemoteResultSource } from './server/RemoteResultSource';
import type { LiveSource } from './server/protocol';
import { BrowserStore } from './server/storage';
import { buildArt } from './client/art/textures';
import { AudioEngine } from './client/audio/AudioEngine';
import { loadFonts } from './client/core/fonts';
import { settings } from './client/core/settings';
import { t } from './client/core/i18n';
import { applyViewport, watchViewport, type ViewportInfo } from './client/core/viewport';
import { diagnostics, diagnosticsReport, installErrorTraps } from '@slotkit/core';
import { GameFlow } from './client/flow/GameFlow';
import { Hud } from './client/hud/Hud';
import { GameView } from './client/view/GameView';
import { StartScreen } from './client/hud/StartScreen';

async function main(): Promise<void> {
  installErrorTraps();
  const start = new StartScreen(document.getElementById('loader')!);
  // ігровий час іде за годинником навіть на повільних кадрах; великі розриви (сон вкладки) обрізаються
  gsap.ticker.lagSmoothing(1500, 50);
  await loadFonts();
  start.progress(0.3);
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    backgroundColor: 0x061a40,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  start.progress(0.45);

  const art = await buildArt();
  start.progress(0.85);
  const audio = new AudioEngine();
  audio.setVolumes(settings.prefs.music, settings.prefs.sfx, settings.prefs.muted);
  const view = new GameView(app, art, audio);
  // Джерело гри: справжній сервер (?server=http://localhost:8787 або VITE_SERVER_URL) чи офлайн-демо в браузері.
  // Сервер недоступний — граємо офлайн і кажемо про це.
  const serverUrl = new URLSearchParams(location.search).get('server') ?? import.meta.env.VITE_SERVER_URL;
  let live: LiveSource | null = null;
  let serverDown = false;
  if (serverUrl) {
    const remote = new RemoteResultSource({ baseUrl: serverUrl, jurisdiction: settings.jurisdiction.id });
    try {
      await remote.connect();
      live = remote;
      diagnostics.add('recover', `connected to ${remote.baseUrl}`);
    } catch {
      serverDown = true;
    }
  }
  live ??= new LocalResultSource({
    store: new BrowserStore(),
    provider: new RandomOutcomeProvider(),
    latency: [40, 140],
    rules: settings.jurisdiction.rules, // максимальний виграш ринку
  });

  // зменшений рух з меню діє і на CSS (значок спіну тощо)
  const applyMotion = () => (document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full');
  applyMotion();
  settings.on(applyMotion);

  let flow: GameFlow | null = null;
  const hud = new Hud(art, {
    spinDown: () => flow?.spinDown(),
    spinUp: () => flow?.spinUp(),
    setBet: (v) => flow?.setBet(v),
    speed: () => flow?.cycleSpeed(),
    auto: (n) => flow?.setAuto(n),
    menuOpened: () => flow?.stopAuto(),
    showcase: (id) => void flow?.showcase(id),
    replay: (id) => void flow?.replay(id),
    exitSpecial: () => flow?.exitSpecial(),
    resetDemo: () => flow?.resetDemo(),
    history: () => flow?.history() ?? [],
    unlockAudio: () => audio.unlock(),
    diagnostics: () => diagnosticsReport({ ...(flow?.diagnosticsInfo() ?? {}), build: __BUILD__ }),
  });
  flow = new GameFlow(live, view, hud, audio);
  // нова помилка в журналі одразу видна в оверлеї стан-машини
  diagnostics.onChange(() => flow?.renderDebug());
  settings.on(() => flow?.renderDebug());

  // Поле займає простір, вільний від HUD і безпечних зон: в альбомі праворуч стовпчик керування,
  // у портреті рядок керування знизу. Компонування й масштаб HUD вирішує viewport.ts.
  let vp: ViewportInfo = applyViewport();
  const menuBtn = document.getElementById('btn-menu')!;
  const layout = () => {
    const { w, h, safe, insetX } = vp;
    const bar = hud.bar.getBoundingClientRect();
    const controls = hud.controls.getBoundingClientRect();
    const left = Math.max(insetX, safe.left) + 6;
    if (vp.layout === 'portrait') {
      const top = Math.max(menuBtn.getBoundingClientRect().bottom + 4, hud.ribbonHeight);
      view.layout(w, h, { x: left, y: top, w: w - Math.max(insetX, safe.right) - 6 - left, h: controls.top - 4 - top });
    } else {
      const top = Math.max(safe.top + 8, hud.ribbonHeight);
      const height = bar.top - 6 - top;
      const right = controls.left - 4;
      // гра по центру екрана, як у слотах 3 Oaks; зсуваємо ліворуч, лише якщо так поле стане помітно більшим
      const half = Math.min(w / 2 - left, right - w / 2);
      const centred = { x: w / 2 - half, y: top, w: half * 2, h: height };
      const free = { x: left, y: top, w: right - left, h: height };
      view.layout(w, h, half > 0 && view.fitScale(centred) >= view.fitScale(free) * 0.97 ? centred : free);
    }
  };
  hud.onLayoutChange = layout;
  watchViewport((v) => {
    vp = v;
    app.renderer.resize(v.w, v.h);
    layout();
  });
  layout();

  // Пауза вкладки. Час гри (GSAP) і рендер (Pixi) ідуть від requestAnimationFrame, який браузер
  // сам зупиняє у схованій вкладці, а після повернення lagSmoothing не дає часу «стрибнути».
  // Тому таймлайни й тікер ми НЕ ставимо на паузу вручну: якщо подія повернення загубиться
  // (буває у вбудованих WebView на iOS), гра не замерзне назавжди. Глушимо лише звук.
  const wake = () => {
    if (document.hidden) return;
    gsap.ticker.wake();
    app.ticker.start();
    audio.resume();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? audio.pause() : wake()));
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pointerdown', wake, { capture: true });

  // пробіл/Enter = натискання «Спін»; утримання пробілу так само дає безперервні турбо-спіни
  const isSpinKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, .popover')) return false;
    if (e.code === 'Space') return target.tagName !== 'BUTTON' || target === hud.spinBtn;
    if (e.code === 'Enter') return target.tagName !== 'BUTTON' || target === hud.spinBtn;
    return false;
  };
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    // на стартовому екрані й екранах бонусу пробіл/Enter лише закривають їх, а не запускають спін
    const overlay = start.open ? () => start.close() : hud.bonus.open ? () => hud.bonus.close() : null;
    if (overlay) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        if (!e.repeat) overlay();
      }
      return;
    }
    if (isSpinKey(e)) {
      e.preventDefault();
      if (!e.repeat) {
        audio.unlock();
        hud.closePopovers();
        flow?.spinDown();
      }
    } else if (e.code === 'KeyM' && !target.closest('input, select, textarea, dialog')) {
      hud.openMenu('paytable');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') flow?.spinUp();
  });
  window.addEventListener('blur', () => flow?.spinUp());
  // клік по полю теж керує спіном/стопом/пропуском
  app.canvas.addEventListener('pointerdown', () => {
    audio.unlock();
    if (flow && flow.state !== 'idle') flow.onSpinPressed();
  });

  // мінімальний read-only API для e2e-тестів
  const game = flow;
  const source = live;
  (window as unknown as { __abyssal: unknown }).__abyssal = {
    get state() {
      return game.state;
    },
    get balance() {
      return source.snapshot().balance;
    },
    history: () => source.history(),
    /** Звідки результати: офлайн у браузері чи сервер. */
    source: live instanceof RemoteResultSource ? live.baseUrl : 'local',
    trace: () => [...game.trace],
    /** Лише для тестів: прискорити весь ігровий час (анімації й очікування йдуть через GSAP). */
    timeScale: (k: number) => {
      gsap.globalTimeline.timeScale(k);
      app.ticker.speed = k; // обертання барабанів і середовище — теж в ігровому часі
    },
    /** Лише для тестів: імітувати «заснулий» тікер анімацій (так поводяться деякі WebView). */
    sleepTicker: () => gsap.ticker.sleep(),
    /** Лише для тестів: екрани бонусу не закриваються самі. */
    holdScreens: (on: boolean) => void (hud.bonus.holdForTests = on),
    diagnostics: () => diagnostics.all.map((d) => `${d.kind}: ${d.message}`),
  };

  await flow.boot();
  start.progress(1);
  flow.startWatchdog();
  flow.startSessionClock();
  await start.ready(art.previews);
  if (serverDown) hud.notice(t('serverOffline'), [], 6000);

}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loader');
  if (l) l.innerHTML = `<div class="mark"><h1>Abyssal Tide</h1><p>${String(e instanceof Error ? e.message : e)}</p></div>`;
});
