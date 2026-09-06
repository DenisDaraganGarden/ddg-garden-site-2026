import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The canonical asset laboratory stays isolated from the product editor and
// gives every collection the same browser surface and cache. It is its own
// Vite entry: the site's build never includes it.
//
// The launch list can only open a server's root, so "/" lands on the lab page.
function labAtRootPlugin() {
  return {
    name: 'asset-lab-at-root',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/' || request.url === '') {
          response.statusCode = 302;
          response.setHeader('Location', '/asset-lab.html');
          response.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), labAtRootPlugin()],
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
