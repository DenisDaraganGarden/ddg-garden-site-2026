// Every engine parameter, three ways at once: does the editor have a control
// for it, does the renderer read it, does it reach the published site (and so
// every camera snapshot)? A control the renderer reads but publication drops is
// a setting Denis tunes and then loses on «На сайт»; a published key the
// renderer reads without a control is a setting he cannot reach. Both fail.
// Run: npm run check:editor-keys
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const server = await createServer({ configFile: false, cacheDir: 'output/keys-audit-cache', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const m = await server.ssrLoadModule('/src/features/home-scene/hooks/useHomeSceneSettings.js');
  const { publishedHomeSceneKeys } = await server.ssrLoadModule('/src/features/home-scene/data/publishedHomeSceneKeys.js');
  const snap = new Set(m.HOME_SCENE_SNAPSHOT_KEYS), pub = new Set(publishedHomeSceneKeys);
  const defaults = m.normalizeHomeSceneDraftSettings({});
  const r = JSON.parse(fs.readFileSync('docs/engine-parameters.json', 'utf8'));
  const base = (k) => k.split('.')[0];
  const controls = new Map(); for (const row of r.rows) { const b = base(row.key); if (!controls.has(b)) controls.set(b, row); }
  // An object's on/off switch is drawn from the registry (sceneObjects.js) on
  // the visibility sheet and above its node, not declared in a section file.
  const { SCENE_OBJECTS } = await server.ssrLoadModule('/src/features/home-scene/lib/sceneObjects.js');
  for (const object of SCENE_OBJECTS) if (!controls.has(object.key)) controls.set(object.key, { node: `registry:${object.id}` });
  // The reference is a snapshot; the sections are the truth for "has a control".
  const sectionsDir = 'src/features/home-scene/components/editor';
  const sectionText = []; const walkSections = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkSections(p); else if (/\.jsx?$/.test(e.name)) sectionText.push([e.name, fs.readFileSync(p, 'utf8')]); } }; walkSections(sectionsDir);
  const inSections = (key) => { const re = new RegExp(`['"\\b]${key}['"\\b]`); const hit = sectionText.find(([, t]) => re.test(t)); return hit ? hit[0] : null; };
  // Consumers: everything that is not settings plumbing, editor UI, i18n, labs or checks.
  const skip = /(\/editor\/|useHomeSceneSettings\.js|publishedHomeScene|\/i18n\/|\.check\.js|-lab\/|\/asset-lab\/|\/legacy\/|sceneCameras\.js|editorCameraState\.js|homeScenePublishClient|projectStore|presetStore)/;
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(e.name) && !skip.test(p)) files.push(p); } };
  walk('src');
  const text = files.map((f) => fs.readFileSync(f, 'utf8'));
  const consumers = (key) => { const re = new RegExp(`\\b${key}\\b`); const hits = []; text.forEach((t, i) => { if (re.test(t)) hits.push(path.basename(files[i])); }); return hits; };
  const keys = new Set([...Object.keys(defaults), ...controls.keys()]);
  const rows = [];
  for (const key of keys) {
    if (!(key in defaults)) continue;
    const used = consumers(key);
    const control = inSections(key) ?? (controls.has(key) ? `reference:${controls.get(key).node}` : null);
    rows.push({ key, control, used, published: pub.has(key), snapshot: snap.has(key) });
  }
  const print = (title, list, f) => { if (!list.length) return; console.log(`\n${title} (${list.length}):`); for (const x of list) console.log(`  ${x.key.padEnd(30)} ${f(x)}`); };
  // Editor-only aids never publish (smoke-test.mjs keeps the same list); camera
  // and object poses live in `layouts`, edited through the pose tools.
  const EDITOR_LOCAL = new Set(['animationPaused', 'showPerformanceHud', 'showPointerDebug', 'freeCamera', 'debugWireframe', 'editorHeadingColor', 'editorCursor', 'editorPostProcessing']);
  const PLUMBING = new Set(['layouts', 'cameraPosition', 'cameraTarget', 'cameraFov', 'boatPosition', 'sculpturePosition', 'sceneCameras', 'slideshow', 'audio', 'boatCutoutDebug', 'seaEnabled']);
  // homeSceneLighting reads these only as fallbacks for sunBearing, sunNoonElevation
  // and sunIntensity; a control would edit a value the scene never shows.
  const LEGACY_FALLBACK = new Set(['keyLightType', 'moonIntensity', 'moonAzimuth', 'moonElevation']);
  // Адрес, координаты и окружение участка — данные заказчика: живут в
  // проекте и на сайт не уходят никогда (src/surroundings/settings.js).
  const { DEFAULT_SURROUNDINGS_SETTINGS } = await server.ssrLoadModule('/src/surroundings/settings.js');
  const PROJECT_LOCAL = new Set(Object.keys(DEFAULT_SURROUNDINGS_SETTINGS));
  const lost = rows.filter((x) => x.control && !x.published && !EDITOR_LOCAL.has(x.key) && !PROJECT_LOCAL.has(x.key) && x.used.length);
  const unreachable = rows.filter((x) => !x.control && x.published && x.used.length && !PLUMBING.has(x.key) && !LEGACY_FALLBACK.has(x.key));
  print('FAIL: control the renderer reads, but publication drops it', lost, (x) => `${x.control}  used by: ${x.used.join(', ')}`);
  print('FAIL: published key the renderer reads, but the editor has no control', unreachable, (x) => x.used.slice(0, 3).join(', '));
  print('info: control with no consumer outside the editor (dynamic access is not seen)', rows.filter((x) => x.control && x.published && !x.used.length && !/^light[12]/.test(x.key)), (x) => x.control);
  print('info: published, no control, no consumer (dead key)', rows.filter((x) => !x.control && x.published && !x.used.length), () => '');
  const ok = !lost.length && !unreachable.length;
  console.log(ok ? `editorKeys: ${rows.length} keys, every consumed control publishes and every consumed published key has a control` : 'editorKeys: FAILED');
  if (!ok) process.exitCode = 1;
} finally { await server.close(); }
