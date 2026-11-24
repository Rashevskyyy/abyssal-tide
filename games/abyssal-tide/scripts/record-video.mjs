/**
 * Відео для портфоліо: `npm run video` → site/media/abyssal-tide.mp4 (1280×720, без звуку).
 *
 * Сценарій: стартовий екран → два спіни → показ 3 Pots (мітки, екран Salvage, банки, Multi, Mega win зі Spine)
 * → Deep Salvage до повного поля → таблиця виплат.
 *
 * Кадри знімає скринкаст Chrome (CDP) з мітками часу, ffmpeg складає з них відео 30 к/с.
 * На машині з GPU пишеться в реальному часі. Без GPU (CI, контейнер) WebGL рендериться програмно й дає кілька
 * кадрів на секунду — тоді SLOWMO=0.1 сповільнює весь ігровий час удесятеро, а тривалості кадрів множаться на 0,1.
 *   SLOWMO=0.1 npm run video
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';

const k = Number(process.env.SLOWMO ?? 1);
const url = process.env.GAME_URL ?? `file://${process.cwd()}/dist-single/index.html`;
const out = process.env.OUT ?? 'site/media/abyssal-tide.mp4';
const tmp = 'test-results/video';

/** Пауза в ігровому часі. */
const pause = (page, ms) => page.waitForTimeout(ms / k);
const log = (...a) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...a);
const state = (page) => page.evaluate(() => window.__abyssal.state);
const waitState = (page, s, timeout = 600_000) =>
  page.waitForFunction((v) => window.__abyssal?.state === v, s, { timeout, polling: 50 });

const started = Date.now();
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
// скринкаст: кадр приходить, коли сторінка змінилась; зберігаємо з міткою часу
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(tmp, `f${String(frames.length).padStart(5, '0')}.jpg`);
  frames.push({ file, t: metadata.timestamp });
  await writeFile(file, Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
});
page.setDefaultTimeout(600_000);
await page.addInitScript(() => {
  if (sessionStorage.getItem('__rec')) return;
  sessionStorage.setItem('__rec', '1');
  localStorage.clear();
  localStorage.setItem('abyssal-tide/prefs/v3', JSON.stringify({ speed: 'normal', lang: 'en', muted: true, startScreen: true }));
});
await page.goto(url, { waitUntil: 'commit' });
log('loaded');
await page.waitForFunction(() => window.__abyssal !== undefined, null, { timeout: 120_000 });
await page.evaluate((v) => window.__abyssal.timeScale(v), k);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720 });
log('probe ready');
await page.locator('#loader .play').waitFor();
log('start screen');
await pause(page, 2800);
await page.locator('#loader .play').click();
await waitState(page, 'idle');
log('idle');
await pause(page, 900);

// два звичайні спіни
for (let i = 0; i < 2; i++) {
  await page.keyboard.press('Space');
  await pause(page, 400);
  await waitState(page, 'idle');
  await pause(page, 1100);
}

/** Показ бонусу зі сценарієм; екрани бонусу закриває «гравець». */
async function showcase(id) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('tab', { name: 'Show bonus' }).click();
  await pause(page, 600);
  await page.locator(`[data-scenario="${id}"]`).click();
  // поки показ іде: закриваємо екрани бонусу, як гравець, і чекаємо повернення в спокій
  for (;;) {
    const s = await state(page);
    const ribbon = await page.locator('.ribbon.on').count();
    if (s === 'idle' && ribbon === 0) break;
    if (await page.locator('.bonus-screen:not([hidden])').count()) {
      await pause(page, 1800);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(200);
  }
  await pause(page, 1200);
}

await showcase(4);
log('showcase 4 done');
await showcase(1);
log('showcase 1 done');

// таблиця виплат: суми в євро, 3 Pots
await page.getByRole('button', { name: 'Menu' }).click();
await pause(page, 1500);
await page.locator('.pt-pots').scrollIntoViewIfNeeded();
await pause(page, 2500);
await page.keyboard.press('Escape');
await pause(page, 800);

await cdp.send('Page.stopScreencast');
await browser.close();
log(`${frames.length} frames`);

// тривалість кадру = до наступного, переведена в ігровий час
const list = frames
  .map((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    return `file '${f.file.split('/').pop()}'\nduration ${Math.max(0.001, (next - f.t) * k).toFixed(4)}`;
  })
  .join('\n');
await writeFile(join(tmp, 'frames.txt'), `${list}\nfile '${frames.at(-1).file.split('/').pop()}'\n`);
execFileSync(
  'ffmpeg',
  ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-an', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
log(`saved ${out}`);
