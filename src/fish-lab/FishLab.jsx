import React, { Suspense, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import FishSchool from './FishSchool';
import { FISH_CATALOG } from './fishCatalog';

function LoadingFish() {
  return (
    <mesh>
      <sphereGeometry args={[0.03, 16, 12]} />
      <meshBasicMaterial color="#6f746f" />
    </mesh>
  );
}

function CatalogCard({ species }) {
  const fish = FISH_CATALOG[species];
  return (
    <div className="fish-lab__species-card">
      <div>
        <strong>{fish.name}</strong>
        <em>{fish.latin}</em>
      </div>
      <span>{Math.round(fish.length * 100)} см</span>
      <small>{fish.triangles.toLocaleString('ru-RU')} трис · {fish.bones} костей</small>
    </div>
  );
}

export default function FishLab() {
  const [mode, setMode] = useState('school');
  const [paused, setPaused] = useState(false);
  const [showRig, setShowRig] = useState(false);
  const [stats, setStats] = useState({
    fish: 50,
    meshes: 0,
    visibleMeshes: 0,
    calls: 0,
    triangles: 0,
    surface: 0,
    bottom: 0,
  });
  const totalTriangles = useMemo(
    () => FISH_CATALOG.pike.triangles
      + FISH_CATALOG.perch.triangles * 11
      + FISH_CATALOG.roach.triangles * 38,
    [],
  );

  return (
    <div className="fish-lab" data-testid="fish-lab" data-asset-collection="river-fish">
      <AssetStudio view={mode}>
        <Suspense fallback={<LoadingFish />}>
          <FishSchool
            mode={mode}
            paused={paused}
            showRig={showRig}
            onStats={setStats}
          />
        </Suspense>
      </AssetStudio>

      <header className="fish-lab__header">
        <div>
          <p>ASSET LAB / RIVER FISH</p>
          <h1>Процедурные речные рыбы</h1>
          <span>Отдельная белая сцена · физический размер в метрах · PBR</span>
        </div>
        <div className="fish-lab__header-actions">
        <div className="fish-lab__controls" role="group" aria-label="Режим лаборатории">
          <button
            type="button"
            className={mode === 'school' ? 'is-active' : ''}
            aria-pressed={mode === 'school'}
            onClick={() => setMode('school')}
          >
            Косяк · 50
          </button>
          <button
            type="button"
            className={mode === 'specimens' ? 'is-active' : ''}
            aria-pressed={mode === 'specimens'}
            onClick={() => setMode('specimens')}
          >
            Три вида
          </button>
          <button
            type="button"
            className={showRig ? 'is-active' : ''}
            aria-pressed={showRig}
            onClick={() => setShowRig((value) => !value)}
          >
            Риг
          </button>
          <button
            type="button"
            className={paused ? 'is-active' : ''}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? 'Продолжить' : 'Пауза'}
          </button>
        </div>
        <LabNav current="river-fish" />
        </div>
      </header>

      <aside className="fish-lab__catalog" aria-label="Три вида рыб">
        {Object.keys(FISH_CATALOG).map((species) => (
          <CatalogCard key={species} species={species} />
        ))}
      </aside>

      <footer className="fish-lab__telemetry" aria-live="polite">
        <span><b>{stats.fish}</b> рыб</span>
        <span><b>{stats.visibleMeshes}/{stats.meshes}</b> мешей</span>
        <span><b>{stats.calls}</b> draw calls</span>
        <span><b>{Math.round(stats.triangles / 1000)}k</b> трис / кадр</span>
        <span><b>{stats.surface}</b> у поверхности</span>
        <span><b>{stats.bottom}</b> у дна</span>
        <span className="fish-lab__budget">геометрия ассетов: {Math.round(totalTriangles / 1000)}k трис</span>
      </footer>

      <div className="fish-lab__note">
        <span>ЛКМ — вращение</span>
        <span>Колесо — масштаб</span>
        <span>UV: обе стороны используют одну боковую карту</span>
      </div>
    </div>
  );
}
