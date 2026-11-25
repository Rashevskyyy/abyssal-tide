import '@fontsource/fira-sans-condensed/400.css';
import '@fontsource/fira-sans-condensed/700.css';
import '@fontsource/fira-sans-condensed/800.css';
import '@slotkit/controls/controls.css';
import '@slotkit/paytable/paytable.css';
import './styles.css';
import 'pixi.js/unsafe-eval';
import gsap from 'gsap';
import { Application, Container, Text } from 'pixi.js';
import { createMoneyFormat, installErrorTraps } from '@slotkit/core';
import { createRng, isJurisdictionId, resolveJurisdiction, type JurisdictionId } from '@slotkit/rules';
import { RandomOutcomeProvider } from './engine/outcome';
import { CURRENCY } from './shared/config';
import { PALETTE, buildArt } from './client/art';
import { BOARD, BoardView, FRAME } from './client/BoardView';
import { Flow } from './client/Flow';
import { Hud } from './client/Hud';
import { rulesHtml } from './client/rules';
import { scenarioById } from './client/scenarios';
import { RemoteSource } from './client/remote';
import { LocalSource, type ResultSource } from './client/source';
import { Sound } from './client/sound';

const MARKET_KEY = 'petrykivka-bloom:market';

async function main(): Promise<void> {
  installErrorTraps();
  gsap.ticker.lagSmoothing(1500, 50);
  await document.fonts.load('800 20px "Fira Sans Condensed"').catch(() => undefined);

  const pref = localStorage.getItem(MARKET_KEY);
  const market = resolveJurisdiction(location.search, isJurisdictionId(pref) ? pref : 'default');
  document.documentElement.dataset.market = market.id;
  const { formatMoney } = createMoneyFormat({ currency: CURRENCY, locale: () => 'en-GB' });

  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    backgroundAlpha: 0,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const art = buildArt();
  const sound = new Sound();
  const board = new BoardView(art, sound, formatMoney);
  board.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = new Container();
  const title = new Text({
    text: 'PETRYKIVKA BLOOM',
    style: { fontFamily: 'Fira Sans Condensed, system-ui, sans-serif', fontWeight: '800', fontSize: 44, letterSpacing: 6, fill: PALETTE.cream },
  });
  title.anchor.set(0.5, 1);
  title.position.set(BOARD / 2, -FRAME - 14);
  world.addChild(title, board);
  app.stage.addChild(world);

  // ?server=http://localhost:8787 або VITE_SERVER_URL під час збірки — гра через сервер;
  // інакше (або якщо він недоступний) — офлайн-демо
  const serverUrl = new URLSearchParams(location.search).get('server') ?? import.meta.env.VITE_SERVER_URL;
  let source: ResultSource = new LocalSource(new RandomOutcomeProvider(createRng()), market.rules);
  let offlineNotice = false;
  if (serverUrl) {
    const remote = new RemoteSource(serverUrl, market.id);
    try {
      await remote.connect();
      source = remote;
      document.documentElement.dataset.source = 'server';
    } catch {
      offlineNotice = true;
    }
  }
  let flow: Flow | null = null;
  const hud = new Hud(formatMoney, market, {
    spin: () => void flow?.spin(),
    buy: () => void flow?.buy(),
    setBet: (v) => flow?.setBet(v),
    setAnte: (on) => flow?.setAnte(on),
    setTurbo: (on) => flow?.setTurbo(on),
    setMuted: (m) => {
      sound.setMuted(m);
      localStorage.setItem('petrykivka-bloom:muted', m ? '1' : '0');
    },
    openRules: () => rulesHtml({ bet: flow?.bet ?? 100, money: formatMoney, images: art.symbolUrls, market }),
    onMode: (free) => {
      title.visible = !free;
      sound.music(free ? 'free' : 'base');
    },
    showcase: (id) => {
      const sc = scenarioById(id);
      if (sc) void flow?.showcase(sc);
    },
    setMarket: (id: JurisdictionId) => {
      localStorage.setItem(MARKET_KEY, id);
      const url = new URL(location.href);
      url.searchParams.delete('jurisdiction');
      location.replace(url);
    },
  });
  const muted = localStorage.getItem('petrykivka-bloom:muted') === '1';
  sound.setMuted(muted);
  hud.setMuted(muted);
  flow = new Flow(board, hud, source, sound, market, formatMoney);
  hud.setTurbo(flow.turbo);
  // лише читання — для e2e-тестів і діагностики
  Object.defineProperty(window, '__pb', {
    get: () => ({
      ...flow?.probe,
      /** Сповільнення всього ігрового часу — для запису відео без GPU (scripts/record-video.mjs). */
      timeScale: (k: number) => gsap.globalTimeline.timeScale(k),
    }),
  });
  // музика стартує з першою взаємодією: так вимагає політика автоплею браузерів
  const startMusic = () => {
    sound.unlock();
    sound.music(document.documentElement.dataset.mode === 'free' ? 'free' : 'base');
  };
  window.addEventListener('pointerdown', startMusic, { once: true });
  window.addEventListener('keydown', startMusic, { once: true });
  // тап по полю під час показу — те саме, що «Спін» (пропуск, де дозволено)
  app.canvas.addEventListener('pointerdown', () => void flow?.spin());

  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const portrait = h > w * 1.05;
    const root = document.documentElement;
    root.dataset.layout = portrait ? 'portrait' : 'landscape';
    const hudW = portrait ? 0 : Math.round(Math.min(330, Math.max(230, w * 0.26)));
    const hudH = portrait ? Math.round(Math.min(250, Math.max(170, h * 0.28))) : 0;
    root.style.setProperty('--hud-w', `${hudW}px`);
    root.style.setProperty('--hud-h', `${hudH}px`);
    const areaW = w - hudW;
    const contentW = BOARD + FRAME * 2;
    const contentH = BOARD + FRAME * 2 + 70;
    if (portrait) {
      // телефон: поле й HUD однією композицією по центру висоти, HUD одразу під полем
      const hudContent = 200;
      const scale = Math.min((w * 0.95) / contentW, ((h - hudContent - 24) * 0.96) / contentH);
      const top = Math.max(8, (h - contentH * scale - hudContent - 12) / 2);
      world.scale.set(scale);
      world.position.set((w - BOARD * scale) / 2, top + (FRAME + 70) * scale);
      root.style.setProperty('--hud-top', `${Math.round(world.position.y + (BOARD + FRAME) * scale + 12)}px`);
    } else {
      const areaH = h - hudH;
      const scale = Math.min((areaW * 0.94) / contentW, (areaH * 0.92) / contentH);
      world.scale.set(scale);
      world.position.set((areaW - BOARD * scale) / 2, (areaH - (BOARD + FRAME) * scale) / 2 + 40 * scale);
    }
    const scale = world.scale.x;
    root.style.setProperty('--board-top', `${world.position.y - FRAME * scale}px`);
    root.style.setProperty('--board-x', `${world.position.x + (BOARD * scale) / 2}px`);
  };
  layout();
  window.addEventListener('resize', layout);
  if (market.showSession) {
    const tick = () => flow?.tickSession();
    tick();
    window.setInterval(tick, 1000);
  }
  document.getElementById('loader')!.remove();
  if (offlineNotice) {
    await hud.card({ title: 'Playing offline', body: 'The game server is not reachable, so this is the offline demo with its own balance.', ok: 'OK' });
  }
  await flow.start();
  // ?demo=chain|stroke|bonus — посилання з кейсу одразу на потрібну фічу
  const demo = scenarioById(new URLSearchParams(location.search).get('demo'));
  if (demo) void flow.showcase(demo);
}

void main();
