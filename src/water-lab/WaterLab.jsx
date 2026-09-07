import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import GerstnerWaterSurface from '../components/effects/water/GerstnerWaterSurface';
import BreakingWaves from '../components/effects/water/BreakingWaves';
import { GERSTNER_MAX_STEEPNESS } from '../components/effects/water/gerstnerWaves';
import { createFoamBores } from '../components/effects/water/foamField';
import { useWaterNoise } from '../components/effects/water/waterShading';
import './waterLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
// The synthetic beach: shoreline along X at z = SHORE_Z, sand rising toward +Z.
const SHORE_Z = 60;
const SHORE = Object.freeze({ origin: [-120, SHORE_Z], crestDir: [1, 0], shoreDir: [0, 1], length: 240 });
const DEFAULTS = Object.freeze({
  wavelength: 18, amplitude: 0.55, steepness: 0.7, speed: 1, windDirection: 180, sets: 0.6, crossWaves: 0.2, fadeStart: 400, fadeEnd: 2500,
  ripple: 0.35, rippleScale: 0.09,
  foamThreshold: 0.55, foamSoftness: 0.15, laceScale: 0.14, foamBrightness: 1,
  foamMemory: true, foamLife: 8, foamDeposit: 0.9, foamWindow: 200, foamDrift: 0.4,
  waterColor: '#2c7a64', deepColor: '#143a40', crestGlow: 0.7, glint: 1, skyReflection: 0.45,
  meshRings: 112, meshSegments: 144, wireframe: false,
  surfEnabled: true, surfHeight: 1.1, surfWidth: 9, surfBreakDistance: 28, surfBreakLength: 16, surfLean: 0.45, surfJet: 2.2, surfLift: 0.9, surfSheet: 0.16, surfRoller: 0.5, surfRollerDensity: 1, surfPeel: 0.06, surfBoreLength: 14, surfRunup: 10, surfSpeed: 4.5, surfPeriod: 9, surfSets: 0.5, beachSlope: 2, surfFreeze: false, surfPhase: 0.5,
  timeOfDay: PUBLISHED.timeOfDay ?? 9.4, sunBearing: PUBLISHED.sunBearing ?? 338, sunNoonElevation: PUBLISHED.sunNoonElevation ?? 50, exposure: 1,
});
const PRESETS = {
  calm: { wavelength: 9, amplitude: 0.12, steepness: 0.25, sets: 0.3, crossWaves: 0.3, ripple: 0.5, foamThreshold: 0.3, foamLife: 5, foamDeposit: 0.6, surfHeight: 0.4, surfJet: 1.1, surfLift: 0.4 },
  breeze: { wavelength: 14, amplitude: 0.42, steepness: 0.55, sets: 0.6, crossWaves: 0.5, ripple: 0.35, foamThreshold: 0.55, foamLife: 7, foamDeposit: 0.8, surfHeight: 0.8, surfJet: 1.4, surfLift: 0.5 },
  rough: { wavelength: 18, amplitude: 0.75, steepness: 0.7, sets: 0.7, crossWaves: 0.6, ripple: 0.35, foamThreshold: 0.6, foamLife: 9, foamDeposit: 0.9, surfHeight: 1.2, surfJet: 1.7, surfLift: 0.6 },
  storm: { wavelength: 26, amplitude: 1.3, steepness: 0.8, sets: 0.5, crossWaves: 0.85, ripple: 0.4, foamThreshold: 0.65, foamLife: 12, foamDeposit: 1.1, surfHeight: 1.8, surfJet: 2.2, surfLift: 0.8 },
};
const VIEWS = {
  shore: { landscape: { position: [0, 3.2, 14], target: [0, 0.4, -40] }, portrait: { position: [0, 4, 18], target: [0, 0.4, -40] } },
  above: { landscape: { position: [0, 42, 70], target: [0, 0, 0] }, portrait: { position: [0, 55, 90], target: [0, 0, 0] } },
  macro: { landscape: { position: [4.5, 1.7, 6.5], target: [0, 0.2, 0] }, portrait: { position: [6, 2.3, 8.5], target: [0, 0.2, 0] } },
  surf: { landscape: { position: [6, 2.4, SHORE_Z + 16], target: [0, 0.7, SHORE_Z - 30] }, portrait: { position: [8, 3, SHORE_Z + 20], target: [0, 0.7, SHORE_Z - 30] } },
  surfSide: { landscape: { position: [-105, 1.3, SHORE_Z - 23.5], target: [-96, 0.7, SHORE_Z - 26.6] }, portrait: { position: [-108, 1.6, SHORE_Z - 23], target: [-96, 0.7, SHORE_Z - 26.6] } },
  lip: { landscape: { position: [-89, 1.0, SHORE_Z - 22.8], target: [-95, 0.55, SHORE_Z - 25.4] }, portrait: { position: [-87.5, 1.3, SHORE_Z - 22], target: [-95, 0.55, SHORE_Z - 25.4] } },
  surfAbove: { landscape: { position: [0, 38, SHORE_Z - 60], target: [0, 0, SHORE_Z - 12] }, portrait: { position: [0, 55, SHORE_Z - 80], target: [0, 0, SHORE_Z - 12] } },
};
const LIMITS = { minDistance: 1, maxDistance: 900, minPolarAngle: 0.04, maxPolarAngle: Math.PI / 2 - 0.03 };

const COPY = {
  ru: { title: 'Вода · волны и пена', subtitle: 'Герстнер от камеры до горизонта · губа прибоя баллистикой · пена из облачного шума', waves: 'Волны', surf: 'Прибой', foam: 'Пена', look: 'Вид', light: 'Свет', shore: 'Берег', above: 'Сверху', macro: 'Гребень', surfView: 'Прибой', surfSide: 'Труба', lip: 'Губа', surfAbove: 'Прибой сверху', wavelength: 'Длина волны', amplitude: 'Высота волны', steepness: 'Крутизна', speed: 'Скорость', wind: 'Направление ветра', sets: 'Наборы', cross: 'Поперечные волны', fadeStart: 'Волны гаснут с', fadeEnd: 'Волны гаснут до', ripple: 'Рябь', rippleScale: 'Масштаб ряби', threshold: 'Порог пены', softness: 'Мягкость', lace: 'Масштаб кружева', brightness: 'Яркость пены', foamMemory: 'Память пены', foamLife: 'Живёт на воде', foamDeposit: 'Плотность пены', foamWindow: 'Окно памяти', foamDrift: 'Снос ветром', water: 'Цвет воды', deep: 'Цвет глубины', glow: 'Просвет гребня', glint: 'Блики солнца', sky: 'Отражение неба', rings: 'Кольца сетки', segments: 'Сегменты сетки', wireframe: 'Каркас', surfEnabled: 'Прибой включён', surfHeight: 'Высота вала', surfWidth: 'Ширина вала', surfBreakDistance: 'Ломается за', surfBreakLength: 'Длина обрушения', surfLean: 'Наклон гребня', surfJet: 'Выброс губы', surfLift: 'Подъём губы', surfSheet: 'Толщина губы', surfRoller: 'Объём пены', surfRollerDensity: 'Плотность вала', surfPeel: 'Пил вдоль гребня', surfBoreLength: 'Схлопывание', surfRunup: 'Заплеск на песок', surfSpeed: 'Скорость вала', surfPeriod: 'Период', surfSets: 'Разброс высоты', beachSlope: 'Уклон пляжа', surfFreeze: 'Стоп-кадр', surfPhase: 'Фаза обрушения', time: 'Время суток', bearing: 'Направление солнца', elevation: 'Высота солнца', exposure: 'Экспозиция', pause: 'Пауза', play: 'Продолжить', reset: 'Сброс', calm: 'Штиль', breeze: 'Бриз', rough: 'Волнение', storm: 'Шторм', tri: 'треугольников', calls: 'вызовов', fps: 'кад/с', budget: 'крутизна', assets: 'Коллекции', metres: 'м', hours: 'ч', seconds: 'с', mps: 'м/с', rad: 'рад' },
  en: { title: 'Water · waves and foam', subtitle: 'Gerstner from the camera to the horizon · a ballistic lip · foam from the cloud noise', waves: 'Waves', surf: 'Surf', foam: 'Foam', look: 'Look', light: 'Light', shore: 'Shore', above: 'Above', macro: 'Crest', surfView: 'Surf', surfSide: 'Tube', lip: 'Lip', surfAbove: 'Surf above', wavelength: 'Wavelength', amplitude: 'Wave height', steepness: 'Steepness', speed: 'Speed', wind: 'Wind direction', sets: 'Sets', cross: 'Cross waves', fadeStart: 'Waves fade from', fadeEnd: 'Waves fade to', ripple: 'Ripple', rippleScale: 'Ripple scale', threshold: 'Foam threshold', softness: 'Softness', lace: 'Lace scale', brightness: 'Foam brightness', foamMemory: 'Foam memory', foamLife: 'Lives on water', foamDeposit: 'Foam density', foamWindow: 'Memory window', foamDrift: 'Wind drift', water: 'Water colour', deep: 'Deep colour', glow: 'Crest glow', glint: 'Sun glints', sky: 'Sky reflection', rings: 'Mesh rings', segments: 'Mesh segments', wireframe: 'Wireframe', surfEnabled: 'Surf enabled', surfHeight: 'Breaker height', surfWidth: 'Breaker width', surfBreakDistance: 'Breaks at', surfBreakLength: 'Breaking length', surfLean: 'Crest lean', surfJet: 'Lip throw', surfLift: 'Lip lift', surfSheet: 'Lip thickness', surfRoller: 'Foam volume', surfRollerDensity: 'Roller density', surfPeel: 'Peel along crest', surfBoreLength: 'Collapse', surfRunup: 'Run-up on sand', surfSpeed: 'Breaker speed', surfPeriod: 'Period', surfSets: 'Height variation', beachSlope: 'Beach slope', surfFreeze: 'Freeze', surfPhase: 'Break phase', time: 'Time of day', bearing: 'Sun bearing', elevation: 'Sun elevation', exposure: 'Exposure', pause: 'Pause', play: 'Resume', reset: 'Reset', calm: 'Calm', breeze: 'Breeze', rough: 'Rough', storm: 'Storm', tri: 'triangles', calls: 'draw calls', fps: 'fps', budget: 'steepness', assets: 'Collections', metres: 'm', hours: 'h', seconds: 's', mps: 'm/s', rad: 'rad' },
};

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return <label className="water-lab__range"><span>{label}</span><output>{Number(value).toFixed(precision)}{unit && ` ${unit}`}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) { return <label className="water-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>; }
function ColorField({ label, value, onChange }) { return <label className="water-lab__toggle"><span>{label}</span><input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
// Counts the whole previous frame: the foam field's own render pass would
// otherwise reset the renderer's tally before the scene is drawn.
function LabStats({ onStats }) {
  const accumulator = useRef({ time: 0, frames: 0 });
  const { gl } = useThree();
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame(({ gl: renderer }, delta) => {
    const a = accumulator.current;
    a.time += delta; a.frames += 1;
    if (a.time >= 0.5) {
      onStats({ fps: a.frames / a.time, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
      a.time = 0; a.frames = 0;
    }
    renderer.info.reset();
  }, -100);
  return null;
}
// A plane through the shoreline, tilted so the sand rises toward +Z.
function Beach({ slopeDeg }) {
  const slope = THREE.MathUtils.degToRad(slopeDeg);
  return <mesh position={[0, 0, SHORE_Z]} rotation={[-Math.PI / 2 - slope, 0, 0]} receiveShadow><planeGeometry args={[4000, 2400]} /><meshStandardMaterial color="#c8b78d" roughness={1} metalness={0} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} /></mesh>;
}

export default function WaterLab() {
  const [language, setLanguage] = useState('ru');
  const [settings, setSettings] = useState(DEFAULTS);
  const [tab, setTab] = useState('waves');
  const [view, setView] = useState('surf');
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden ?? false);
  const [stats, setStats] = useState({ fps: 0, triangles: 0, calls: 0 });
  const t = COPY[language];
  const noise = useWaterNoise(null);
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, sunBearing: settings.sunBearing, sunNoonElevation: settings.sunNoonElevation, cloudCover: 0 }), [settings.sunBearing, settings.sunNoonElevation, settings.timeOfDay]);
  // The swell hands the wave to the ribbons before the break zone.
  const swellShore = useMemo(() => (settings.surfEnabled ? { ...SHORE, fadeN: -settings.surfBreakDistance - 6, fadeWidth: 30 } : null), [settings.surfBreakDistance, settings.surfEnabled]);
  // The ribbons write their bores straight into the foam field's uniform.
  const foamBores = useMemo(() => createFoamBores(), []);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const range = (key, label, min, max, step, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const viewLabel = (id) => (id === 'surf' ? t.surfView : t[id]);
  return <main className="water-lab" data-asset-collection="water" lang={language}>
    <header className="water-lab__header"><div><p>DDG / ASSET LAB / {assetIndex('water')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="water-lab__header-actions"><div>{['ru', 'en'].map((id) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{id.toUpperCase()}</button>)}</div><LabNav current="water" lang={language} label={t.assets} /></div></header>
    <div className="water-lab__workspace"><section className="water-lab__viewer" aria-label="Water viewport">
      <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} cameraFar={6000} fogRange={[1200, 4500]} floorVisible={false} lighting={lighting} exposure={settings.exposure} environmentIntensity={1} paused={paused} inactive={hidden} pixelRatio={[1, 1.5]} background="#a9c8d9" shadowRadius={40}>
        <GerstnerWaterSurface settings={settings} lighting={lighting} noise={noise} wireframe={settings.wireframe} shore={swellShore} foamBores={settings.surfEnabled ? foamBores : null} />
        {settings.surfEnabled ? <BreakingWaves settings={settings} lighting={lighting} noise={noise} shore={swellShore} foamBores={foamBores} /> : null}
        {settings.surfEnabled ? <Beach slopeDeg={settings.beachSlope} /> : null}
        <LabStats onStats={setStats} />
      </AssetStudio>
      <div className="water-lab__views" role="group" aria-label="Ракурс">{['shore', 'above', 'macro', 'surf', 'surfSide', 'lip', 'surfAbove'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{viewLabel(id)}</button>)}</div>
      <div className="water-lab__presets" role="group" aria-label="Presets">{Object.keys(PRESETS).map((id) => <button key={id} onClick={() => setSettings((current) => ({ ...current, ...PRESETS[id] }))}>{t[id]}</button>)}</div>
    </section><aside className="water-lab__inspector">
      <div className="water-lab__tabs" role="tablist">{['waves', 'surf', 'foam', 'look', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'waves' && <>{range('wavelength', t.wavelength, 3, 40, 0.5, t.metres)}{range('amplitude', t.amplitude, 0, 1.6, 0.01, t.metres)}{range('steepness', t.steepness, 0, GERSTNER_MAX_STEEPNESS, 0.01)}{range('speed', t.speed, 0, 2.5, 0.05)}{range('windDirection', t.wind, 0, 360, 1, '°')}{range('sets', t.sets, 0, 1, 0.01)}{range('crossWaves', t.cross, 0, 1, 0.01)}{range('fadeStart', t.fadeStart, 20, 1500, 10, t.metres)}{range('fadeEnd', t.fadeEnd, 40, 3000, 10, t.metres)}</>}
        {tab === 'surf' && <><Toggle label={t.surfEnabled} value={settings.surfEnabled} onChange={(value) => set('surfEnabled', value)} /><Toggle label={t.surfFreeze} value={settings.surfFreeze} onChange={(value) => set('surfFreeze', value)} />{range('surfPhase', t.surfPhase, 0, 1, 0.01)}{range('surfHeight', t.surfHeight, 0.2, 3, 0.05, t.metres)}{range('surfWidth', t.surfWidth, 3, 24, 0.5, t.metres)}{range('surfBreakDistance', t.surfBreakDistance, 5, 80, 1, t.metres)}{range('surfBreakLength', t.surfBreakLength, 4, 40, 1, t.metres)}{range('surfLean', t.surfLean, 0, 1, 0.01)}{range('surfJet', t.surfJet, 0.3, 4, 0.05, t.mps)}{range('surfLift', t.surfLift, 0, 2, 0.05, t.mps)}{range('surfSheet', t.surfSheet, 0.04, 0.4, 0.01)}{range('surfRoller', t.surfRoller, 0, 1.2, 0.02)}{range('surfRollerDensity', t.surfRollerDensity, 0.2, 2.5, 0.05)}{range('surfPeel', t.surfPeel, 0, 0.6, 0.01)}{range('surfBoreLength', t.surfBoreLength, 3, 40, 1, t.metres)}{range('surfRunup', t.surfRunup, 0, 30, 1, t.metres)}{range('surfSpeed', t.surfSpeed, 1, 10, 0.1, t.mps)}{range('surfPeriod', t.surfPeriod, 3, 20, 0.5, t.seconds)}{range('surfSets', t.surfSets, 0, 1, 0.01)}{range('beachSlope', t.beachSlope, 0.5, 8, 0.1, '°')}</>}
        {tab === 'foam' && <><Toggle label={t.foamMemory} value={settings.foamMemory} onChange={(value) => set('foamMemory', value)} />{range('foamLife', t.foamLife, 1, 20, 0.5, t.seconds)}{range('foamDeposit', t.foamDeposit, 0.2, 1.5, 0.05)}{range('foamWindow', t.foamWindow, 32, 400, 4, t.metres)}{range('foamDrift', t.foamDrift, 0, 2, 0.05, t.mps)}{range('foamThreshold', t.threshold, 0, 0.95, 0.01)}{range('foamSoftness', t.softness, 0.02, 0.4, 0.01)}{range('laceScale', t.lace, 0.03, 0.6, 0.01)}{range('foamBrightness', t.brightness, 0.2, 2, 0.05)}{range('ripple', t.ripple, 0, 1, 0.01)}{range('rippleScale', t.rippleScale, 0.01, 0.3, 0.005)}</>}
        {tab === 'look' && <><ColorField label={t.water} value={settings.waterColor} onChange={(value) => set('waterColor', value)} /><ColorField label={t.deep} value={settings.deepColor} onChange={(value) => set('deepColor', value)} />{range('crestGlow', t.glow, 0, 2, 0.05)}{range('glint', t.glint, 0, 3, 0.05)}{range('skyReflection', t.sky, 0, 3, 0.05)}{range('meshRings', t.rings, 32, 192, 8)}{range('meshSegments', t.segments, 48, 256, 8)}<Toggle label={t.wireframe} value={settings.wireframe} onChange={(value) => set('wireframe', value)} /></>}
        {tab === 'light' && <>{range('timeOfDay', t.time, 0, 24, 0.1, t.hours)}{range('sunBearing', t.bearing, -180, 360, 1, '°')}{range('sunNoonElevation', t.elevation, 10, 85, 1, '°')}{range('exposure', t.exposure, 0.3, 2, 0.05)}</>}
      </div>
      <div className="water-lab__transport"><button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button><button onClick={() => { setSettings(DEFAULTS); setView('surf'); setTab('waves'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="water-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{Math.round(stats.fps)}</b> {t.fps}</span><span><b>Σ Q·k·A = {Number(settings.steepness).toFixed(2)}</b> {t.budget}</span></footer>
  </main>;
}
