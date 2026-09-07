import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { createCoastalRockGeometry, ROCK_DETAIL, ROCK_TYPES, rockRandom, seatRock } from '../terrain/rocks/rockModel.js';
import { createCoastalRockMaterial, updateCoastalRockMaterial, COASTAL_PEBBLE_PALETTE } from '../terrain/rocks/rockMaterial.js';
import { ROCK_MAP_NAMES, createRockTextureSet, rockMapUrl } from '../terrain/rocks/rockTextures.js';
import { TERRAIN_RANGES } from '../terrain/settings.js';
import '../tanker-lab/tankerLab.css';
import './rockLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
const BOULDER_SIZES = [.3, .65, 1.1, 1.7, 2.5];
const BOULDER_TYPES = ['limestone', 'coquina', 'limestone', 'worn', 'coquina'];
const VIEWS = {
  full: { landscape: { position: [-8, 10, 21], target: [.4, .5, .8] }, portrait: { position: [-15, 18, 23], target: [.4, .5, .8] } },
  boulders: { landscape: { position: [-6, 5, 12], target: [1.5, .8, -1.5] }, portrait: { position: [-13, 13, 18], target: [1.5, .8, -1.5] } },
  debris: { landscape: { position: [-3, 1.1, 5.2], target: [-4.5, .12, 2.5] }, portrait: { position: [-2.6, 1.6, 6.2], target: [-4.5, .12, 2.5] } },
  pebbles: { landscape: { position: [.18, .18, .8], target: [0, .02, 0] }, portrait: { position: [.25, .32, 1.2], target: [0, .02, 0] } },
  top: { landscape: { position: [.5, 16, .8], target: [.5, 0, .5] }, portrait: { position: [.5, 22, 1], target: [.5, 0, .5] } },
  macro: { landscape: { position: [2, 1.1, 3.2], target: [0, .4, 0] }, portrait: { position: [2.2, 1.4, 4.2], target: [0, .4, 0] } },
  underside: { landscape: { position: [1.5, -2, 3], target: [0, .3, 0] }, portrait: { position: [2, -2.5, 4], target: [0, .3, 0] } },
};
const LIMITS = { minDistance: .1, maxDistance: 40, minPolarAngle: .04, maxPolarAngle: Math.PI / 2 - .02 };
const UNDER_LIMITS = { ...LIMITS, maxPolarAngle: Math.PI - .04 };
const DEFAULTS = {
  seed: PUBLISHED.terrainSeed, rockSize: PUBLISHED.terrainRockSize, pebbleSize: PUBLISHED.terrainPebbleSize,
  type: 'mixed', erosion: .65, roundness: .35, fracture: .78, cavities: .65, damage: .8, blend: .85, showBlend: false, relief: 1, wetness: 0, waterline: .36, algae: 0,
  debris: 1, pebbles: 1, wireframe: false, exposure: 1.04, environmentIntensity: .7,
};
const TEXT = {
  ru: { title: 'Камни', subtitle: 'Валуны, осыпь и галька побережья · геометрия и материалы сцены', pieces: 'Камни', material: 'Материал', light: 'Свет', full: 'Общий', boulders: 'Валуны', debris: 'Осыпь', pebbles: 'Галька', top: 'Сверху', macro: 'Крупно', underside: 'Снизу', seed: 'Вариант', rockSize: 'Размер валунов', pebbleSize: 'Размер гальки', debrisAmount: 'Осыпь в куче', pebblesAmount: 'Гальки в россыпи', wire: 'Каркас', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене', assets: 'Коллекции', metres: 'м', tri: 'треугольников', boulderCount: 'валунов', debrisCount: 'осколков', pebbleCount: 'галек', type: 'Тип', mixed: 'Смесь', limestone: 'Плитчатый известняк', coquina: 'Ракушечник', worn: 'Окатанный камень', erosion: 'Выветривание', roundness: 'Окатанность', fracture: 'Сколы', cavities: 'Выбоины', damage: 'Рельеф излома', blend: 'Свежий излом', showBlend: 'Маска излома', relief: 'Микрорельеф', wetness: 'Намокание', waterline: 'Уровень намокания', algae: 'Водорослевый налёт' },
  en: { title: 'Rocks', subtitle: 'Coast boulders, debris and pebbles · scene geometry and materials', pieces: 'Stones', material: 'Material', light: 'Light', full: 'Overview', boulders: 'Boulders', debris: 'Debris', pebbles: 'Pebbles', top: 'Top', macro: 'Close-up', underside: 'Underside', seed: 'Seed', rockSize: 'Boulder size', pebbleSize: 'Pebble size', debrisAmount: 'Debris in the pile', pebblesAmount: 'Pebbles in the spread', wire: 'Wireframe', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene', assets: 'Collections', metres: 'm', tri: 'triangles', boulderCount: 'boulders', debrisCount: 'fragments', pebbleCount: 'pebbles', type: 'Type', mixed: 'Mixed', limestone: 'Bedded limestone', coquina: 'Shell limestone', worn: 'Sea-worn stone', erosion: 'Weathering', roundness: 'Roundness', fracture: 'Chipping', cavities: 'Pits', damage: 'Fracture relief', blend: 'Fresh fracture', showBlend: 'Fracture mask', relief: 'Microrelief', wetness: 'Wetness', waterline: 'Wet margin', algae: 'Algal film' },
};

function Range({ label, value, min = 0, max = 1, step = .01, unit = '', onChange }) {
  return <label className="tanker-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : 2)}{unit && ` ${unit}`}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) {
  return <label className="tanker-lab__toggle"><span>{label}</span><input type="checkbox" aria-label={label} checked={value} onChange={(e) => onChange(e.target.checked)} /></label>;
}

// A bounded number of shared shapes, including differently worn pebbles. The
// generator is independent of placement, so changing density preserves stones.
function buildCollection(settings, lowPower, closePebbles) {
  const specs = [];
  const typeAt = (i) => settings.type === 'mixed' ? ROCK_TYPES[i % ROCK_TYPES.length] : settings.type;
  BOULDER_SIZES.forEach((_, i) => specs.push({ name: `boulder-${i}`, type: settings.type === 'mixed' ? BOULDER_TYPES[i] : settings.type, seed: settings.seed * 101 + i * 37, detail: lowPower ? ROCK_DETAIL.mobileBoulder : ROCK_DETAIL.boulder }));
  for (let i = 0; i < 6; i++) specs.push({ name: `debris-${i}`, type: typeAt(i), seed: settings.seed * 53 + i * 79, detail: ROCK_DETAIL.debris });
  const pebbleDetail = closePebbles ? (lowPower ? 3 : 5) : (lowPower ? ROCK_DETAIL.mobilePebble : ROCK_DETAIL.pebble);
  for (let i = 0; i < 6; i++) specs.push({ name: `pebble-${i}`, type: i === 4 ? 'coquina' : 'worn', pebble: true, seed: settings.seed * 29 + i * 67, detail: pebbleDetail });
  const batches = specs.map((spec) => ({ ...spec, geometry: createCoastalRockGeometry({ ...spec, erosion: settings.erosion, roundness: settings.roundness, fracture: settings.fracture, cavities: settings.cavities }), items: [] }));
  return { batches, dispose() { batches.forEach((batch) => batch.geometry.dispose()); } };
}

function buildLayout(collection, settings) {
  const batches = collection.batches.map((batch) => ({ ...batch, items: [] }));
  const random = rockRandom(settings.seed);
  let x = -3.2;
  BOULDER_SIZES.forEach((base, i) => {
    const size = base * settings.rockSize;
    const scale = [size * (1 + random()), size * (.65 + random() * .32), size * (.75 + random())];
    const rotation = [(random() - .5) * .5, random() * Math.PI * 2, (random() - .5) * .3];
    x += scale[0] * .55;
    batches[i].items.push({ x, y: seatRock(batches[i].geometry, rotation, scale), z: -1.5, rotation, scale, tint: i % 3 });
    x += scale[0] * .55 + .35;
  });
  const debris = [];
  const debrisRandom = rockRandom(settings.seed + 923);
  for (let i = 0; i < Math.round(60 * settings.debris); i++) {
    const size = .07 + debrisRandom() ** 2 * .66, angle = debrisRandom() * Math.PI * 2, distance = Math.sqrt(debrisRandom()) * 2.4;
    const scale = [size * (1 + debrisRandom() * .6), size * (.55 + debrisRandom() * .5), size * (.7 + debrisRandom() * .5)];
    const rotation = [(debrisRandom() - .5) * 1.1, debrisRandom() * Math.PI * 2, (debrisRandom() - .5) * .7];
    const batch = batches[5 + i % 6];
    let px = -4.5 + Math.cos(angle) * distance, pz = 2.5 + Math.sin(angle) * distance;
    const radius = Math.max(scale[0], scale[2]) * .38;
    // Resolve projected overlap while keeping a natural, irregular distribution.
    for (let attempt = 0; attempt < 10; attempt++) {
      const clash = debris.find((p) => Math.hypot(p.x - px, p.z - pz) < p.radius + radius);
      if (!clash) break;
      px += (debrisRandom() - .5) * radius * 2; pz += (debrisRandom() - .5) * radius * 2;
    }
    debris.push({ x: px, z: pz, radius });
    batch.items.push({ x: px, y: seatRock(batch.geometry, rotation, scale), z: pz, rotation, scale, tint: i % 3 });
  }
  const pebbleRandom = rockRandom(settings.seed + 4781);
  const pebbles = [];
  for (let i = 0; i < Math.round(360 * settings.pebbles); i++) {
    const radius = (.012 + pebbleRandom() ** 2 * .038) * settings.pebbleSize;
    const stretch = 1 + pebbleRandom() * .75, flat = .4 + pebbleRandom() * .4;
    let px, pz;
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = pebbleRandom() * Math.PI * 2, distance = Math.sqrt(pebbleRandom()) * 1.5;
      px = Math.cos(angle) * distance; pz = 3.2 + Math.sin(angle) * distance;
      if (!pebbles.some((p) => Math.hypot(p.x - px, p.z - pz) < p.radius + radius * stretch * .8)) break;
    }
    const scale = [radius * stretch * 2, radius * flat * 2, radius * 2];
    const rotation = [(pebbleRandom() - .5) * .18, pebbleRandom() * Math.PI * 2, (pebbleRandom() - .5) * .15];
    const batch = batches[11 + i % 6];
    pebbles.push({ x: px, z: pz, radius: radius * stretch * .8 });
    batch.items.push({ x: px, y: seatRock(batch.geometry, rotation, scale, .02), z: pz, rotation, scale, tint: Math.floor(pebbleRandom() * COASTAL_PEBBLE_PALETTE.length) });
  }
  return batches;
}

const ROCK_TINTS = ['#ffffff', '#e3ded1', '#f4e9d4'];
function Batch({ geometry, material, items, name, palette, castShadow = false }) {
  const mesh = React.useRef();
  const colors = useMemo(() => palette.map((color) => new THREE.Color(color)), [palette]);
  useEffect(() => {
    const instance = mesh.current;
    // R3F's dispose={null} protects our separately owned geometry/material;
    // it also shadows the method on the instance, so release only its buffers
    // through the prototype. Never dispose the shared maps from a batch.
    return () => { if (instance) THREE.InstancedMesh.prototype.dispose.call(instance); };
  }, [geometry, material, items.length]);
  React.useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new THREE.Object3D();
    items.forEach((item, i) => {
      transform.position.set(item.x, item.y, item.z); transform.rotation.set(...item.rotation); transform.scale.set(...item.scale); transform.updateMatrix();
      mesh.current.setMatrixAt(i, transform.matrix); mesh.current.setColorAt(i, colors[item.tint]);
    });
    mesh.current.count = items.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items, colors]);
  return <instancedMesh ref={mesh} name={name} args={[geometry, material, Math.max(1, items.length)]} count={items.length} castShadow={castShadow} receiveShadow dispose={null} />;
}

function RockStage({ settings, lowPower, view }) {
  const { gl } = useThree();
  const loaded = useLoader(THREE.TextureLoader, ROCK_MAP_NAMES.map((name) => rockMapUrl(name, lowPower)));
  const textures = useMemo(() => createRockTextureSet(loaded, Math.min(8, gl.capabilities.getMaxAnisotropy())), [loaded, gl]);
  useEffect(() => () => textures.dispose(), [textures]);
  const materials = useMemo(() => ({
    limestone: createCoastalRockMaterial(textures.maps.limestone, { fractureMaps: textures.maps.fracture }),
    coquina: createCoastalRockMaterial(textures.maps.coquina, { type: 'coquina', fractureMaps: textures.maps.fracture }),
    worn: createCoastalRockMaterial(textures.maps.limestone, { type: 'worn', fractureMaps: textures.maps.fracture }),
    pebble: createCoastalRockMaterial(textures.maps.limestone, { pebble: true }),
    shellPebble: createCoastalRockMaterial(textures.maps.coquina, { type: 'coquina', pebble: true }),
  }), [textures]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  useEffect(() => { Object.values(materials).forEach((m) => updateCoastalRockMaterial(m, settings)); }, [materials, settings]);
  const { seed, type, erosion, roundness, fracture, cavities, rockSize, pebbleSize, debris, pebbles } = settings;
  const closePebbles = view === 'pebbles';
  const collection = useMemo(() => buildCollection({ seed, type, erosion, roundness, fracture, cavities }, lowPower, closePebbles), [seed, type, erosion, roundness, fracture, cavities, lowPower, closePebbles]);
  useEffect(() => () => collection.dispose(), [collection]);
  const layout = useMemo(() => buildLayout(collection, { seed, rockSize, pebbleSize, debris, pebbles }), [collection, seed, rockSize, pebbleSize, debris, pebbles]);
  const inspect = view === 'macro' || view === 'underside';
  const batches = useMemo(() => {
    if (view === 'pebbles') return layout.slice(11).map((batch) => ({ ...batch, items: batch.items.map((item) => ({ ...item, z: item.z - 3.2 })) }));
    if (view === 'boulders') return layout.slice(0, 5);
    if (view === 'debris') return layout.slice(5, 11);
    if (!inspect) return layout;
    const scale = [1.8, 1.1, 1.5].map((v) => v * rockSize);
    return [{ ...layout[4], items: [{ ...layout[4].items[0], x: 0, z: 0, scale, y: seatRock(layout[4].geometry, layout[4].items[0].rotation, scale) }] }];
  }, [layout, inspect, rockSize, view]);
  useEffect(() => {
    gl.domElement.dataset.rockTriangles = String(batches.reduce((sum, b) => sum + b.geometry.userData.triangles * b.items.length, 0));
    gl.domElement.dataset.rockBatches = String(batches.filter((b) => b.items.length).length);
    gl.domElement.dataset.rockTextureMiB = String(textures.bytes / 1048576);
    gl.domElement.dataset.rockProfile = lowPower ? 'mobile' : 'desktop';
  }, [batches, textures, gl, lowPower]);
  const frame = React.useRef(0);
  useFrame(() => {
    if (++frame.current % 45 === 0) {
      gl.domElement.dataset.rockDrawCalls = String(gl.info.render.calls);
      gl.domElement.dataset.rockGpuGeometries = String(gl.info.memory.geometries);
      gl.domElement.dataset.rockGpuTextures = String(gl.info.memory.textures);
    }
  });
  return <>
    {batches.map((batch) => <Batch key={batch.name} geometry={batch.geometry} material={batch.pebble ? (batch.type === 'coquina' ? materials.shellPebble : materials.pebble) : materials[batch.type]} items={batch.items} name={`lab-${batch.name}`} palette={batch.pebble ? COASTAL_PEBBLE_PALETTE : ROCK_TINTS} castShadow={!batch.pebble || view === 'pebbles'} />)}
  </>;
}

export default function RockLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('pieces');
  const [hidden, setHidden] = useState(document.hidden);
  // Fixed for the visit: resizing the inspector does not reload GPU textures.
  const [lowPower] = useState(() => window.matchMedia('(max-width: 820px)').matches || window.matchMedia('(pointer: coarse)').matches);
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
          <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={view === 'underside' ? UNDER_LIMITS : LIMITS} floorY={0} floorVisible={false} cameraFar={120} fogRange={[70, 110]} shadowRadius={view === 'pebbles' ? 2.4 : (view === 'macro' || view === 'underside') ? 3 : 9} exposure={settings.exposure} environmentIntensity={settings.environmentIntensity} paused={hidden}>
            {view !== 'underside' && <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#f0eee9" roughness={.96} /></mesh>}
            <Suspense fallback={null}><RockStage settings={settings} lowPower={lowPower} view={view} /></Suspense>
          </AssetStudio>
          <div className="tanker-lab__views" role="group" aria-label={language === 'ru' ? 'Ракурс' : 'View'}>
            {['full', 'boulders', 'debris', 'pebbles', 'top', 'macro', 'underside'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}
          </div>
          <div className="tanker-lab__scale"><span>{(BOULDER_SIZES.at(-1) * settings.rockSize).toFixed(1)} {t.metres}</span><i /></div>
        </section>
        <aside className="tanker-lab__inspector">
          <div className="tanker-lab__tabs" role="tablist">{['pieces', 'material', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
          <div className="tanker-lab__controls" role="tabpanel" aria-label={t[tab]}>
            {tab === 'pieces' && <>
              <label className="tanker-lab__select"><span>{t.type}</span><select aria-label={t.type} value={settings.type} onChange={(e) => set('type', e.target.value)}>{['mixed', ...ROCK_TYPES].map((id) => <option key={id} value={id}>{t[id]}</option>)}</select></label>
              {range('seed', t.seed, 1, 999, 1)}
              {range('erosion', t.erosion)}{range('roundness', t.roundness)}
              {range('fracture', t.fracture)}{range('cavities', t.cavities)}
              {range('rockSize', t.rockSize, ...TERRAIN_RANGES.terrainRockSize, '×')}
              {range('debris', t.debrisAmount, 0, 2, .05)}
              {range('pebbleSize', t.pebbleSize, ...TERRAIN_RANGES.terrainPebbleSize, '×')}
              {range('pebbles', t.pebblesAmount, 0, 2, .05)}
              <Toggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
            </>}
            {tab === 'material' && <>{range('damage', t.damage, 0, 1.5)}{range('blend', t.blend)}{range('relief', t.relief, 0, 2)}{range('wetness', t.wetness)}{range('waterline', t.waterline, 0, 2, .01, t.metres)}{range('algae', t.algae)}<Toggle label={t.showBlend} value={settings.showBlend} onChange={(value) => set('showBlend', value)} /></>}
            {tab === 'light' && <>{range('exposure', t.exposure, .2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
          </div>
          <div className="tanker-lab__transport"><button onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button></div>
        </aside>
      </div>
      <footer className="tanker-lab__footer" aria-live="off"><span><b>{counts.boulders}</b> {t.boulderCount}</span><span><b>{counts.debris}</b> {t.debrisCount}</span><span><b>{counts.pebbles}</b> {t.pebbleCount}</span></footer>
    </main>
  );
}
