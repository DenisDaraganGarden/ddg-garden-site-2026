import React, { useEffect, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import SurfboardModel from '../components/surfboard/SurfboardModel';
import { createBoardBody, createBoardState, stepBoard } from '../components/surfboard/boardPhysics';
import { boardDimensions, buildBoardHull } from '../components/surfboard/boardShape';
import { SURFBOARD_RANGES, normalizeSurfboardSettings } from '../components/surfboard/settings';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

// The surfboard is built from numbers, not a file: the shape, the paint and the
// fins are the scene's own modules (components/surfboard), seeded from the
// published scene. The lab adds the stand, the views and the sliders.
const PUBLISHED = getPublishedHomeSceneSettings();
const WATER_Y = 0;
// On the stand the board hangs this high, so the fins clear the floor.
const STAND = 0.16;
// Afloat, the board rests where the scene's own physics lets an empty board
// come to rest on still water (this long of it, s): the draft and the nose-down
// trim of the board moored in the editor, not a second rule of the lab's.
const SETTLE_TIME = 5;
const stillWater = (x, z, time, out) => { out.height = WATER_Y; };
// The panel covers the right quarter of the frame, so every view aims a little
// right of the board to sit it in the open part of the studio.
const CAMERA_VIEWS = {
  full: { landscape: { position: [2.5, 1.45, 1.95], target: [0.12, 0.08, -0.12] }, portrait: { position: [3.2, 1.9, 2.7], target: [0, 0.1, 0.05] } },
  deck: { landscape: { position: [0.12, 3.05, -0.22], target: [0, 0.12, -0.22] }, portrait: { position: [0.02, 4.4, 0.12], target: [0, 0.12, 0] } },
  bottom: { landscape: { position: [0.12, -2.8, -0.22], target: [0, 0.12, -0.22] }, portrait: { position: [0.02, -4.1, 0.12], target: [0, 0.12, 0] } },
  side: { landscape: { position: [2.9, 0.16, -0.22], target: [0, 0.14, -0.22] }, portrait: { position: [4.6, 0.2, 0], target: [0, 0.14, 0] } },
  tail: { landscape: { position: [0.5, 0.03, -1.62], target: [-0.12, 0.1, -0.77] }, portrait: { position: [0.8, 0.05, -1.95], target: [0, 0.1, -0.7] } },
  rail: { landscape: { position: [0.62, 0.34, 0.45], target: [0.26, 0.14, 0.07] }, portrait: { position: [0.8, 0.42, 0.6], target: [0.22, 0.14, 0.12] } },
};
const CAMERA_LIMITS = { minDistance: 0.15, maxDistance: 12, minPolarAngle: 0.02, maxPolarAngle: Math.PI - 0.02 };
const DEFAULTS = {
  ...normalizeSurfboardSettings(PUBLISHED),
  mode: 'studio', wireframe: false,
  timeOfDay: PUBLISHED.timeOfDay, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: {
    title: 'Доска для серфинга', subtitle: 'Шортборд 5\'10" · процедурная модель · стекло, карбоновый кант, стрингер, трастер',
    studio: 'Студия', water: 'На воде', shape: 'Форма', paint: 'Покраска', light: 'Свет',
    full: 'Общий', deck: 'Палуба', bottom: 'Дно', side: 'Прогиб', tail: 'Хвост', rail: 'Кант',
    length: 'Длина', width: 'Ширина', thickness: 'Толщина', noseRocker: 'Подъём носа', tailRocker: 'Подъём хвоста', wire: 'Каркас',
    deckColor: 'Стекло палубы', railColor: 'Кант · карбон', stripeColor: 'Полосы', stringerColor: 'Стрингер', finColor: 'Плавники', stripes: 'Число полос',
    volume: 'Объём', area: 'Площадь в плане', size: 'Размер',
    hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене',
    l: 'л', m: 'м', cm: 'см', m2: 'м²', h: 'ч',
  },
  en: {
    title: 'Surfboard', subtitle: '5\'10" shortboard · procedural model · glassed deck, carbon rails, stringer, thruster',
    studio: 'Studio', water: 'Afloat', shape: 'Shape', paint: 'Paint', light: 'Light',
    full: 'Overview', deck: 'Deck', bottom: 'Bottom', side: 'Rocker', tail: 'Tail', rail: 'Rail',
    length: 'Length', width: 'Width', thickness: 'Thickness', noseRocker: 'Nose rocker', tailRocker: 'Tail rocker', wire: 'Wireframe',
    deckColor: 'Deck glass', railColor: 'Rails · carbon', stripeColor: 'Stripes', stringerColor: 'Stringer', finColor: 'Fins', stripes: 'Stripe count',
    volume: 'Volume', area: 'Plan area', size: 'Size',
    hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene',
    l: 'L', m: 'm', cm: 'cm', m2: 'm²', h: 'h',
  },
};

// 1.78 × 0.5 × 0.062 m → 5'10" × 19.7" × 2.44", the way a surfer reads a board.
function imperial({ length, width, thickness }) {
  const inches = Math.round(length / 0.0254);
  return `${Math.floor(inches / 12)}'${inches % 12}" × ${(width / 0.0254).toFixed(1)}" × ${(thickness / 0.0254).toFixed(2)}"`;
}

export default function SurfboardLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('shape');
  const [hidden, setHidden] = useState(document.hidden);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const lighting = useMemo(() => buildHomeSceneLighting({
    ...PUBLISHED, timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover,
  }), [settings.cloudCover, settings.timeOfDay]);
  const board = useMemo(() => normalizeSurfboardSettings(settings), [settings]);
  // Rebuilt only when the shape changes, not on every paint or light slider.
  const shapeKey = JSON.stringify(boardDimensions(board));
  const hull = useMemo(() => buildBoardHull(JSON.parse(shapeKey)), [shapeKey]);
  // stepBoard hands the water function its outputs reset to rest (no flow, no
  // foam, no sand), so still water only has to name its height.
  const afloatPose = useMemo(() => {
    const body = createBoardBody(hull, { boardMass: board.surfboardMass, riderMass: 0 });
    const state = createBoardState({ y: WATER_Y });
    for (let time = 0.1; time <= SETTLE_TIME + 1e-9; time += 0.1) stepBoard(state, body, null, stillWater, time, 0.1);
    return { y: state.p[1], quaternion: state.q };
  }, [board.surfboardMass, hull]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const range = (key, label, format, unit) => {
    const [min, max, step] = SURFBOARD_RANGES[key];
    return <LabRange key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} format={format} onChange={(value) => set(key, value)} />;
  };
  const centimetres = (value) => (value * 100).toFixed(1);
  const colour = (key, label) => <LabColor key={key} label={label} value={settings[key]} onChange={(value) => set(key, value)} />;
  const afloat = settings.mode === 'water' && view !== 'bottom';

  return (
    <LabShell
      collection="surfboard"
      testId="surfboard-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('surfboard')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'deck', 'bottom', 'side', 'tail', 'rail'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${hull.length.toFixed(2)} ${t.m}`}
      panel={<>
        <LabModes label={t.studio} items={['studio', 'water'].map((id) => ({ id, label: t[id] }))} value={settings.mode} onChange={(value) => set('mode', value)} />
        <LabTabs label={t[tab]} items={['shape', 'paint', 'light'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'shape' && <>
          {range('surfboardLength', t.length, (value) => value.toFixed(2), t.m)}
          {range('surfboardWidth', t.width, centimetres, t.cm)}
          {range('surfboardThickness', t.thickness, centimetres, t.cm)}
          {range('surfboardNoseRocker', t.noseRocker, centimetres, t.cm)}
          {range('surfboardTailRocker', t.tailRocker, centimetres, t.cm)}
          <LabToggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
          <LabFacts rows={[
            [t.size, imperial(hull)],
            [t.volume, `${(hull.volume * 1000).toFixed(1)} ${t.l}`],
            [t.area, `${hull.planformArea.toFixed(3)} ${t.m2}`],
          ]} />
        </>}
        {tab === 'paint' && <>
          {colour('surfboardDeckColor', t.deckColor)}
          {colour('surfboardRailColor', t.railColor)}
          {colour('surfboardStripeColor', t.stripeColor)}
          {range('surfboardStripes', t.stripes)}
          {colour('surfboardStringerColor', t.stringerColor)}
          {colour('surfboardFinColor', t.finColor)}
        </>}
        {tab === 'light' && <>
          <LabRange label={t.hour} value={settings.timeOfDay} min={0} max={24} step={0.1} unit={t.h} onChange={(value) => set('timeOfDay', value)} />
          <LabRange label={t.clouds} value={settings.cloudCover} onChange={(value) => set('cloudCover', value)} />
          <LabRange label={t.exposure} value={settings.exposure} min={0.2} max={2.4} onChange={(value) => set('exposure', value)} />
          <LabRange label={t.environment} value={settings.environmentIntensity} min={0} max={2} onChange={(value) => set('environmentIntensity', value)} />
        </>}
      </>}
      transport={<button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>}
      stats={<>
        <span><b>{(hull.volume * 1000).toFixed(1)}</b> {t.l}</span>
        <span><b>{imperial(hull)}</b></span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        waterReflection={afloat} waterY={WATER_Y} floorY={WATER_Y}
        floorVisible={view !== 'bottom'}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
        shadowRadius={3}
        paused={hidden}
      >
        <group
          position={[0, settings.mode === 'water' ? afloatPose.y : WATER_Y + STAND, 0]}
          quaternion={settings.mode === 'water' ? afloatPose.quaternion : [0, 0, 0, 1]}
        >
          <SurfboardModel settings={board} lighting={lighting} wireframe={settings.wireframe} />
        </group>
      </AssetStudio>
    </LabShell>
  );
}
