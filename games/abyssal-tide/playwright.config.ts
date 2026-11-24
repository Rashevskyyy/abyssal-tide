import { defineConfig } from '@playwright/test';

// CHROME_PATH дозволяє запускати на системному Chrome (наприклад, у CI без `npx playwright install`).
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 800, height: 500 },
    launchOptions: {
      executablePath,
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'npx vite build && npx vite preview --port 4174 --strictPort',
      port: 4174,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // ігровий сервер для тесту гри через HTTP; без DATABASE_URL — у пам’яті
      command: 'npx tsx ../../server/src/main.ts',
      port: 8788,
      env: { PORT: '8788', DATABASE_URL: process.env.DATABASE_URL ?? '' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
