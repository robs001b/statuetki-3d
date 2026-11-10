import { defineConfig } from 'vite';
export default defineConfig({
  base: '/statuetki-3d/',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
  server: { host: '127.0.0.1', port: 5180 },
  preview: { host: '127.0.0.1', port: 5181 },
  build: { target: 'es2022' },
});
