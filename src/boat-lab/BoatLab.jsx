import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { ENV_REFLECTION_SCALE } from '../components/effects/water/pbrMaterial';
import { BOAT_NEUTRAL_Y } from '../components/effects/water/constants';
import {
  BOAT_MODEL_URL,
  BOAT_OPTICS_LOD_URL,
  BOAT_TEXTURE_URLS,
  createBoatMaterials,
  dressBoat,
} from '../components/effects/water/boatModel';
import { installOpticsGeometryLod, setOpticsGeometryLod } from '../components/effects/water/opticsGeometryLod';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import '../tanker-lab/tankerLab.css';

// Collection 07. The boat is the scene's own asset: the GLB, the maps and both
// materials come from boatModel.js, the look and the sit in the water start
// from the published scene. The lab only adds the studio, the views and sliders.
const PUBLISHED = getPublishedHomeSceneSettings();
const WATER_Y = 0;
const CAMERA_VIEWS = {
  full: { landscape: { position: [4.4, 2.1, 5.6], target: [0, 0.35, 0] }, portrait: { position: [5.8, 2.9, 8.2], target: [0, 0.35, 0] } },
  side: { landscape: { position: [7.2, 0.9, 0.6], target: [0, 0.35, 0] }, portrait: { position: [10.5, 1.4, 0.8], target: [0, 0.35, 0] } },
  bow: { landscape: { position: [0.9, 1.0, -6.0], target: [0, 0.3, 0] }, portrait: { position: [1.2, 1.5, -8.6], target: [0, 0.3, 0] } },
  stern: { landscape: { position: [-0.9, 1.0, 6.0], target: [0, 0.3, 0] }, portrait: { position: [-1.2, 1.5, 8.6], target: [0, 0.3, 0] } },
  macro: { landscape: { position: [1.5, 0.95, 1.3], target: [0.35, 0.45, 0.2] }, portrait: { position: [2.0, 1.3, 1.8], target: [0.35, 0.45, 0.2] } },
  top: { landscape: { position: [0.2, 7.5, 0.4], target: [0, 0.2, 0] }, portrait: { position: [0.3, 10, 0.5], target: [0, 0.2, 0] } },
  underside: { landscape: { position: [3.2, -2.6, 4.6], target: [0, 0.1, 0] }, portrait: { position: [4.6, -3.8, 6.8], target: [0, 0.1, 0] } },
};
const CAMERA_LIMITS = { minDistance: 0.5, maxDistance: 24, minPolarAngle: 0.04, maxPolarAngle: Math.PI - 0.04 };
const DEFAULTS = {
  mode: 'water', lod: 'full', wireframe: false,
  color: PUBLISHED.boatColor, roughness: PUBLISHED.boatRoughness, metalness: PUBLISHED.boatMetalness,
  clearcoat: PUBLISHED.boatClearcoat, clearcoatRoughness: PUBLISHED.boatClearcoatRoughness,
  lightMode: 'studio', timeOfDay: PUBLISHED.timeOfDay, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: { title: 'Лодка', subtitle: 'Деревянная гребная лодка · GLB из 3ds Max · дерево и чёрный металл', studio: 'Студия', water: 'На воде', material: 'Материал', geometry: 'Геометрия', light: 'Свет', full: 'Общий', side: 'Борт', bow: 'Нос', stern: 'Корма', macro: 'Крупно', top: 'Сверху', underside: 'Снизу', color: 'Тон дерева', rough: 'Шероховатость', metal: 'Металличность', clearcoat: 'Лак', clearcoatRough: 'Шероховатость лака', detail: 'Детализация', fullGeometry: 'Полная', optics: 'Оптика · LOD', wire: 'Каркас', length: 'Длина', beam: 'Ширина', height: 'Высота', download: 'Скачать GLB', lighting: 'Освещение', scene: 'Свет сцены', hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене', model: 'модель', draws: 'вызовы', rendered: 'кадр', metres: 'м', assets: 'Коллекции', h: 'ч' },
  en: { title: 'Rowing boat', subtitle: 'Wooden rowing boat · GLB from 3ds Max · wood and black metal', studio: 'Studio', water: 'Afloat', material: 'Material', geometry: 'Geometry', light: 'Light', full: 'Overview', side: 'Broadside', bow: 'Bow', stern: 'Stern', macro: 'Close-up', top: 'Top', underside: 'Underside', color: 'Wood tint', rough: 'Roughness', metal: 'Metalness', clearcoat: 'Varnish', clearcoatRough: 'Varnish roughness', detail: 'Detail', fullGeometry: 'Full', optics: 'Optics · LOD', wire: 'Wireframe', length: 'Length', beam: 'Beam', height: 'Height', download: 'Download GLB', lighting: 'Lighting', scene: 'Scene light', hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene', model: 'model', draws: 'draw calls', rendered: 'frame', metres: 'm', assets: 'Collections', h: 'h' },
};

function Range({ label, value, min = 0, max = 1, step = 0.01, unit = '', onChange }) {
  return <label className="tanker-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : 2)}{unit && ` ${unit}`}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) {
  return <label className="tanker-lab__toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /></label>;
}

function countTriangles(root) {
  let triangles = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const { index } = object.geometry;
    triangles += (index ? index.count : object.geometry.getAttribute('position')?.count ?? 0) / 3;
  });
  return Math.round(triangles);
}

function BoatStage({ settings, lighting, onStats }) {
  const { gl } = useThree();
  const textures = useLoader(THREE.TextureLoader, BOAT_TEXTURE_URLS);
  const source = useLoader(GLTFLoader, BOAT_MODEL_URL).scene;
  const lastStats = useRef(-1);
  const materials = useMemo(() => createBoatMaterials(gl, textures, {
    color: settings.color,
    roughness: settings.roughness,
    metalness: settings.metalness,
    clearcoat: settings.clearcoat,
    clearcoatRoughness: settings.clearcoatRoughness,
  }, lighting.environment.reflection * ENV_REFLECTION_SCALE.boat), [
    gl, lighting, settings.clearcoat, settings.clearcoatRoughness, settings.color, settings.metalness, settings.roughness, textures,
  ]);
  const boat = useMemo(
    () => dressBoat(source.clone(), materials, PUBLISHED.boatScale),
    [materials, source],
  );
  // The studio centres the hull; the sit is the scene's (neutral height plus the
  // published offset) when afloat, and keel-on-floor in the studio. The hull is
  // the largest mesh — the oar blades reach lower than the keel.
  const frame = useMemo(() => {
    boat.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(boat);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    let hull = null;
    boat.traverse((object) => {
      if (object.isMesh && (!hull || object.geometry.getAttribute('position').count > hull.geometry.getAttribute('position').count)) hull = object;
    });
    const keel = hull ? new THREE.Box3().setFromObject(hull).min.y : bounds.min.y;
    return { x: -centre.x, z: -centre.z, keel, size, triangles: countTriangles(boat) };
  }, [boat]);

  useEffect(() => installOpticsGeometryLod(boat, BOAT_OPTICS_LOD_URL, true), [boat]);
  useEffect(() => {
    materials.woodMaterial.wireframe = settings.wireframe;
    materials.metalMaterial.wireframe = settings.wireframe;
  }, [materials, settings.wireframe]);
  useEffect(() => () => {
    materials.woodMaterial.dispose();
    materials.metalMaterial.dispose();
  }, [materials]);
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [gl]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastStats.current > 0.4) {
      lastStats.current = state.clock.elapsedTime;
      // The reduced index arrives asynchronously; re-applying is a no-op once swapped.
      setOpticsGeometryLod(boat, settings.lod === 'optics');
      onStats({
        triangles: countTriangles(boat), fullTriangles: frame.triangles,
        calls: gl.info.render.calls, renderedTriangles: gl.info.render.triangles,
        length: frame.size.z, beam: frame.size.x, height: frame.size.y,
      });
    }
    gl.info.reset();
  });

  const y = settings.mode === 'water' ? WATER_Y + BOAT_NEUTRAL_Y + PUBLISHED.boatHeightOffset : WATER_Y - frame.keel;
  return (
    <group position={[frame.x, y, frame.z]}>
      <primitive object={boat} dispose={null} />
    </group>
  );
}

export default function BoatLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('material');
  const [hidden, setHidden] = useState(document.hidden);
  const [stats, setStats] = useState({ triangles: 0, fullTriangles: 0, calls: 0, renderedTriangles: 0, length: 0, beam: 0, height: 0 });
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const lighting = useMemo(() => buildHomeSceneLighting({
    ...PUBLISHED, timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover,
  }), [settings.cloudCover, settings.timeOfDay]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const range = (key, label, min = 0, max = 1, step = 0.01, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const afloat = settings.mode === 'water' && view !== 'underside';

  return (
    <main className="tanker-lab" data-testid="boat-lab" data-asset-collection="boat" lang={language}>
      <header className="tanker-lab__header">
        <div><p>DDG / ASSET LAB / 007</p><h1>{t.title}</h1><span>{t.subtitle}</span></div>
        <div className="tanker-lab__header-actions">
          <div className="tanker-lab__languages">{['ru', 'en'].map((lang) => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
          <LabNav current="boat" lang={language} label={t.assets} />
        </div>
      </header>
      <div className="tanker-lab__workspace">
        <section className="tanker-lab__viewer" aria-label={language === 'ru' ? '3D-модель лодки' : 'Boat 3D viewport'}>
          <AssetStudio
            view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
            waterReflection={afloat} waterY={WATER_Y} floorY={WATER_Y}
            floorVisible={view !== 'underside'}
            lighting={settings.lightMode === 'scene' ? lighting : undefined}
            exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
            paused={hidden}
          >
            <Suspense fallback={null}>
              <BoatStage settings={settings} lighting={lighting} onStats={setStats} />
            </Suspense>
          </AssetStudio>
          <div className="tanker-lab__views" role="group" aria-label="Ракурс">
            {['full', 'side', 'bow', 'stern', 'macro', 'top', 'underside'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}
          </div>
          <div className="tanker-lab__scale"><span>{stats.length.toFixed(1)} {t.metres}</span><i /></div>
        </section>
        <aside className="tanker-lab__inspector">
          <div className="tanker-lab__modes" role="group" aria-label="Режим сцены">{['studio', 'water'].map((mode) => <button key={mode} aria-pressed={settings.mode === mode} onClick={() => set('mode', mode)}>{t[mode]}</button>)}</div>
          <div className="tanker-lab__tabs" role="tablist">{['material', 'geometry', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
          <div className="tanker-lab__controls" role="tabpanel" aria-label={t[tab]}>
            {tab === 'material' && <><label className="tanker-lab__toggle"><span>{t.color}</span><input type="color" aria-label={t.color} value={settings.color} onChange={(e) => set('color', e.target.value)} /></label>{range('roughness', t.rough)}{range('metalness', t.metal, 0, 0.3)}{range('clearcoat', t.clearcoat)}{range('clearcoatRoughness', t.clearcoatRough)}</>}
            {tab === 'geometry' && <>
              <label className="tanker-lab__select"><span>{t.detail}</span><select aria-label={t.detail} value={settings.lod} onChange={(e) => set('lod', e.target.value)}><option value="full">{t.fullGeometry} · {stats.fullTriangles.toLocaleString(language)}</option><option value="optics">{t.optics}</option></select></label>
              <Toggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
              <dl><div><dt>{t.length}</dt><dd>{stats.length.toFixed(2)} {t.metres}</dd></div><div><dt>{t.beam}</dt><dd>{stats.beam.toFixed(2)} {t.metres}</dd></div><div><dt>{t.height}</dt><dd>{stats.height.toFixed(2)} {t.metres}</dd></div><div><dt>LOD</dt><dd>{stats.triangles.toLocaleString(language)} tri</dd></div></dl>
              <a className="tanker-lab__download" href={BOAT_MODEL_URL} download>{t.download} ↗</a>
            </>}
            {tab === 'light' && <><label className="tanker-lab__select"><span>{t.lighting}</span><select aria-label={t.lighting} value={settings.lightMode} onChange={(e) => set('lightMode', e.target.value)}><option value="studio">{t.studio}</option><option value="scene">{t.scene}</option></select></label>{range('timeOfDay', t.hour, 0, 24, 0.1, t.h)}{range('cloudCover', t.clouds)}{range('exposure', t.exposure, 0.2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
          </div>
          <div className="tanker-lab__transport">
            <button onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>
          </div>
        </aside>
      </div>
      <footer className="tanker-lab__footer" aria-live="off"><span><b>{stats.triangles.toLocaleString(language)}</b> tri / {t.model}</span><span><b>{stats.calls}</b> {t.draws}</span><span><b>{stats.renderedTriangles.toLocaleString(language)}</b> tri / {t.rendered}</span></footer>
    </main>
  );
}
