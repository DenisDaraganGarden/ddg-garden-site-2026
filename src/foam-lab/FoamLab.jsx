import React, { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import GerstnerWaterSurface from '../components/effects/water/GerstnerWaterSurface';
import BreakingWaves from '../components/effects/water/BreakingWaves';
import FoamVolume from '../components/effects/water/FoamVolume';
import { buildRadialWaterGeometry } from '../components/effects/water/radialWaterGeometry';
import { createFoamBores, createFoamFieldHolder } from '../components/effects/water/foamField';
import { ShoreDepthMap, breakLineMean, coastBreakLine, createShoreDepth } from '../components/effects/water/coastFrame';
import { createSceneTimeline } from '../components/effects/sceneTimeline';
import { createTerrainDefinition, coastPoint } from '../terrain/terrainModel.js';
import '../water-lab/waterLab.css';

// The foam bench. A straight synthetic coast, a small patch of the new water
// with one breaker on it, and nothing else: the foam is the only thing under
// study here, so it is judged without the terrain's textures, its plants or
// its light. Denis's idea — the foam is built the way the painterly clouds
// are, so this collection is where that principle is proven.

const PUBLISHED = getPublishedHomeSceneSettings();
// A straight shore: no cape, no spit, no curve — the crest arrives parallel
// and every change on screen belongs to the foam.
const DEFINITION = createTerrainDefinition({
  ...PUBLISHED, terrainSpitEnabled: false, terrainCurve: 0, terrainCapeDepth: 0,
  terrainBearing: 90, terrainOffset: 0, terrainLength: 1600, waterDepthMeters: 2.75,
});
const ALONG0 = -140;
const CREST_LENGTH = 280;
const ALONG_MID = ALONG0 + CREST_LENGTH * 0.5;
const BAND = Object.freeze({ sMin: ALONG0 - 40, sMax: ALONG0 + CREST_LENGTH + 40, seam: -24 });
const at = (q, s, y) => { const p = coastPoint(q, s, DEFINITION); return [p.x, y, p.z]; };

const DEFAULTS = Object.freeze({
  wavelength: 11.5, amplitude: 0.57, steepness: 0.7, speed: 0.55, windDirection: 90, sets: 0.37, gusts: 0.44, crossWaves: 0.01, fadeStart: 260, fadeEnd: 2440,
  ripple: 0.63, rippleScale: 0.09,
  foamThreshold: 0.55, foamSoftness: 0.15, laceScale: 0.13, foamBrightness: 1,
  foamMemory: true, foamLife: 7, foamDeposit: 0.9, foamSwirl: 0.3, foamWindow: 200, foamDrift: 0.9, foamDry: 43, swashFilm: 0.03,
  waterColor: '#2c7a64', deepColor: '#143a40', bedColor: '#c4b08a', crestGlow: 0.6, glint: 1.4, skyReflection: 0.4,
  meshRings: 128, meshSegments: 128,
  // The volume itself.
  spray: true, sprayAmount: 1, sprayCurl: 0.35, sprayGrain: 8, sprayDensity: 2.4, sprayFar: 170, sprayMist: 0.4, sprayMistSize: 2.2, spraySpread: 1.6,
  volume: true, volumeHeight: 0.35, volumeDensity: 1, volumeDetail: 0.9, volumeErosion: 0.35, volumeNear: 120, volumeFar: 260,
  surfEnabled: true, surfHeight: 0.9, surfWidth: 9, surfBreakDistance: -6, surfBreakLength: 16, surfLean: 0.4, surfJet: 2, surfLift: 0.7, surfSheet: 0.16, surfRoller: 0.5, surfRollerDensity: 1, surfPeel: 0.05, surfRefraction: 0.7, surfBoreLength: 16, surfRunup: 6, surfSpeed: 4.5, surfPeriod: 9, surfSets: 0.5, surfFreeze: false, surfPhase: 0.5,
  timeOfDay: PUBLISHED.timeOfDay ?? 9.4, sunBearing: PUBLISHED.sunBearing ?? 338, sunNoonElevation: PUBLISHED.sunNoonElevation ?? 50, exposure: 1,
});
// The four weathers Denis names: the foam's character, not just its amount.
const PRESETS = {
  calm: { amplitude: 0.16, steepness: 0.3, gusts: 0.2, foamThreshold: 0.35, foamDeposit: 0.5, foamLife: 4, volumeHeight: 0.12, volumeDensity: 0.7, volumeErosion: 0.55, foamSwirl: 0.05, surfHeight: 0.3 },
  breeze: { amplitude: 0.42, steepness: 0.5, gusts: 0.4, foamThreshold: 0.5, foamDeposit: 0.75, foamLife: 6, volumeHeight: 0.22, volumeDensity: 0.9, volumeErosion: 0.45, foamSwirl: 0.2, surfHeight: 0.6 },
  rough: { amplitude: 0.75, steepness: 0.68, gusts: 0.6, foamThreshold: 0.62, foamDeposit: 0.95, foamLife: 9, volumeHeight: 0.38, volumeDensity: 1.15, volumeErosion: 0.32, foamSwirl: 0.45, surfHeight: 1.1 },
  storm: { amplitude: 1.25, steepness: 0.8, gusts: 0.85, foamThreshold: 0.78, foamDeposit: 1.3, foamLife: 14, volumeHeight: 0.6, volumeDensity: 1.5, volumeErosion: 0.2, foamSwirl: 0.9, surfHeight: 1.8 },
};
// The bench looks at open water: the foam under study is the whitecap on the
// swell, so the shore stays behind the camera and never fills the frame.
const VIEWS = {
  eye: { landscape: { position: at(-150, ALONG_MID, 1.8), target: at(-430, ALONG_MID + 40, 0.6) }, portrait: { position: at(-150, ALONG_MID, 2.2), target: at(-430, ALONG_MID + 40, 0.6) } },
  macro: { landscape: { position: at(-120, ALONG_MID, 1.1), target: at(-150, ALONG_MID + 6, 0.3) }, portrait: { position: at(-120, ALONG_MID, 1.3), target: at(-150, ALONG_MID + 6, 0.3) } },
  above: { landscape: { position: at(-140, ALONG_MID, 34), target: at(-210, ALONG_MID + 20, 0) }, portrait: { position: at(-140, ALONG_MID, 44), target: at(-210, ALONG_MID + 20, 0) } },
  far: { landscape: { position: at(-90, ALONG_MID, 9), target: at(-800, ALONG_MID + 90, 0.5) }, portrait: { position: at(-90, ALONG_MID, 11), target: at(-800, ALONG_MID + 90, 0.5) } },
  surf: { landscape: { position: at(4, ALONG_MID + 13, 2.0), target: at(-7, ALONG_MID, 0.7) }, portrait: { position: at(6, ALONG_MID + 16, 2.4), target: at(-7, ALONG_MID, 0.7) } },
  burst: { landscape: { position: at(-1, ALONG_MID + 5.5, 1.1), target: at(-8, ALONG_MID, 0.6) }, portrait: { position: at(0, ALONG_MID + 7, 1.3), target: at(-8, ALONG_MID, 0.6) } },
};
const LIMITS = { minDistance: 1, maxDistance: 500, minPolarAngle: 0.04, maxPolarAngle: Math.PI / 2 - 0.03 };
const STORAGE_KEY = 'ddg_foam_lab_v1';
const loadSettings = () => {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null');
    return saved && typeof saved === 'object' ? { ...DEFAULTS, ...saved, surfFreeze: false } : DEFAULTS;
  } catch { return DEFAULTS; }
};
const saveSettings = (settings) => { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage may be unavailable */ } };
const forgetSettings = () => { try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ } };

const COPY = {
  ru: { title: 'Пена · объём по принципу облаков', subtitle: 'кусок воды с валом · пена как объёмная среда · штиль, бриз, волнение, шторм', volume: 'Объём', field: 'Поле', wave: 'Волна', light: 'Свет', eye: 'С воды', macro: 'Вблизи', above: 'Сверху', far: 'Вдаль', surf: 'Прибой', burst: 'Всплеск', volumeOn: 'Объём включён', sprayOn: 'Брызги включены', sprayAmount: 'Брызги', sprayDensity: 'Плотность брызг', sprayGrain: 'Зерно брызг', sprayCurl: 'Завихрение брызг', sprayMist: 'Доля пара', sprayMistSize: 'Размер пара', spraySpread: 'Разброс поперёк', sprayFar: 'Дальность брызг', volumeHeight: 'Высота пены', volumeDensity: 'Плотность', volumeDetail: 'Масштаб комков', volumeErosion: 'Эрозия верха', volumeNear: 'Плоская с', volumeFar: 'Плоская к', brightness: 'Яркость пены', threshold: 'Порог пены', softness: 'Мягкость', deposit: 'Осаждение', life: 'Живёт на воде', window: 'Окно памяти', drift: 'Снос ветром', swirl: 'Завихрения', lace: 'Масштаб кружева', amplitude: 'Высота волны', wavelength: 'Длина волны', steepness: 'Крутизна', gusts: 'Порывы', speed: 'Скорость', wind: 'Направление ветра', surfHeight: 'Высота вала', surfEnabled: 'Вал включён', surfFreeze: 'Стоп-кадр', surfPhase: 'Фаза обрушения', time: 'Время суток', bearing: 'Направление солнца', elevation: 'Высота солнца', exposure: 'Экспозиция', pause: 'Пауза', play: 'Продолжить', reset: 'Сброс', calm: 'Штиль', breeze: 'Бриз', rough: 'Волнение', storm: 'Шторм', tri: 'треугольников', calls: 'вызовов', fps: 'кад/с', assets: 'Коллекции', metres: 'м', hours: 'ч', seconds: 'с', mps: 'м/с' },
  en: { title: 'Foam · volume by the clouds’ principle', subtitle: 'a patch of water with a breaker · foam as a medium · calm, breeze, rough, storm', volume: 'Volume', field: 'Field', wave: 'Wave', light: 'Light', eye: 'From the water', macro: 'Close', above: 'Above', far: 'Distance', surf: 'Surf', burst: 'Burst', volumeOn: 'Volume on', sprayOn: 'Spray on', sprayAmount: 'Spray', sprayDensity: 'Spray density', sprayGrain: 'Spray grain', sprayCurl: 'Spray swirl', sprayMist: 'Vapour share', sprayMistSize: 'Vapour size', spraySpread: 'Across-crest spread', sprayFar: 'Spray range', volumeHeight: 'Foam height', volumeDensity: 'Density', volumeDetail: 'Lump scale', volumeErosion: 'Top erosion', volumeNear: 'Flat from', volumeFar: 'Flat by', brightness: 'Foam brightness', threshold: 'Foam threshold', softness: 'Softness', deposit: 'Deposit', life: 'Lives on water', window: 'Memory window', drift: 'Wind drift', swirl: 'Swirl', lace: 'Lace scale', amplitude: 'Wave height', wavelength: 'Wavelength', steepness: 'Steepness', gusts: 'Gusts', speed: 'Speed', wind: 'Wind direction', surfHeight: 'Breaker height', surfEnabled: 'Breaker on', surfFreeze: 'Freeze', surfPhase: 'Break phase', time: 'Time of day', bearing: 'Sun bearing', elevation: 'Sun elevation', exposure: 'Exposure', pause: 'Pause', play: 'Resume', reset: 'Reset', calm: 'Calm', breeze: 'Breeze', rough: 'Rough', storm: 'Storm', tri: 'triangles', calls: 'draw calls', fps: 'fps', assets: 'Collections', metres: 'm', hours: 'h', seconds: 's', mps: 'm/s' },
};

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return <label className="water-lab__range"><span>{label}</span><output>{Number(value).toFixed(precision)}{unit && ` ${unit}`}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) { return <label className="water-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>; }
function LabStats({ onStats }) {
  const accumulator = React.useRef({ time: 0, frames: 0 });
  const { gl } = useThree();
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame(({ gl: renderer }, delta) => {
    const a = accumulator.current;
    a.time += delta; a.frames += 1;
    if (a.time >= 0.5) { onStats({ fps: a.frames / a.time, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }); a.time = 0; a.frames = 0; }
    renderer.info.reset();
  }, -100);
  return null;
}

export default function FoamLab() {
  const [language, setLanguage] = useState('ru');
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState('volume');
  const [view, setView] = useState('eye');
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden ?? false);
  const [stats, setStats] = useState({ fps: 0, triangles: 0, calls: 0 });
  const t = COPY[language];
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, sunBearing: settings.sunBearing, sunNoonElevation: settings.sunNoonElevation, cloudCover: 0 }), [settings.sunBearing, settings.sunNoonElevation, settings.timeOfDay]);
  const timeline = useMemo(() => createSceneTimeline(), []);
  const shoreDepth = useMemo(() => createShoreDepth(), []);
  const foamField = useMemo(() => createFoamFieldHolder(), []);
  const foamBores = useMemo(() => createFoamBores(), []);
  const geometry = useMemo(() => buildRadialWaterGeometry({ rings: settings.meshRings, segments: settings.meshSegments }), [settings.meshRings, settings.meshSegments]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const coast = useMemo(() => ({
    definition: DEFINITION, along0: ALONG0, length: CREST_LENGTH, shoreDepth, foamField, band: BAND,
    breakQ: breakLineMean(coastBreakLine(DEFINITION, settings.surfHeight, ALONG0, CREST_LENGTH, 8)) + settings.surfBreakDistance - 6,
  }), [foamField, settings.surfBreakDistance, settings.surfHeight, shoreDepth]);

  useEffect(() => { timeline.setActive(!paused && !hidden); }, [hidden, paused, timeline]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const range = (key, label, min, max, step, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;

  return <main className="water-lab" data-asset-collection="foam" lang={language}>
    <header className="water-lab__header"><div><p>DDG / ASSET LAB / {assetIndex('foam')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="water-lab__header-actions"><div>{['ru', 'en'].map((id) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{id.toUpperCase()}</button>)}</div><LabNav current="foam" lang={language} label={t.assets} /></div></header>
    <div className="water-lab__workspace"><section className="water-lab__viewer" aria-label="Foam viewport">
      <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} cameraFar={6000} fogRange={[900, 3600]} floorVisible={false} lighting={lighting} exposure={settings.exposure} environmentIntensity={1} paused={paused} inactive={hidden} pixelRatio={[1, 1.5]} background="#a9c8d9" shadowRadius={40}>
        <ShoreDepthMap coast={coast} />
        <GerstnerWaterSurface settings={settings} lighting={lighting} coast={coast} foamBores={settings.surfEnabled ? foamBores : null} timeline={timeline} />
        {settings.surfEnabled ? <BreakingWaves settings={settings} lighting={lighting} coast={coast} foamBores={foamBores} timeline={timeline} /> : null}
        {settings.volume ? <FoamVolume settings={settings} lighting={lighting} geometry={geometry} foamField={foamField} timeline={timeline} /> : null}
        <LabStats onStats={setStats} />
      </AssetStudio>
      <div className="water-lab__views" role="group" aria-label="Ракурс">{['eye', 'macro', 'above', 'far', 'surf', 'burst'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__presets" role="group" aria-label="Presets">{Object.keys(PRESETS).map((id) => <button key={id} onClick={() => setSettings((current) => ({ ...current, ...PRESETS[id] }))}>{t[id]}</button>)}</div>
    </section><aside className="water-lab__inspector">
      <div className="water-lab__tabs" role="tablist">{['volume', 'field', 'wave', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'volume' && <><Toggle label={t.sprayOn} value={settings.spray} onChange={(value) => set('spray', value)} />{range('sprayAmount', t.sprayAmount, 0, 2, 0.05)}{range('sprayDensity', t.sprayDensity, 0.5, 12, 0.1)}{range('sprayGrain', t.sprayGrain, 2, 30, 0.5)}{range('sprayMist', t.sprayMist, 0, 1, 0.05)}{range('sprayMistSize', t.sprayMistSize, 1, 8, 0.1)}{range('spraySpread', t.spraySpread, 0, 6, 0.1, t.metres)}{range('sprayCurl', t.sprayCurl, 0, 1, 0.05)}{range('sprayFar', t.sprayFar, 40, 220, 5, t.metres)}<Toggle label={t.volumeOn} value={settings.volume} onChange={(value) => set('volume', value)} />{range('volumeHeight', t.volumeHeight, 0, 1.2, 0.01, t.metres)}{range('volumeDensity', t.volumeDensity, 0.2, 2.5, 0.05)}{range('volumeDetail', t.volumeDetail, 0.2, 3, 0.05)}{range('volumeErosion', t.volumeErosion, 0, 0.9, 0.01)}{range('volumeNear', t.volumeNear, 20, 400, 5, t.metres)}{range('volumeFar', t.volumeFar, 40, 800, 5, t.metres)}{range('foamBrightness', t.brightness, 0.2, 2, 0.05)}</>}
        {tab === 'field' && <>{range('foamThreshold', t.threshold, 0, 0.95, 0.01)}{range('foamSoftness', t.softness, 0.02, 0.4, 0.01)}{range('foamDeposit', t.deposit, 0.2, 1.5, 0.05)}{range('foamLife', t.life, 1, 20, 0.5, t.seconds)}{range('foamWindow', t.window, 32, 400, 4, t.metres)}{range('foamDrift', t.drift, 0, 2, 0.05, t.mps)}{range('foamSwirl', t.swirl, 0, 1.5, 0.05)}{range('laceScale', t.lace, 0.03, 0.6, 0.01)}</>}
        {tab === 'wave' && <>{range('amplitude', t.amplitude, 0, 1.6, 0.01, t.metres)}{range('wavelength', t.wavelength, 3, 40, 0.5, t.metres)}{range('steepness', t.steepness, 0, 0.8, 0.01)}{range('gusts', t.gusts, 0, 1, 0.01)}{range('speed', t.speed, 0, 2.5, 0.05)}{range('windDirection', t.wind, 0, 360, 1, '°')}<Toggle label={t.surfEnabled} value={settings.surfEnabled} onChange={(value) => set('surfEnabled', value)} />{range('surfHeight', t.surfHeight, 0.2, 3, 0.05, t.metres)}<Toggle label={t.surfFreeze} value={settings.surfFreeze} onChange={(value) => set('surfFreeze', value)} />{range('surfPhase', t.surfPhase, 0, 1, 0.01)}</>}
        {tab === 'light' && <>{range('timeOfDay', t.time, 0, 24, 0.1, t.hours)}{range('sunBearing', t.bearing, -180, 360, 1, '°')}{range('sunNoonElevation', t.elevation, 10, 85, 1, '°')}{range('exposure', t.exposure, 0.3, 2, 0.05)}</>}
      </div>
      <div className="water-lab__transport"><button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button><button onClick={() => { forgetSettings(); setSettings(DEFAULTS); setView('eye'); setTab('volume'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="water-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{Math.round(stats.fps)}</b> {t.fps}</span></footer>
  </main>;
}
