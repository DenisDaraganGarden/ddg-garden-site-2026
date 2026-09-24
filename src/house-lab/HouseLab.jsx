import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import { useLabLightMode } from '../asset-lab/labLighting';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { BeachHouseView } from '../components/house/BeachHouseScene';
import { useBeachHouse } from '../components/house/useBeachHouse';
import { CAMP_PAINT, HOUSE_PAINT, HOUSE_SETTING_RANGES, normalizeHouseSettings } from '../components/house/settings';
import RiderModel from '../components/surfboard/RiderModel';
import { updateRiderModel } from '../components/surfboard/riderMesh';
import { createRiderRagdoll } from '../components/surfboard/riderSkeleton';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

// Bikini Point — the beach house, its shed and the surfers' things — is
// built from numbers (components/house), like the surfboard, and is one
// object of the scene: the lab starts from the published scene's settings for
// it (settings.js) and draws it with the scene's own component
// (BeachHouseScene.jsx), set at the origin. The surfer stands at the foot of
// the stairs for scale: the rider's own balsa model in its rest pose, 1.74 m.
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
  lounge: aim([4.2, 2.3, 3], [0.9, 0.25, 0.45], 8, 0.6),
  shed: aim([-8.6, 1.6, 7.4], [0.66, 0.34, 0.67], 12, 1.1),
  beach: aim([-3.3, 1.2, 8.6], [0.3, 0.22, 1], 7.5, 0.8),
  top: aim([-2.6, 0, 2.2], [0, 1, 0.001], 48, 3.5),
};
const VIEW_ORDER = ['full', 'front', 'side', 'back', 'porch', 'lounge', 'shed', 'beach', 'top'];
const CAMERA_LIMITS = { minDistance: 1.2, maxDistance: 160, minPolarAngle: 0.02, maxPolarAngle: Math.PI / 2 - 0.02 };
const WEAR = {
  fresh: { houseWeather: 0, houseDamage: 0, houseSag: 0 },
  lived: { houseWeather: 0.35, houseDamage: 0.15, houseSag: 0.2 },
  derelict: { houseWeather: 0.9, houseDamage: 0.8, houseSag: 0.75 },
};
const WEAR_KEYS = Object.keys(WEAR.fresh);
// Quick times for the lights: late morning, just after sunset, deep night.
const DAYTIMES = { day: 11.5, dusk: 20.3, deep: 23.2 };
const wearPreset = (settings) => Object.keys(WEAR).find((id) => WEAR_KEYS.every((key) => WEAR[id][key] === settings[key])) ?? null;
const DEFAULTS = {
  ...normalizeHouseSettings(PUBLISHED), houseX: 0, houseZ: 0, houseHeading: 0,
  look: 'color', rider: true, wireframe: false,
  // Late morning: the sun comes from the front left, as in the diorama's
  // photos, where the published scene's early sun leaves the porch in shade.
  timeOfDay: 11.5, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: {
    title: 'Bikini Point', subtitle: 'Дом на сваях и сарай · процедурные текстуры и износ · по диораме «By the ocean»',
    color: 'Цвет', clay: 'Макет', shape: 'Форма', wear: 'Износ', paint: 'Краски', light: 'Свет', things: 'Вещи',
    fresh: 'Новый', lived: 'Жилой', derelict: 'Заброшенный', houseWeather: 'Подтёки и выцветание', houseDamage: 'Сломанные доски', houseSag: 'Проседание',
    full: 'Общий', front: 'Фасад', side: 'Сбоку', back: 'Сзади', porch: 'Веранда', lounge: 'Гамак', shed: 'Сарай', beach: 'Пляж', top: 'План',
    houseWidth: 'Ширина дома', houseLength: 'Длина дома', houseFloorHeight: 'Высота свай', houseRoofPitch: 'Уклон крыши', housePorchDepth: 'Глубина веранды', houseSeed: 'Вариант досок',
    rider: 'Серфер для масштаба', houseShed: 'Сарай', wire: 'Каркас',
    house: 'Дом', floor: 'Пол над песком', ridge: 'Конёк', stairs: 'Лестница', door: 'Дверь', beam: 'Под балкой веранды', shedFacts: 'Сарай',
    stairsValue: (n, rise, run) => `${n} × ${rise} см, проступь ${run} см`, shedValue: '3,5 × 2,6 м · 3 ступени по 15 см',
    siding: 'Обшивка', shakes: 'Дранка пристройки', trim: 'Белые доски', deck: 'Настил', wood: 'Сваи и каркас', roof: 'Кровля', metal: 'Профлист',
    glass: 'Стекло', door_: 'Двери', awning: 'Ставни', shedWall: 'Сарай', shedRoof: 'Крыша сарая', rope: 'Верёвка', unit: 'Кондиционер', void: 'Дыры', lamp: 'Фонари',
    hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Исходный вид',
    daytime: 'Время', day: 'День', dusk: 'Сумерки', deep: 'Ночь', houseLamps: 'Лампы в доме', houseGarlands: 'Гирлянды',
    houseCamp: 'Вещи серферов', houseCampSeed: 'Раскладка', houseCampWind: 'Ветер', houseCampHue: 'Оттенок вещей', houseCampFade: 'Выгорание на солнце',
    chairs: 'Шезлонги', hammock: 'Гамак', curtain: 'Занавеска', flags: 'Флажки', machine: 'Автомат', machineSide: 'Бок автомата',
    triangles: 'треугольников', far: 'вдали', meshes: 'мешей', m: 'м', deg: '°', h: 'ч',
  },
  en: {
    title: 'Bikini Point', subtitle: 'Stilt house and shed · procedural textures and wear · after the «By the ocean» diorama',
    color: 'Colour', clay: 'Clay', shape: 'Shape', wear: 'Wear', paint: 'Paint', light: 'Light', things: 'Things',
    fresh: 'New', lived: 'Lived-in', derelict: 'Derelict', houseWeather: 'Streaks and fading', houseDamage: 'Broken boards', houseSag: 'Sagging',
    full: 'Overview', front: 'Front', side: 'Side', back: 'Back', porch: 'Porch', lounge: 'Hammock', shed: 'Shed', beach: 'Beach', top: 'Plan',
    houseWidth: 'House width', houseLength: 'House length', houseFloorHeight: 'Stilt height', houseRoofPitch: 'Roof pitch', housePorchDepth: 'Porch depth', houseSeed: 'Board variant',
    rider: 'Surfer for scale', houseShed: 'Shed', wire: 'Wireframe',
    house: 'House', floor: 'Floor above the sand', ridge: 'Ridge', stairs: 'Stairs', door: 'Door', beam: 'Under the porch beam', shedFacts: 'Shed',
    stairsValue: (n, rise, run) => `${n} × ${rise} cm, ${run} cm treads`, shedValue: '3.5 × 2.6 m · 3 steps of 15 cm',
    siding: 'Siding', shakes: 'Lean-to shakes', trim: 'White boards', deck: 'Decking', wood: 'Stilts and frame', roof: 'Roofing', metal: 'Corrugated iron',
    glass: 'Glass', door_: 'Doors', awning: 'Shutters', shedWall: 'Shed', shedRoof: 'Shed roof', rope: 'Rope', unit: 'Air conditioner', void: 'Holes', lamp: 'Lanterns',
    hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'Initial view',
    daytime: 'Time', day: 'Day', dusk: 'Dusk', deep: 'Night', houseLamps: 'House lamps', houseGarlands: 'String lights',
    houseCamp: 'Surfers’ things', houseCampSeed: 'Arrangement', houseCampWind: 'Wind', houseCampHue: 'Hue of the things', houseCampFade: 'Sun fading',
    chairs: 'Deck chairs', hammock: 'Hammock', curtain: 'Curtain', flags: 'Flags', machine: 'Drinks machine', machineSide: 'Machine side',
    triangles: 'triangles', far: 'far off', meshes: 'meshes', m: 'm', deg: '°', h: 'h',
  },
};
const triangleCount = (parts) => [...(parts?.values() ?? [])].reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0);

export default function HouseLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('shape');
  const [hidden, setHidden] = useState(document.hidden);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const built = useBeachHouse(settings);
  const { house, shed } = built, { plan } = house;
  const placeRider = useCallback((mesh) => updateRiderModel(mesh, REST_RIDER), []);
  const [footX, , footZ] = plan.stairs.foot;
  const clay = settings.look === 'clay';
  // How dark it is under the scene's sky at this hour; the studio is day.
  const lightMode = useLabLightMode();
  const night = useMemo(() => (lightMode === 'scene' ? buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }).sky.night : 0), [lightMode, settings.cloudCover, settings.timeOfDay]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const range = (key, format, unit) => {
    const [min, max, step] = HOUSE_SETTING_RANGES[key];
    return <LabRange key={key} label={t[key]} value={settings[key]} min={min} max={max} step={step} unit={unit} format={format} onChange={(value) => set(key, value)} />;
  };
  const metres = (value) => value.toFixed(2);
  const withShed = (count) => count(house) + (settings.houseShed ? count(shed) : 0);
  const triangles = withShed((building) => triangleCount(building.parts)), farTriangles = withShed((building) => triangleCount(building.far));

  return (
    <LabShell
      collection="house"
      testId="house-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('house')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={VIEW_ORDER.map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${t.ridge} ${plan.ridge.toFixed(1)} ${t.m}`}
      panel={<>
        <LabModes label={t.color} items={['color', 'clay'].map((id) => ({ id, label: t[id] }))} value={settings.look} onChange={(value) => set('look', value)} />
        <LabTabs label={t[tab]} items={['shape', 'wear', 'paint', 'light', 'things'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'shape' && <>
          {range('houseWidth', metres, t.m)}
          {range('houseLength', metres, t.m)}
          {range('houseFloorHeight', metres, t.m)}
          {range('houseRoofPitch', (value) => value.toFixed(0), t.deg)}
          {range('housePorchDepth', metres, t.m)}
          {range('houseSeed')}
          <LabToggle label={t.rider} value={settings.rider} onChange={(value) => set('rider', value)} />
          <LabToggle label={t.houseShed} value={settings.houseShed} onChange={(value) => set('houseShed', value)} />
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
          {range('houseWeather')}
          {range('houseDamage')}
          {range('houseSag')}
          {range('houseSeed')}
        </>}
        {tab === 'paint' && Object.entries(HOUSE_PAINT).map(([key, role]) => (
          <LabColor key={key} label={t[role === 'door' ? 'door_' : role]} value={settings[key]} onChange={(value) => set(key, value)} />
        ))}
        {tab === 'light' && <>
          <LabModes label={t.daytime} items={Object.keys(DAYTIMES).map((id) => ({ id, label: t[id] }))} value={Object.keys(DAYTIMES).find((id) => DAYTIMES[id] === settings.timeOfDay) ?? null} onChange={(id) => set('timeOfDay', DAYTIMES[id])} />
          {range('houseLamps')}
          {range('houseGarlands')}
          <LabRange label={t.hour} value={settings.timeOfDay} min={0} max={24} step={0.1} unit={t.h} onChange={(value) => set('timeOfDay', value)} />
          <LabRange label={t.clouds} value={settings.cloudCover} onChange={(value) => set('cloudCover', value)} />
          <LabRange label={t.exposure} value={settings.exposure} min={0.2} max={2.4} onChange={(value) => set('exposure', value)} />
          <LabRange label={t.environment} value={settings.environmentIntensity} min={0} max={2} onChange={(value) => set('environmentIntensity', value)} />
        </>}
        {tab === 'things' && <>
          <LabToggle label={t.houseCamp} value={settings.houseCamp} onChange={(value) => set('houseCamp', value)} />
          {range('houseCampSeed')}
          {range('houseCampWind')}
          {range('houseCampHue', (value) => value.toFixed(0), t.deg)}
          {range('houseCampFade')}
          {Object.entries(CAMP_PAINT).map(([key, thing]) => (
            <LabColor key={key} label={t[thing]} value={settings[key]} onChange={(value) => set(key, value)} />
          ))}
        </>}
      </>}
      transport={<button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>}
      stats={<>
        <span><b>{triangles.toLocaleString(language)}</b> {t.triangles}</span>
        <span><b>{farTriangles.toLocaleString(language)}</b> {t.far}</span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        floorY={0} floorVisible={false} cameraFar={420} fogRange={[140, 380]}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
        shadowRadius={14}
        paused={hidden}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[800, 800]} />
          <meshStandardMaterial color="#f0eee9" roughness={0.96} />
        </mesh>
        <BeachHouseView settings={settings} built={built} night={night} clay={clay} wireframe={settings.wireframe} />
        {settings.rider ? (
          <group position={[footX - 0.45, 0, footZ + 0.75]} rotation={[0, 0.9, 0]}>
            <RiderModel ref={placeRider} />
          </group>
        ) : null}
      </AssetStudio>
    </LabShell>
  );
}
