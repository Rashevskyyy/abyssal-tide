import { defineConfig } from 'vitest/config';

// Юніт-тести всього монорепо: ігри, спільні пакети й сервер.
export default defineConfig({
  define: { __BUILD__: JSON.stringify('test') },
  test: {
    include: ['games/*/tests/**/*.spec.ts', 'packages/*/tests/**/*.spec.ts', 'server/tests/**/*.spec.ts'],
    environment: 'node',
  },
});
