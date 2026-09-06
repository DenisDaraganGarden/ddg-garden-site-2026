import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import { buildHomeSceneLighting } from '../components/effects/homeSceneLighting';
import { buildRuntimeQualityProfile } from '../components/effects/qualityProfile';
import { SurfaceVegetation } from '../components/effects/water/SurfaceVegetation';
import { UnderwaterAlgae } from '../components/effects/water/UnderwaterAlgae';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { translations } from '../i18n/translations';
import '../tanker-lab/tankerLab.css';

// Collections 08 and 09. The lilies and the algae are the scene's own
// components mounted as they are, fed with the published editor settings; the
// sliders are the editor's keys with the editor's labels and ranges, so what
// Denis tunes here he can set in the editor by the same name.
const PUBLISHED = getPublishedHomeSceneSettings();
const WATER_Y = 0;
const BED_Y = -PUBLISHED.waterDepthMeters;
// Still water for the lilies: the scene's height field is two textures, so the
// lab hands over one flat texel of each (height 0, normal straight up). A null
// texture reads as height -1 and the pads sink under the studio surface.
const flatTexel = (bytes) => {
  const texture = new THREE.DataTexture(new Uint8Array(bytes), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
};
const IDLE_RUNTIME = {
  currentStateTargetRef: { current: { texture: flatTexel([0, 0, 0, 0]) } },
  normalTargetRef: { current: { texture: flatTexel([128, 255, 128, 128]) } },
};
const CAMERA_LIMITS = { minDistance: 0.35, maxDistance: 20, minPolarAngle: 0.04, maxPolarAngle: Math.PI - 0.04 };

// [key, min, max, step, unit]
const SPECIES = {
  lilies: {
    id: 'lilies',
    Component: SurfaceVegetation,
    water: true,
    floorY: WATER_Y,
    // The lab studies one patch at the origin on a flat bed; the scene keeps its own centre.
    overrides: { surfacePlantCenterX: 0, surfacePlantCenterZ: 0, surfacePlantRadius: 2.6, terrainEnabled: false, seabedReliefStrength: 0 },
    tabs: {
      form: [['surfacePlantAmount', 0, 1, 0.01], ['surfacePlantSize', 0, 0.6, 0.01, 'm'], ['surfacePlantClustering', 0, 1, 0.01], ['surfacePlantRadius', 0, 20, 0.1, 'm'], ['surfacePlantFloatOffset', -0.05, 0.2, 0.002, 'm'], ['surfacePlantStiffness', 0, 1, 0.01]],
      material: [['surfacePlantSaturation', 0, 2, 0.01], ['surfacePlantTranslucency', 0, 1, 0.01], ['surfacePlantReflection', 0, 1, 0.01], ['plantAoStrength', 0, 1.5, 0.01]],
    },
    color: 'surfacePlantColor',
    views: {
      full: { landscape: { position: [3.2, 1.6, 3.6], target: [0, 0, 0] }, portrait: { position: [4.4, 2.4, 5.2], target: [0, 0, 0] } },
      macro: { landscape: { position: [0.9, 0.5, 1.0], target: [0.1, 0, 0] }, portrait: { position: [1.3, 0.8, 1.5], target: [0.1, 0, 0] } },
      low: { landscape: { position: [3.0, 0.22, 2.0], target: [0, 0.04, 0] }, portrait: { position: [4.2, 0.3, 2.8], target: [0, 0.04, 0] } },
      top: { landscape: { position: [0.2, 5.0, 0.3], target: [0, 0, 0] }, portrait: { position: [0.3, 7.0, 0.4], target: [0, 0, 0] } },
    },
    copy: {
      ru: { title: 'Кувшинки', subtitle: 'Плавающие листья пруда · атлас PBR · настройки те же, что в редакторе' },
      en: { title: 'Water lilies', subtitle: 'Floating pond leaves · PBR atlas · the editor\'s own settings' },
    },
  },
  algae: {
    id: 'algae',
    Component: UnderwaterAlgae,
    water: false,
    floorY: BED_Y,
    overrides: { underwaterAlgaeCenterX: 0, underwaterAlgaeCenterZ: 0, underwaterAlgaeRadius: 2.4, terrainEnabled: false, seabedReliefStrength: 0 },
    tabs: {
      form: [['underwaterAlgaeAmount', 0, 1, 0.01], ['underwaterAlgaeDensity', 1, 4, 0.1], ['underwaterAlgaeRadius', 0, 20, 0.1, 'm'], ['underwaterAlgaeLength', 0, 3, 0.05, 'm'], ['underwaterAlgaeWidth', 0.5, 3, 0.05], ['underwaterAlgaePatchiness', 0, 1, 0.01], ['underwaterAlgaeSpeciesMix', 0, 1, 0.01]],
      flow: [['underwaterAlgaeSway', 0, 1.5, 0.01], ['underwaterAlgaeFlowDirection', -180, 180, 1, '°'], ['underwaterAlgaeFlowStrength', 0, 4, 0.01]],
      material: [['underwaterAlgaeSaturation', 0, 2, 0.01], ['plantAoStrength', 0, 1.5, 0.01]],
    },
    color: 'underwaterAlgaeColor',
    views: {
      full: { landscape: { position: [3.4, 0.7, 3.9], target: [0, BED_Y + 0.9, 0] }, portrait: { position: [4.8, 1.2, 5.6], target: [0, BED_Y + 0.9, 0] } },
      macro: { landscape: { position: [1.1, BED_Y + 0.8, 1.3], target: [0, BED_Y + 0.55, 0] }, portrait: { position: [1.6, BED_Y + 1.0, 1.9], target: [0, BED_Y + 0.55, 0] } },
      low: { landscape: { position: [2.6, BED_Y + 0.25, 2.2], target: [0, BED_Y + 0.45, 0] }, portrait: { position: [3.6, BED_Y + 0.3, 3.0], target: [0, BED_Y + 0.45, 0] } },
      top: { landscape: { position: [0.3, 4.2, 0.4], target: [0, BED_Y + 0.6, 0] }, portrait: { position: [0.4, 6.0, 0.5], target: [0, BED_Y + 0.6, 0] } },
    },
    copy: {
      ru: { title: 'Водоросли', subtitle: 'Нити на дне пруда · течение и колыхание · настройки те же, что в редакторе' },
      en: { title: 'Algae', subtitle: 'Strands on the pond bed · current and sway · the editor\'s own settings' },
    },
  },
};
const TEXT = {
  ru: { studio: 'Студия', scene: 'Свет сцены', form: 'Форма', flow: 'Течение', material: 'Материал', light: 'Свет', full: 'Общий', macro: 'Крупно', low: 'Низко', top: 'Сверху', lighting: 'Освещение', hour: 'Время суток', clouds: 'Облачность', exposure: 'Экспозиция', environment: 'Отражения среды', reset: 'Как в сцене', draws: 'вызовы', rendered: 'кадр', assets: 'Коллекции', h: 'ч', m: 'м' },
  en: { studio: 'Studio', scene: 'Scene light', form: 'Form', flow: 'Flow', material: 'Material', light: 'Light', full: 'Overview', macro: 'Close-up', low: 'Low', top: 'Top', lighting: 'Lighting', hour: 'Time of day', clouds: 'Cloud cover', exposure: 'Exposure', environment: 'Environment reflections', reset: 'As in the scene', draws: 'draw calls', rendered: 'frame', assets: 'Collections', h: 'h', m: 'm' },
};
const LAB_DEFAULTS = { lightMode: 'studio', timeOfDay: PUBLISHED.timeOfDay, cloudCover: PUBLISHED.cloudCover, exposure: 1.04, environmentIntensity: 0.7 };

function Range({ label, value, min = 0, max = 1, step = 0.01, unit = '', onChange }) {
  return <label className="tanker-lab__range"><span>{label}</span><output>{Number(value).toFixed(step >= 1 ? 0 : step >= 0.01 ? 2 : 3)}{unit && ` ${unit}`}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Telemetry({ onStats }) {
  const { gl } = useThree();
  const last = useRef(-1);
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 0.4) return;
    last.current = state.clock.elapsedTime;
    onStats({ calls: gl.info.render.calls, triangles: gl.info.render.triangles });
  });
  return null;
}

function WaterPlantLab({ species }) {
  const [language, setLanguage] = useState('ru');
  const t = TEXT[language];
  const controlLabel = (key) => translations[language].homeEditor.controls[key] ?? key;
  const [scene, setScene] = useState(() => ({ ...PUBLISHED, ...species.overrides }));
  const [lab, setLab] = useState(LAB_DEFAULTS);
  const [view, setView] = useState('full');
  const [tab, setTab] = useState('form');
  const [hidden, setHidden] = useState(document.hidden);
  const [stats, setStats] = useState({ calls: 0, triangles: 0 });
  const setScene1 = (key, value) => setScene((current) => ({ ...current, [key]: value }));
  const setLab1 = (key, value) => setLab((current) => ({ ...current, [key]: value }));
  const lighting = useMemo(() => buildHomeSceneLighting({ ...scene, timeOfDay: lab.timeOfDay, cloudCover: lab.cloudCover }), [lab.cloudCover, lab.timeOfDay, scene]);
  const qualityProfile = useMemo(() => buildRuntimeQualityProfile('public', window.innerWidth), []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const range = ([key, min, max, step, unit]) => <Range key={key} label={controlLabel(key)} value={scene[key]} min={min} max={max} step={step} unit={unit === 'm' ? t.m : (unit ?? '')} onChange={(value) => setScene1(key, value)} />;
  const tabs = [...Object.keys(species.tabs), 'light'];
  const { Component } = species;

  return (
    <main className="tanker-lab" data-testid={`${species.id}-lab`} data-asset-collection={species.id} lang={language}>
      <header className="tanker-lab__header">
        <div><p>DDG / ASSET LAB / {assetIndex(species.id)}</p><h1>{species.copy[language].title}</h1><span>{species.copy[language].subtitle}</span></div>
        <div className="tanker-lab__header-actions">
          <div className="tanker-lab__languages">{['ru', 'en'].map((lang) => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
          <LabNav current={species.id} lang={language} label={t.assets} />
        </div>
      </header>
      <div className="tanker-lab__workspace">
        <section className="tanker-lab__viewer" aria-label={species.copy[language].title}>
          <AssetStudio
            view={view} cameraViews={species.views} cameraLimits={CAMERA_LIMITS}
            waterReflection={species.water} waterY={WATER_Y} floorY={species.floorY}
            lighting={lab.lightMode === 'scene' ? lighting : undefined}
            exposure={lab.exposure} environmentIntensity={lab.environmentIntensity}
            paused={hidden}
          >
            <Component settings={scene} runtime={IDLE_RUNTIME} qualityProfile={qualityProfile} lighting={lighting} terrainQuery={null} />
            <Telemetry onStats={setStats} />
          </AssetStudio>
          <div className="tanker-lab__views" role="group" aria-label="Ракурс">
            {Object.keys(species.views).map((id) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t[id]}</button>)}
          </div>
        </section>
        <aside className="tanker-lab__inspector">
          <div className="tanker-lab__tabs" role="tablist">{tabs.map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}</div>
          <div className="tanker-lab__controls" role="tabpanel" aria-label={t[tab]}>
            {tab === 'material' && <label className="tanker-lab__toggle"><span>{controlLabel(species.color)}</span><input type="color" aria-label={controlLabel(species.color)} value={scene[species.color]} onChange={(e) => setScene1(species.color, e.target.value)} /></label>}
            {species.tabs[tab]?.map(range)}
            {tab === 'light' && <><label className="tanker-lab__select"><span>{t.lighting}</span><select aria-label={t.lighting} value={lab.lightMode} onChange={(e) => setLab1('lightMode', e.target.value)}><option value="studio">{t.studio}</option><option value="scene">{t.scene}</option></select></label><Range label={t.hour} value={lab.timeOfDay} min={0} max={24} step={0.1} unit={t.h} onChange={(value) => setLab1('timeOfDay', value)} /><Range label={t.clouds} value={lab.cloudCover} onChange={(value) => setLab1('cloudCover', value)} /><Range label={t.exposure} value={lab.exposure} min={0.2} max={2.4} onChange={(value) => setLab1('exposure', value)} /><Range label={t.environment} value={lab.environmentIntensity} min={0} max={2} onChange={(value) => setLab1('environmentIntensity', value)} /></>}
          </div>
          <div className="tanker-lab__transport">
            <button onClick={() => { setScene({ ...PUBLISHED, ...species.overrides }); setLab(LAB_DEFAULTS); setView('full'); }}>{t.reset}</button>
          </div>
        </aside>
      </div>
      <footer className="tanker-lab__footer" aria-live="off"><span><b>{stats.calls}</b> {t.draws}</span><span><b>{stats.triangles.toLocaleString(language)}</b> tri / {t.rendered}</span></footer>
    </main>
  );
}

export const LiliesLab = () => <WaterPlantLab species={SPECIES.lilies} />;
export const AlgaeLab = () => <WaterPlantLab species={SPECIES.algae} />;
