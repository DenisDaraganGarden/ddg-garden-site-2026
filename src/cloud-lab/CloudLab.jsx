import React, { Suspense, useEffect, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { resolvePainterlyCloudSettings } from '../features/home-scene/lib/painterlyCloudSettings';
import PainterlyClouds from '../components/effects/sky/painterly/PainterlyClouds';
import CloudGround from './CloudGround';
import './cloudLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
const DEFAULTS = Object.freeze({
  ...resolvePainterlyCloudSettings(PUBLISHED),
  timeOfDay: 15, exposure: 1.0, skyTurbidity: 2.2, sunIntensity: 1.4, hdrExposure: 64, sunTint: '#ffffff', sunBearing: -40, sunNoonElevation: 50, receiverSurface: 'ground',
});

const PRESETS = {
  clear: { coverage: .5, density: .9, height: 1, timeOfDay: 15, sunBearing: -40 },
  sunset: { coverage: .62, density: 1.35, height: 1, timeOfDay: 17.4, sunBearing: 130 },
  storm: { coverage: .94, density: 2.2, height: 1.25, timeOfDay: 16, sunBearing: 100 },
  broken: { coverage: .35, density: .8, height: .6, timeOfDay: 17, sunBearing: 100 },
};
const VIEWS = {
  horizon: { landscape: { position: [0, 70, 140], target: [0, 900, -4200] }, portrait: { position: [0, 92, 175], target: [0, 860, -4200] } },
  ground: { landscape: { position: [1700, 1800, 2500], target: [0, 0, 0] }, portrait: { position: [2200, 2150, 3100], target: [0, 0, 0] } },
  zenith: { landscape: { position: [5500, 70, 4900], target: [5500, 4500, 4880] }, portrait: { position: [5500, 70, 4900], target: [5500, 4500, 4880] } },
};
const LIMITS = { minDistance: 5, maxDistance: 15000, minPolarAngle: .001, maxPolarAngle: Math.PI - .001 };

const COPY = {
  ru: { title: 'Живописные облака', subtitle: 'процедурное небо · свет и тени', form: 'Облака', light: 'Свет', motion: 'Движение', horizon: 'Горизонт', ground: 'Тени', zenith: 'Зенит', seed: 'Вариант', coverage: 'Покрытие', density: 'Плотность', altitude: 'Высота слоя', scale: 'Масштаб', height: 'Вертикальный объём', time: 'Время суток', exposure: 'Экспозиция', haze: 'Дымка', rays: 'Лучи', shadows: 'Тень облаков', softness: 'Мягкость тени', windSpeed: 'Скорость ветра', windDirection: 'Направление ветра', quality: 'Качество', enabled: 'Облака включены', pause: 'Пауза', play: 'Продолжить', reset: 'Сброс', published: 'Свет из проекта', clear: 'Ясно', sunset: 'Закат', storm: 'Гроза', broken: 'Разорванные', balanced: 'Баланс', low: 'Легко', high: 'Высоко', tri: 'треугольников', calls: 'вызовов', fps: 'кад/с', tex: 'текстуры', bake: 'сборка', ready: 'готово', building: 'сборка…', assets: 'Коллекции', metres: 'м', ms: 'мс', sand: 'Песок', water: 'Вода' },
  en: { title: 'Painterly clouds', subtitle: 'procedural sky · light and shadows', form: 'Clouds', light: 'Light', motion: 'Motion', horizon: 'Horizon', ground: 'Shadows', zenith: 'Zenith', seed: 'Seed', coverage: 'Coverage', density: 'Density', altitude: 'Layer altitude', scale: 'Scale', height: 'Vertical volume', time: 'Time of day', exposure: 'Exposure', haze: 'Haze', rays: 'Rays', shadows: 'Cloud shadows', softness: 'Shadow softness', windSpeed: 'Wind speed', windDirection: 'Wind direction', quality: 'Quality', enabled: 'Clouds enabled', pause: 'Pause', play: 'Resume', reset: 'Reset', published: 'Project light', clear: 'Clear', sunset: 'Sunset', storm: 'Storm', broken: 'Broken', balanced: 'Balanced', low: 'Low', high: 'High', tri: 'triangles', calls: 'draw calls', fps: 'fps', tex: 'textures', bake: 'build', ready: 'ready', building: 'building…', assets: 'Collections', metres: 'm', ms: 'ms', sand: 'Sand', water: 'Water' },
};

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const precision = step >= 1 ? 0 : step >= .1 ? 1 : 2;
  return <label className="cloud-lab__range"><span>{label}</span><output>{Number(value).toFixed(precision)}{unit && ` ${unit}`}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) { return <label className="cloud-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>; }

export default function CloudLab() {
  const [language, setLanguage] = useState('ru');
  const [settings, setSettings] = useState(DEFAULTS);
  const [tab, setTab] = useState('form');
  const [view, setView] = useState('horizon');
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden ?? false);
  const [stats, setStats] = useState({ calls: 0, triangles: 0, fps: 0, textureMB: 0, bakeMs: 0, ready: false, clouds: 0 });
  const [shadow, setShadow] = useState(null);
  const t = COPY[language];
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, sunBearing: settings.sunBearing, sunNoonElevation: settings.sunNoonElevation, cloudCover: 0, skyTurbidity: settings.skyTurbidity, sunIntensity: settings.sunIntensity, hdrExposure: settings.hdrExposure, sunTint: settings.sunTint }), [settings.hdrExposure, settings.skyTurbidity, settings.sunBearing, settings.sunIntensity, settings.sunNoonElevation, settings.sunTint, settings.timeOfDay]);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const range = (key, label, min, max, step, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const usePublishedLight = () => setSettings((current) => ({ ...current, timeOfDay: PUBLISHED.timeOfDay ?? 15, sunBearing: PUBLISHED.sunBearing ?? PUBLISHED.moonAzimuth ?? -40, sunNoonElevation: PUBLISHED.sunNoonElevation ?? PUBLISHED.moonElevation ?? 50, skyTurbidity: PUBLISHED.skyTurbidity ?? 2.2, sunIntensity: PUBLISHED.sunIntensity ?? 1.4, hdrExposure: PUBLISHED.hdrExposure ?? 64, sunTint: PUBLISHED.sunTint ?? '#ffffff', exposure: 1 }));
  return <main className="cloud-lab" data-asset-collection="clouds" lang={language}>
    <header className="cloud-lab__header"><div><p>DDG / ASSET LAB / {assetIndex('clouds')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="cloud-lab__header-actions"><div>{['ru', 'en'].map((id) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{id.toUpperCase()}</button>)}</div><LabNav current="clouds" lang={language} label={t.assets} /></div></header>
    <div className="cloud-lab__workspace"><section className="cloud-lab__viewer" aria-label="Cloud atmosphere viewport">
      <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} cameraFar={30000} fogRange={[8000, 18000]} floorVisible={false} lighting={lighting} exposure={settings.exposure} environmentIntensity={1} paused={paused} inactive={hidden} pixelRatio={[1, 1.5]} background="#a9c8d9">
        <CloudGround settings={settings} lighting={lighting} shadow={shadow} />
        <Suspense fallback={null}><PainterlyClouds settings={settings} lighting={lighting} onStats={setStats} onShadow={setShadow} paused={paused || hidden} /></Suspense>
      </AssetStudio>
      <div className="cloud-lab__views" role="group" aria-label="Ракурс">{['horizon', 'ground', 'zenith'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}</div>
      <div className="cloud-lab__surface" role="group" aria-label="Surface"><button aria-pressed={settings.receiverSurface === 'ground'} onClick={() => set('receiverSurface', 'ground')}>{t.sand}</button><button aria-pressed={settings.receiverSurface === 'water'} onClick={() => set('receiverSurface', 'water')}>{t.water}</button></div>
      <div className="cloud-lab__presets" role="group" aria-label="Presets">{Object.keys(PRESETS).map((id) => <button key={id} onClick={() => setSettings((current) => ({ ...current, ...PRESETS[id] }))}>{t[id]}</button>)}</div>
    </section><aside className="cloud-lab__inspector">
      <div className="cloud-lab__tabs" role="tablist">{['form', 'light', 'motion'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div className="cloud-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'form' && <>{range('seed', t.seed, 1, 99, 1)}{range('coverage', t.coverage, 0, 1, .01)}{range('density', t.density, .2, 2.5, .05)}{range('altitude', t.altitude, 300, 5000, 25, t.metres)}{range('scale', t.scale, .35, 2.5, .05)}{range('height', t.height, .2, 2, .05)}<label className="cloud-lab__select"><span>{t.quality}</span><select aria-label={t.quality} value={settings.quality} onChange={(event) => set('quality', event.target.value)}>{['low', 'balanced', 'high'].map((id) => <option key={id} value={id}>{t[id]}</option>)}</select></label><Toggle label={t.enabled} value={settings.enabled} onChange={(value) => set('enabled', value)} /></>}
        {tab === 'light' && <>{range('timeOfDay', t.time, 0, 24, .1, language === 'ru' ? 'ч' : 'h')}{range('sunBearing', language === 'ru' ? 'Направление солнца' : 'Sun bearing', -180, 180, 1, '°')}{range('sunNoonElevation', language === 'ru' ? 'Высота солнца' : 'Sun elevation', 10, 85, 1, '°')}{range('exposure', t.exposure, .3, 2, .05)}{range('haze', t.haze, 0, 1, .01)}{range('rays', t.rays, 0, 1, .01)}{range('shadowStrength', t.shadows, 0, 1, .01)}{range('shadowSoftness', t.softness, 0, 1, .01)}<button className="cloud-lab__published" onClick={usePublishedLight}>{t.published}</button></>}
        {tab === 'motion' && <>{range('windSpeed', t.windSpeed, 0, 40, .5, language === 'ru' ? 'м/с' : 'm/s')}{range('windDirection', t.windDirection, 0, 360, 1, '°')}</>}
      </div>
      <div className="cloud-lab__transport"><button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button><button onClick={() => { setSettings(DEFAULTS); setView('horizon'); setTab('form'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="cloud-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{Math.round(stats.fps)}</b> {t.fps}</span><span><b>{stats.gpuMs == null ? '—' : stats.gpuMs.toFixed(2)} ms</b> GPU</span><span><b>{Number(stats.textureMB).toFixed(1)} MB</b> {t.tex}</span><span><b>{Math.round(stats.bakeMs)} {t.ms}</b> {stats.ready ? t.ready : t.building}</span></footer>
  </main>;
}
