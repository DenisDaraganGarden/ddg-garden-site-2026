import React, { useEffect, useMemo, useRef, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabColor, LabFacts, LabModes, LabRange, LabSelect, LabTabs, LabToggle } from '../asset-lab/LabShell';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { TankerSound } from '../tanker/audio';
import TankerStage from './TankerStage';

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
  timeOfDay: 16.3, cloudCover: 0.2, exposure: 1.04, environmentIntensity: 0.7,
  engineGain: 0.65, wakeGain: 0.4,
  lights: true, lightsIntensity: 1, lightsDay: 0.35, beaconPeriod: 4, lightsSize: 1, previewNight: false,
  audio: { enabled: true, mode: 'soundscape', masterGain: 0.72, ambienceGain: 0.78, spatialGain: 0.92, spatialEnabled: true, tracks: { tanker: { enabled: true, gain: 0.65 } } },
};
const TEXT = {
  ru: { title: 'Речной танкер', subtitle: '138 м · стальной корпус · процедурная модель', studio: 'Студия', passage: 'На ходу', horizon: 'Горизонт', vessel: 'Судно', motion: 'Ход', material: 'Материал', light: 'Свет', sound: 'Звук', full: 'Общий', side: 'Борт', bow: 'Нос', deck: 'Сверху', bridge: 'Надстройка', underside: 'Снизу', play: 'Продолжить', pause: 'Пауза', mute: 'Выключить звук', unmute: 'Включить звук', horn: 'Гудок', speed: 'Скорость', waves: 'Волнение', course: 'Курс', time: 'Темп просмотра', travel: 'Перемещение', wake: 'Кильватер', distance: 'Дальность', detail: 'Геометрия', near: 'Ближняя', far: 'Горизонт', count: 'Судов', wire: 'Каркас', hull: 'Краска корпуса', wear: 'Потёки', wet: 'Влажность', rough: 'Шероховатость', lighting: 'Освещение', scene: 'Свет сцены', hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', master: 'Общая громкость', ambience: 'Окружение', spatial: 'Шина 3D', track: 'Танкер', diesel: 'Дизель', wash: 'Шум воды', spatialize: '3D-позиционирование', mode: 'Режим микшера', off: 'Выкл.', music: 'Музыка', soundscape: 'Окружение', hybrid: 'Вместе', reset: 'Исходный вид', download: 'Скачать GLB', synthetic: 'Процедурный дизель / винт / пневмогудок', loading: 'Звук включается…', audioError: 'Не удалось включить звук', model: 'модель', draws: 'вызовы', rendered: 'кадр', rpm: 'об/мин', knots: 'уз', metres: 'м', assets: 'Коллекции', lights: 'Огни', lightsOn: 'Огни включены', intensity: 'Яркость', lightsDay: 'Днём', beacon: 'Период маяка', lightsSize: 'Размер', previewNight: 'Как ночью', s: 'с' },
  en: { title: 'River–sea tanker', subtitle: '138 m · steel hull · procedural model', studio: 'Studio', passage: 'Under way', horizon: 'Horizon', vessel: 'Vessel', motion: 'Motion', material: 'Material', light: 'Light', sound: 'Sound', full: 'Overview', side: 'Broadside', bow: 'Bow', deck: 'Deck', bridge: 'Bridge', underside: 'Underside', play: 'Resume', pause: 'Pause', mute: 'Mute', unmute: 'Enable sound', horn: 'Horn', speed: 'Speed', waves: 'Sea state', course: 'Heading', time: 'Preview rate', travel: 'Translation', wake: 'Wake', distance: 'Distance', detail: 'Geometry', near: 'Near', far: 'Horizon', count: 'Vessels', wire: 'Wireframe', hull: 'Hull paint', wear: 'Weathering', wet: 'Wetness', rough: 'Roughness', lighting: 'Lighting', scene: 'Scene light', hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', master: 'Master', ambience: 'Ambience', spatial: '3D bus', track: 'Tanker', diesel: 'Diesel', wash: 'Water wash', spatialize: '3D positioning', mode: 'Mixer mode', off: 'Off', music: 'Music', soundscape: 'Soundscape', hybrid: 'Hybrid', reset: 'Initial view', download: 'Download GLB', synthetic: 'Procedural diesel / propeller / air horn', loading: 'Enabling sound…', audioError: 'Could not enable sound', model: 'model', draws: 'draw calls', rendered: 'frame', rpm: 'rpm', knots: 'kn', metres: 'm', assets: 'Collections', lights: 'Lights', lightsOn: 'Lights on', intensity: 'Intensity', lightsDay: 'In daylight', beacon: 'Beacon period', lightsSize: 'Size', previewNight: 'As at night', s: 's' },
};

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

  // Night preview: the scene's lighting at half past eleven on a dark ground,
  // so the sprites read against something instead of the white studio.
  const nightLighting = useMemo(() => buildHomeSceneLighting({
    timeOfDay: 23.5, cloudCover: 0.2, sunNoonElevation: 45,
    sunBearing: -40, sunIntensity: 1.2, ambientIntensity: 0.22, hemisphereIntensity: 0.7,
    hemisphereSkyColor: '#d4deec', hemisphereGroundColor: '#655950',
  }), []);
  const previewNight = settings.previewNight;
  const night = previewNight ? 1 : lighting.sky.night;

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

  const range = (key, label, min = 0, max = 1, step = 0.01, unit = '') => <LabRange key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
  const audioRange = (key, label) => <LabRange key={key} label={label} value={settings.audio[key]} onChange={(value) => setAudio(key, value)} />;

  return (
    <LabShell
      collection="tanker"
      eyebrow={`DDG / ASSET LAB / ${'04'}`}
      title={t.title}
      subtitle={t.subtitle}
      language={language}
      onLanguage={setLanguage}
      views={['full', 'side', 'bow', 'deck', 'bridge', 'underside'].map((id) => ({ id, label: t[id] }))}
      view={view}
      onView={setView}
      scale={`138 ${t.metres}`}
      panel={<>
        <LabModes label={language === 'ru' ? 'Режим сцены' : 'Scene mode'} items={['studio', 'passage', 'horizon'].map((id) => ({ id, label: t[id] }))} value={settings.mode} onChange={chooseMode} />
        <LabTabs label={t.vessel} items={['vessel', 'motion', 'material', 'lights', 'light', 'sound'].map((id) => ({ id, label: t[id] }))} value={tab} onChange={setTab} />
        {tab === 'vessel' && <>
          <LabSelect label={t.detail} value={settings.lod} onChange={(value) => set('lod', value)} options={[{ value: 'near', label: `${t.near} · 8 348` }, { value: 'horizon', label: `${t.far} · 860` }]} />
          <LabSelect label={t.count} value={String(settings.count)} onChange={(value) => { set('count', Number(value)); if (Number(value) > 1) { set('lod', 'horizon'); set('mode', 'studio'); setView('full'); } }} options={[{ value: '1', label: '1' }, { value: '8', label: '8' }]} />
          <LabToggle label={t.wire} value={settings.wireframe} onChange={(value) => set('wireframe', value)} />
          <LabFacts rows={[['LOA', '138.0 m'], ['Beam', '16.6 m'], ['Draft', '4.5 m'], ['LOD 0 / 1', '8 348 / 860 tri']]} />
          <a className="lab__link" href={new URL(`../../assets-source/models/tanker/river-sea-tanker-${settings.lod}.glb`, import.meta.url).href} download>{t.download} ↗</a>
        </>}
        {tab === 'motion' && <>{range('speed', t.speed, 0, 14, 0.1, t.knots)}{range('seaState', t.waves)}{range('heading', t.course, -180, 180, 1, '°')}{range('timeScale', t.time, 0.25, 4, 0.25, '×')}{range('wake', t.wake)}{range('distance', t.distance, 45, 3000, 5, t.metres)}<LabToggle label={t.travel} value={settings.travel} onChange={(value) => set('travel', value)} /></>}
        {tab === 'material' && <><LabColor label={t.hull} value={settings.color} onChange={(value) => set('color', value)} />{range('wear', t.wear)}{range('wetness', t.wet)}{range('roughness', t.rough, 0.18, 0.95)}</>}
        {tab === 'lights' && <><LabToggle label={t.lightsOn} value={settings.lights} onChange={(value) => set('lights', value)} /><LabToggle label={t.previewNight} value={settings.previewNight} onChange={(value) => set('previewNight', value)} />{range('lightsIntensity', t.intensity, 0, 3, 0.05)}{range('lightsDay', t.lightsDay, 0, 1, 0.05)}{range('beaconPeriod', t.beacon, 1, 12, 0.5, t.s)}{range('lightsSize', t.lightsSize, 0.5, 3, 0.1, '×')}</>}
        {tab === 'light' && <>{range('timeOfDay', t.hour, 0, 24, 0.1, 'h')}{range('cloudCover', t.clouds)}{range('exposure', t.exposure, 0.2, 2.4)}{range('environmentIntensity', t.environment, 0, 2)}</>}
        {tab === 'sound' && <>
          <LabSelect label={t.mode} value={settings.audio.mode} onChange={(value) => setAudio('mode', value)} options={['off', 'music', 'soundscape', 'hybrid'].map((id) => ({ value: id, label: t[id] }))} />
          {audioRange('masterGain', t.master)}{audioRange('ambienceGain', t.ambience)}{audioRange('spatialGain', t.spatial)}
          <LabRange label={t.track} value={settings.audio.tracks.tanker.gain} onChange={(gain) => setAudio('tracks', { tanker: { enabled: true, gain } })} />
          {range('engineGain', t.diesel)}{range('wakeGain', t.wash)}{range('distance', t.distance, 45, 3000, 5, t.metres)}
          <LabToggle label={t.spatialize} value={settings.audio.spatialEnabled} onChange={(value) => setAudio('spatialEnabled', value)} />
          <p className="lab__note">{t.synthetic}</p>
        </>}
        {audioError && <p className="lab__note" role="alert">{audioError}</p>}
      </>}
      transport={<>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} {paused ? t.play : t.pause}</button>
        <button type="button" aria-pressed={audioEnabled} disabled={audioBusy} onClick={toggleAudio}>{audioBusy ? t.loading : audioEnabled ? t.mute : t.unmute}</button>
        <button type="button" disabled={!audioEnabled} onClick={() => audioRef.current?.sound.horn()}>{t.horn}</button>
      </>}
      stats={<>
        <span><b>{stats.triangles.toLocaleString(language)}</b> tri / {t.model}</span>
        <span><b>{stats.calls}</b> {t.draws}</span>
        <span><b>{stats.renderedTriangles.toLocaleString(language)}</b> tri / {t.rendered}</span>
        <span><b>{stats.rpm.toFixed(0)}</b> {t.rpm}</span>
        <span className="lab__meter">AUDIO <i style={{ '--level': `${Math.min(100, stats.rms * 1500)}%` }} /> <b>{stats.rms > 0 ? `${(20 * Math.log10(stats.rms)).toFixed(0)} dBFS` : '—'}</b></span>
      </>}
    >
      <AssetStudio
        view={view} cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS}
        waterReflection={settings.mode !== 'studio' && view !== 'underside'} waterY={-0.78}
        floorVisible={view !== 'underside'}
        lighting={previewNight ? nightLighting : undefined}
        sceneOverrides={{ timeOfDay: settings.timeOfDay, cloudCover: settings.cloudCover }}
        background={previewNight ? '#1b1f24' : undefined}
        exposure={settings.exposure} environmentIntensity={previewNight ? 0.06 : settings.environmentIntensity}
        paused={hidden}
      >
        <TankerStage settings={settings} night={night} audioRef={audioRef} onStats={setStats} paused={paused || hidden} />
      </AssetStudio>
    </LabShell>
  );
}
