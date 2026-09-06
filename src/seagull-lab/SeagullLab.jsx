import React, { Suspense, useRef, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import { assetIndex } from '../asset-lab/assetCatalog';
import SeagullFlock from './SeagullFlock';
import SeagullLandingStage from './SeagullLandingStage';
import { SEAGULL_ASSET } from './seagullCatalog';
import { HOME_SEAGULL_WATER_Y } from '../features/home-scene/creatures/seagullFlight.js';
import './seagullLab.css';

// The flock runs on the product modules, whose routes are authored around the
// scene water at y=0. The studio water therefore sits at that datum and the
// camera presets are the old ones lifted by the former floor depth.
const LIFT = HOME_SEAGULL_WATER_Y + 1.14;
const lift = ({ position: [x, y, z], target: [tx, ty, tz] }) => ({ position: [x, y + LIFT, z], target: [tx, ty + LIFT, tz] });
const CAMERA_VIEWS = {
  flight: { landscape: lift({ position: [7.2, 3.1, 8.8], target: [0, 0.5, 0] }), portrait: lift({ position: [15.5, 6.6, 18.8], target: [0, 0.5, 0] }) },
  landing: { landscape: lift({ position: [8.6, 4.2, 10.4], target: [0, 0.35, 0] }), portrait: lift({ position: [13.8, 7.2, 17.2], target: [0, 0.45, 0] }) },
  'flight-specimen': { landscape: lift({ position: [1.6, 0.9, 3.4], target: [0, 0.02, 0] }), portrait: lift({ position: [2.3, 1.45, 4.45], target: [0, 0.04, 0] }) },
};
const CAMERA_LIMITS = { minDistance: 1.2, maxDistance: 35, minPolarAngle: 0.45, maxPolarAngle: Math.PI - 0.5 };

function LoadingBird() {
  return (
    <mesh position={[0, 0.2, 0]}>
      <sphereGeometry args={[0.035, 16, 12]} />
      <meshBasicMaterial color="#6f746f" />
    </mesh>
  );
}

function AuditCard({ label, triangles, bones, influences, accent = false }) {
  return (
    <div className={`fish-lab__species-card seagull-lab__audit-card ${accent ? 'is-web' : ''}`}>
      <div>
        <strong>{label}</strong>
        {accent && <em>runtime</em>}
      </div>
      <span>{triangles.toLocaleString('ru-RU')} трис</span>
      <small>{bones} костей · до {influences} влияний</small>
    </div>
  );
}

export default function SeagullLab() {
  const [mode, setMode] = useState('flight');
  const [paused, setPaused] = useState(false);
  const [showRig, setShowRig] = useState(false);
  const landingSitesRef = useRef([]);
  const [stats, setStats] = useState({
    birds: 9,
    calls: 0,
    triangles: 0,
    flap: 0,
    glide: 0,
    thermal: 0,
    perched: 0,
    approaching: 0,
    takingOff: 0,
    airborne: 9,
    cursorTargets: 0,
    shadowCasters: 0,
    reflectionParticipants: 0,
    startled: 0,
    minHeight: 12,
    maxHeight: 28,
    shells: 2,
    reloading: false,
    reloadRemaining: 0,
    shots: 0,
    hits: 0,
    downed: 0,
    falling: 0,
    sliding: 0,
    resting: 0,
    flockAlarm: false,
  });

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode !== 'specimen') setShowRig(false);
  };

  return (
    <div className="fish-lab seagull-lab" data-testid="seagull-lab" data-asset-collection="seagulls">
      <AssetStudio
        view={mode === 'specimen' ? 'flight-specimen' : mode === 'landing' ? 'landing' : 'flight'}
        cameraViews={CAMERA_VIEWS} cameraLimits={CAMERA_LIMITS} fogRange={[32, 48]}
        waterReflection waterY={HOME_SEAGULL_WATER_Y}
      >
        <Suspense fallback={<LoadingBird />}>
          {mode === 'landing' && <SeagullLandingStage landingSitesRef={landingSitesRef} />}
          <SeagullFlock
            mode={mode}
            paused={paused}
            showRig={showRig}
            landingSitesRef={landingSitesRef}
            onStats={setStats}
          />
        </Suspense>
      </AssetStudio>

      <header className="fish-lab__header">
        <div>
          <p>ASSET LAB / {assetIndex('seagulls')} / PROCEDURAL SEAGULL FLIGHT</p>
          <h1>Чайки в воздухе</h1>
          <span>Компактный web-риг · PBR-перья · flap / glide / thermal</span>
        </div>
        <div className="fish-lab__header-actions">
        <div className="fish-lab__controls" role="group" aria-label="Режим полёта чаек">
          <button type="button" className={mode === 'flight' ? 'is-active' : ''} aria-pressed={mode === 'flight'} onClick={() => chooseMode('flight')}>
            Небо · 9
          </button>
          <button type="button" className={mode === 'landing' ? 'is-active' : ''} aria-pressed={mode === 'landing'} onClick={() => chooseMode('landing')}>
            Посадки · курсор
          </button>
          <button type="button" className={mode === 'glide' ? 'is-active' : ''} aria-pressed={mode === 'glide'} onClick={() => chooseMode('glide')}>
            Планирование
          </button>
          <button type="button" className={mode === 'stress' ? 'is-active' : ''} aria-pressed={mode === 'stress'} onClick={() => chooseMode('stress')}>
            Нагрузка · 18
          </button>
          <button type="button" className={mode === 'specimen' ? 'is-active' : ''} aria-pressed={mode === 'specimen'} onClick={() => chooseMode('specimen')}>
            Экземпляр
          </button>
          <button
            type="button"
            className={showRig ? 'is-active' : ''}
            aria-pressed={showRig}
            onClick={() => {
              setMode('specimen');
              setShowRig((value) => !value);
            }}
          >
            Риг
          </button>
          <button type="button" className={paused ? 'is-active' : ''} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? 'Продолжить' : 'Пауза'}
          </button>
        </div>
        <LabNav current="seagulls" />
        </div>
      </header>

      <aside className="fish-lab__catalog seagull-lab__catalog" aria-label="Аудит модели чайки">
        <AuditCard label="Исходная модель" triangles={SEAGULL_ASSET.source.triangles} bones={SEAGULL_ASSET.source.bones} influences={SEAGULL_ASSET.source.influences} />
        <AuditCard label="Web LOD" triangles={SEAGULL_ASSET.web.triangles} bones={SEAGULL_ASSET.web.bones} influences={SEAGULL_ASSET.web.influences} accent />
        <div className="seagull-lab__flight-card">
          <strong>{SEAGULL_ASSET.flight.wingbeatHz[0]}–{SEAGULL_ASSET.flight.wingbeatHz[1]} Гц</strong>
          <span>взмах</span>
          <small>{SEAGULL_ASSET.flight.cruiseSpeed[0]}–{SEAGULL_ASSET.flight.cruiseSpeed[1]} м/с · сосед ≈ {SEAGULL_ASSET.flight.nearestNeighbor} м</small>
        </div>
      </aside>

      <footer className="fish-lab__telemetry" aria-live="polite">
        <span><b>{stats.birds}</b> чаек</span>
        <span><b>{stats.calls}</b> draw calls</span>
        <span><b>{Math.round(stats.triangles / 1000)}k</b> трис / кадр</span>
        <span><b>{stats.shadowCasters}</b> тени · LOD</span>
        <span><b>{stats.reflectionParticipants}</b> отражения · RT</span>
        {mode === 'landing' ? (
          <>
            <span><b>{stats.airborne}</b> в воздухе</span>
            <span><b>{stats.approaching}</b> заходят</span>
            <span><b>{stats.perched}</b> сидят</span>
            <span><b>{stats.takingOff}</b> взлетают</span>
            <span><b>{stats.startled}</b> спугнуто</span>
          </>
        ) : (
          <>
            <span><b>{stats.flap}</b> взмах</span>
            <span><b>{stats.glide}</b> планируют</span>
            <span><b>{stats.thermal}</b> кружат</span>
            <span className="fish-lab__budget">в проекте: {Math.round(stats.minHeight)}–{Math.round(stats.maxHeight)} м</span>
          </>
        )}
        <span className="fish-lab__budget">
          <b>{stats.reloading ? `${stats.reloadRemaining.toFixed(1)}с` : `${stats.shells}/2`}</b>{' '}
          {stats.reloading ? 'перезарядка' : 'ствола'}
        </span>
        {stats.downed > 0 && <span><b>{stats.downed}</b> подбито</span>}
        {stats.flockAlarm && <span><b>40с+</b> возврат</span>}
      </footer>

      <div className="fish-lab__note">
        <span>ЛКМ по птице — выстрел · по фону — вращение</span>
        <span>Колесо — масштаб</span>
        <span>{mode === 'landing' ? '2 ствола · перья без крови · стая возвращается постепенно' : 'Выстрел сохраняет направление полёта и включает физическое падение'}</span>
      </div>
    </div>
  );
}
