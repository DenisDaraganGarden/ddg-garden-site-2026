import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The canonical asset laboratory stays isolated from the product editor and
// gives every future collection the same browser surface and cache.
export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-asset-lab',
  server: {
    host: '127.0.0.1',
    hmr: false,
  },
  build: {
    outDir: 'dist-asset-lab',
    rollupOptions: {
      input: 'asset-lab.html',
    },
  },
});
