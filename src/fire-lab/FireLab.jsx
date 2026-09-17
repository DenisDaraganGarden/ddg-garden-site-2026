import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { useLabLightMode } from '../asset-lab/labLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import FireTrail from '../fire/FireTrail.jsx';
import { FIRE_RANGES, normalizeFireSettings } from '../fire/settings.js';

// Коллекция 15. Огонь показывается продуктовым модулем FireTrail на плоском
// песке; ползунки — те же ключи, что в редакторе, старт — опубликованная
// сцена. Свет — свет сцены в выбранный час; ночь — отдельным выключателем,
// потому что ночью этот огонь и задуман.
const PUBLISHED = getPublishedHomeSceneSettings();
const flat = () => 0;
const CAMERA_VIEWS = {
  full: { landscape: { position: [26, 11, 30], target: [0, 0.6, 0] }, portrait: { position: [34, 16, 40], target: [0, 0.6, 0] } },
  low: { landscape: { position: [9, 1.3, 14], target: [0, 0.7, -2] }, portrait: { position: [12, 1.8, 20], target: [0, 0.7, -2] } },
  along: { landscape: { position: [1.5, 1.6, -34], target: [0, 0.8, 0] }, portrait: { position: [2, 2.2, -42], target: [0, 0.8, 0] } },
  top: { landscape: { position: [0.5, 42, 6], target: [0, 0, 0] }, portrait: { position: [0.5, 56, 6], target: [0, 0, 0] } },
};
const CAMERA_LIMITS = { minDistance: 1.5, maxDistance: 120, minPolarAngle: 0.05, maxPolarAngle: Math.PI / 2 - 0.02 };
const TEXT = {
  ru: {
    title: 'Огонь по следу', subtitle: 'горючее по колее · фронт бежит по сплайну · пламя, дым, свет, копоть',
    full: 'Общий', low: 'С песка', along: 'Вдоль следа', top: 'Сверху',
    front: 'Фронт', flames: 'Пламя', smoke: 'Дым', ground: 'Земля', light: 'Свет',
    delay: 'Задержка поджига', speed: 'Скорость фронта', burn: 'Время горения места', loop: 'Повторять', pause: 'Пауза перед повтором',
    width: 'Ширина колеи', height: 'Высота', intensity: 'Яркость', turbulence: 'Турбулентность', hot: 'Цвет ядра', cool: 'Цвет языков',
    smokeOn: 'Дым', amount: 'Количество', rise: 'Подъём', life: 'Жизнь', size: 'Размер клуба', windShare: 'Доля ветра', opacity: 'Плотность', smokeColor: 'Цвет',
    lightOn: 'Свет от огня', lightIntensity: 'Сила света', lightDistance: 'Дальность света',
    track: 'Колея и копоть', dark: 'Темнота следа', soot: 'Копоть сходит за',
    night: 'Как ночью', hour: 'Время суток', clouds: 'Облачность', wind: 'Ветер', exposure: 'Экспозиция',
    presets: 'Пресеты', fuel: 'Фуел', slow: 'Медленно', steady: 'Весь след', play: 'Продолжить', pauseBtn: 'Пауза', reset: 'Сначала',
    stats: { front: 'фронт', tail: 'хвост', flames: 'языков', smoke: 'клубов', length: 'длина' },
    hint: 'Точки следа задаются в редакторе: ручка в сцене на каждой точке.',
  },
  en: {
    title: 'Fire along a trail', subtitle: 'fuel on a tyre track · the front runs along a spline · flames, smoke, light, soot',
    full: 'Overview', low: 'From the sand', along: 'Along the trail', top: 'From above',
    front: 'Front', flames: 'Flames', smoke: 'Smoke', ground: 'Ground', light: 'Light',
    delay: 'Ignition delay', speed: 'Front speed', burn: 'Burn time per spot', loop: 'Repeat', pause: 'Pause before repeat',
    width: 'Track width', height: 'Height', intensity: 'Brightness', turbulence: 'Turbulence', hot: 'Core colour', cool: 'Tongue colour',
    smokeOn: 'Smoke', amount: 'Amount', rise: 'Rise', life: 'Lifetime', size: 'Puff size', windShare: 'Wind share', opacity: 'Density', smokeColor: 'Colour',
    lightOn: 'Light from the fire', lightIntensity: 'Intensity', lightDistance: 'Reach',
    track: 'Track and soot', dark: 'Track darkness', soot: 'Soot fades in',
    night: 'As at night', hour: 'Time of day', clouds: 'Cloud cover', wind: 'Wind', exposure: 'Exposure',
    presets: 'Presets', fuel: 'Fuel', slow: 'Slow', steady: 'Whole trail', play: 'Resume', pauseBtn: 'Pause', reset: 'Restart',
    stats: { front: 'front', tail: 'tail', flames: 'tongues', smoke: 'puffs', length: 'length' },
    hint: 'Trail points are authored in the editor: a handle in the scene on every point.',
  },
};
const PRESETS = {
  fuel: { fireSpeed: 12, fireBurn: 9, fireHeight: 1.6, fireIntensity: 1.3, fireSmokeAmount: 1.4, fireSmokeLife: 10, previewNight: true },
  slow: { fireSpeed: 2, fireBurn: 6, fireHeight: 1.1, fireIntensity: 1, fireSmokeAmount: 1, fireSmokeLife: 8 },
  steady: { fireSpeed: 40, fireBurn: 0, fireHeight: 1.3, fireIntensity: 1 },
};
const fireDefaults = () => ({ ...normalizeFireSettings(PUBLISHED), fireEnabled: true, fireX: 0, fireZ: 0, fireYaw: 0, fireScale: 1, fireDelay: 0.5 });
const DEFAULTS = () => ({
  ...fireDefaults(), previewNight: true, timeOfDay: PUBLISHED.timeOfDay ?? 12, cloudCover: PUBLISHED.cloudCover ?? 0,
  wind: 5, exposure: 1.04,
});

function Stage({ settings, lighting, paused, onFrame }) {
  const wind = useMemo(() => ({ x: settings.wind * 0.7, z: -settings.wind * 0.7 }), [settings.wind]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#b9a888" roughness={1} metalness={0} />
      </mesh>
      <FireTrail settings={settings} heightAt={flat} wind={wind} lighting={lighting} tier={window.innerWidth < 768 ? 'medium' : 'high'} paused={paused} onFrame={onFrame} />
    </>
  );
}

export default function FireLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('low');
  const [tab, setTab] = useState('front');
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(document.hidden);
  const [epoch, setEpoch] = useState(0);
  const [stats, setStats] = useState({ front: 0, tail: 0, flames: 0, smoke: 0, length: 0 });
  const lastStats = useRef(0);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  // Свет — опубликованной сцены с наложенными ручками коллекции (час, облака);
  // «Сцена · Студия» в навигации переключает комнату, огонь считает свой дым
  // тем же светом, что и SceneLight.
  const overrides = useMemo(() => ({ timeOfDay: settings.previewNight ? 22.5 : settings.timeOfDay, cloudCover: settings.cloudCover }), [settings.cloudCover, settings.previewNight, settings.timeOfDay]);
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, ...overrides }), [overrides]);
  const sceneLight = useLabLightMode() === 'scene';
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const onFrame = useCallback((frame) => {
    // Симметрично: на паузе время стоит, и без |·| счётчики обновлялись бы каждый кадр.
    if (Math.abs(frame.time - lastStats.current) < 0.25) return;
    lastStats.current = frame.time;
    setStats({ front: frame.front, tail: frame.tail, flames: frame.flames, smoke: frame.smoke, length: frame.length });
  }, []);
  const range = (key, label, step = 0.01, unit = '') => {
    const [min, max] = FIRE_RANGES[key];
    return <LabRange key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  };
  const tabs = {
    front: <>
      <LabModes label={t.presets} items={[{ id: 'fuel', label: t.fuel }, { id: 'slow', label: t.slow }, { id: 'steady', label: t.steady }]} value={null} onChange={(id) => { setSettings((current) => ({ ...current, ...PRESETS[id] })); setEpoch((n) => n + 1); }} />
      {range('fireDelay', t.delay, 0.1, 's')}{range('fireSpeed', t.speed, 0.1, 'm/s')}{range('fireBurn', t.burn, 0.5, 's')}
      <LabToggle label={t.loop} value={settings.fireLoop} onChange={(value) => set('fireLoop', value)} />
      {range('fireLoopPause', t.pause, 0.5, 's')}
    </>,
    flames: <>
      {range('fireWidth', t.width, 0.05, 'm')}{range('fireHeight', t.height, 0.05, 'm')}{range('fireIntensity', t.intensity, 0.05)}{range('fireTurbulence', t.turbulence, 0.05)}
      <LabColor label={t.hot} value={settings.fireColorHot} onChange={(value) => set('fireColorHot', value)} />
      <LabColor label={t.cool} value={settings.fireColorCool} onChange={(value) => set('fireColorCool', value)} />
    </>,
    smoke: <>
      <LabToggle label={t.smokeOn} value={settings.fireSmoke} onChange={(value) => set('fireSmoke', value)} />
      {range('fireSmokeAmount', t.amount, 0.05)}{range('fireSmokeRise', t.rise, 0.1, 'm/s')}{range('fireSmokeLife', t.life, 0.5, 's')}{range('fireSmokeSize', t.size, 0.1, 'm')}
      {range('fireSmokeWind', t.windShare, 0.05)}{range('fireSmokeOpacity', t.opacity, 0.01)}
      <LabColor label={t.smokeColor} value={settings.fireSmokeColor} onChange={(value) => set('fireSmokeColor', value)} />
      <LabRange label={t.wind} value={settings.wind} min={0} max={18} step={0.1} unit="m/s" onChange={(value) => set('wind', value)} />
    </>,
    ground: <>
      <LabToggle label={t.track} value={settings.fireTrack} onChange={(value) => set('fireTrack', value)} />
      {range('fireTrackDark', t.dark, 0.01)}{range('fireSootFade', t.soot, 5, 's')}
    </>,
    light: <>
      <LabToggle label={t.lightOn} value={settings.fireLight} onChange={(value) => set('fireLight', value)} />
      {range('fireLightIntensity', t.lightIntensity, 1)}{range('fireLightDistance', t.lightDistance, 0.5, 'm')}
      <LabToggle label={t.night} value={settings.previewNight} onChange={(value) => set('previewNight', value)} />
      <LabRange label={t.hour} value={settings.timeOfDay} min={0} max={24} step={0.1} unit="h" onChange={(value) => set('timeOfDay', value)} />
      <LabRange label={t.clouds} value={settings.cloudCover} min={0} max={1} step={0.01} onChange={(value) => set('cloudCover', value)} />
      <LabRange label={t.exposure} value={settings.exposure} min={0.4} max={2} step={0.01} onChange={(value) => set('exposure', value)} />
    </>,
  };
  const metres = (value) => `${value.toFixed(1)} m`;
  return (
    <LabShell
      collection="fire"
      eyebrow="DDG / ASSET LAB / 15"
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'low', 'along', 'top'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      panel={<>
        <LabTabs label="" items={['front', 'flames', 'smoke', 'ground', 'light'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tabs[tab]}
      </>}
      transport={<>
        <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? t.play : t.pauseBtn}</button>
        <button type="button" onClick={() => { setSettings((current) => ({ ...DEFAULTS(), previewNight: current.previewNight })); setEpoch((n) => n + 1); }}>{t.reset}</button>
      </>}
      stats={<LabFacts rows={[[t.stats.length, metres(stats.length)], [t.stats.front, metres(stats.front)], [t.stats.tail, metres(stats.tail)], [t.stats.flames, String(stats.flames)], [t.stats.smoke, String(stats.smoke)]]} />}
      hints={[t.hint]}
    >
      <AssetStudio
        view={view}
        cameraViews={CAMERA_VIEWS}
        cameraLimits={CAMERA_LIMITS}
        sceneOverrides={overrides}
        floorVisible={false}
        paused={paused}
        inactive={hidden}
        exposure={settings.exposure}
        environmentIntensity={0.7}
        cameraFar={400}
        fogRange={[120, 320]}
        shadowRadius={30}
      >
        <Stage key={epoch} settings={settings} lighting={sceneLight ? lighting : null} paused={paused} onFrame={onFrame} />
      </AssetStudio>
    </LabShell>
  );
}
