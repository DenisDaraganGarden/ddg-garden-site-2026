import React, { Suspense, useRef, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabRange, LabToggle } from '../asset-lab/LabShell';
import SeagullFlock from './SeagullFlock';
import SeagullLandingStage from './SeagullLandingStage';
import { SEAGULL_ASSET } from './seagullCatalog';
import { HOME_SEAGULL_WATER_Y } from '../features/home-scene/creatures/seagullFlight.js';

// The flock runs on the product modules, whose routes are authored around the
// scene water at y=0. The studio water therefore sits at that datum and the
// camera presets are the old ones lifted by the former floor depth.
const LIFT = HOME_SEAGULL_WATER_Y + 1.14;
const lift = ({ position: [x, y, z], target: [tx, ty, tz] }) => ({ position: [x, y + LIFT, z], target: [tx, ty + LIFT, tz] });
const CAMERA_VIEWS = {
  territory: { landscape: lift({ position: [14, 7.5, 16], target: [3, 0.8, 0] }), portrait: lift({ position: [24, 12, 28], target: [3, 0.8, 0] }) },
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

const audit = (label, part, note) => ({
  id: label,
  name: label,
  latin: note,
  size: `${part.triangles.toLocaleString('ru-RU')} трис`,
  note: `${part.bones} костей · до ${part.influences} влияний`,
});

export default function SeagullLab() {
  const [mode, setMode] = useState('flight');
  const [paused, setPaused] = useState(false);
  const [showRig, setShowRig] = useState(false);
  // Территория — тот же набор, что в редакторе (creatures/seagulls): радиус,
  // полоса высот, места на суше. Заводские — маршруты сайта как есть.
  const [territory, setTerritory] = useState({ radius: 6, altitudeMin: 0.36, altitudeMax: 4.6, perchCount: 12, terrain: true, rocks: true, objects: true });
  const setTerritoryValue = (key, value) => setTerritory((current) => ({ ...current, [key]: value }));
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
    <LabShell
      collection="seagulls"
      testId="seagull-lab"
      eyebrow="ASSET LAB / 02 / PROCEDURAL SEAGULL FLIGHT"
      title="Чайки в воздухе"
      subtitle="Компактный web-риг · PBR-перья · flap / glide / thermal"
      views={[
        { id: 'flight', label: 'Небо · 9' },
        { id: 'landing', label: 'Посадки · курсор' },
        { id: 'territory', label: 'Территория' },
        { id: 'glide', label: 'Планирование' },
        { id: 'stress', label: 'Нагрузка · 18' },
        { id: 'specimen', label: 'Экземпляр' },
      ]}
      view={mode}
      onView={chooseMode}
      specimens={[
        audit('Исходная модель', SEAGULL_ASSET.source),
        audit('Web LOD', SEAGULL_ASSET.web, 'runtime'),
        {
          id: 'flight',
          name: `${SEAGULL_ASSET.flight.wingbeatHz[0]}–${SEAGULL_ASSET.flight.wingbeatHz[1]} Гц`,
          latin: 'взмах',
          note: `${SEAGULL_ASSET.flight.cruiseSpeed[0]}–${SEAGULL_ASSET.flight.cruiseSpeed[1]} м/с · сосед ≈ ${SEAGULL_ASSET.flight.nearestNeighbor} м`,
        },
      ]}
      panel={mode === 'territory' ? <>
        <LabRange label="Радиус территории" value={territory.radius} min={3} max={40} step={0.5} unit="м" onChange={(value) => setTerritoryValue('radius', value)} />
        <LabRange label="Высота полёта · нижняя" value={territory.altitudeMin} min={0.2} max={12} step={0.1} unit="м" onChange={(value) => setTerritoryValue('altitudeMin', value)} />
        <LabRange label="Высота полёта · верхняя" value={territory.altitudeMax} min={1} max={30} step={0.1} unit="м" onChange={(value) => setTerritoryValue('altitudeMax', value)} />
        <LabRange label="Мест на суше" value={territory.perchCount} min={0} max={48} step={1} onChange={(value) => setTerritoryValue('perchCount', value)} />
        <LabToggle label="Садятся на сушу" value={territory.terrain} onChange={(value) => setTerritoryValue('terrain', value)} />
        <LabToggle label="Садятся на валуны" value={territory.rocks} onChange={(value) => setTerritoryValue('rocks', value)} />
        <LabToggle label="Садятся на объекты" value={territory.objects} onChange={(value) => setTerritoryValue('objects', value)} />
        <p className="lab__note">Кольца — места, которые берег отдал сам: красные на песке, синие на валуне. Тот же расчёт, что в сцене.</p>
      </> : null}
      transport={<>
        <button type="button" aria-pressed={showRig} onClick={() => { setMode('specimen'); setShowRig((value) => !value); }}>Риг</button>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button>
      </>}
      stats={<>
        <span><b>{stats.birds}</b> чаек</span>
        <span><b>{stats.calls}</b> draw calls</span>
        <span><b>{Math.round(stats.triangles / 1000)}k</b> трис / кадр</span>
        <span><b>{stats.shadowCasters}</b> тени · LOD</span>
        <span><b>{stats.reflectionParticipants}</b> отражения · RT</span>
        {mode === 'landing' || mode === 'territory' ? (
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
            <span>в проекте: {Math.round(stats.minHeight)}–{Math.round(stats.maxHeight)} м</span>
          </>
        )}
        <span className="is-budget">
          <b>{stats.reloading ? `${stats.reloadRemaining.toFixed(1)}с` : `${stats.shells}/2`}</b>{' '}
          {stats.reloading ? 'перезарядка' : 'ствола'}
        </span>
        {stats.downed > 0 ? <span><b>{stats.downed}</b> подбито</span> : null}
        {stats.flockAlarm ? <span><b>40с+</b> возврат</span> : null}
      </>}
      hints={[
        'ЛКМ по птице — выстрел · по фону — вращение',
        'Колесо — масштаб',
        mode === 'landing' ? '2 ствола · перья без крови · стая возвращается постепенно' : 'Выстрел сохраняет направление полёта и включает физическое падение',
      ]}
    >
      <AssetStudio
        view={mode === 'specimen' ? 'flight-specimen' : mode === 'landing' ? 'landing' : mode === 'territory' ? 'territory' : 'flight'}
        cameraViews={CAMERA_VIEWS} cameraLimits={{ ...CAMERA_LIMITS, maxDistance: 60 }} fogRange={[32, 48]}
        waterReflection waterY={HOME_SEAGULL_WATER_Y}
      >
        <Suspense fallback={<LoadingBird />}>
          {mode === 'landing' && <SeagullLandingStage landingSitesRef={landingSitesRef} />}
          {mode === 'territory' && <SeagullLandingStage landingSitesRef={landingSitesRef} land perch={{ radius: territory.radius, count: territory.perchCount, terrain: territory.terrain, rocks: territory.rocks, objects: territory.objects }} />}
          <SeagullFlock
            mode={mode === 'territory' ? 'landing' : mode}
            paused={paused}
            showRig={showRig}
            landingSitesRef={landingSitesRef}
            onStats={setStats}
            territory={mode === 'territory' ? { x: 0, z: 0, radius: territory.radius, altitudeMin: territory.altitudeMin, altitudeMax: territory.altitudeMax } : null}
          />
        </Suspense>
      </AssetStudio>
    </LabShell>
  );
}
