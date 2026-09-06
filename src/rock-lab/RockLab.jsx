import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { makeRockGeometry, makePebbleGeometry, createPebbleMaterial, PEBBLE_PALETTE } from '../terrain/terrainRocks.js';
import { createTerrainDefinition } from '../terrain/terrainModel.js';
import { createTerrainMaterial } from '../terrain/terrainMaterial.js';
import { syncCoastUniforms } from '../terrain/terrainShader.js';
import { TERRAIN_MAP_NAMES, createTerrainTextureArrays } from '../terrain/terrainTextures.js';
import { TERRAIN_RANGES } from '../terrain/settings.js';
import '../tanker-lab/tankerLab.css';

// The stones of the coast on a studio floor: the scene's boulder and pebble
// geometry with the scene's sandstone maps and pebble palette. The studio
// stands far inland of the coast definition, so the shader paints dry rock -
// no wet margin, no foam. Sizes and the seed start from the published scene.
const PUBLISHED = getPublishedHomeSceneSettings();
const STUDIO_COAST = createTerrainDefinition({ ...PUBLISHED, terrainOffset: -200 });
const BOULDER_SIZES = [.3, .65, 1.1, 1.7, 2.5];
const VIEWS = {
  full: { landscape: { position: [2.5, 6.5, 16.5], target: [.8, .5, .5] }, portrait: { position: [3.5, 9, 22], target: [.8, .5, .5] } },
  boulders: { landscape: { position: [1.5, 1.8, 4.5], target: [1.5, .8, -1.5] }, portrait: { position: [2, 2.6, 6.5], target: [1.5, .8, -1.5] } },
  debris: { landscape: { position: [-3, 1.1, 5.2], target: [-4.5, .12, 2.5] }, portrait: { position: [-2.6, 1.6, 6.2], target: [-4.5, .12, 2.5] } },
  pebbles: { landscape: { position: [.6, .55, 4.4], target: [0, .02, 3.2] }, portrait: { position: [.9, .85, 5], target: [0, .02, 3.2] } },
  top: { landscape: { position: [.5, 16, .8], target: [.5, 0, .5] }, portrait: { position: [.5, 22, 1], target: [.5, 0, .5] } },
};
const LIMITS = { minDistance: .2, maxDistance: 30, minPolarAngle: .04, maxPolarAngle: Math.PI / 2 - .02 };
const DEFAULTS = {
  seed: PUBLISHED.terrainSeed, rockSize: PUBLISHED.terrainRockSize, pebbleSize: PUBLISHED.terrainPebbleSize,
  debris: 1, pebbles: 1, wireframe: false, exposure: 1.04, environmentIntensity: .7,
};
const TEXT = {
  ru: { title: 'Камни', subtitle: 'Валуны, осыпь и галька побережья · геометрия и материалы сцены', pieces: 'Камни', light: 'Свет', full: 'Общий', boulders: 'Валуны', debris: 'Осыпь', pebbles: 'Галька', top: 'Сверху', seed: 'Вариант', rockSize: 'Размер валунов', pebbleSize: 'Размер гальки', debrisAmount: 'Осыпь в куче', pebblesAmount: 'Гальки в россыпи', wire: 'Каркас', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене', assets: 'Коллекции', metres: 'м', tri: 'треугольников', boulderCount: 'валунов', debrisCount: 'осколков', pebbleCount: 'галек' },
  en: { title: 'Rocks', subtitle: 'Coast boulders, debris and pebbles · scene geometry and materials', pieces: 'Stones', light: 'Light', full: 'Overview', boulders: 'Boulders', debris: 'Debris', pebbles: 'Pebbles', top: 'Top', seed: 'Seed', rockSize: 'Boulder size', pebbleSize: 'Pebble size', debrisAmount: 'Debris in the pile', pebblesAmount: 'Pebbles in the spread', wire: 'Wireframe', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene', assets: 'Collections', metres: 'm', tri: 'triangles', boulderCount: 'boulders', debrisCount: 'fragments', pebbleCount: 'pebbles' },
};

function Range({ label, value, min = 0, max = 1, step = .01, unit = '', onChange }) {
  return <label className="tanker-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : 2)}{unit && ` ${unit}`}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) {
  return <label className="tanker-lab__toggle"><span>{label}</span><input type="checkbox" aria-label={label} checked={value} onChange={(e) => onChange(e.target.checked)} /></label>;
}

// Seats a piece on the floor the way the coast seats a slab: by its lowest
// transformed vertex, sunk a little so it does not hover on one corner.
function seat(vertices, rotation, scale) {
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
  const point = new THREE.Vector3();
  let lowest = Infinity;
  for (let i = 0; i < vertices.count; i++) lowest = Math.min(lowest, point.fromBufferAttribute(vertices, i).applyMatrix4(transform).y);
  return -lowest - .1 * scale[1];
}

function buildLayout(settings) {
  let seed = settings.seed >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const geometry = makeRockGeometry(), vertices = geometry.attributes.position;
  const boulders = [];
  let x = -3.2;
  for (const base of BOULDER_SIZES) {
    const size = base * settings.rockSize;
    const scale = [size * (1 + random()), size * (.4 + random() * .35), size * (.75 + random())];
    const rotation = [(random() - .5) * .5, random() * Math.PI * 2, (random() - .5) * .3];
    x += scale[0] * .55;
    boulders.push({ x, y: seat(vertices, rotation, scale), z: -1.5, rotation, scale });
    x += scale[0] * .55 + .35;
  }
  const debris = [];
  for (let i = 0; i < Math.round(60 * settings.debris); i++) {
    const size = .07 + random() ** 2 * .66, angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * 2.4;
    const scale = [size * (1 + random() * .6), size * (.55 + random() * .5), size * (.7 + random() * .5)];
    const rotation = [(random() - .5) * 1.1, random() * Math.PI * 2, (random() - .5) * .7];
    debris.push({ x: -4.5 + Math.cos(angle) * distance, y: seat(vertices, rotation, scale), z: 2.5 + Math.sin(angle) * distance, rotation, scale });
  }
  geometry.dispose();
  const pebbles = [];
  for (let i = 0; i < Math.round(360 * settings.pebbles); i++) {
    const radius = (.012 + random() ** 2 * .038) * settings.pebbleSize, angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * 1.5;
    const stretch = 1 + random() * .6, flat = .42 + random() * .3;
    pebbles.push({ x: Math.cos(angle) * distance, y: radius * flat * .7, z: 3.2 + Math.sin(angle) * distance, rotation: [0, random() * Math.PI * 2, 0], scale: [radius * stretch, radius * flat, radius], tint: Math.floor(random() * PEBBLE_PALETTE.length) });
  }
  return { boulders, debris, pebbles };
}

function Batch({ geometry, material, items, name, palette, castShadow = false }) {
  const mesh = React.useRef();
  const colors = useMemo(() => (palette ?? []).map((color) => new THREE.Color(color)), [palette]);
  React.useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new THREE.Object3D();
    items.forEach((item, i) => {
      transform.position.set(item.x, item.y, item.z);
      transform.rotation.set(...item.rotation);
      transform.scale.set(...item.scale);
      transform.updateMatrix();
      mesh.current.setMatrixAt(i, transform.matrix);
      if (palette) mesh.current.setColorAt(i, colors[item.tint]);
    });
    mesh.current.count = items.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items, colors, palette]);
  return <instancedMesh ref={mesh} name={name} args={[geometry, material, Math.max(1, items.length)]} count={items.length} castShadow={castShadow} receiveShadow />;
}

function RockStage({ settings }) {
  const { gl } = useThree();
  const loaded = useLoader(THREE.TextureLoader, TERRAIN_MAP_NAMES.map((name) => '/textures/azov/' + name + '.webp'));
  const images = useMemo(() => Object.fromEntries(TERRAIN_MAP_NAMES.map((name, i) => [name, loaded[i]])), [loaded]);
  const textures = useMemo(() => createTerrainTextureArrays(images, false, Math.min(8, gl.capabilities.getMaxAnisotropy())), [images, gl]);
  useEffect(() => () => textures.dispose(), [textures]);
  const materials = useMemo(() => {
    const rock = createTerrainMaterial(textures.maps, STUDIO_COAST, true);
    const debris = createTerrainMaterial(textures.maps, STUDIO_COAST, true);
    debris.userData.coastUniforms.uRockLayer.value = 3;
    return { rock, debris, pebble: createPebbleMaterial() };
  }, [textures]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  useEffect(() => { Object.values(materials).forEach((m) => { m.wireframe = settings.wireframe; }); }, [materials, settings.wireframe]);
  const rockGeometry = useMemo(makeRockGeometry, []);
  const pebbleGeometry = useMemo(makePebbleGeometry, []);
  useEffect(() => () => { rockGeometry.dispose(); pebbleGeometry.dispose(); }, [rockGeometry, pebbleGeometry]);
  const layout = useMemo(() => buildLayout(settings), [settings.seed, settings.rockSize, settings.pebbleSize, settings.debris, settings.pebbles]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    for (const m of [materials.rock, materials.debris]) {
      syncCoastUniforms(m.userData.coastUniforms, STUDIO_COAST);
      m.envMapIntensity = settings.environmentIntensity;
    }
    materials.pebble.envMapIntensity = settings.environmentIntensity;
  });
  return <>
    <Batch geometry={rockGeometry} material={materials.rock} items={layout.boulders} name="lab-boulders" castShadow />
    <Batch geometry={rockGeometry} material={materials.debris} items={layout.debris} name="lab-debris" castShadow />
    <Batch geometry={pebbleGeometry} material={materials.pebble} items={layout.pebbles} name="lab-pebbles" palette={PEBBLE_PALETTE} />
  </>;
}

export default function RockLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('pieces');
  const [hidden, setHidden] = useState(document.hidden);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const range = (key, label, min = 0, max = 1, step = .01, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const counts = { boulders: BOULDER_SIZES.length, debris: Math.round(60 * settings.debris), pebbles: Math.round(360 * settings.pebbles) };

  return (
    <main className="tanker-lab" data-testid="rock-lab" data-asset-collection="rocks" lang={language}>
      <header className="tanker-lab__header">
        <div><p>DDG / ASSET LAB / {assetIndex('rocks')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div>
        <div className="tanker-lab__header-actions">
          <div className="tanker-lab__languages">{['ru', 'en'].map((lang) => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
          <LabNav current="rocks" lang={language} label={t.assets} />
        </div>
      </header>
      <div className="tanker-lab__workspace">
        <section className="tanker-lab__viewer" aria-label={language === 'ru' ? '3D-камни' : 'Rocks 3D viewport'}>
          <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} floorY={0} exposure={settings.exposure} environmentIntensity={settings.environmentIntensity} paused={hidden}>
            <Suspense fallback={null}><RockStage settings={settings} /></Suspense>
          </AssetStudio>
          <div className="tanker-lab__views" role="group" aria-label="Ракурс">
            {['full', 'boulders', 'debris', 'pebbles', 'top'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}
          </div>
          <div className="tanker-lab__scale"><span>{(BOULDER_SIZES[BOULDER_SIZES.length - 1] * settings.rockSize).toFixed(1)} {t.metres}</span><i /></div>
        </section>
        <aside className="tanker-lab__inspector">
          <div className="tanker-lab__tabs" role="tablist">{['pieces', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
          <div className="tanker-lab__controls" role="tabpanel" aria-label={t[tab]}>
            {tab === 'pieces' && <>
              {range('seed', t.seed, 1, 999, 1)}
              {range('rockSize', t.rockSize, ...TERRAIN_RANGES.terrainRockSize, '×')}
              {range('debris', t.debrisAmount, 0, 2, .05)}
              {range('pebbleSize', t.pebbleSize, ...TERRAIN_RANGES.terrainPebbleSize, '×')}
              {range('pebbles', t.pebblesAmount, 0, 2, .05)}
              <Toggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
            </>}
            {tab === 'light' && <>{range('exposure', t.exposure, .2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
          </div>
          <div className="tanker-lab__transport"><button onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button></div>
        </aside>
      </div>
      <footer className="tanker-lab__footer" aria-live="off"><span><b>{counts.boulders}</b> {t.boulderCount}</span><span><b>{counts.debris}</b> {t.debrisCount}</span><span><b>{counts.pebbles}</b> {t.pebbleCount}</span></footer>
    </main>
  );
}
