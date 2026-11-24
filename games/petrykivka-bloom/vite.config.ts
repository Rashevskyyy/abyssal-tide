import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 2000 },
});
