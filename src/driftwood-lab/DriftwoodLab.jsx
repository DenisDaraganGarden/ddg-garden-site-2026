import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { DEADWOOD_FORMS, makeDeadwood, makeDeadwoodGeometry, scatterDeadwood } from '../plants/deadwoodModel.js';
import { createDeadwoodMaterials } from '../plants/deadwoodMaterial.js';
import { makeStoneRing, createStoneRingMaterial, SHORE_STONE_MAPS } from '../terrain/stoneRingModel.js';
import { terrainMapUrl } from '../terrain/terrainTextures.js';
import '../plant-lab/plantLab.css';
import './driftwoodLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
const DEFAULTS = { seed: PUBLISHED.shoreSeed, length: 4.3, diameter: .55, limbs: 6, bend: .55, breakage: .7, size: PUBLISHED.shoreSize,
  bleach: PUBLISHED.shoreBleach, grain: PUBLISHED.shoreGrain, wetness: PUBLISHED.shoreWetness, bark: PUBLISHED.shoreBark, burial: PUBLISHED.shoreBurial, sand: false, ringDiameter: 1.9, stones: 14, irregularity: .55,
  count: 18, extent: 18, lightDetail: false, wireframe: false, exposure: 1.04, timeOfDay: PUBLISHED.timeOfDay ?? 16 };
const KINDS = Object.keys(DEADWOOD_FORMS);
const LIMITS = { minDistance: .18, maxDistance: 85, minPolarAngle: .015, maxPolarAngle: Math.PI - .04 };
const TEXT = {
  ru: { title: 'Коряги и камни', subtitle: 'Азовский берег · выбеленная древесина, обломки и следы человека', all: 'Все', ring: 'Круг', specimen: 'Объекты', patch: 'Россыпь', form: 'Форма', surface: 'Материал', ground: 'Посадка', light: 'Свет', full: 'Общий', macro: 'Древесина', end: 'Облом', top: 'Сверху', underside: 'Снизу', seed: 'Вариант', length: 'Длина', diameter: 'Толщина', limbs: 'Сучьев', bend: 'Изгиб', breakage: 'Излом', size: 'Масштаб', bleach: 'Выбеленность', grain: 'Борозды', bark: 'Остатки коры', wetness: 'Влажность', burial: 'Погружение в песок', sand: 'Песок', ringDiameter: 'Диаметр круга', stones: 'Камней', irregularity: 'Неровность', count: 'Количество', extent: 'Длина россыпи', lightDetail: 'Лёгкая геометрия', wireframe: 'Каркас', exposure: 'Экспозиция', timeOfDay: 'Время суток', reset: 'Сброс', tri: 'треугольников', calls: 'вызовов', pieces: 'объектов', unit: 'м', hour: 'ч', viewport: '3D береговых объектов', view: 'Ракурс', kind: 'Объект' },
  en: { title: 'Driftwood & stones', subtitle: 'Azov shore · bleached wood, broken limbs and human traces', all: 'All', ring: 'Stone ring', specimen: 'Objects', patch: 'Scatter', form: 'Form', surface: 'Material', ground: 'Placement', light: 'Light', full: 'Overview', macro: 'Wood', end: 'Break', top: 'Top', underside: 'Underside', seed: 'Seed', length: 'Length', diameter: 'Thickness', limbs: 'Limbs', bend: 'Bend', breakage: 'Breakage', size: 'Scale', bleach: 'Bleaching', grain: 'Grooves', bark: 'Retained bark', wetness: 'Wetness', burial: 'Sand burial', sand: 'Sand', ringDiameter: 'Ring diameter', stones: 'Stones', irregularity: 'Irregularity', count: 'Count', extent: 'Scatter length', lightDetail: 'Light geometry', wireframe: 'Wireframe', exposure: 'Exposure', timeOfDay: 'Time of day', reset: 'Reset', tri: 'triangles', calls: 'draw calls', pieces: 'objects', unit: 'm', hour: 'h', viewport: 'Shore objects 3D viewport', view: 'View', kind: 'Object' },
};
const GALLERY = {
  log: { x: -2.2, z: .3, yaw: -.16, scale: 1 },
  root: { x: 2.25, z: .1, yaw: -.48, scale: 1 },
  stake: { x: 3.7, z: -3.1, yaw: -.55, scale: 1 },
  stump: { x: -2.4, z: -2.5, yaw: .2, scale: 1 },
  branch: { x: -2.2, z: 2.7, yaw: .18, scale: 1 },
  ring: { x: 2.4, z: 3.1, yaw: 0, scale: 1 },
};

function Range({ label, value, min = 0, max = 1, step = .01, unit = '', onChange }) {
  return <label className="plant-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : step >= .1 ? 1 : 2)} {unit}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(+e.target.value)} /></label>;
}
function Toggle({ label, value, onChange }) {
  return <label className="plant-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /></label>;
}

function makeReview(settings, selected, mode) {
  const layout = mode === 'patch' ? scatterDeadwood(settings) :
    (selected === 'all' ? [...KINDS, 'ring'] : [selected]).map((kind) => ({ kind, variant: 0,
      ...(selected === 'all' ? GALLERY[kind] : { x: 0, z: 0, yaw: 0, scale: 1 }), scale: settings.size }));
  const assets = new Map();
  for (const p of layout) {
    const key = `${p.kind}-${p.variant}`;
    if (assets.has(key)) continue;
    if (p.kind === 'ring') {
      assets.set(key, { kind: p.kind, data: makeStoneRing({ seed: settings.seed, diameter: settings.ringDiameter, stones: settings.stones, irregularity: settings.irregularity, lod: settings.lightDetail ? 1 : 0 }), items: [] });
    } else {
      const shape = { ...DEADWOOD_FORMS[p.kind], seed: settings.seed + KINDS.indexOf(p.kind) * 137 + p.variant * 43,
        kind: p.kind, bend: settings.bend, breakage: settings.breakage };
      if (selected === p.kind && mode !== 'patch') Object.assign(shape, { length: settings.length, diameter: settings.diameter, limbs: settings.limbs });
      const model = makeDeadwood(shape);
      assets.set(key, { kind: p.kind, model, data: makeDeadwoodGeometry(model, settings.lightDetail ? 1 : 0), items: [] });
    }
  }
  const bounds = new THREE.Box3(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  for (const p of layout) {
    const asset = assets.get(`${p.kind}-${p.variant}`);
    const tilt = asset.model?.restAngle ?? 0;
    let bottom = asset.data.bounds.min.y;
    if (tilt) {
      bottom = Infinity;
      for (const geometry of [asset.data.wood, asset.data.endGrain]) {
        const vertices = geometry.attributes.position;
        for (let j = 0; j < vertices.count; j++) bottom = Math.min(bottom, vertices.getX(j) * Math.sin(tilt) + vertices.getY(j) * Math.cos(tilt));
      }
    }
    const y = asset.model ? (-bottom - asset.model.radius * 2 * settings.burial) * p.scale : -settings.burial * .09 * p.scale;
    const position = new THREE.Vector3(p.x, y, p.z);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    matrix.compose(position, quaternion, new THREE.Vector3().setScalar(p.scale));
    asset.items.push(matrix.clone());
    if (tilt) {
      const point = new THREE.Vector3();
      for (const geometry of [asset.data.wood, asset.data.endGrain]) for (let j = 0; j < geometry.attributes.position.count; j++) {
        bounds.expandByPoint(point.fromBufferAttribute(geometry.attributes.position, j).applyMatrix4(matrix));
      }
    } else bounds.union(asset.data.bounds.clone().applyMatrix4(matrix));
  }
  const main = [...assets.values()].find((a) => a.kind === (selected === 'all' || mode === 'patch' ? 'log' : selected)) ?? [...assets.values()][0];
  const focus = main?.data.bounds.getCenter(new THREE.Vector3()).applyMatrix4(main.items[0]) ?? new THREE.Vector3();
  let end = focus.clone();
  if (main?.model) end = main.model.main.curve.getPointAt(0).applyMatrix4(main.items[0]);
  return { assets: [...assets.values()], bounds, focus, end, count: layout.length,
    triangles: [...assets.values()].reduce((sum, a) => sum + a.data.triangles * a.items.length, 0),
    dispose() { assets.forEach((a) => a.data.dispose()); } };
}

function Batch({ geometry, material, items, name }) {
  const mesh = useRef();
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    items.forEach((matrix, i) => mesh.current.setMatrixAt(i, matrix));
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox(); mesh.current.computeBoundingSphere(); invalidate();
  }, [items, invalidate]);
  return <instancedMesh ref={mesh} name={name} args={[geometry, material, items.length]} castShadow receiveShadow dispose={null} />;
}

function SandFloor() {
  const loaded = useLoader(THREE.TextureLoader, ['sand-color', 'sand-normal', 'sand-surface'].map((name) => terrainMapUrl(name)));
  const maps = useMemo(() => loaded.map((original, i) => {
    const map = original.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(32 / 1.2, 24 / 1.2);
    map.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true; return map;
  }), [loaded]);
  useEffect(() => () => maps.forEach((map) => map.dispose()), [maps]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.006, 0]} receiveShadow><planeGeometry args={[32, 24]} /><meshStandardMaterial color="#d2c3a6" map={maps[0]} normalMap={maps[1]} normalScale={new THREE.Vector2(.55, .55)} roughnessMap={maps[2]} roughness={1} /></mesh>;
}

function Stage({ review, settings, floorVisible, onStats }) {
  const { gl, camera, size, invalidate } = useThree();
  const loaded = useLoader(THREE.TextureLoader, ['/textures/plants/bark/oleaster-albedo.webp', '/textures/plants/bark/oleaster-normal.webp', ...SHORE_STONE_MAPS]);
  const allMaps = useMemo(() => loaded.map((original, i) => {
    const map = original.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = i === 0 || i === 2 ? THREE.SRGBColorSpace : THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true; return map;
  }), [loaded]);
  useEffect(() => () => allMaps.forEach((map) => map.dispose()), [allMaps]);
  const materials = useMemo(() => createDeadwoodMaterials(allMaps.slice(0, 2)), [allMaps]);
  const stone = useMemo(() => createStoneRingMaterial(allMaps.slice(2)), [allMaps]);
  const raf = useRef();
  useEffect(() => () => { materials.dispose(); stone.dispose(); cancelAnimationFrame(raf.current); }, [materials, stone]);
  useLayoutEffect(() => { materials.update(settings); stone.wireframe = settings.wireframe; stone.roughness = 1 - settings.wetness * .42; stone.color.setScalar(.72 * (1 - settings.wetness * .35)); invalidate(); }, [materials, stone, settings, invalidate]);
  useFrame(() => {
    // Reading after R3F's draw gives the actual renderer budget. The callback
    // only updates changed values, so an idle demand canvas stays idle.
    cancelAnimationFrame(raf.current);
    const metres = review.bounds.getSize(new THREE.Vector3()).length() > 7 ? 1 : .25;
    const a = review.focus.clone().project(camera);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(metres);
    const b = review.focus.clone().add(right).project(camera);
    const pixels = Math.abs(b.x - a.x) * size.width * .5;
    raf.current = requestAnimationFrame(() => onStats({ triangles: gl.info.render.triangles, calls: gl.info.render.calls, pixels: Math.round(pixels), metres }));
  });
  return <>
    {review.assets.map((asset) => <React.Fragment key={asset.kind + asset.model?.settings.seed}>
      {asset.kind === 'ring' ? <Batch geometry={asset.data.geometry} material={stone} items={asset.items} name="driftwood-stone-ring" /> : <>
        <Batch geometry={asset.data.wood} material={materials.wood} items={asset.items} name={`driftwood-${asset.kind}`} />
        <Batch geometry={asset.data.endGrain} material={materials.endGrain} items={asset.items} name={`driftwood-${asset.kind}-breaks`} />
      </>}
    </React.Fragment>)}
    {floorVisible && (settings.sand ? <Suspense fallback={null}><SandFloor /></Suspense> :
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.006, 0]} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#f0eee9" roughness={.96} /></mesh>)}
  </>;
}

function cameraPresets(review, selected, mode) {
  const size = review.bounds.getSize(new THREE.Vector3()), center = review.bounds.getCenter(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, .5), overview = selected === 'all' || mode === 'patch';
  const target = center.clone(); target.y = Math.max(.15, center.y);
  const pair = (point, offset, portraitScale = 1.32) => ({
    landscape: { position: point.clone().add(new THREE.Vector3(...offset)).toArray(), target: point.toArray() },
    portrait: { position: point.clone().add(new THREE.Vector3(...offset).multiplyScalar(portraitScale)).toArray(), target: point.toArray() },
  });
  const focus = review.focus.clone(), end = review.end.clone();
  const detail = selected === 'branch' ? .5 : selected === 'ring' ? 1.5 : 1.25;
  return {
    full: pair(target, [extent * .4, extent * (overview ? 1.05 : .64), extent * 2.1]),
    top: pair(center, [.01, extent * 1.8, .01]),
    underside: pair(center, [extent * .3, -extent * .8, extent * 2.1]),
    macro: pair(focus, [detail * .35, detail * .72, detail * 1.25]),
    end: pair(end, [-detail * 1.3, detail * .45, detail * .75]),
  };
}

export default function DriftwoodLab() {
  const [lang, setLang] = useState('ru'), [selected, setSelected] = useState('all'), [mode, setMode] = useState('specimen');
  const [settings, setSettings] = useState(DEFAULTS), [tab, setTab] = useState('form'), [view, setView] = useState('full');
  const [hidden, setHidden] = useState(document.hidden), [stats, setStats] = useState({ triangles: 0, calls: 0, pixels: 64, metres: 1 });
  const t = TEXT[lang], set = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
  // Light and surface edits must not regenerate or move the geometry.
  const shapeKey = JSON.stringify([settings.seed, settings.length, settings.diameter, settings.limbs, settings.bend, settings.breakage,
    settings.size, settings.burial, settings.ringDiameter, settings.stones, settings.irregularity, settings.count, settings.extent, settings.lightDetail]);
  const review = useMemo(() => makeReview(settings, selected, mode), [shapeKey, selected, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => review.dispose(), [review]);
  const views = useMemo(() => cameraPresets(review, selected, mode), [review, selected, mode]);
  const onStats = React.useCallback((next) => setStats((previous) => Object.keys(next).every((key) => next[key] === previous[key]) ? previous : next), []);
  useEffect(() => { const changed = () => setHidden(document.hidden); document.addEventListener('visibilitychange', changed); return () => document.removeEventListener('visibilitychange', changed); }, []);
  const choose = (kind) => { setSelected(kind); setMode('specimen'); setView('full'); if (DEADWOOD_FORMS[kind]) setSettings((s) => ({ ...s, ...DEADWOOD_FORMS[kind] })); };
  const chooseMode = (next) => { setMode(next); setView('full'); if (next === 'patch') setSelected('all'); };
  const range = (key, min = 0, max = 1, step = .01, unit = '') => <Range key={key} label={t[key]} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const toggle = (key) => <Toggle key={key} label={t[key]} value={settings[key]} onChange={(value) => set(key, value)} />;
  return <main className="plant-lab driftwood-lab" data-asset-collection="driftwood" data-asset-kind={selected} data-mode={mode} lang={lang}>
    <header className="plant-lab__header"><div><p>DDG / ASSET LAB / {assetIndex('driftwood')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="plant-lab__header-actions"><div>{['ru', 'en'].map((id) => <button key={id} aria-pressed={lang === id} onClick={() => setLang(id)}>{id.toUpperCase()}</button>)}</div><LabNav current="driftwood" lang={lang} /></div></header>
    <div className="plant-lab__workspace"><section className="plant-lab__viewer" aria-label={t.viewport}>
      <AssetStudio view={view} cameraViews={views} cameraLimits={LIMITS} cameraFar={150} fogRange={[90, 150]} floorVisible={false}
        paused inactive={hidden} exposure={settings.exposure} sceneOverrides={{ timeOfDay: settings.timeOfDay }} shadowRadius={mode === 'patch' ? settings.extent * .6 : selected === 'all' ? 8 : 4}>
        <Suspense fallback={null}><Stage review={review} settings={settings} floorVisible={view !== 'underside'} onStats={onStats} /></Suspense>
      </AssetStudio>
      <div className="plant-lab__views" role="group" aria-label={t.view}>{['full', 'macro', 'end', 'top', 'underside'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}</div>
      <div className="plant-lab__scale"><span>{stats.metres} {t.unit}</span><i style={{ width: stats.pixels }} /></div>
    </section><aside className="plant-lab__inspector">
      <div className="plant-lab__modes plant-lab__variants" role="group" aria-label={t.kind}>{['all', ...KINDS, 'ring'].map((kind) => <button key={kind} aria-pressed={selected === kind} onClick={() => choose(kind)}>{DEADWOOD_FORMS[kind]?.[lang] ?? t[kind]}</button>)}</div>
      <div className="plant-lab__modes">{['specimen', 'patch'].map((id) => <button key={id} aria-pressed={mode === id} onClick={() => chooseMode(id)}>{t[id]}</button>)}</div>
      <div className="plant-lab__tabs" role="tablist">{['form', 'surface', 'ground', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div key={`${tab}-${selected}-${mode}`} className="plant-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'form' && <>{range('seed', 1, 999, 1)}{selected === 'all' ? range('size', .5, 1.7, .05) : selected !== 'ring' && <>{range('length', .4, 7, .05, t.unit)}{range('diameter', .03, 1, .01, t.unit)}{range('limbs', 0, 12, 1)}</>}
          {selected !== 'ring' && <>{range('bend')}{range('breakage')}{toggle('lightDetail')}</>}
          {(selected === 'ring' || (selected === 'all' && mode === 'specimen')) && <>{range('ringDiameter', .9, 3.8, .1, t.unit)}{range('stones', 7, 24, 1)}{range('irregularity')}</>}{toggle('wireframe')}</>}
        {tab === 'surface' && <>{selected !== 'ring' && <>{range('bleach')}{range('grain')}{range('bark')}</>}{range('wetness')}</>}
        {tab === 'ground' && <>{range('burial', 0, .4)}{toggle('sand')}{mode === 'patch' && <>{range('count', 6, 48, 1)}{range('extent', 12, 32, 1, t.unit)}</>}</>}
        {tab === 'light' && <>{range('timeOfDay', 0, 24, .05, t.hour)}{range('exposure', .3, 2, .01)}</>}
      </div><div className="plant-lab__transport"><button onClick={() => { setSettings(DEFAULTS); setSelected('all'); setMode('specimen'); setView('full'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="plant-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{review.count}</b> {t.pieces}</span><span>{review.bounds.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)).join(' × ')} {t.unit}</span></footer>
  </main>;
}
