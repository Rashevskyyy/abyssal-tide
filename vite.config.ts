/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → regular multi-file build in dist/
// `vite build --mode single` → one self-contained HTML (dist-single/index.html) for sharing/embedding
export default defineConfig(({ mode }) => ({
  base: './',
  // мітка збірки потрапляє у звіт діагностики — видно, яку версію тестували
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  plugins: mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.spec.ts', 'packages/*/tests/**/*.spec.ts', 'server/tests/**/*.spec.ts'],
    environment: 'node',
  },
}));
