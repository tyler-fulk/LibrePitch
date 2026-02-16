import { defineConfig } from 'vite';
import { coffee } from 'vite-plugin-coffee3';

export default defineConfig({
  root: '.',
  plugins: [coffee()],
  esbuild: {
    drop: ['console'],
  },
  optimizeDeps: {
    // av/alac use .coffee; let Vite transform them instead of esbuild pre-bundling
    exclude: ['av', 'alac'],
  },
  build: {
    outDir: 'dist',
    // BUILD_NO_MINIFY=1 → unminified build for hosts that block minified JS (ClamAV false positive)
    minify: process.env.BUILD_NO_MINIFY === '1' ? false : 'esbuild',
  },
  server: {
    open: true,
  },
});
