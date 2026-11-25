/**
 * Наскрізні сценарії GDD §5 у справжньому браузері.
 * Гра віддає read-only `window.__abyssal` (стан FSM, баланс, історія) — тест не лізе у внутрішні об’єкти.
 */
import { expect, test, type Page } from '@playwright/test';
import { ScriptedOutcomeProvider, board, landing } from '../src/engine/scripted';
import { LocalResultSource } from '../src/server/LocalResultSource';
import { MemoryStore } from '../src/server/storage';
import type { RoundRecord } from '../src/server/protocol';

const SESSION_KEY = 'abyssal-tide/session/v3';
const PREFS_KEY = 'abyssal-tide/prefs/v3';
const START = 100_000; // €1 000.00 у центах

interface Probe {
  state: string;
  balance: number;
  history(): RoundRecord[];
}

async function boot(page: Page, opts: { session?: string; speed?: string; startScreen?: boolean; query?: string } = {}) {
  await page.addInitScript(
    ([key, prefsKey, session, speed, startScreen]) => {
      if (sessionStorage.getItem('__seeded')) return; // лише на першому завантаженні
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem(prefsKey, JSON.stringify({ speed, lang: 'en', muted: true, startScreen }));
      if (session) localStorage.setItem(key, session);
    },
    [SESSION_KEY, PREFS_KEY, opts.session ?? '', opts.speed ?? 'turbo', opts.startScreen ?? false] as const,
  );
  await page.goto(`/${opts.query ?? ''}`);
  await waitIdle(page);
}

const probe = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __abyssal: Probe }).__abyssal;
  return { state: a.state, balance: a.balance, history: a.history() };
});

async function waitIdle(page: Page, timeout = 120_000) {
  await page.waitForFunction(() => (window as unknown as { __abyssal?: Probe }).__abyssal?.state === 'idle', null, { timeout });
}

test('boots into the base game with an accessible HUD', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('button', { name: 'Spin', exact: true })).toBeVisible();
  await expect(page.locator('.balance strong')).toHaveText('€1,000.00');
  await expect(page.locator('.bet strong')).toHaveText('€1.00');
  expect((await probe(page)).balance).toBe(START);
});

test('start screen shows the features and can be turned off', async ({ page }) => {
  await boot(page, { startScreen: true });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible();
  await expect(page.locator('#loader h2')).toHaveText(['Salvage', '3 Pots', 'Free Dives', 'Black pearl and prizes']);
  // пробіл на стартовому екрані лише закриває його — спін не стартує
  await page.getByLabel('Don’t show again').check();
  await page.keyboard.press('Space');
  await expect(page.locator('#loader')).toBeHidden();
  expect((await probe(page)).history).toHaveLength(0);
  await page.reload();
  await waitIdle(page);
  await expect(page.locator('#loader')).toBeHidden();
});

test('3 Pots showcase: the Salvage start screen waits for the player and lists the full jars', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await page.evaluate(() => (window as unknown as { __abyssal: { holdScreens(on: boolean): void } }).__abyssal.holdScreens(true));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('tab', { name: 'Show bonus' }).click();
  await page.locator('[data-scenario="4"]').click();
  const screen = page.getByRole('dialog', { name: 'Salvage' });
  await expect(screen).toBeVisible({ timeout: 120_000 });
  await expect(screen.locator('.chip b')).toHaveText(['EXTRA', 'BOOST', 'MULTI']);
  await expect(screen).toContainText('+€2.00 to every pearl');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __abyssal: Probe }).__abyssal.state)).toBe('salvageIntro'); // чекає на гравця
  await page.keyboard.press('Enter');
  await expect(screen).toBeHidden();
  await expect(page.locator('.ribbon')).not.toHaveClass(/\bon\b/, { timeout: 200_000 });
  await waitIdle(page);
  expect((await probe(page)).balance).toBe(START);
});

test('autoplay stops when the balance drops by the set limit, like in 3 Oaks games', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page);
  await page.locator('#btn-auto').click();
  await page.locator('#auto-panel [data-n="100"]').click();
  // ліміт в одну ставку (€1): спрацьовує за кілька раундів, тож тест не залежить від того,
  // чи встигне більший програш набігти за відведені раунди
  await page.getByLabel('Stop if balance decreases by').fill('1');
  await page.getByRole('button', { name: 'Start autoplay' }).click();
  await expect(page.locator('#btn-auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-auto')).toHaveAttribute('aria-pressed', 'false', { timeout: 250_000 });
  await waitIdle(page);
  const { balance, history } = await probe(page);
  const last = history[history.length - 1];
  const bonus = last.steps.length > 1; // «зупинити на бонусі» увімкнено за замовчуванням
  expect(history.length).toBeLessThan(100);
  expect(START - last.balanceBefore).toBeLessThan(100); // до останнього раунду умова ще не виконувалась
  expect(bonus || START - balance >= 100).toBe(true);
  // налаштування автогри запам’ятовуються
  await page.locator('#btn-auto').click();
  await expect(page.getByLabel('Stop if balance decreases by')).toHaveValue('1.00');
  await expect(page.locator('#auto-panel [data-n="100"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a frozen animation ticker mid-spin is woken up and the round finishes', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await page.getByRole('button', { name: 'Spin', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __abyssal: { sleepTicker(): void } }).__abyssal.sleepTicker());
  await waitIdle(page);
  const diag = await page.evaluate(() => (window as unknown as { __abyssal: { diagnostics(): string[] } }).__abyssal.diagnostics());
  expect(diag.some((d) => d.includes('GSAP ticker idle'))).toBe(true);
  expect((await probe(page)).history).toHaveLength(1);
});

test('double click and quick stop: one bet, one result, one credit record', async ({ page }) => {
  await boot(page);
  // подвійний клік: друге натискання приходить під час обертання й стає quick stop, а не новим спіном
  await page.locator('#btn-spin').dblclick();
  await waitIdle(page);
  const { balance, history } = await probe(page);
  expect(history).toHaveLength(1);
  expect(history[0].balanceBefore).toBe(START);
  expect(balance).toBe(START - history[0].bet + history[0].win);
});

test('bet is chosen in the bet panel, like in 3 Oaks games', async ({ page }) => {
  await boot(page);
  await page.locator('#btn-bet').click();
  await expect(page.locator('#bet-panel')).toBeVisible();
  await page.locator('#bet-panel [data-v="50"]').click();
  await expect(page.locator('#bet-panel')).toBeHidden();
  await expect(page.locator('#btn-bet strong')).toHaveText('€0.50');
  await page.locator('#btn-spin').click();
  await waitIdle(page);
  const { history } = await probe(page);
  expect(history[0].bet).toBe(50);
  // поза станом спокою ставку змінити не можна
  await page.locator('#btn-spin').click();
  await expect(page.locator('#btn-bet')).toBeDisabled();
  await waitIdle(page);
});

test('holding Spin keeps spinning in turbo until released', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page, { speed: 'normal' });
  const box = (await page.locator('#btn-spin').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('#btn-spin')).toHaveClass(/holding/);
  await expect.poll(async () => (await probe(page)).history.length, { timeout: 200_000, intervals: [500] }).toBeGreaterThanOrEqual(3);
  await page.mouse.up();
  await expect(page.locator('#btn-spin')).not.toHaveClass(/holding/);
  await waitIdle(page);
  const settled = (await probe(page)).history.length;
  await page.waitForTimeout(2000);
  const { balance, history } = await probe(page);
  expect(history).toHaveLength(settled); // після відпускання нових спінів немає
  const bets = history.reduce((s, r) => s + r.bet, 0);
  const wins = history.reduce((s, r) => s + r.win, 0);
  expect(balance).toBe(START - bets + wins);
});

test('bonus showcase plays on a temporary balance and leaves the session untouched', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('tab', { name: 'Show bonus' }).click();
  await page.locator('[data-scenario="3"]').click();
  await expect(page.locator('.ribbon')).toHaveClass(/\bon\b/);
  await expect(page.locator('.ribbon')).not.toHaveClass(/\bon\b/, { timeout: 120_000 });
  await waitIdle(page);
  const { balance, history } = await probe(page);
  expect(balance).toBe(START);
  expect(history).toHaveLength(0);
  await expect(page.locator('#btn-spin')).toBeFocused();
});

test('reload in the middle of Salvage restores the round without a second debit', async ({ page }) => {
  // Готуємо збережену сесію тим самим рушієм: спін із шістьма перлинами + один порожній респін.
  const store = new MemoryStore();
  const src = new LocalResultSource({
    store,
    provider: new ScriptedOutcomeProvider({
      reels: [board(['P1 R1 P2 C  P2', 'R2 P3 H  P5 R4', 'N  R1 P1 R2 C '])],
      respins: [landing()],
    }),
  });
  await src.request({ stepId: 'seed-1', action: 'spin', bet: 200 });
  const afterRespin = await src.request({ stepId: 'seed-2', action: 'respin' });
  expect(afterRespin.respinsLeft).toBe(2);

  await page.addInitScript(() => {
    (window as unknown as { __seen: string[] }).__seen = [];
    const tick = () => {
      const a = (window as unknown as { __abyssal?: Probe }).__abyssal;
      const seen = (window as unknown as { __seen: string[] }).__seen;
      if (a && seen[seen.length - 1] !== a.state) seen.push(a.state);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await boot(page, { session: store.get(SESSION_KEY)! });
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).toContain('respin');
  const { balance, history } = await probe(page);
  expect(history).toHaveLength(1);
  const round = history[0];
  expect(round.balanceBefore).toBe(START);
  expect(round.steps[0].action).toBe('spin');
  expect(round.steps.filter((s) => s.action === 'spin')).toHaveLength(1);
  expect(round.steps.filter((s) => s.action === 'collect')).toHaveLength(1);
  expect(balance).toBe(START - 200 + round.win);
});

test('history replay re-plays recorded steps without touching the balance', async ({ page }) => {
  await boot(page);
  await page.locator('#btn-spin').click();
  await waitIdle(page);
  const before = await probe(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Replay' }).first().click();
  await expect(page.locator('.ribbon')).toHaveClass(/\bon\b/);
  await expect(page.locator('.ribbon')).not.toHaveClass(/\bon\b/, { timeout: 120_000 });
  await waitIdle(page);
  const after = await probe(page);
  expect(after.balance).toBe(before.balance);
  expect(after.history).toHaveLength(1);
});

test('UK rules: no autoplay or turbo, at least 2.5 s per game, net result and a reality check', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, { query: '?jurisdiction=ukgc&rc=0.08' });
  await expect(page.locator('#btn-auto')).toBeHidden();
  await expect(page.locator('#btn-speed')).toBeHidden();
  await expect(page.locator('.session')).toContainText('Net');
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space'); // slam stop не діє
  await page.waitForFunction(() => document.querySelector('#btn-spin')?.getAttribute('data-state') === 'idle', null, { timeout: 60_000 });
  expect(Date.now() - t0).toBeGreaterThanOrEqual(2450);
  // нагадування про час гри (тут — через 5 с) зупиняє гру до відповіді
  await expect(page.locator('.notice')).toContainText('You have been playing', { timeout: 20_000 });
  await page.keyboard.press('Space');
  expect((await probe(page)).history).toHaveLength(1);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.locator('.notice')).not.toHaveClass(/\bon\b/);
});

test('with ?server= the game plays through the HTTP server and the balance survives a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, { query: '?server=http://localhost:8788' });
  expect(await page.evaluate(() => (window as unknown as { __abyssal: { source: string } }).__abyssal.source)).toBe('http://localhost:8788');
  const before = (await probe(page)).balance;
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await waitIdle(page);
  const { balance, history } = await probe(page);
  expect(history).toHaveLength(1);
  expect(balance).toBe(before - history[0].bet + history[0].win);
  await page.reload();
  await waitIdle(page);
  expect((await probe(page)).balance).toBe(balance); // стан живе на сервері, а не в localStorage
});

test('an unreachable server falls back to the offline demo with a notice', async ({ page }) => {
  await boot(page, { query: '?server=http://localhost:9' });
  expect(await page.evaluate(() => (window as unknown as { __abyssal: { source: string } }).__abyssal.source)).toBe('local');
  await expect(page.locator('.notice')).toContainText('offline');
});

test.describe('mobile portrait', () => {
  test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

  test('HUD sits under the field and focus returns to Spin after the menu', async ({ page }) => {
    await boot(page);
    const spin = await page.locator('#btn-spin').boundingBox();
    const bar = await page.locator('.bar').boundingBox();
    expect(spin!.y).toBeGreaterThan(760 / 2);
    expect(bar!.y + bar!.height).toBeCloseTo(760, 0);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('dialog.menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-spin')).toBeFocused();
  });
});

test.describe('mobile landscape', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test('a phone held sideways keeps the controls in a column on the right and the autoplay panel fits', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('landscape');
    const spin = (await page.locator('#btn-spin').boundingBox())!;
    expect(spin.x).toBeGreaterThan(667 * 0.75); // стовпчик праворуч, а не рядок під полем
    expect(spin.y + spin.height).toBeLessThan(375);
    await page.locator('#btn-auto').click();
    const panel = (await page.locator('#auto-panel').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Start autoplay' })).toBeInViewport({ ratio: 1 });
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the result does not depend on motion settings', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Space');
    await waitIdle(page);
    const { balance, history } = await probe(page);
    expect(history).toHaveLength(1);
    expect(balance).toBe(START - history[0].bet + history[0].win);
  });
});
