import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate cache and server keep the asset laboratory independent from the
// home-scene editor and from another agent's long-lived Vite process.
export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-fish-lab',
  server: {
    host: '127.0.0.1',
    hmr: false,
  },
  build: {
    outDir: 'dist-fish-lab',
    rollupOptions: {
      input: 'fish-lab.html',
    },
  },
});
