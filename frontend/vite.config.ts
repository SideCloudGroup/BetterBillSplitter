import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {alias: {'@': resolve(__dirname, 'src')}},
  root: resolve(__dirname),
  base: '/',
  build: {
    outDir: resolve(__dirname, '../public/spa'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {target: 'http://127.0.0.1:8000', changeOrigin: true},
      '/captcha': {target: 'http://127.0.0.1:8000', changeOrigin: true},
    },
  },
});
