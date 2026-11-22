import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite gallery` — дев-сервер галереї; `vite build gallery --mode single` — один HTML для портфоліо
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
}));
