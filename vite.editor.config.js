import baseConfig from './vite.config.js';

// The launch list can only open a server's root, never a path, so the editor
// could not have its own button. This config is the normal dev server with one
// addition: "/" redirects to the editor. Everything else - publish endpoint,
// chunking, HMR - comes from vite.config.js unchanged.
//
// Note this runs on its own port, so it has its own localStorage and therefore
// its own scene draft. That is fine: only the editor uses the draft, the home
// page reads the published file.
function editorAtRootPlugin() {
  const redirectRootToEditor = (middlewares) => {
    middlewares.use((request, response, next) => {
      if (request.url === '/' || request.url === '') {
        response.statusCode = 302;
        response.setHeader('Location', '/home/edit');
        response.end();
        return;
      }

      next();
    });
  };

  return {
    name: 'editor-at-root',
    configureServer(server) {
      redirectRootToEditor(server.middlewares);
    },
    configurePreviewServer(server) {
      redirectRootToEditor(server.middlewares);
    },
  };
}

export default {
  ...baseConfig,
  plugins: [...baseConfig.plugins, editorAtRootPlugin()],
  server: {
    ...baseConfig.server,
    // Hot reload off on purpose. Every server here runs from the same working
    // copy, so while the agent edits a file this page was rebuilding the scene
    // under Denis's hands - which reads exactly like "the sliders are laggy and
    // barely do anything". His editor now only picks up code changes when he
    // reloads it himself, which is also the moment he chooses to take them.
    hmr: false,
  },
};
