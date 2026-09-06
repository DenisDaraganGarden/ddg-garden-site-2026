import React, { useEffect, useMemo, useRef, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { TankerSound } from '../tanker/audio';
import TankerStage from './TankerStage';
import './tankerLab.css';

const CAMERA_VIEWS = {
  full: { landscape: { position: [4.6, 2.7, 8.5], target: [0, -0.28, 0] }, portrait: { position: [5.7, 3.3, 12.4], target: [0, -0.28, 0] } },
  side: { landscape: { position: [0, 0.4, 12.5], target: [0, -0.3, 0] }, portrait: { position: [0, 0.5, 17], target: [0, -0.3, 0] } },
  bow: { landscape: { position: [5.9, 1.1, 2.9], target: [1.7, -0.63, 0] }, portrait: { position: [7.9, 2.4, 4.8], target: [1.0, -0.4, 0] } },
  deck: { landscape: { position: [1.4, 8.8, 3.3], target: [0, -0.3, 0] }, portrait: { position: [2.5, 12.5, 4.5], target: [0, -0.3, 0] } },
  bridge: { landscape: { position: [-3.5, 0.9, 2.2], target: [-2.27, -0.32, 0] }, portrait: { position: [-4.3, 1.4, 3.1], target: [-2.27, -0.32, 0] } },
  underside: { landscape: { position: [3.7, -3.3, 7.5], target: [0, -0.8, 0] }, portrait: { position: [5.5, -5.5, 12.2], target: [0, -0.8, 0] } },
  horizon: { landscape: { position: [0.6, -0.1, 11.5], target: [0, -0.63, 0] }, portrait: { position: [0.6, 0.2, 12.8], target: [0, -0.63, 0] } },
};
const CAMERA_LIMITS = { minDistance: 0.45, maxDistance: 30, minPolarAngle: 0.04, maxPolarAngle: Math.PI - 0.04 };
const DEFAULTS = {
  mode: 'studio', lod: 'near', count: 1, speed: 8, seaState: 0.35, heading: 0,
  timeScale: 1, travel: true, wake: 0.75, distance: 180,
  wear: 0.28, wetness: 0.35, roughness: 0.66, color: '#a62f23', wireframe: false,
  lightMode: 'studio', timeOfDay: 16.3, cloudCover: 0.2, exposure: 1.04, environmentIntensity: 0.7,
  engineGain: 0.65, wakeGain: 0.4,
  audio: { enabled: true, mode: 'soundscape', masterGain: 0.72, ambienceGain: 0.78, spatialGain: 0.92, spatialEnabled: true, tracks: { tanker: { enabled: true, gain: 0.65 } } },
};
const TEXT = {
  ru: { title: 'Речной танкер', subtitle: '138 м · стальной корпус · процедурная модель', studio: 'Студия', passage: 'На ходу', horizon: 'Горизонт', vessel: 'Судно', motion: 'Ход', material: 'Материал', light: 'Свет', sound: 'Звук', full: 'Общий', side: 'Борт', bow: 'Нос', deck: 'Сверху', bridge: 'Надстройка', underside: 'Снизу', play: 'Продолжить', pause: 'Пауза', mute: 'Выключить звук', unmute: 'Включить звук', horn: 'Гудок', speed: 'Скорость', waves: 'Волнение', course: 'Курс', time: 'Темп просмотра', travel: 'Перемещение', wake: 'Кильватер', distance: 'Дальность', detail: 'Геометрия', near: 'Ближняя', far: 'Горизонт', count: 'Судов', wire: 'Каркас', hull: 'Краска корпуса', wear: 'Потёки', wet: 'Влажность', rough: 'Шероховатость', lighting: 'Освещение', scene: 'Свет сцены', hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', master: 'Общая громкость', ambience: 'Окружение', spatial: 'Шина 3D', track: 'Танкер', diesel: 'Дизель', wash: 'Шум воды', spatialize: '3D-позиционирование', mode: 'Режим микшера', off: 'Выкл.', music: 'Музыка', soundscape: 'Окружение', hybrid: 'Вместе', reset: 'Исходный вид', download: 'Скачать GLB', synthetic: 'Процедурный дизель / винт / пневмогудок', loading: 'Звук включается…', audioError: 'Не удалось включить звук', model: 'модель', draws: 'вызовы', rendered: 'кадр', rpm: 'об/мин', knots: 'уз', metres: 'м', assets: 'Коллекции' },
  en: { title: 'River–sea tanker', subtitle: '138 m · steel hull · procedural model', studio: 'Studio', passage: 'Under way', horizon: 'Horizon', vessel: 'Vessel', motion: 'Motion', material: 'Material', light: 'Light', sound: 'Sound', full: 'Overview', side: 'Broadside', bow: 'Bow', deck: 'Deck', bridge: 'Bridge', underside: 'Underside', play: 'Resume', pause: 'Pause', mute: 'Mute', unmute: 'Enable sound', horn: 'Horn', speed: 'Speed', waves: 'Sea state', course: 'Heading', time: 'Preview rate', travel: 'Translation', wake: 'Wake', distance: 'Distance', detail: 'Geometry', near: 'Near', far: 'Horizon', count: 'Vessels', wire: 'Wireframe', hull: 'Hull paint', wear: 'Weathering', wet: 'Wetness', rough: 'Roughness', lighting: 'Lighting', scene: 'Scene light', hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', master: 'Master', ambience: 'Ambience', spatial: '3D bus', track: 'Tanker', diesel: 'Diesel', wash: 'Water wash', spatialize: '3D positioning', mode: 'Mixer mode', off: 'Off', music: 'Music', soundscape: 'Soundscape', hybrid: 'Hybrid', reset: 'Initial view', download: 'Download GLB', synthetic: 'Procedural diesel / propeller / air horn', loading: 'Enabling sound…', audioError: 'Could not enable sound', model: 'model', draws: 'draw calls', rendered: 'frame', rpm: 'rpm', knots: 'kn', metres: 'm', assets: 'Collections' },
};

function Range({ label, value, min = 0, max = 1, step = 0.01, unit = '', onChange }) {
  return <label className="tanker-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : 2)}{unit && ` ${unit}`}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Toggle({ label, value, onChange }) {
  return <label className="tanker-lab__toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /></label>;
}

export default function TankerLab() {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const [settings, setSettings] = useState(DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('vessel');
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(document.hidden);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [stats, setStats] = useState({ triangles: 8348, calls: 0, renderedTriangles: 0, rpm: 0, metres: 0, rms: 0 });
  const audioRef = useRef(null);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const setAudio = (key, value) => setSettings((current) => ({ ...current, audio: { ...current.audio, [key]: value } }));
  const lighting = useMemo(() => buildHomeSceneLighting({
    timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover, sunNoonElevation: 45,
    sunBearing: -40, sunIntensity: 1.2, ambientIntensity: 0.22, hemisphereIntensity: 0.7,
    hemisphereSkyColor: '#d4deec', hemisphereGroundColor: '#655950',
  }), [settings.cloudCover, settings.timeOfDay]);

  const chooseMode = (mode) => {
    setSettings((current) => ({ ...current, mode, count: 1, lod: mode === 'horizon' ? 'horizon' : 'near', distance: mode === 'horizon' ? 1200 : 180 }));
    setView(mode === 'horizon' ? 'horizon' : 'full');
  };
  const toggleAudio = async () => {
    setAudioBusy(true);
    setAudioError('');
    try {
      if (!audioRef.current) {
        const Constructor = window.AudioContext ?? window.webkitAudioContext;
        if (!Constructor) throw new Error('Web Audio unavailable');
        const context = new Constructor({ latencyHint: 'playback' });
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 4;
        limiter.connect(context.destination);
        audioRef.current = { context, limiter, sound: new TankerSound({ context, destination: limiter }), enabled: false };
      }
      const next = !audioRef.current.enabled;
      if (next) await audioRef.current.context.resume();
      else await audioRef.current.context.suspend();
      audioRef.current.enabled = next;
      setAudioEnabled(next);
    } catch (error) {
      setAudioError(`${t.audioError}: ${error.message}`);
    } finally {
      setAudioBusy(false);
    }
  };
  useEffect(() => {
    const onVisibility = () => {
      setHidden(document.hidden);
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) void audio.context.suspend();
      else if (audio.enabled) void audio.context.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      const audio = audioRef.current;
      if (audio) { audio.sound.dispose(); audio.limiter.disconnect(); void audio.context.close(); audioRef.current = null; }
    };
  }, []);

  const range = (key, label, min = 0, max = 1, step = 0.01, unit = '') => <Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const audioRange = (key, label) => <Range key={key} label={label} value={settings.audio[key]} onChange={(value) => setAudio(key, value)} />;

  return (
    <main className="tanker-lab" data-testid="tanker-lab" data-asset-collection="tanker" lang={language}>
      <header className="tanker-lab__header">
        <div><p>DDG / ASSET LAB / {assetIndex('tanker')}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div>
        <div className="tanker-lab__header-actions">
          <div className="tanker-lab__languages">{['ru', 'en'].map((lang) => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
          <LabNav current="tanker" lang={language} label={t.assets} />
        </div>
      </header>
      <div className="tanker-lab__workspace">
        <section className="tanker-lab__viewer" aria-label={language === 'ru' ? '3D-модель танкера' : 'Tanker 3D viewport'}>
          <AssetStudio
            view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
            waterReflection={settings.mode !== 'studio' && view !== 'underside'} waterY={-0.78}
            floorVisible={view !== 'underside'}
            lighting={settings.lightMode === 'scene' ? lighting : undefined}
            exposure={settings.exposure} environmentIntensity={settings.environmentIntensity}
            paused={hidden}
          >
            <TankerStage settings={settings} night={settings.lightMode === 'scene' ? lighting.sky.night : 0} audioRef={audioRef} onStats={setStats} paused={paused || hidden} />
          </AssetStudio>
          <div className="tanker-lab__views" role="group" aria-label="Ракурс">
            {['full', 'side', 'bow', 'deck', 'bridge', 'underside'].map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}
          </div>
          <div className="tanker-lab__scale"><span>138 {t.metres}</span><i /></div>
        </section>
        <aside className="tanker-lab__inspector">
          <div className="tanker-lab__modes" role="group" aria-label="Режим сцены">{['studio', 'passage', 'horizon'].map((mode) => <button key={mode} aria-pressed={settings.mode === mode} onClick={() => chooseMode(mode)}>{t[mode]}</button>)}</div>
          <div className="tanker-lab__tabs" role="tablist">{['vessel', 'motion', 'material', 'light', 'sound'].map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
          <div className="tanker-lab__controls" role="tabpanel" aria-label={t[tab]}>
            {tab === 'vessel' && <>
              <label className="tanker-lab__select"><span>{t.detail}</span><select aria-label={t.detail} value={settings.lod} onChange={(e) => set('lod', e.target.value)}><option value="near">{t.near} · 8 348</option><option value="horizon">{t.far} · 860</option></select></label>
              <label className="tanker-lab__select"><span>{t.count}</span><select aria-label={t.count} value={settings.count} onChange={(e) => { set('count', Number(e.target.value)); if (Number(e.target.value) > 1) { set('lod', 'horizon'); set('mode', 'studio'); setView('full'); } }}><option value="1">1</option><option value="8">8</option></select></label>
              <Toggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
              <dl><div><dt>LOA</dt><dd>138.0 m</dd></div><div><dt>Beam</dt><dd>16.6 m</dd></div><div><dt>Draft</dt><dd>4.5 m</dd></div><div><dt>LOD 0 / 1</dt><dd>8 348 / 860 tri</dd></div></dl>
              <a className="tanker-lab__download" href={new URL(`../../assets-source/models/tanker/river-sea-tanker-${settings.lod}.glb`, import.meta.url).href} download>{t.download} ↗</a>
            </>}
            {tab === 'motion' && <>{range('speed', t.speed, 0, 14, 0.1, t.knots)}{range('seaState', t.waves)}{range('heading', t.course, -180, 180, 1, '°')}{range('timeScale', t.time, 0.25, 4, 0.25, '×')}{range('wake', t.wake)}{range('distance', t.distance, 45, 3000, 5, t.metres)}<Toggle label={t.travel} value={settings.travel} onChange={(value) => set('travel', value)} /></>}
            {tab === 'material' && <><label className="tanker-lab__toggle"><span>{t.hull}</span><input type="color" aria-label={t.hull} value={settings.color} onChange={(e) => set('color', e.target.value)} /></label>{range('wear', t.wear)}{range('wetness', t.wet)}{range('roughness', t.rough, 0.18, 0.95)}</>}
            {tab === 'light' && <><label className="tanker-lab__select"><span>{t.lighting}</span><select aria-label={t.lighting} value={settings.lightMode} onChange={(e) => set('lightMode', e.target.value)}><option value="studio">{t.studio}</option><option value="scene">{t.scene}</option></select></label>{range('timeOfDay', t.hour, 0, 24, 0.1, 'h')}{range('cloudCover', t.clouds)}{range('exposure', t.exposure, 0.2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
            {tab === 'sound' && <><label className="tanker-lab__select"><span>{t.mode}</span><select aria-label={t.mode} value={settings.audio.mode} onChange={(e) => setAudio('mode', e.target.value)}>{['off', 'music', 'soundscape', 'hybrid'].map((id) => <option key={id} value={id}>{t[id]}</option>)}</select></label>{audioRange('masterGain', t.master)}{audioRange('ambienceGain', t.ambience)}{audioRange('spatialGain', t.spatial)}<Range label={t.track} value={settings.audio.tracks.tanker.gain} onChange={(gain) => setAudio('tracks', { tanker: { enabled: true, gain } })} />{range('engineGain', t.diesel)}{range('wakeGain', t.wash)}{range('distance', t.distance, 45, 3000, 5, t.metres)}<Toggle label={t.spatialize} value={settings.audio.spatialEnabled} onChange={(value) => setAudio('spatialEnabled', value)} /><p className="tanker-lab__audio-note">{t.synthetic}</p></>}
          </div>
          <div className="tanker-lab__transport">
            <button aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button>
            <button aria-pressed={audioEnabled} disabled={audioBusy} onClick={toggleAudio}>{audioBusy ? t.loading : audioEnabled ? t.mute : t.unmute}</button>
            <button disabled={!audioEnabled} onClick={() => audioRef.current?.sound.horn()}>{t.horn}</button>
          </div>
          {audioError && <p role="alert">{audioError}</p>}
        </aside>
      </div>
      <footer className="tanker-lab__footer" aria-live="off"><span><b>{stats.triangles.toLocaleString(language)}</b> tri / {t.model}</span><span><b>{stats.calls}</b> {t.draws}</span><span><b>{stats.renderedTriangles.toLocaleString(language)}</b> tri / {t.rendered}</span><span><b>{stats.rpm.toFixed(0)}</b> {t.rpm}</span><span className="tanker-lab__meter">AUDIO <i style={{ '--level': `${Math.min(100, stats.rms * 1500)}%` }} /> <b>{stats.rms > 0 ? `${(20 * Math.log10(stats.rms)).toFixed(0)} dBFS` : '—'}</b></span></footer>
    </main>
  );
}
