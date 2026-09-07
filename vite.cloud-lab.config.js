import lab from './vite.asset-lab.config.js';

// The existing asset laboratory in an isolated checkout while port 41215 is
// occupied by concurrent asset work. A unique cache avoids Vite 504 races.
export default { ...lab, cacheDir: 'node_modules/.vite-painterly-clouds' };
