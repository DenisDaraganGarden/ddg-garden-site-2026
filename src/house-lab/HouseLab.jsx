import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import BeachHouseModel from '../components/house/BeachHouseModel';
import { HOUSE_COLORS, HOUSE_DEFAULTS, HOUSE_RANGES, buildBeachHouse, buildBeachShed, disposeBuilding } from '../components/house/beachHouse';
import RiderModel from '../components/surfboard/RiderModel';
import { updateRiderModel } from '../components/surfboard/riderMesh';
import { createRiderRagdoll } from '../components/surfboard/riderSkeleton';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

// The beach house and its shed are built from numbers (components/house), like
// the surfboard. The lab stages them as in Denis's diorama — the shed a few
// steps off the foot of the porch stairs — and stands the surfer there for
// scale: the rider's own balsa model in its rest pose, 1.74 m.
const PUBLISHED = getPublishedHomeSceneSettings();
const REST_RIDER = { world: createRiderRagdoll() };
// A view: the camera `distance` out from `centre` along `towards`. On a wide
// screen both slide `slide` metres to the camera's right, so the buildings sit
// in the open part of the frame and not under the panel.
function aim(centre, towards, distance, slide) {
  const out = new THREE.Vector3(...towards).normalize();
  const right = new THREE.Vector3(out.z, 0, -out.x).normalize();
  const view = (reach, shift) => {
    const target = new THREE.Vector3(...centre).addScaledVector(right, shift);
    return { position: target.clone().addScaledVector(out, reach).toArray(), target: target.toArray() };
  };
  return { landscape: view(distance, slide), portrait: view(distance * 1.45, 0) };
}
const CAMERA_VIEWS = {
  full: aim([-2.6, 2.4, 2.2], [0.54, 0.43, 0.72], 38, 3.4),
  front: aim([-1.4, 3.9, 0], [0, 0.05, 1], 31, 2.6),
  side: aim([0.2, 3.9, 1.2], [1, 0.06, 0], 31, 2.6),
  back: aim([-2.2, 3.2, 0], [-0.6, 0.45, -0.66], 35, 3),
  porch: aim([-1.3, 2.3, 4.6], [0.55, 0.12, 0.83], 8.5, 0.7),
  shed: aim([-8.6, 1.6, 7.4], [0.66, 0.34, 0.67], 12, 1.1),
  top: aim([-2.6, 0, 2.2], [0, 1, 0.001], 48, 3.5),
};
const CAMERA_LIMITS = { minDistance: 1.2, maxDistance: 90, minPolarAngle: 0.02, maxPolarAngle: Math.PI / 2 - 0.02 };
// The weathering is the material's; everything else rebuilds the geometry.
const GEOMETRY_KEYS = [...Object.keys(HOUSE_RANGES).filter((key) => key !== 'weather'), 'seed'];
const PAINT_KEYS = Object.keys(HOUSE_COLORS);
const WEAR_KEYS = ['weather', 'damage', 'sag'];
const WEAR = {
  fresh: { weather: 0, damage: 0, sag: 0 },
  lived: { weather: HOUSE_DEFAULTS.weather, damage: HOUSE_DEFAULTS.damage, sag: HOUSE_DEFAULTS.sag },
  derelict: { weather: 0.9, damage: 0.8, sag: 0.75 },
};
const wearPreset = (settings) => Object.keys(WEAR).find((id) => WEAR_KEYS.every((key) => WEAR[id][key] === settings[key])) ?? null;
const DEFAULTS = {
  ...HOUSE_DEFAULTS, colors: HOUSE_COLORS, look: 'color', rider: true, shed: true, wireframe: false,
  // Late morning: the sun comes from the front left, as in the diorama's
  // photos, where the published scene's early sun leaves the porch in shade.
  timeOfDay: 11.5, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: {
    title: 'Дом у океана', subtitle: 'Дом на сваях и сарай · эскиз без текстур · по диораме «By the ocean»',
    color: 'Цвет', clay: 'Макет', shape: 'Форма', wear: 'Износ', paint: 'Краски', light: 'Свет',
    fresh: 'Новый', lived: 'Жилой', derelict: 'Заброшенный', weather: 'Подтёки и выцветание', damage: 'Сломанные доски', sag: 'Проседание',
    full: 'Общий', front: 'Фасад', side: 'Сбоку', back: 'Сзади', porch: 'Веранда', shed: 'Сарай', top: 'План',
    houseWidth: 'Ширина дома', houseLength: 'Длина дома', floorHeight: 'Высота свай', roofPitch: 'Уклон крыши', porchDepth: 'Глубина веранды', seed: 'Вариант досок',
    rider: 'Серфер для масштаба', showShed: 'Сарай', wire: 'Каркас',
    house: 'Дом', floor: 'Пол над песком', ridge: 'Конёк', stairs: 'Лестница', door: 'Дверь', beam: 'Под балкой веранды', shedFacts: 'Сарай',
    stairsValue: (n, rise, run) => `${n} × ${rise} см, проступь ${run} см`, shedValue: '3,5 × 2,6 м · 3 ступени по 15 см',
    siding: 'Обшивка', shakes: 'Дранка пристройки', trim: 'Белые доски', deck: 'Настил', wood: 'Сваи и каркас', roof: 'Кровля', metal: 'Профлист',
    glass: 'Стекло', doorColor: 'Двери', awning: 'Ставни', shedWall: 'Сарай', shedRoof: 'Крыша сарая', rope: 'Верёвка', unit: 'Кондиционер', void: 'Дыры',
    hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Исходный вид',
    triangles: 'треугольников', meshes: 'мешей', m: 'м', deg: '°', h: 'ч',
  },
  en: {
    title: 'House by the ocean', subtitle: 'Stilt house and shed · untextured sketch · after the «By the ocean» diorama',
    color: 'Colour', clay: 'Clay', shape: 'Shape', wear: 'Wear', paint: 'Paint', light: 'Light',
    fresh: 'New', lived: 'Lived-in', derelict: 'Derelict', weather: 'Streaks and fading', damage: 'Broken boards', sag: 'Sagging',
    full: 'Overview', front: 'Front', side: 'Side', back: 'Back', porch: 'Porch', shed: 'Shed', top: 'Plan',
    houseWidth: 'House width', houseLength: 'House length', floorHeight: 'Stilt height', roofPitch: 'Roof pitch', porchDepth: 'Porch depth', seed: 'Board variant',
    rider: 'Surfer for scale', showShed: 'Shed', wire: 'Wireframe',
    house: 'House', floor: 'Floor above the sand', ridge: 'Ridge', stairs: 'Stairs', door: 'Door', beam: 'Under the porch beam', shedFacts: 'Shed',
    stairsValue: (n, rise, run) => `${n} × ${rise} cm, ${run} cm treads`, shedValue: '3.5 × 2.6 m · 3 steps of 15 cm',
    siding: 'Siding', shakes: 'Lean-to shakes', trim: 'White boards', deck: 'Decking', wood: 'Stilts and frame', roof: 'Roofing', metal: 'Corrugated iron',
    glass: 'Glass', doorColor: 'Doors', awning: 'Shutters', shedWall: 'Shed', shedRoof: 'Shed roof', rope: 'Rope', unit: 'Air conditioner', void: 'Holes',
    hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'Initial view',
    triangles: 'triangles', meshes: 'meshes', m: 'm', deg: '°', h: 'h',
  },
};
const triangleCount = (building) => [...building.parts.values()].reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0);

export default function HouseLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('shape');
  const [hidden, setHidden] = useState(document.hidden);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const setColor = (key, value) => setSettings((current) => ({ ...current, colors: { ...current.colors, [key]: value } }));

  // Rebuilt only when the shape changes, and a step behind a fast drag.
  const shapeKey = useDeferredValue(JSON.stringify(Object.fromEntries(GEOMETRY_KEYS.map((key) => [key, settings[key]]))));
  const house = useMemo(() => buildBeachHouse(JSON.parse(shapeKey)), [shapeKey]);
  const shed = useMemo(() => {
    const { seed, damage, sag } = JSON.parse(shapeKey);
    return buildBeachShed({ seed, damage, sag });
  }, [shapeKey]);
  useEffect(() => () => disposeBuilding(house), [house]);
  useEffect(() => () => disposeBuilding(shed), [shed]);
  const placeRider = useCallback((mesh) => updateRiderModel(mesh, REST_RIDER), []);
  const { plan } = house;
  const [footX, , footZ] = plan.stairs.foot;
  const clay = settings.look === 'clay';

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const range = (key, format, unit) => {
    const [min, max, step] = HOUSE_RANGES[key];
    return <LabRange key={key} label={t[key]} value={settings[key]} min={min} max={max} step={step} unit={unit} format={format} onChange={(value) => set(key, value)} />;
  };
  const metres = (value) => value.toFixed(2);
  const triangles = triangleCount(house) + (settings.shed ? triangleCount(shed) : 0);

  return (
    <LabShell
      collection="house"
      testId="house-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('house')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'front', 'side', 'back', 'porch', 'shed', 'top'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${t.ridge} ${plan.ridge.toFixed(1)} ${t.m}`}
      panel={<>
        <LabModes label={t.color} items={['color', 'clay'].map((id) => ({ id, label: t[id] }))} value={settings.look} onChange={(value) => set('look', value)} />
        <LabTabs label={t[tab]} items={['shape', 'wear', 'paint', 'light'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'shape' && <>
          {range('houseWidth', metres, t.m)}
          {range('houseLength', metres, t.m)}
          {range('floorHeight', metres, t.m)}
          {range('roofPitch', (value) => value.toFixed(0), t.deg)}
          {range('porchDepth', metres, t.m)}
          <LabRange label={t.seed} value={settings.seed} min={1} max={99} step={1} onChange={(value) => set('seed', value)} />
          <LabToggle label={t.rider} value={settings.rider} onChange={(value) => set('rider', value)} />
          <LabToggle label={t.showShed} value={settings.shed} onChange={(value) => set('shed', value)} />
          <LabToggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
          <LabFacts rows={[
            [t.house, `${plan.houseWidth.toFixed(1)} × ${plan.houseLength.toFixed(1)} ${t.m}`],
            [t.floor, `${plan.floor.toFixed(2)} ${t.m}`],
            [t.ridge, `${plan.ridge.toFixed(2)} ${t.m}`],
            [t.stairs, t.stairsValue(plan.stairs.risers, (plan.stairs.rise * 100).toFixed(1), (plan.stairs.run * 100).toFixed(0))],
            [t.door, `${plan.door.width.toFixed(2)} × ${plan.door.height.toFixed(2)} ${t.m}`],
            [t.beam, `${plan.porch.underBeam.toFixed(2)} ${t.m}`],
            [t.shedFacts, t.shedValue],
          ]} />
        </>}
        {tab === 'wear' && <>
          <LabModes label={t.wear} items={Object.keys(WEAR).map((id) => ({ id, label: t[id] }))} value={wearPreset(settings)} onChange={(id) => setSettings((current) => ({ ...current, ...WEAR[id] }))} />
          {range('weather')}
          {range('damage')}
          {range('sag')}
          <LabRange label={t.seed} value={settings.seed} min={1} max={99} step={1} onChange={(value) => set('seed', value)} />
        </>}
        {tab === 'paint' && PAINT_KEYS.map((key) => (
          <LabColor key={key} label={t[key === 'door' ? 'doorColor' : key]} value={settings.colors[key]} onChange={(value) => setColor(key, value)} />
        ))}
        {tab === 'light' && <>
          <LabRange label={t.hour} value={settings.timeOfDay} min={0} max={24} step={0.1} unit={t.h} onChange={(value) => set('timeOfDay', value)} />
          <LabRange label={t.clouds} value={settings.cloudCover} onChange={(value) => set('cloudCover', value)} />
          <LabRange label={t.exposure} value={settings.exposure} min={0.2} max={2.4} onChange={(value) => set('exposure', value)} />
          <LabRange label={t.environment} value={settings.environmentIntensity} min={0} max={2} onChange={(value) => set('environmentIntensity', value)} />
        </>}
      </>}
      transport={<button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>}
      stats={<>
        <span><b>{triangles.toLocaleString(language)}</b> {t.triangles}</span>
        <span><b>{house.parts.size + (settings.shed ? shed.parts.size : 0)}</b> {t.meshes}</span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        floorY={0} floorVisible={false} cameraFar={320} fogRange={[110, 260]}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
        shadowRadius={14}
        paused={hidden}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[600, 600]} />
          <meshStandardMaterial color="#f0eee9" roughness={0.96} />
        </mesh>
        <BeachHouseModel building={house} colors={settings.colors} clay={clay} wireframe={settings.wireframe} weather={settings.weather} seed={settings.seed} />
        {settings.shed ? (
          // Off the foot of the stairs, its steps a metre and a bit from theirs.
          <group position={[footX - 3.6, 0, footZ + 1.4]} rotation={[0, 0.12, 0]}>
            <BeachHouseModel building={shed} colors={settings.colors} clay={clay} wireframe={settings.wireframe} weather={settings.weather} seed={settings.seed + 5} />
          </group>
        ) : null}
        {settings.rider ? (
          <group position={[footX - 0.45, 0, footZ + 0.75]} rotation={[0, 0.9, 0]}>
            <RiderModel ref={placeRider} />
          </group>
        ) : null}
      </AssetStudio>
    </LabShell>
  );
}
