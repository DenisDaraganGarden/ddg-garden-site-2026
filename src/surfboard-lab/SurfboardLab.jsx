import React, { useEffect, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import SurfboardModel from '../components/surfboard/SurfboardModel';
import LabRider from './LabRider';
import { proneTuning, setProneTuning } from '../components/surfboard/riderPose';
import { PRONE_FACTORY } from '../components/surfboard/proneTuning';
import { createBoardBody, createBoardState, stepBoard } from '../components/surfboard/boardPhysics';
import { boardDimensions, buildBoardHull } from '../components/surfboard/boardShape';
import { SURFBOARD_CHOICES, SURFBOARD_RANGES, normalizeSurfboardSettings } from '../components/surfboard/settings';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

// The surfboard is built from numbers, not a file: the shape, the paint and the
// fins are the scene's own modules (components/surfboard), seeded from the
// published scene. The lab adds the stand, the views and the sliders.
const PUBLISHED = getPublishedHomeSceneSettings();
const WATER_Y = 0;
// On the stand the board hangs this high, so the fins clear the floor.
const STAND = 0.16;
// With the rider the floor is this far under the water line he floats on.
const RIDER_FLOOR = -1.2;
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
  // With the rider: all of him, standing too; his face; from abeam.
  rider: { landscape: { position: [3.3, 2.0, 3.5], target: [0.25, 0.8, 0] }, portrait: { position: [4.4, 2.6, 4.7], target: [0, 0.85, 0] } },
  face: { landscape: { position: [0.55, 0.85, 2.7], target: [0.12, 0.55, 0.2] }, portrait: { position: [0.6, 1.0, 3.6], target: [0, 0.55, 0.2] } },
  abeam: { landscape: { position: [3.6, 1.05, 0.05], target: [0.2, 0.6, 0] }, portrait: { position: [4.8, 1.3, 0.05], target: [0, 0.6, 0] } },
};
const BOARD_VIEWS = ['full', 'deck', 'bottom', 'side', 'tail', 'rail'];
const RIDER_VIEWS = ['rider', 'face', 'abeam', 'deck', 'tail'];
const CAMERA_LIMITS = { minDistance: 0.15, maxDistance: 12, minPolarAngle: 0.02, maxPolarAngle: Math.PI - 0.02 };
const DEFAULTS = {
  ...normalizeSurfboardSettings(PUBLISHED),
  mode: 'studio', wireframe: false,
  // The rider: what he does, how he shows, and time (1 as it runs).
  pose: 'prone', pace: 1,
  timeOfDay: PUBLISHED.timeOfDay, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7,
};
const TEXT = {
  ru: {
    title: 'Доска для серфинга', subtitle: 'Шортборд 5\'10" · процедурная модель · стекло, карбоновый кант, стрингер, трастер',
    studio: 'Студия', water: 'На воде', rider: 'С райдером', shape: 'Форма', paint: 'Покраска', light: 'Свет',
    full: 'Общий', deck: 'Палуба', bottom: 'Дно', side: 'Прогиб', tail: 'Хвост', rail: 'Кант', face: 'Лицо', abeam: 'Сбоку',
    prone: 'Лежит', paddle: 'Гребёт', stand: 'Стоит', swim: 'В воду', human: 'Человек', skeleton: 'Скелет', both: 'Человек и скелет',
    doing: 'Что делает', look: 'Вид', pace: 'Скорость времени', now: 'Сейчас',
    states: { prone: 'лежит', popup: 'встаёт', stand: 'стоит', liedown: 'ложится', fallen: 'падает', swim: 'плывёт', recover: 'забирается' },
    editPose: 'Править позу лёжа', part: 'Часть', how: 'Как', howText: 'точка на теле — выбрать, стрелки — тянуть',
    save: 'Сохранить позу', factory: 'Сбросить позу', saved: 'Сохранено — в игре так же', restart: 'Перезапустите приложение: сохранение появится после перезапуска', failed: 'Не сохранилось',
    parts: { pelvis: 'таз', chest: 'грудь', head: 'голова', handL: 'левая кисть', handR: 'правая кисть', elbowL: 'левый локоть', elbowR: 'правый локоть', kneeL: 'левое колено', kneeR: 'правое колено', footL: 'левая стопа', footR: 'правая стопа' },
    length: 'Длина', width: 'Ширина', thickness: 'Толщина', noseRocker: 'Подъём носа', tailRocker: 'Подъём хвоста', wire: 'Каркас',
    deckColor: 'Стекло палубы', railColor: 'Кант · карбон', stripeColor: 'Полосы', stringerColor: 'Стрингер', finColor: 'Плавники', stripes: 'Число полос',
    volume: 'Объём', area: 'Площадь в плане', size: 'Размер',
    hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене',
    l: 'л', m: 'м', cm: 'см', m2: 'м²', h: 'ч',
  },
  en: {
    title: 'Surfboard', subtitle: '5\'10" shortboard · procedural model · glassed deck, carbon rails, stringer, thruster',
    studio: 'Studio', water: 'Afloat', rider: 'With rider', shape: 'Shape', paint: 'Paint', light: 'Light',
    full: 'Overview', deck: 'Deck', bottom: 'Bottom', side: 'Rocker', tail: 'Tail', rail: 'Rail', face: 'Face', abeam: 'Abeam',
    prone: 'Lying', paddle: 'Paddling', stand: 'Riding', swim: 'Into the water', human: 'Human', skeleton: 'Skeleton', both: 'Human and skeleton',
    doing: 'What he does', look: 'Look', pace: 'Time', now: 'Now',
    states: { prone: 'lying', popup: 'getting up', stand: 'riding', liedown: 'lying down', fallen: 'falling', swim: 'swimming', recover: 'climbing on' },
    editPose: 'Edit the lying pose', part: 'Part', how: 'How', howText: 'a point on him — pick, the arrows — drag',
    save: 'Save the pose', factory: 'Reset the pose', saved: 'Saved — the game has it too', restart: 'Restart the app: saving arrives with the restart', failed: 'Not saved',
    parts: { pelvis: 'pelvis', chest: 'chest', head: 'head', handL: 'left hand', handR: 'right hand', elbowL: 'left elbow', elbowR: 'right elbow', kneeL: 'left knee', kneeR: 'right knee', footL: 'left foot', footR: 'right foot' },
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
  const [riderState, setRiderState] = useState('prone');
  // The lying pose's corrections (riderPose holds the live ones for the
  // physics; this is the panel's copy), the part the arrows are on, and how
  // the last save went.
  const [editing, setEditing] = useState(false);
  const [tuning, setTuning] = useState(proneTuning);
  const [part, setPart] = useState('handL');
  const [saved, setSaved] = useState(null);
  const retune = (next) => { setProneTuning(next); setTuning(next); setSaved(null); };
  const savePose = async () => {
    try {
      const response = await fetch('/__rider-pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prone: tuning }) });
      setSaved(response.ok ? 'saved' : response.status === 404 ? 'restart' : 'failed');
    } catch {
      setSaved('failed');
    }
  };
  const [hidden, setHidden] = useState(document.hidden);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const lighting = useMemo(() => buildHomeSceneLighting({
    ...PUBLISHED, timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover,
  }), [settings.cloudCover, settings.timeOfDay]);
  const board = useMemo(() => normalizeSurfboardSettings(settings), [settings]);
  // Rebuilt only when the shape changes, not on every paint or light slider.
  const shapeKey = JSON.stringify(boardDimensions(board));
  const dims = useMemo(() => JSON.parse(shapeKey), [shapeKey]);
  const hull = useMemo(() => buildBoardHull(dims), [dims]);
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
  // With the rider the water is not drawn: the mirror would hide all of him
  // under it (the physics still floats him on y = 0); the floor sinks below
  // where he swims.
  const riding = settings.mode === 'rider';
  const afloat = settings.mode === 'water' && view !== 'bottom';
  const views = riding ? RIDER_VIEWS : BOARD_VIEWS;
  const tabs = riding ? ['rider', 'shape', 'paint', 'light'] : ['shape', 'paint', 'light'];
  const setMode = (mode) => {
    set('mode', mode);
    if (mode !== 'rider') setEditing(false);
    // The rider's views frame a standing man; the board's, the board.
    if (mode === 'rider') { setView('rider'); setTab('rider'); } else {
      if (!BOARD_VIEWS.includes(view)) setView('full');
      if (tab === 'rider') setTab('shape');
    }
  };

  return (
    <LabShell
      collection="surfboard"
      testId="surfboard-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('surfboard')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={views.map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${hull.length.toFixed(2)} ${t.m}`}
      panel={<>
        <LabModes label={t.studio} items={['studio', 'water', 'rider'].map((id) => ({ id, label: t[id] }))} value={settings.mode} onChange={setMode} />
        <LabTabs label={t[tab]} items={tabs.map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'rider' && <>
          <LabModes label={t.doing} items={['prone', 'paddle', 'stand', 'swim'].map((id) => ({ id, label: t[id] }))} value={settings.pose} onChange={(value) => set('pose', value)} />
          <LabModes label={t.look} items={SURFBOARD_CHOICES.surfboardRiderLook.map((id) => ({ id, label: t[id] }))} value={settings.surfboardRiderLook} onChange={(value) => set('surfboardRiderLook', value)} />
          <LabRange label={t.pace} value={settings.pace} min={0.05} max={1} step={0.05} onChange={(value) => set('pace', value)} />
          <LabFacts rows={[[t.now, t.states[riderState] ?? riderState]]} />
          <LabToggle label={t.editPose} value={editing} onChange={(value) => { setEditing(value); if (value) set('pose', 'prone'); }} />
          {editing && <LabFacts rows={[
            [t.part, t.parts[part]],
            [t.how, t.howText],
            ...(saved ? [['', t[saved]]] : []),
          ]} />}
        </>}
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
      transport={editing ? <>
        <button type="button" onClick={savePose}>{t.save}</button>
        <button type="button" onClick={() => retune(PRONE_FACTORY)}>{t.factory}</button>
      </> : <button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); setTab('shape'); setEditing(false); }}>{t.reset}</button>}
      stats={<>
        <span><b>{(hull.volume * 1000).toFixed(1)}</b> {t.l}</span>
        <span><b>{imperial(hull)}</b></span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        waterReflection={afloat} waterY={WATER_Y} floorY={riding ? RIDER_FLOOR : WATER_Y}
        floorVisible={view !== 'bottom'}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
        shadowRadius={3}
        paused={hidden}
      >
        {riding ? (
          <LabRider
            hull={hull} dims={dims} board={board} lighting={lighting}
            pose={settings.pose} look={board.surfboardRiderLook} pace={settings.pace} wireframe={settings.wireframe}
            onState={setRiderState} onClimbed={() => set('pose', 'prone')}
            editing={editing} tuning={tuning} part={part} onPart={setPart} onTuning={retune}
          />
        ) : (
          <group
            position={[0, settings.mode === 'water' ? afloatPose.y : WATER_Y + STAND, 0]}
            quaternion={settings.mode === 'water' ? afloatPose.quaternion : [0, 0, 0, 1]}
          >
            <SurfboardModel settings={board} lighting={lighting} wireframe={settings.wireframe} />
          </group>
        )}
      </AssetStudio>
    </LabShell>
  );
}
