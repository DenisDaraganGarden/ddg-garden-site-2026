import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import GerstnerWaterSurface from '../components/effects/water/GerstnerWaterSurface';
import BreakingWaves from '../components/effects/water/BreakingWaves';
import ShoreWater from '../components/effects/water/ShoreWater';
import { createSceneTimeline } from '../components/effects/sceneTimeline';
import { GERSTNER_MAX_STEEPNESS } from '../components/effects/water/gerstnerWaves';
import { createFoamBores, createFoamFieldHolder } from '../components/effects/water/foamField';
import { ShoreDepthMap, breakLineMean, coastBreakLine, createShoreDepth } from '../components/effects/water/coastFrame';
import { useWaterNoise } from '../components/effects/water/waterShading';
import { buildRuntimeQualityProfile } from '../components/effects/qualityProfile';
import AzovTerrain from '../terrain/AzovTerrain.jsx';
import { coastPoint, createTerrainDefinition } from '../terrain/terrainModel.js';
import { buildCoastRocks } from '../terrain/terrainRocks.js';
import './waterLab.css';

const PUBLISHED = getPublishedHomeSceneSettings();
// The published coast, the way the scene builds it, with the product's own
// water switched off: the swell and the breakers here are the new water. Two
// of its settings are worked on here and are not published yet — the bed's
// slope at the water's edge and the bars along it — so the coast the surf
// stands on is rebuilt when they move.
const DEFINITION = createTerrainDefinition(PUBLISHED);

// The stretch of shore the breakers work: the open beach running into the
// root of the spit, whose shoal bends the break line out to sea.
const ALONG0 = DEFINITION.terrainSpitPosition - 300;
const CREST_LENGTH = 280;
const ALONG_MID = ALONG0 + CREST_LENGTH * 0.5;
// World point from coast coordinates (q across the shore, s along it, y up).
const at = (q, s, y) => { const p = coastPoint(q, s, DEFINITION); return [p.x, y, p.z]; };
// The shore band: the water on the beach's own grid along the breakers' stretch,
// from the seam where the open-water mesh hands over.
const BAND = Object.freeze({ sMin: ALONG0 - 60, sMax: ALONG0 + CREST_LENGTH + 60, seam: -24 });
// Denis's tuning of 2026-09-08; the breaker at the 0.45 m he settled on.
const DEFAULTS = Object.freeze({
  wavelength: 11.5, amplitude: 0.57, steepness: 0.7, speed: 0.55, windDirection: 94, sets: 0.37, gusts: 0.44, crossWaves: 0.01, fadeStart: 260, fadeEnd: 2440,
  ripple: 0.63, rippleScale: 0.09,
  foamThreshold: 0.8, foamSoftness: 0.4, laceScale: 0.13, foamBrightness: 0.5,
  foamMemory: true, foamLife: 7, foamDeposit: 0.65, foamWindow: 228, foamDrift: 1.3, foamDry: 43, swashFilm: 0.03,
  waterColor: '#2c7a64', deepColor: '#143a40', bedColor: '#c4b08a', crestGlow: 0.6, glint: 2.05, skyReflection: 0.3,
  meshRings: 152, meshSegments: 104, wireframe: false,
  surfEnabled: true, surfHeight: 0.45, surfWidth: 9, surfBreakDistance: 0, surfBreakLength: 16, surfLean: 0.29, surfJet: 1.9, surfLift: 0.25, surfSheet: 0.16, surfRoller: 0.5, surfRollerDensity: 1, surfPeel: 0.06, surfRefraction: 0.7, surfBoreLength: 14, surfRunup: 6, surfSpeed: 4.5, surfPeriod: 9, surfSets: 0.5, surfFreeze: false, surfPhase: 0.5,
  timeOfDay: PUBLISHED.timeOfDay ?? 9.4, sunBearing: PUBLISHED.sunBearing ?? 338, sunNoonElevation: PUBLISHED.sunNoonElevation ?? 50, exposure: 1,
  // The bed of Denis's surf sheet: 1:50 at the water's edge, with bars on it.
  // At the published 1:4.4 a half-metre wave breaks four metres from the sand
  // and the bore has nowhere to run, which is what «Сдвиг обрушения» was for.
  shoreSlope: 50, bars: 0.45,
});
const PRESETS = {
  calm: { wavelength: 9, amplitude: 0.12, steepness: 0.25, sets: 0.3, crossWaves: 0.3, ripple: 0.5, foamThreshold: 0.3, foamLife: 5, foamDeposit: 0.6, surfHeight: 0.4, surfJet: 1.1, surfLift: 0.4 },
  breeze: { wavelength: 14, amplitude: 0.42, steepness: 0.55, sets: 0.6, crossWaves: 0.5, ripple: 0.35, foamThreshold: 0.55, foamLife: 7, foamDeposit: 0.8, surfHeight: 0.8, surfJet: 1.4, surfLift: 0.5 },
  rough: { wavelength: 18, amplitude: 0.75, steepness: 0.7, sets: 0.7, crossWaves: 0.6, ripple: 0.35, foamThreshold: 0.6, foamLife: 9, foamDeposit: 0.9, surfHeight: 1.2, surfJet: 1.7, surfLift: 0.6 },
  storm: { wavelength: 26, amplitude: 1.3, steepness: 0.8, sets: 0.5, crossWaves: 0.85, ripple: 0.4, foamThreshold: 0.65, foamLife: 12, foamDeposit: 1.1, surfHeight: 1.8, surfJet: 2.2, surfLift: 0.8 },
};
// The cameras are built around the breaker that is actually drawn — the break
// line plus «Сдвиг обрушения» — so «Труба» and «Губа» look at the wave and not
// at the water where physics alone would have put it.
const buildViews = (BREAK_Q) => ({
  shore: { landscape: { position: at(6, ALONG_MID, 3.2), target: at(-45, ALONG_MID, 0.4) }, portrait: { position: at(9, ALONG_MID, 4), target: at(-45, ALONG_MID, 0.4) } },
  above: { landscape: { position: at(-95, ALONG_MID, 42), target: at(-40, ALONG_MID, 0) }, portrait: { position: at(-120, ALONG_MID, 55), target: at(-40, ALONG_MID, 0) } },
  macro: { landscape: { position: at(-48, ALONG_MID + 4.5, 1.7), target: at(-56, ALONG_MID, 0.2) }, portrait: { position: at(-46, ALONG_MID + 6, 2.3), target: at(-56, ALONG_MID, 0.2) } },
  surf: { landscape: { position: at(BREAK_Q + 26, ALONG_MID + 6, 2.4), target: at(BREAK_Q, ALONG_MID, 0.7) }, portrait: { position: at(BREAK_Q + 32, ALONG_MID + 8, 3), target: at(BREAK_Q, ALONG_MID, 0.7) } },
  surfSide: { landscape: { position: at(BREAK_Q + 8, ALONG_MID - 12, 1.4), target: at(BREAK_Q + 1, ALONG_MID, 0.6) }, portrait: { position: at(BREAK_Q + 9, ALONG_MID - 15, 1.7), target: at(BREAK_Q + 1, ALONG_MID, 0.6) } },
  lip: { landscape: { position: at(BREAK_Q + 13, ALONG_MID + 8, 1.4), target: at(BREAK_Q + 2, ALONG_MID, 0.6) }, portrait: { position: at(BREAK_Q + 16, ALONG_MID + 10, 1.7), target: at(BREAK_Q + 2, ALONG_MID, 0.6) } },
  surfAbove: { landscape: { position: at(BREAK_Q - 46, ALONG_MID, 44), target: at(BREAK_Q + 12, ALONG_MID, 0) }, portrait: { position: at(BREAK_Q - 62, ALONG_MID, 60), target: at(BREAK_Q + 12, ALONG_MID, 0) } },
  spit: { landscape: { position: at(-260, DEFINITION.terrainSpitPosition + 260, 90), target: at(-110, DEFINITION.terrainSpitPosition + 40, 0) }, portrait: { position: at(-330, DEFINITION.terrainSpitPosition + 330, 120), target: at(-110, DEFINITION.terrainSpitPosition + 40, 0) } },
  // The waterline itself, from a metre above the sand: the swash, the lace and
  // the seam between the water and the beach at the scale they are made at.
  edge: { landscape: { position: at(9, ALONG_MID + 5, 1.25), target: at(-1, ALONG_MID, 0.05) }, portrait: { position: at(11, ALONG_MID + 6, 1.5), target: at(-1, ALONG_MID, 0.05) } },
});
const LIMITS = { minDistance: 1, maxDistance: 900, minPolarAngle: 0.04, maxPolarAngle: Math.PI / 2 - 0.03 };
// The sliders survive a reload, per origin like the editor's; «Сброс» forgets them.
const STORAGE_KEY = 'ddg_water_lab_v1';
const loadSettings = () => {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null');
    return saved && typeof saved === 'object' ? { ...DEFAULTS, ...saved, surfFreeze: false } : DEFAULTS;
  } catch { return DEFAULTS; }
};
const saveSettings = (settings) => { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage may be unavailable */ } };
const forgetSettings = () => { try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ } };

const COPY = {
  ru: { title: 'Вода · волны и пена', subtitle: 'Герстнер от камеры до горизонта · губа прибоя баллистикой · пена из облачного шума', waves: 'Волны', surf: 'Прибой', foam: 'Пена', look: 'Вид', light: 'Свет', shore: 'Берег', above: 'Сверху', macro: 'Гребень', surfView: 'Прибой', surfSide: 'Труба', lip: 'Губа', surfAbove: 'Прибой сверху', spit: 'Коса', edge: 'Урез', wavelength: 'Длина волны', amplitude: 'Высота волны', steepness: 'Крутизна', speed: 'Скорость', wind: 'Направление ветра', sets: 'Наборы', gusts: 'Порывы', cross: 'Поперечные волны', fadeStart: 'Волны гаснут с', fadeEnd: 'Волны гаснут до', ripple: 'Рябь', rippleScale: 'Масштаб ряби', threshold: 'Порог пены', softness: 'Мягкость', lace: 'Масштаб кружева', brightness: 'Яркость пены', foamMemory: 'Память пены', foamLife: 'Живёт на воде', foamDeposit: 'Плотность пены', foamWindow: 'Окно памяти', foamDrift: 'Снос ветром', foamDry: 'Сохнет песок', swashFilm: 'Плёнка заплеска', water: 'Цвет воды', deep: 'Цвет глубины', bed: 'Цвет дна', glow: 'Просвет гребня', glint: 'Блики солнца', sky: 'Отражение неба', rings: 'Кольца сетки', segments: 'Сегменты сетки', wireframe: 'Каркас', surfEnabled: 'Прибой включён', surfHeight: 'Высота вала', surfWidth: 'Ширина вала', surfBreakDistance: 'Сдвиг обрушения', shoreSlope: 'Пологость дна 1:N', bars: 'Бары и отмели', surfBreakLength: 'Длина обрушения', surfLean: 'Наклон гребня', surfJet: 'Выброс губы', surfLift: 'Подъём губы', surfSheet: 'Толщина губы', surfRoller: 'Объём пены', surfRollerDensity: 'Плотность вала', surfPeel: 'Пил вдоль гребня', surfRefraction: 'Рефракция', surfBoreLength: 'Схлопывание', surfRunup: 'Заплеск на песок', surfSpeed: 'Скорость вала', surfPeriod: 'Период', surfSets: 'Разброс высоты', surfFreeze: 'Стоп-кадр', surfPhase: 'Фаза обрушения', time: 'Время суток', bearing: 'Направление солнца', elevation: 'Высота солнца', exposure: 'Экспозиция', pause: 'Пауза', play: 'Продолжить', reset: 'Сброс', calm: 'Штиль', breeze: 'Бриз', rough: 'Волнение', storm: 'Шторм', tri: 'треугольников', calls: 'вызовов', fps: 'кад/с', budget: 'крутизна', assets: 'Коллекции', metres: 'м', hours: 'ч', seconds: 'с', mps: 'м/с', rad: 'рад' },
  en: { title: 'Water · waves and foam', subtitle: 'Gerstner from the camera to the horizon · a ballistic lip · foam from the cloud noise', waves: 'Waves', surf: 'Surf', foam: 'Foam', look: 'Look', light: 'Light', shore: 'Shore', above: 'Above', macro: 'Crest', surfView: 'Surf', surfSide: 'Tube', lip: 'Lip', surfAbove: 'Surf above', spit: 'Spit', edge: 'Waterline', wavelength: 'Wavelength', amplitude: 'Wave height', steepness: 'Steepness', speed: 'Speed', wind: 'Wind direction', sets: 'Sets', gusts: 'Gusts', cross: 'Cross waves', fadeStart: 'Waves fade from', fadeEnd: 'Waves fade to', ripple: 'Ripple', rippleScale: 'Ripple scale', threshold: 'Foam threshold', softness: 'Softness', lace: 'Lace scale', brightness: 'Foam brightness', foamMemory: 'Foam memory', foamLife: 'Lives on water', foamDeposit: 'Foam density', foamWindow: 'Memory window', foamDrift: 'Wind drift', foamDry: 'Sand dries in', swashFilm: 'Swash film', water: 'Water colour', deep: 'Deep colour', bed: 'Bed colour', glow: 'Crest glow', glint: 'Sun glints', sky: 'Sky reflection', rings: 'Mesh rings', segments: 'Mesh segments', wireframe: 'Wireframe', surfEnabled: 'Surf enabled', surfHeight: 'Breaker height', surfWidth: 'Breaker width', surfBreakDistance: 'Break offset', shoreSlope: 'Bed slope 1:N', bars: 'Bars and shoals', surfBreakLength: 'Breaking length', surfLean: 'Crest lean', surfJet: 'Lip throw', surfLift: 'Lip lift', surfSheet: 'Lip thickness', surfRoller: 'Foam volume', surfRollerDensity: 'Roller density', surfPeel: 'Peel along crest', surfRefraction: 'Refraction', surfBoreLength: 'Collapse', surfRunup: 'Run-up on sand', surfSpeed: 'Breaker speed', surfPeriod: 'Period', surfSets: 'Height variation', surfFreeze: 'Freeze', surfPhase: 'Break phase', time: 'Time of day', bearing: 'Sun bearing', elevation: 'Sun elevation', exposure: 'Exposure', pause: 'Pause', play: 'Resume', reset: 'Reset', calm: 'Calm', breeze: 'Breeze', rough: 'Rough', storm: 'Storm', tri: 'triangles', calls: 'draw calls', fps: 'fps', budget: 'steepness', assets: 'Collections', metres: 'm', hours: 'h', seconds: 's', mps: 'm/s', rad: 'rad' },
};

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return <label className="water-lab__range"><span>{label}</span><output>{Number(value).toFixed(precision)}{unit && ` ${unit}`}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
// Paused, the canvas draws on demand only. A slider moved while the wave stands
// still has to ask for the one frame that shows what it did.
function RedrawOnChange({ of }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate, of]);
  return null;
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

export default function WaterLab() {
  const [language, setLanguage] = useState('ru');
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState('waves');
  const [view, setView] = useState('surf');
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden ?? false);
  const [stats, setStats] = useState({ fps: 0, triangles: 0, calls: 0 });
  const t = COPY[language];
  const noise = useWaterNoise(null);
  // The water's clock stands still with the scene: pausing must not let the
  // waves jump ahead by the wall time that passed.
  const timeline = useMemo(() => createSceneTimeline(), []);
  useEffect(() => { timeline.setActive(!paused && !hidden); }, [hidden, paused, timeline]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  const lighting = useMemo(() => buildHomeSceneLighting({ ...PUBLISHED, timeOfDay: settings.timeOfDay, sunBearing: settings.sunBearing, sunNoonElevation: settings.sunNoonElevation, cloudCover: 0 }), [settings.sunBearing, settings.sunNoonElevation, settings.timeOfDay]);
  const qualityProfile = useMemo(() => buildRuntimeQualityProfile('public', window.innerWidth), []);
  // The coast frame every water surface shares, and where the swell hands over
  // to the breakers: the mean break line of the breaker being drawn.
  const { shoreSlope, bars } = settings;
  // The slider is the slope Denis draws with, 1:N; the coast stores the knee
  // in metres, so a coast of another depth keeps its own profile.
  const knee = shoreSlope * (PUBLISHED.waterDepthMeters ?? PUBLISHED.waterDepth ?? 2.75);
  const definition = useMemo(() => createTerrainDefinition({ ...PUBLISHED, terrainShoreKnee: knee, terrainBars: bars }), [bars, knee]);
  const terrainSettings = useMemo(() => ({ ...PUBLISHED, waterVisible: false, terrainShoreKnee: knee, terrainBars: bars }), [bars, knee]);
  const rocks = useMemo(() => buildCoastRocks(definition), [definition]);
  const shoreDepth = useMemo(() => createShoreDepth(), []);
  const foamField = useMemo(() => createFoamFieldHolder(), []);
  const coast = useMemo(() => ({
    definition, along0: ALONG0, length: CREST_LENGTH, shoreDepth, foamField, band: BAND,
    breakQ: breakLineMean(coastBreakLine(definition, settings.surfHeight, ALONG0, CREST_LENGTH, 8)) + settings.surfBreakDistance - 6,
  }), [definition, foamField, settings.surfBreakDistance, settings.surfHeight, shoreDepth]);
  const views = useMemo(() => buildViews(coast.breakQ + 6), [coast.breakQ]);
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
      <AssetStudio view={view} cameraViews={views} cameraLimits={LIMITS} cameraFar={6000} fogRange={[1200, 4500]} floorVisible={false} lighting={lighting} exposure={settings.exposure} environmentIntensity={1} paused={paused} inactive={hidden} pixelRatio={[1, 1.5]} background="#a9c8d9" shadowRadius={40}>
        <ShoreDepthMap coast={coast} />
        <GerstnerWaterSurface settings={settings} lighting={lighting} noise={noise} wireframe={settings.wireframe} coast={coast} foamBores={settings.surfEnabled ? foamBores : null} timeline={timeline} />
        <ShoreWater settings={settings} lighting={lighting} noise={noise} coast={coast} timeline={timeline} wireframe={settings.wireframe} />
        {settings.surfEnabled ? <BreakingWaves settings={settings} lighting={lighting} noise={noise} coast={coast} foamBores={foamBores} timeline={timeline} wireframe={settings.wireframe} /> : null}
        <RedrawOnChange of={settings} />
        <Suspense fallback={null}><AzovTerrain definition={definition} settings={terrainSettings} qualityProfile={qualityProfile} lighting={lighting} sky={null} runtime={null} rocks={rocks} swash={foamField} /></Suspense>
        <LabStats onStats={setStats} />
      </AssetStudio>
      <div className="water-lab__views" role="group" aria-label="Ракурс">{['shore', 'above', 'macro', 'surf', 'surfSide', 'lip', 'surfAbove', 'spit', 'edge'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{viewLabel(id)}</button>)}</div>
      <div className="water-lab__presets" role="group" aria-label="Presets">{Object.keys(PRESETS).map((id) => <button key={id} onClick={() => setSettings((current) => ({ ...current, ...PRESETS[id] }))}>{t[id]}</button>)}</div>
    </section><aside className="water-lab__inspector">
      <div className="water-lab__tabs" role="tablist">{['waves', 'surf', 'foam', 'look', 'light'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
      <div className="water-lab__controls" role="tabpanel" aria-label={t[tab]}>
        {tab === 'waves' && <>{range('wavelength', t.wavelength, 3, 40, 0.5, t.metres)}{range('amplitude', t.amplitude, 0, 1.6, 0.01, t.metres)}{range('steepness', t.steepness, 0, GERSTNER_MAX_STEEPNESS, 0.01)}{range('speed', t.speed, 0, 2.5, 0.05)}{range('windDirection', t.wind, 0, 360, 1, '°')}{range('sets', t.sets, 0, 1, 0.01)}{range('gusts', t.gusts, 0, 1, 0.01)}{range('crossWaves', t.cross, 0, 1, 0.01)}{range('fadeStart', t.fadeStart, 20, 1500, 10, t.metres)}{range('fadeEnd', t.fadeEnd, 40, 3000, 10, t.metres)}</>}
        {tab === 'surf' && <><Toggle label={t.surfEnabled} value={settings.surfEnabled} onChange={(value) => set('surfEnabled', value)} /><Toggle label={t.surfFreeze} value={settings.surfFreeze} onChange={(value) => set('surfFreeze', value)} />{range('surfPhase', t.surfPhase, 0, 1, 0.01)}{range('surfHeight', t.surfHeight, 0.2, 3, 0.05, t.metres)}{range('surfWidth', t.surfWidth, 3, 24, 0.5, t.metres)}{range('surfBreakDistance', t.surfBreakDistance, -20, 40, 0.5, t.metres)}{range('shoreSlope', t.shoreSlope, 3, 80, 0.5)}{range('bars', t.bars, 0, 1, 0.01)}{range('surfBreakLength', t.surfBreakLength, 4, 40, 1, t.metres)}{range('surfLean', t.surfLean, 0, 1, 0.01)}{range('surfJet', t.surfJet, 0.3, 4, 0.05, t.mps)}{range('surfLift', t.surfLift, 0, 2, 0.05, t.mps)}{range('surfSheet', t.surfSheet, 0.04, 0.4, 0.01)}{range('surfRoller', t.surfRoller, 0, 1.2, 0.02)}{range('surfRollerDensity', t.surfRollerDensity, 0.2, 2.5, 0.05)}{range('surfPeel', t.surfPeel, 0, 0.6, 0.01)}{range('surfRefraction', t.surfRefraction, 0, 1, 0.01)}{range('surfBoreLength', t.surfBoreLength, 3, 40, 1, t.metres)}{range('surfRunup', t.surfRunup, 0, 12, 1, t.metres)}{range('surfSpeed', t.surfSpeed, 1, 10, 0.1, t.mps)}{range('surfPeriod', t.surfPeriod, 3, 20, 0.5, t.seconds)}{range('surfSets', t.surfSets, 0, 1, 0.01)}</>}
        {tab === 'foam' && <><Toggle label={t.foamMemory} value={settings.foamMemory} onChange={(value) => set('foamMemory', value)} />{range('foamLife', t.foamLife, 1, 20, 0.5, t.seconds)}{range('foamDeposit', t.foamDeposit, 0.2, 1.5, 0.05)}{range('foamWindow', t.foamWindow, 32, 400, 4, t.metres)}{range('foamDrift', t.foamDrift, 0, 2, 0.05, t.mps)}{range('foamDry', t.foamDry, 5, 120, 1, t.seconds)}{range('swashFilm', t.swashFilm, 0, 0.08, 0.005, t.metres)}{range('foamThreshold', t.threshold, 0, 0.95, 0.01)}{range('foamSoftness', t.softness, 0.02, 0.4, 0.01)}{range('laceScale', t.lace, 0.03, 0.6, 0.01)}{range('foamBrightness', t.brightness, 0.2, 2, 0.05)}{range('ripple', t.ripple, 0, 1, 0.01)}{range('rippleScale', t.rippleScale, 0.01, 0.3, 0.005)}</>}
        {tab === 'look' && <><ColorField label={t.water} value={settings.waterColor} onChange={(value) => set('waterColor', value)} /><ColorField label={t.deep} value={settings.deepColor} onChange={(value) => set('deepColor', value)} /><ColorField label={t.bed} value={settings.bedColor} onChange={(value) => set('bedColor', value)} />{range('crestGlow', t.glow, 0, 2, 0.05)}{range('glint', t.glint, 0, 3, 0.05)}{range('skyReflection', t.sky, 0, 3, 0.05)}{range('meshRings', t.rings, 32, 192, 8)}{range('meshSegments', t.segments, 48, 256, 8)}<Toggle label={t.wireframe} value={settings.wireframe} onChange={(value) => set('wireframe', value)} /></>}
        {tab === 'light' && <>{range('timeOfDay', t.time, 0, 24, 0.1, t.hours)}{range('sunBearing', t.bearing, -180, 360, 1, '°')}{range('sunNoonElevation', t.elevation, 10, 85, 1, '°')}{range('exposure', t.exposure, 0.3, 2, 0.05)}</>}
      </div>
      <div className="water-lab__transport"><button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button><button onClick={() => { forgetSettings(); setSettings(DEFAULTS); setView('surf'); setTab('waves'); }}>{t.reset}</button></div>
    </aside></div>
    <footer className="water-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span><b>{Math.round(stats.fps)}</b> {t.fps}</span><span><b>Σ Q·k·A = {Number(settings.steepness).toFixed(2)}</b> {t.budget}</span></footer>
  </main>;
}
