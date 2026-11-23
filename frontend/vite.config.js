import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig(({ command }) => ({
  plugins: [solid()],
  // Keep development diagnostics; production reports handled failures in the UI.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : undefined,
  root: fileURLToPath(new URL('./app', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 3005,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8083',
      '/uploads': 'http://127.0.0.1:8083',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
}));
