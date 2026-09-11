import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabSelect, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
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
  timeOfDay: PUBLISHED.timeOfDay, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: { title: 'Лодка', subtitle: 'Деревянная гребная лодка · GLB из 3ds Max · дерево и чёрный металл', studio: 'Студия', water: 'На воде', material: 'Материал', geometry: 'Геометрия', light: 'Свет', full: 'Общий', side: 'Борт', bow: 'Нос', stern: 'Корма', macro: 'Крупно', top: 'Сверху', underside: 'Снизу', color: 'Тон дерева', rough: 'Шероховатость', metal: 'Металличность', clearcoat: 'Лак', clearcoatRough: 'Шероховатость лака', detail: 'Детализация', fullGeometry: 'Полная', optics: 'Оптика · LOD', wire: 'Каркас', length: 'Длина', beam: 'Ширина', height: 'Высота', download: 'Скачать GLB', lighting: 'Освещение', scene: 'Свет сцены', hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене', model: 'модель', draws: 'вызовы', rendered: 'кадр', metres: 'м', assets: 'Коллекции', h: 'ч' },
  en: { title: 'Rowing boat', subtitle: 'Wooden rowing boat · GLB from 3ds Max · wood and black metal', studio: 'Studio', water: 'Afloat', material: 'Material', geometry: 'Geometry', light: 'Light', full: 'Overview', side: 'Broadside', bow: 'Bow', stern: 'Stern', macro: 'Close-up', top: 'Top', underside: 'Underside', color: 'Wood tint', rough: 'Roughness', metal: 'Metalness', clearcoat: 'Varnish', clearcoatRough: 'Varnish roughness', detail: 'Detail', fullGeometry: 'Full', optics: 'Optics · LOD', wire: 'Wireframe', length: 'Length', beam: 'Beam', height: 'Height', download: 'Download GLB', lighting: 'Lighting', scene: 'Scene light', hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene', model: 'model', draws: 'draw calls', rendered: 'frame', metres: 'm', assets: 'Collections', h: 'h' },
};

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

  const range = (key, label, min = 0, max = 1, step = 0.01, unit = '') => <LabRange key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const afloat = settings.mode === 'water' && view !== 'underside';

  return (
    <LabShell
      collection="boat"
      testId="boat-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('boat')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'side', 'bow', 'stern', 'macro', 'top', 'underside'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${stats.length.toFixed(1)} ${t.metres}`}
      panel={<>
        <LabModes label={t.studio} items={['studio', 'water'].map((id) => ({ id, label: t[id] }))} value={settings.mode} onChange={(value) => set('mode', value)} />
        <LabTabs label={t[tab]} items={['material', 'geometry', 'light'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'material' && <><LabColor label={t.color} value={settings.color} onChange={(value) => set('color', value)} />{range('roughness', t.rough)}{range('metalness', t.metal, 0, 0.3)}{range('clearcoat', t.clearcoat)}{range('clearcoatRoughness', t.clearcoatRough)}</>}
        {tab === 'geometry' && <>
          <LabSelect label={t.detail} value={settings.lod} onChange={(value) => set('lod', value)} options={[{ value: 'full', label: `${t.fullGeometry} · ${stats.fullTriangles.toLocaleString(language)}` }, { value: 'optics', label: t.optics }]} />
          <LabToggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
          <LabFacts rows={[[t.length, `${stats.length.toFixed(2)} ${t.metres}`], [t.beam, `${stats.beam.toFixed(2)} ${t.metres}`], [t.height, `${stats.height.toFixed(2)} ${t.metres}`], ['LOD', `${stats.triangles.toLocaleString(language)} tri`]]} />
          <a className="lab__link" href={BOAT_MODEL_URL} download>{t.download} ↗</a>
        </>}
        {tab === 'light' && <>{range('timeOfDay', t.hour, 0, 24, 0.1, t.h)}{range('cloudCover', t.clouds)}{range('exposure', t.exposure, 0.2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
      </>}
      transport={<button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>}
      stats={<>
        <span><b>{stats.triangles.toLocaleString(language)}</b> tri / {t.model}</span>
        <span><b>{stats.calls}</b> {t.draws}</span>
        <span><b>{stats.renderedTriangles.toLocaleString(language)}</b> tri / {t.rendered}</span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        waterReflection={afloat} waterY={WATER_Y} floorY={WATER_Y}
        floorVisible={view !== 'underside'}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
        paused={hidden}
      >
        <Suspense fallback={null}>
          <BoatStage settings={settings} lighting={lighting} onStats={setStats} />
        </Suspense>
      </AssetStudio>
    </LabShell>
  );
}
