import { defineConfig } from 'vite';
import { coffee } from 'vite-plugin-coffee3';

export default defineConfig({
  root: '.',
  plugins: [coffee()],
  optimizeDeps: {
    // av/alac use .coffee; let Vite transform them instead of esbuild pre-bundling
    exclude: ['av', 'alac'],
  },
  build: {
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
