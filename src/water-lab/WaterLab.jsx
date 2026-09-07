import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import GerstnerWaterSurface from '../components/effects/water/GerstnerWaterSurface';
import { GERSTNER_MAX_STEEPNESS } from '../components/effects/water/gerstnerWaves';
import './waterLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
const DEFAULTS = Object.freeze({
  wavelength: 14, amplitude: 0.42, steepness: 0.55, speed: 1, windDirection: 205, sets: 0.6, crossWaves: 0.5, fadeStart: 120, fadeEnd: 320,
  ripple: 0.35, rippleScale: 0.09,
  foamThreshold: 0.45, foamSoftness: 0.08, laceScale: 0.14, foamBrightness: 1,
  waterColor: '#2c7a64', deepColor: '#143a40', crestGlow: 0.7, glint: 1, skyReflection: 0.7,
  meshRings: 112, meshSegments: 144, wireframe: false,
  timeOfDay: PUBLISHED.timeOfDay ?? 9.4, sunBearing: PUBLISHED.sunBearing ?? 338, sunNoonElevation: PUBLISHED.sunNoonElevation ?? 50, exposure: 1,
});
const PRESETS = {
  calm: { wavelength: 9, amplitude: 0.12, steepness: 0.25, sets: 0.3, crossWaves: 0.3, ripple: 0.5, foamThreshold: 0.3 },
  breeze: { wavelength: 14, amplitude: 0.42, steepness: 0.55, sets: 0.6, crossWaves: 0.5, ripple: 0.35, foamThreshold: 0.45 },
  rough: { wavelength: 18, amplitude: 0.75, steepness: 0.7, sets: 0.7, crossWaves: 0.6, ripple: 0.35, foamThreshold: 0.5 },
  storm: { wavelength: 26, amplitude: 1.3, steepness: 0.8, sets: 0.5, crossWaves: 0.85, ripple: 0.4, foamThreshold: 0.55 },
};
const VIEWS = {
  shore: { landscape: { position: [0, 3.2, 14], target: [0, 0.4, -40] }, portrait: { position: [0, 4, 18], target: [0, 0.4, -40] } },
  above: { landscape: { position: [0, 42, 70], target: [0, 0, 0] }, portrait: { position: [0, 55, 90], target: [0, 0, 0] } },
  macro: { landscape: { position: [4.5, 1.7, 6.5], target: [0, 0.2, 0] }, portrait: { position: [6, 2.3, 8.5], target: [0, 0.2, 0] } },
};
const LIMITS = { minDistance: 1, maxDistance: 900, minPolarAngle: 0.04, maxPolarAngle: Math.PI / 2 - 0.03 };

const COPY = {
  ru: { title: 'Вода · волны и пена', subtitle: 'Герстнер от камеры до горизонта · пена из облачного шума', waves: 'Волны', foam: 'Пена', look: 'Вид', light: 'Свет', shore: 'Берег', above: 'Сверху', macro: 'Гребень', wavelength: 'Длина волны', amplitude: 'Высота волны', steepness: 'Крутизна', speed: 'Скорость', wind: 'Направление ветра', sets: 'Наборы', cross: 'Поперечные волны', fadeStart: 'Волны гаснут с', fadeEnd: 'Волны гаснут до', ripple: 'Рябь', rippleScale: 'Масштаб ряби', threshold: 'Порог пены', softness: 'Мягкость', lace: 'Масштаб кружева', brightness: 'Яркость пены', water: 'Цвет воды', deep: 'Цвет глубины', glow: 'Просвет гребня', glint: 'Блики солнца', sky: 'Отражение неба', rings: 'Кольца сетки', segments: 'Сегменты сетки', wireframe: 'Каркас', time: 'Время суток', bearing: 'Направление солнца', elevation: 'Высота солнца', exposure: 'Экспозиция', pause: 'Пауза', play: 'Продолжить', reset: 'Сброс', calm: 'Штиль', breeze: 'Бриз', rough: 'Волнение', storm: 'Шторм', tri: 'треугольников', calls: 'вызовов', fps: 'кад/с', budget: 'крутизна', assets: 'Коллекции', metres: 'м', hours: 'ч' },
  en: { title: 'Water · waves and foam', subtitle: 'Gerstner from the camera to the horizon · foam from the cloud noise', waves: 'Waves', foam: 'Foam', look: 'Look', light: 'Light', shore: 'Shore', above: 'Above', macro: 'Crest', wavelength: 'Wavelength', amplitude: 'Wave height', steepness: 'Steepness', speed: 'Speed', wind: 'Wind direction', sets: 'Sets', cross: 'Cross waves', fadeStart: 'Waves fade from', fadeEnd: 'Waves fade to', ripple: 'Ripple', rippleScale: 'Ripple scale', threshold: 'Foam threshold', softness: 'Softness', lace: 'Lace scale', brightness: 'Foam brightness', water: 'Water colour', deep: 'Deep colour', glow: 'Crest glow', glint: 'Sun glints', sky: 'Sky reflection', rings: 'Mesh rings', segments: 'Mesh segments', wireframe: 'Wireframe', time: 'Time of day', bearing: 'Sun bearing', elevation: 'Sun elevation', exposure: 'Exposure', pause: 'Pause', play: 'Resume', reset: 'Reset', calm: 'Calm', breeze: 'Breeze', rough: 'Rough', storm: 'Storm', tri: 'triangles', calls: 'draw calls', fps: 'fps', budget: 'steepness', assets: 'Collections', metres: 'm', hours: 'h' },
};

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return <label className="water-lab__range"><span>{label}</span><output>{Number(value).toFixed(precision)}{unit && ` ${unit}`}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) { return <label className="water-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>; }
function ColorField({ label, value, onChange }) { return <label className="water-lab__toggle"><span>{label}</span><input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function LabStats({ onStats }) {
  const accumulator = useRef({ time: 0, frames: 0 });
  useFrame(({ gl }, delta) => {
    const a = accumulator.current;
    a.time += delta; a.frames += 1;
    if (a.time < 0.5) return;
    onStats({ fps: a.frames / a.time, triangles: gl.info.render.triangles, calls: gl.info.render.calls });
    a.time = 0; a.frames = 0;
  });
  return null;
}

export default function WaterLab() {
  const [language, setLanguage] = useState('ru');
  const [settings, setSettings] = useState(DEFAULTS);
  const [tab, setTab] = useState('waves');
  const [view, setView] = useState('shore');
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden ?? false);
  const [stats, setStats] = useState({ fps: 0, triangles: 0, calls: 0 });
  const t = COPY[language];
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, sunBearing: settings.sunBearing, sunNoonElevation: settings.sunNoonElevation, cloudCover: 0 }), [settings.sunBearing, settings.sunNoonElevation, settings.timeOfDay]);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const range = (key, label, min, max, step, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return <main className="water-lab" data-asset-collection="water" lang={language}>
    <header className="water-lab__header"><div><p>DDG / ASSET LAB / {assetIndex('water')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="water-lab__header-actions"><div>{['ru', 'en'].map((id) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{id.toUpperCase()}</button>)}</div><LabNav current="water" lang={language} label={t.assets} /></div></header>
    <div className="water-lab__workspace"><section className="water-lab__viewer" aria-label="Water viewport">
      <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} cameraFar={6000} fogRange={[1200, 4500]} floorVisible={false} lighting={lighting} exposure={settings.exposure} environmentIntensity={1} paused={paused} inactive={hidden} pixelRatio={[1, 1.5]} background="#a9c8d9" shadowRadius={40}>
        <GerstnerWaterSurface settings={settings} lighting={lighting} wireframe={settings.wireframe} />
        <LabStats onStats={setStats} />
      </AssetStudio>
      <div className="water-lab__views" role="group" aria-label="Ракурс">{['shore', 'above', 'macro'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__presets" role="group" aria-label="Presets">{Object.keys(PRESETS).map((id) => <button key={id} onClick={() => setSettings((current) => ({ ...current, ...PRESETS[id] }))}>{t[id]}</button>)}</div>
    </section><aside className="water-lab__inspector">
      <div className="water-lab__tabs" role="tablist">{['waves', 'foam', 'look', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'waves' && <>{range('wavelength', t.wavelength, 3, 40, 0.5, t.metres)}{range('amplitude', t.amplitude, 0, 1.6, 0.01, t.metres)}{range('steepness', t.steepness, 0, GERSTNER_MAX_STEEPNESS, 0.01)}{range('speed', t.speed, 0, 2.5, 0.05)}{range('windDirection', t.wind, 0, 360, 1, '°')}{range('sets', t.sets, 0, 1, 0.01)}{range('crossWaves', t.cross, 0, 1, 0.01)}{range('fadeStart', t.fadeStart, 20, 1500, 10, t.metres)}{range('fadeEnd', t.fadeEnd, 40, 3000, 10, t.metres)}</>}
        {tab === 'foam' && <>{range('foamThreshold', t.threshold, 0, 0.95, 0.01)}{range('foamSoftness', t.softness, 0.02, 0.4, 0.01)}{range('laceScale', t.lace, 0.03, 0.6, 0.01)}{range('foamBrightness', t.brightness, 0.2, 2, 0.05)}{range('ripple', t.ripple, 0, 1, 0.01)}{range('rippleScale', t.rippleScale, 0.01, 0.3, 0.005)}</>}
        {tab === 'look' && <><ColorField label={t.water} value={settings.waterColor} onChange={(value) => set('waterColor', value)} /><ColorField label={t.deep} value={settings.deepColor} onChange={(value) => set('deepColor', value)} />{range('crestGlow', t.glow, 0, 2, 0.05)}{range('glint', t.glint, 0, 3, 0.05)}{range('skyReflection', t.sky, 0, 3, 0.05)}{range('meshRings', t.rings, 32, 192, 8)}{range('meshSegments', t.segments, 48, 256, 8)}<Toggle label={t.wireframe} value={settings.wireframe} onChange={(value) => set('wireframe', value)} /></>}
        {tab === 'light' && <>{range('timeOfDay', t.time, 0, 24, 0.1, t.hours)}{range('sunBearing', t.bearing, -180, 360, 1, '°')}{range('sunNoonElevation', t.elevation, 10, 85, 1, '°')}{range('exposure', t.exposure, 0.3, 2, 0.05)}</>}
      </div>
      <div className="water-lab__transport"><button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button><button onClick={() => { setSettings(DEFAULTS); setView('shore'); setTab('waves'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="water-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{Math.round(stats.fps)}</b> {t.fps}</span><span><b>Σ Q·k·A = {Number(settings.steepness).toFixed(2)}</b> {t.budget}</span></footer>
  </main>;
}
