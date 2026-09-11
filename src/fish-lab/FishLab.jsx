import React, { Suspense, useMemo, useState } from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell from '../asset-lab/LabShell';
import FishSchool from './FishSchool';
import { FISH_CATALOG, FISH_DEFAULT_COUNTS, FISH_SPECIES_ORDER } from '../features/home-scene/creatures/fish/fishCatalog.js';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';

const PUBLISHED = getPublishedHomeSceneSettings();

function LoadingFish() {
  return (
    <mesh>
      <sphereGeometry args={[0.03, 16, 12]} />
      <meshBasicMaterial color="#6f746f" />
    </mesh>
  );
}

export default function FishLab() {
  const [mode, setMode] = useState('school');
  const [paused, setPaused] = useState(false);
  const [showRig, setShowRig] = useState(false);
  const [stats, setStats] = useState({
    fish: PUBLISHED.fishCount,
    batches: 0,
    calls: 0,
    triangles: 0,
    surface: 0,
    bottom: 0,
  });
  const totalTriangles = useMemo(
    () => FISH_SPECIES_ORDER.reduce((sum, species) => sum + FISH_CATALOG[species].triangles * FISH_DEFAULT_COUNTS[species], 0),
    [],
  );
  const specimens = FISH_SPECIES_ORDER.map((species) => {
    const fish = FISH_CATALOG[species];
    return {
      id: species,
      name: fish.name,
      latin: fish.latin,
      size: `${Math.round(fish.length * 100)} см`,
      note: `${fish.triangles.toLocaleString('ru-RU')} трис · ${fish.bones} костей`,
    };
  });

  return (
    <LabShell
      collection="river-fish"
      testId="fish-lab"
      eyebrow="ASSET LAB / 01 / RIVER FISH"
      title="Процедурные речные рыбы"
      subtitle="Отдельная белая сцена · физический размер в метрах · PBR"
      views={[
        { id: 'school', label: `Косяк · ${PUBLISHED.fishCount}` },
        { id: 'specimens', label: 'Три вида' },
      ]}
      view={mode}
      onView={setMode}
      specimens={specimens}
      transport={<>
        <button type="button" aria-pressed={showRig} onClick={() => setShowRig((value) => !value)}>Риг</button>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button>
      </>}
      stats={<>
        <span><b>{stats.fish}</b> рыб</span>
        <span><b>{stats.batches}</b> батча · инстансы</span>
        <span><b>{stats.calls}</b> draw calls</span>
        <span><b>{Math.round(stats.triangles / 1000)}k</b> трис / кадр</span>
        <span><b>{stats.surface}</b> у поверхности</span>
        <span><b>{stats.bottom}</b> у дна</span>
        <span className="is-budget">геометрия ассетов: {Math.round(totalTriangles / 1000)}k трис</span>
      </>}
      hints={['ЛКМ — вращение', 'Колесо — масштаб', 'UV: обе стороны используют одну боковую карту']}
    >
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
    </LabShell>
  );
}
