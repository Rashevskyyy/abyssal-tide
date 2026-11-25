import { defineConfig } from '@playwright/test';

// CHROME_PATH дозволяє запускати на системному Chrome (наприклад, у CI без `npx playwright install`).
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4175',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath,
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'npx vite build && npx vite preview --port 4175 --strictPort',
      port: 4175,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // спільний ігровий сервер; без DATABASE_URL — у пам’яті
      command: 'npx tsx ../../server/src/main.ts',
      port: 8789,
      env: { PORT: '8789', DATABASE_URL: process.env.DATABASE_URL ?? '' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
