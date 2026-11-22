// Галерея паку: усі символи на одному «відбитку», кнопки запускають анімації з @slotkit/board.
import '@fontsource/ibm-plex-sans/latin-400';
import '@fontsource/ibm-plex-sans/latin-600';
import '@fontsource/ibm-plex-mono/latin-500';
import '@fontsource/big-shoulders-stencil-display/latin-900';
import 'pixi.js/unsafe-eval';
import gsap from 'gsap';
import { Application, Container, Text } from 'pixi.js';
import { SymbolView } from '@slotkit/board';
import { runtime } from '@slotkit/core';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { CYANOTYPE_IDS, CYANOTYPE_NAMES, MOTION, createCyanotypePack, loadDiverSkeleton, type CyanotypeId } from '../src';

const MONO = '"IBM Plex Mono", "Courier New", monospace';
const STENCIL = '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif';
const CELL_W = 212;
const CELL_H = 270;

type Tile = { id: CyanotypeId; root: Container; view: SymbolView<CyanotypeId> };

async function main(): Promise<void> {
  // текстури малюються шрифтами — чекаємо їх до растеризації
  await Promise.all([document.fonts.load(`500 20px ${MONO}`), document.fonts.load(`900 40px ${STENCIL}`)]).catch(() => undefined);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  runtime.reducedMotion = reduce.matches;
  reduce.addEventListener('change', () => (runtime.reducedMotion = reduce.matches));

  const host = document.getElementById('stage')!;
  const app = new Application();
  await app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true, width: host.clientWidth, height: 320 });
  host.appendChild(app.canvas);

  const pack = await createCyanotypePack({ mono: MONO, stencil: STENCIL });
  const sheet = new Container();
  app.stage.addChild(sheet);

  const tiles: Tile[] = CYANOTYPE_IDS.map((id) => {
    const root = new Container();
    const view = new SymbolView<CyanotypeId>(pack);
    view.set({ s: id });
    view.position.set(CELL_W / 2, 104);
    const name = new Text({ text: CYANOTYPE_NAMES[id], style: { fontFamily: MONO, fontWeight: '500', fontSize: 18, fill: 0xf4f8ff, align: 'center' } });
    name.anchor.set(0.5, 0);
    name.position.set(CELL_W / 2, 204);
    const motion = new Text({ text: MOTION[id], style: { fontFamily: MONO, fontWeight: '500', fontSize: 15, fill: 0xff8a7c } });
    motion.anchor.set(0.5, 0);
    motion.position.set(CELL_W / 2, 232);
    root.addChild(view, name, motion);
    // клік по символу — його власна анімація виграшу
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointertap', () => {
      view.stopWin();
      view.startWin();
    });
    sheet.addChild(root);
    return { id, root, view };
  });

  const layout = () => {
    const w = host.clientWidth;
    // 8, 4 або 2 колонки — шістнадцять символів завжди складаються в повні ряди
    const cols = [8, 4, 2].find((n) => w / n >= 140) ?? 2;
    const scale = Math.min(1, w / (cols * CELL_W));
    const rows = Math.ceil(tiles.length / cols);
    tiles.forEach((t, i) => t.root.position.set((i % cols) * CELL_W, Math.floor(i / cols) * CELL_H));
    sheet.scale.set(scale);
    sheet.x = (w - cols * CELL_W * scale) / 2;
    sheet.y = 18 * scale;
    app.renderer.resize(w, Math.ceil(rows * CELL_H * scale + 24 * scale));
  };
  layout();
  new ResizeObserver(layout).observe(host);

  const each = (fn: (t: Tile, i: number) => void) => tiles.forEach(fn);
  const reset = () => each((t) => {
    t.view.stopWin();
    t.view.dim(false);
  });
  let blurred = false;

  const actions: Record<string, (btn: HTMLButtonElement) => void> = {
    land: () => {
      reset();
      // символи падають по колонках, як барабани зупиняються зліва направо
      each((t, i) => gsap.delayedCall((i % 8) * 0.07, () => t.view.pop()));
    },
    win: () => {
      reset();
      each((t, i) => t.view.startWin(undefined, (i % 8) * 0.05));
    },
    throb: () => {
      reset();
      each((t) => (pack.isBonus(t.id) || t.id === 'MAP' ? t.view.throb() : t.view.dim(true)));
    },
    glint: () => each((t, i) => gsap.delayedCall(i * 0.04, () => t.view.glint())),
    lock: () => {
      reset();
      each((t) => pack.isBonus(t.id) && t.view.lockFlash());
    },
    blur: (btn) => {
      blurred = !blurred;
      btn.setAttribute('aria-pressed', String(blurred));
      each((t) => t.view.setBlur(blurred));
    },
    stop: () => {
      reset();
      if (blurred) document.querySelector<HTMLButtonElement>('[data-act="blur"]')!.click();
    },
  };

  document.querySelector('.tools')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (btn) actions[btn.dataset.act!](btn);
  });

  // перше враження: символи «проявляються» по черзі, як ціанотипія на сонці
  if (!runtime.reducedMotion) actions.land(document.createElement('button'));

  await diverDemo();
}

/** «Водолаз» у Spine: атлас і скелет з того самого паку, що й у грі. */
async function diverDemo(): Promise<void> {
  const host = document.getElementById('diver-stage')!;
  const app = new Application();
  await app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true, resizeTo: host });
  host.appendChild(app.canvas);
  const diver = new Spine({ skeletonData: await loadDiverSkeleton() });
  app.stage.addChild(diver);
  const fit = () => {
    const k = Math.min(app.screen.width / 640, app.screen.height / 600);
    diver.scale.set(k);
    diver.position.set(app.screen.width / 2, app.screen.height - 20 * k);
  };
  fit();
  app.renderer.on('resize', fit);
  const play = (name: string) => {
    if (name === 'intro') {
      diver.state.setAnimation(0, 'intro', false);
      diver.state.addAnimation(0, 'idle', true, 0);
    } else diver.state.setAnimation(0, name, name === 'idle');
  };
  play(runtime.reducedMotion ? 'idle' : 'intro');
  document.querySelector('.spine .tools')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-anim]');
    if (btn) play(btn.dataset.anim!);
  });
}

void main();
