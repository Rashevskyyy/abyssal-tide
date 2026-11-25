/**
 * Наскрізні сценарії Petrykivka Bloom у справжньому браузері.
 * Гра віддає read-only `window.__pb` (зайнятість, баланс, наступна дія); стан сесії — у localStorage.
 */
import { expect, test, type Page } from '@playwright/test';
import type { EngineState } from '../src/shared/types';

const SESSION = 'petrykivka-bloom:session:v1';
const PREFS = 'petrykivka-bloom:prefs:v1';
const START = 100_000;

interface Probe {
  busy: boolean;
  balance: number;
  next: 'spin' | 'freeSpin';
  showcase: boolean;
  liveBalance: number;
}

async function boot(page: Page, query = '', opts: { turbo?: boolean; session?: EngineState } = {}) {
  await page.addInitScript(
    ([sessionKey, prefsKey, turbo, session]) => {
      if (sessionStorage.getItem('__seeded')) return; // лише на першому завантаженні
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem(prefsKey, JSON.stringify({ bet: 100, ante: false, turbo }));
      localStorage.setItem('petrykivka-bloom:muted', '1');
      if (session) localStorage.setItem(sessionKey, session);
    },
    [SESSION, PREFS, opts.turbo ?? true, opts.session ? JSON.stringify(opts.session) : ''] as const,
  );
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window as unknown as { __pb?: Probe }).__pb);
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __pb: Probe }).__pb);
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as EngineState, SESSION);

/** Клікає «OK/Start/Collect» у картках, доки раунд не закінчиться. */
async function playOut(page: Page, timeout = 150_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = await probe(page);
    if (!p.busy && p.next === 'spin') return;
    const ok = page.locator('#overlay:not([hidden]) [data-ok]');
    // картка може закритися сама за таймером — тоді не чекаємо на неї
    if (await ok.isVisible().catch(() => false)) await ok.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  throw new Error('Round did not finish');
}

test('boots into the base game with an accessible HUD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await expect(page.getByRole('button', { name: 'Spin' })).toBeEnabled();
  await expect(page.locator('[data-balance]')).toHaveText('€1,000.00');
  await expect(page.locator('#stage canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a spin debits the bet once and settles the win', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Spin' }).click();
  await playOut(page);
  const s = await saved(page);
  expect(s.roundSeq).toBe(1);
  await expect(page.locator('[data-balance]')).toHaveText(new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(s.balance / 100));
  // без виграшу баланс рівно на ставку менший; з виграшем — більший за це
  expect(s.balance).toBeGreaterThanOrEqual(START - 100);
});

test('bonus buy: confirm, ten free spins, summary, balance adds up', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await page.locator('[data-buy]').click();
  await expect(page.locator('#overlay h2')).toHaveText('Buy free spins?');
  await page.locator('#overlay [data-ok]').click();
  await expect(page.locator('#overlay h2')).toHaveText('10 free spins');
  await expect(page.locator('#fs-banner')).toBeVisible();
  await page.locator('#overlay [data-ok]').click();
  await expect(page.locator('#fs-banner')).toContainText('Free spin');
  await playOut(page, 220_000);
  const s = await saved(page);
  expect(s.round).toBeNull();
  await expect(page.locator('#fs-banner')).toBeHidden();
  expect(s.balance).toBeGreaterThanOrEqual(START - 10_000);
});

test('reload in the middle of free spins resumes the bonus with its flowers', async ({ page }) => {
  const spots = new Array(49).fill(0);
  spots[24] = 4;
  const session: EngineState = {
    balance: 90_000,
    roundSeq: 3,
    lastGrid: Array.from({ length: 49 }, (_, i) => (['SEED', 'COMB', 'CURL', 'LEAF', 'MALLOW', 'KALYNA', 'FIREBIRD', 'ROOSTER'] as const)[(Math.floor(i / 7) * 3 + (i % 7)) % 8]),
    round: { id: 'P000003', bet: 100, ante: false, bought: true, win: 1500, fs: { left: 2, total: 10, win: 1500, spots, stroked: true } },
  };
  await boot(page, '', { session });
  await expect(page.locator('#overlay h2')).toHaveText('Free spins in progress');
  await expect(page.locator('#fs-banner')).toContainText('8');
  await page.locator('#overlay [data-ok]').click();
  await playOut(page);
  const s = await saved(page);
  expect(s.round).toBeNull();
  expect(s.roundSeq).toBe(3);
  expect(s.balance).toBeGreaterThanOrEqual(90_000);
});

test('UK rules: no bonus buy or turbo, session result on screen, at least 2.5 s per game', async ({ page }) => {
  await boot(page, '?jurisdiction=ukgc');
  await expect(page.locator('[data-buy]')).toBeHidden();
  await expect(page.locator('[data-turbo]')).toBeHidden();
  await expect(page.locator('[data-session]')).toBeVisible();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Spin' }).click();
  await playOut(page);
  await page.getByRole('button', { name: 'Spin' }).click({ timeout: 10_000 });
  expect(Date.now() - t0).toBeGreaterThanOrEqual(2500);
  await playOut(page);
  expect((await saved(page)).roundSeq).toBe(2);
});

test('feature showcase plays on a temporary balance and leaves the session untouched', async ({ page }) => {
  await boot(page, '?demo=chain');
  await expect(page.locator('#showcase-badge')).toContainText('Tumble chain');
  expect((await probe(page)).showcase).toBe(true);
  await playOut(page);
  await expect(page.locator('#showcase-badge')).toBeHidden();
  expect((await probe(page)).balance).toBe(START);
  expect(await saved(page)).toBeNull(); // жодного кроку в справжній сесії
  // те саме з меню правил
  await page.getByRole('button', { name: 'Rules' }).click();
  await page.locator('[data-scenario="stroke"]').click();
  await expect(page.locator('#showcase-badge')).toContainText('The Stroke');
  await playOut(page);
  expect((await probe(page)).balance).toBe(START);
});

test('with ?server= the game plays through the HTTP server and the balance survives a reload', async ({ page }) => {
  await boot(page, '?server=http://localhost:8789');
  await expect(page.locator('html')).toHaveAttribute('data-source', 'server');
  await page.getByRole('button', { name: 'Spin' }).click();
  await playOut(page);
  const after = (await probe(page)).balance;
  expect(after).not.toBe(START);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __pb?: Probe }).__pb);
  expect((await probe(page)).balance).toBe(after);
  expect(await saved(page)).toBeNull(); // офлайн-сесія не чіпалась
});

test('an unreachable server falls back to the offline demo with a notice', async ({ page }) => {
  await boot(page, '?server=http://localhost:9');
  await expect(page.locator('#overlay h2')).toHaveText('Playing offline');
  await page.locator('#overlay [data-ok]').click();
  await expect(page.getByRole('button', { name: 'Spin' })).toBeEnabled();
});

test.describe('phone, portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('the controls sit under the board and the bet panel fits the screen', async ({ page }) => {
    await boot(page);
    const hud = await page.locator('#hud').boundingBox();
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hud-top'));
    expect(parseFloat(canvas)).toBeGreaterThan(300);
    expect(hud!.y + hud!.height).toBeLessThanOrEqual(844);
    await page.locator('[data-bet-btn]').click();
    const panel = await page.locator('.sk-panel').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  });
});
