/**
 * Відео для кейсу й портфоліо: `npm run video -w @games/petrykivka-bloom` → site/media/petrykivka-bloom.mp4
 * (1280×720, без звуку). Сценарій: звичайний спін → «Мазок» → ланцюжок каскадів → фриспіни з квітками до ×128
 * → правила.
 *
 * Кадри знімає скринкаст Chrome (CDP) з мітками часу, ffmpeg складає з них відео 30 к/с.
 * Без GPU WebGL рендериться програмно й дає кілька кадрів на секунду — тоді SLOWMO=0.2 сповільнює
 * ігровий час уп’ятеро, а тривалості кадрів множаться на 0,2. Потрібен запущений `vite preview` (GAME_URL).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';

const k = Number(process.env.SLOWMO ?? 1);
const url = process.env.GAME_URL ?? 'http://localhost:4175/';
const out = process.env.OUT ?? 'site/media/petrykivka-bloom.mp4';
const tmp = 'test-results/video';

const pause = (page, ms) => page.waitForTimeout(ms / k);
const started = Date.now();
const log = (...a) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...a);
const probe = (page) => page.evaluate(() => ({ busy: window.__pb.busy, next: window.__pb.next }));

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(tmp, `f${String(frames.length).padStart(5, '0')}.jpg`);
  frames.push({ file, t: metadata.timestamp });
  await writeFile(file, Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
});
page.setDefaultTimeout(900_000);
await page.addInitScript(() => {
  if (sessionStorage.getItem('__rec')) return;
  sessionStorage.setItem('__rec', '1');
  localStorage.clear();
  localStorage.setItem('petrykivka-bloom:prefs:v1', JSON.stringify({ bet: 100, ante: false, turbo: false }));
  localStorage.setItem('petrykivka-bloom:muted', '1');
});
await page.goto(url);
await page.waitForFunction(() => window.__pb?.timeScale !== undefined, null, { timeout: 120_000 });
await page.evaluate((v) => window.__pb.timeScale(v), k);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720 });
log('ready');
await pause(page, 1500);

/** Чекає кінця раунду; картки (вхід у бонус, підсумок, великий виграш) закриває «гравець» після паузи. */
async function settle() {
  for (;;) {
    const p = await probe(page);
    if (!p.busy && p.next === 'spin') break;
    const ok = page.locator('#overlay:not([hidden]) [data-ok]');
    if (await ok.isVisible().catch(() => false)) {
      await pause(page, 1800);
      // картка могла закритися сама (автотаймер) — тоді клікати нічого, не чекаємо
      await ok.click({ timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
  await pause(page, 1200);
}

async function showcase(id) {
  await page.getByRole('button', { name: 'Rules' }).click();
  await pause(page, 900);
  await page.locator(`[data-scenario="${id}"]`).click();
  await settle();
  log(`showcase ${id}`);
}

await page.getByRole('button', { name: 'Spin' }).click();
await settle();
await showcase('stroke');
await showcase('chain');
await page.getByRole('button', { name: 'Turbo' }).click(); // бонус — у турбо, щоб відео не розтягувалось
await showcase('bonus');
await page.getByRole('button', { name: 'Turbo' }).click();

await page.getByRole('button', { name: 'Rules' }).click();
await pause(page, 1200);
await page.locator('.sheet').evaluate((el) => el.scrollBy({ top: 520, behavior: 'smooth' }));
await pause(page, 2600);
await page.keyboard.press('Escape');
await pause(page, 600);

await cdp.send('Page.stopScreencast');
await browser.close();
log(`${frames.length} frames`);

const list = frames
  .map((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    return `file '${f.file.split('/').pop()}'\nduration ${Math.max(0.001, (next - f.t) * k).toFixed(4)}`;
  })
  .join('\n');
await writeFile(join(tmp, 'frames.txt'), `${list}\nfile '${frames.at(-1).file.split('/').pop()}'\n`);
await mkdir('site/media', { recursive: true });
execFileSync(
  'ffmpeg',
  ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-an', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
log(`saved ${out}`);
