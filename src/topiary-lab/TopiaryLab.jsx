import React, { Suspense, useEffect, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabRange, LabSelect, LabTabs } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import TopiaryObjects from '../topiary/TopiaryObjects.jsx';
import { normalizeTopiaryObject, TOPIARY_DEFAULT, TOPIARY_RANGES } from '../topiary/settings.js';

// The clipped hedge of the editor's brush (src/topiary), one shape at a time on
// the white floor: the same renderer, geometry and thuja maps as the scene. The
// brush itself stays in the editor; here the stroke is one of a few fixed paths.
const PUBLISHED = getPublishedHomeSceneSettings();
const SHAPES = {
  line: [[-6, 0], [6, 0]],
  wave: Array.from({ length: 13 }, (_, i) => [i - 6, Math.sin((i - 6) * .7) * 1.2]),
  ring: Array.from({ length: 25 }, (_, i) => [Math.cos(i / 24 * Math.PI * 2) * 3, Math.sin(i / 24 * Math.PI * 2) * 3]),
  corner: [[-5, 0], [0, 0], [0, 5]],
};
const VIEWS = {
  full: { landscape: { position: [-9, 5, 13], target: [0, 1, 0] }, portrait: { position: [-14, 9, 20], target: [0, 1, 0] } },
  close: { landscape: { position: [2.2, 1.5, 3.4], target: [0, 1.1, 0] }, portrait: { position: [2.8, 2, 4.6], target: [0, 1.1, 0] } },
  side: { landscape: { position: [12, 1.6, 0], target: [0, 1, 0] }, portrait: { position: [18, 2.4, 0], target: [0, 1, 0] } },
  top: { landscape: { position: [0, 18, .1], target: [0, 0, 0] }, portrait: { position: [0, 26, .1], target: [0, 0, 0] } },
};
const LIMITS = { minDistance: .4, maxDistance: 60, minPolarAngle: .04, maxPolarAngle: Math.PI / 2 - .02 };
const DEFAULTS = {
  shape: 'line', seed: 17,
  width: TOPIARY_DEFAULT.width, height: TOPIARY_DEFAULT.height, roundness: TOPIARY_DEFAULT.roundness, leafSize: TOPIARY_DEFAULT.leafSize,
  density: TOPIARY_DEFAULT.density, roughness: TOPIARY_DEFAULT.roughness, translucency: TOPIARY_DEFAULT.translucency,
  exposure: 1.04, environmentIntensity: PUBLISHED.envReflectionIntensity ? PUBLISHED.envReflectionIntensity / 100 : .84,
};
const TEXT = {
  ru: {
    title: 'Стриженые формы', subtitle: 'Стриженая изгородь кисти редактора · геометрия, хвоя и материал сцены',
    shape: 'Форма', foliage: 'Хвоя', light: 'Свет', full: 'Обзор', close: 'Вблизи', side: 'Сбоку', top: 'Сверху',
    line: 'Прямая', wave: 'Волна', ring: 'Кольцо', corner: 'Угол', kind: 'Мазок', seed: 'Вариант',
    width: 'Толщина', height: 'Высота', roundness: 'Скругление', leafSize: 'Размер веточки',
    density: 'Плотность хвои', roughness: 'Шероховатость', translucency: 'Просвечивание',
    exposure: 'Экспозиция', environment: 'Окружение', reset: 'Сбросить', metres: 'м', points: 'точек', long: 'длина',
  },
  en: {
    title: 'Topiary', subtitle: 'The editor brush\'s clipped hedge · scene geometry, foliage and material',
    shape: 'Shape', foliage: 'Foliage', light: 'Light', full: 'Overview', close: 'Close', side: 'Side', top: 'Top',
    line: 'Straight', wave: 'Wave', ring: 'Ring', corner: 'Corner', kind: 'Stroke', seed: 'Variant',
    width: 'Width', height: 'Height', roundness: 'Roundness', leafSize: 'Sprig size',
    density: 'Foliage density', roughness: 'Roughness', translucency: 'Translucency',
    exposure: 'Exposure', environment: 'Environment', reset: 'Reset', metres: 'm', points: 'points', long: 'length',
  },
};
const strokeLength = (points) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

export default function TopiaryLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('shape');
  const [hidden, setHidden] = useState(document.hidden);
  const [lowPower] = useState(() => window.matchMedia('(max-width: 820px)').matches || window.matchMedia('(pointer: coarse)').matches);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const points = SHAPES[settings.shape];
  const object = useMemo(() => normalizeTopiaryObject({
    ...TOPIARY_DEFAULT, id: 'lab-hedge', name: 'Lab', points, seed: settings.seed,
    width: settings.width, height: settings.height, roundness: settings.roundness, leafSize: settings.leafSize,
    density: settings.density, roughness: settings.roughness, translucency: settings.translucency,
  }), [points, settings.seed, settings.width, settings.height, settings.roundness, settings.leafSize, settings.density, settings.roughness, settings.translucency]);
  const objects = useMemo(() => [object], [object]);
  const qualityProfile = useMemo(() => ({ isLowPower: lowPower }), [lowPower]);
  const range = (key, label, unit = '') => <LabRange key={key} label={label} value={settings[key]} min={TOPIARY_RANGES[key][0]} max={TOPIARY_RANGES[key][1]} step={TOPIARY_RANGES[key][2]} unit={unit} onChange={(value) => set(key, value)} />;
  return (
    <LabShell
      collection="topiary"
      testId="topiary-lab"
      eyebrow={`DDG / ASSET LAB / ${assetIndex('topiary')}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'close', 'side', 'top'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`${settings.height.toFixed(1)} ${t.metres}`}
      panel={<>
        <LabTabs label={t[tab]} items={['shape', 'foliage', 'light'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'shape' && <>
          <LabSelect label={t.kind} value={settings.shape} onChange={(value) => set('shape', value)} options={Object.keys(SHAPES).map((id) => ({ value: id, label: t[id] }))} />
          <LabRange label={t.seed} value={settings.seed} min={1} max={999} step={1} onChange={(value) => set('seed', value)} />
          {range('width', t.width, t.metres)}{range('height', t.height, t.metres)}
          {range('roundness', t.roundness)}{range('leafSize', t.leafSize, t.metres)}
        </>}
        {tab === 'foliage' && <>{range('density', t.density)}{range('roughness', t.roughness)}{range('translucency', t.translucency)}</>}
        {tab === 'light' && <>
          <LabRange label={t.exposure} value={settings.exposure} min={.2} max={2.4} step={.01} onChange={(value) => set('exposure', value)} />
          <LabRange label={t.environment} value={settings.environmentIntensity} min={0} max={2} step={.01} onChange={(value) => set('environmentIntensity', value)} />
        </>}
      </>}
      transport={<button type="button" onClick={() => { setSettings(DEFAULTS); setView('full'); }}>{t.reset}</button>}
      stats={<>
        <span><b>{points.length}</b> {t.points}</span>
        <span><b>{strokeLength(points).toFixed(1)}</b> {t.metres} {t.long}</span>
      </>}
    >
      <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} floorY={0} floorVisible={false} cameraFar={120} fogRange={[70, 110]} shadowRadius={view === 'close' ? 3 : 6} exposure={settings.exposure} environmentIntensity={settings.environmentIntensity} paused={hidden}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#f0eee9" roughness={.96} /></mesh>
        <Suspense fallback={null}><TopiaryObjects objects={objects} qualityProfile={qualityProfile} envMapIntensity={settings.environmentIntensity} /></Suspense>
      </AssetStudio>
    </LabShell>
  );
}
