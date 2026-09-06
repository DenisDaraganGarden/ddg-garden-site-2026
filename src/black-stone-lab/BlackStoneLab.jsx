import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import BlackStoneSculpture from './BlackStoneSculpture';
import { BLACK_STONE_PRESETS } from './blackStonePresets';

const VIEW_OPTIONS = Object.freeze([
  { id: 'stone-full', label: 'Общий' },
  { id: 'stone-macro', label: 'Макро' },
  { id: 'stone-top', label: 'Сверху' },
]);

const DIAGNOSTIC_OPTIONS = Object.freeze([
  { id: 'beauty', label: 'Материал' },
  { id: 'roughness', label: 'Rough' },
  { id: 'normal', label: 'Normal' },
  { id: 'masks', label: 'Маски' },
]);

const PRESET_OPTIONS = Object.freeze([
  { id: 'hybrid', label: 'Гибрид' },
  { id: 'slate', label: 'Сланец' },
  { id: 'obsidian', label: 'Обсидиан' },
  { id: 'wet', label: 'Влажный' },
]);

const PARAMETER_OPTIONS = Object.freeze([
  { id: 'layering', label: 'Слоистость', min: 0, max: 1, step: 0.01 },
  { id: 'layerScale', label: 'Масштаб слоёв', min: 0.6, max: 4, step: 0.05, scale: true },
  { id: 'layerRelief', label: 'Рельеф слоёв', min: 0, max: 1, step: 0.01 },
  { id: 'layerSharpness', label: 'Острота граней', min: 0, max: 1, step: 0.01 },
  { id: 'layerEdgeChips', label: 'Сколы граней', min: 0, max: 1, step: 0.01 },
  { id: 'fracture', label: 'Излом / сколы', min: 0, max: 1, step: 0.01 },
  { id: 'fractureScale', label: 'Масштаб излома', min: 0.6, max: 4, step: 0.05, scale: true },
  { id: 'veins', label: 'Жилы', min: 0, max: 1, step: 0.01 },
  { id: 'veinScale', label: 'Масштаб жил', min: 0.6, max: 4, step: 0.05, scale: true },
  { id: 'polish', label: 'Потёртая полировка', min: 0, max: 1, step: 0.01 },
  { id: 'wearScale', label: 'Масштаб потёртости', min: 0.6, max: 4, step: 0.05, scale: true },
  { id: 'wetness', label: 'Влажность', min: 0, max: 1, step: 0.01 },
  { id: 'dryRoughness', label: 'Сухая шершавость', min: 0, max: 1, step: 0.01 },
  { id: 'microRelief', label: 'Микрорельеф', min: 0, max: 1, step: 0.01 },
]);

function LoadingStone() {
  return (
    <mesh position={[0, 0.05, 0]} castShadow>
      <icosahedronGeometry args={[0.62, 2]} />
      <meshPhysicalMaterial color="#17191b" roughness={0.72} clearcoat={0.08} />
    </mesh>
  );
}

function StoneSweepLight({ active, phase }) {
  const light = useRef();

  useFrame((state) => {
    if (!light.current) {
      return;
    }

    const time = phase + (active ? state.clock.elapsedTime * 0.38 : 0);
    light.current.position.set(
      Math.cos(time) * 3.15,
      1.15 + Math.sin(time * 0.73) * 0.5,
      Math.sin(time) * 3.15,
    );
  });

  return (
    <pointLight
      ref={light}
      position={[3.15, 1.15, 0]}
      intensity={5.8}
      distance={7.5}
      decay={2}
      color="#ffd8b7"
    />
  );
}

function RenderTelemetry({ modelMetrics, onStats }) {
  const { gl } = useThree();
  const lastUpdate = useRef(-1);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdate.current < 0.45) {
      return;
    }

    lastUpdate.current = state.clock.elapsedTime;
    onStats({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      textures: gl.info.memory.textures,
      ...modelMetrics,
    });
  });

  return null;
}

function ControlGroup({ options, value, onChange, label }) {
  return (
    <div className="stone-lab__control-group" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'is-active' : ''}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatMeters(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

export default function BlackStoneLab() {
  const [view, setView] = useState('stone-full');
  const [diagnostic, setDiagnostic] = useState('beauty');
  const [preset, setPreset] = useState('hybrid');
  const [parameters, setParameters] = useState({ ...BLACK_STONE_PRESETS.hybrid });
  const [lightSweep, setLightSweep] = useState(true);
  const [lightPhase, setLightPhase] = useState(0);
  const [modelMetrics, setModelMetrics] = useState({
    meshes: 0,
    triangles: 0,
    vertices: 0,
    width: 0,
    height: 0,
    depth: 0,
  });
  const [stats, setStats] = useState({
    calls: 0,
    triangles: 0,
    programs: 0,
    textures: 0,
  });

  const telemetry = useMemo(() => ({ ...stats, ...modelMetrics }), [modelMetrics, stats]);

  const applyPreset = (nextPreset) => {
    setPreset(nextPreset);
    setParameters({ ...BLACK_STONE_PRESETS[nextPreset] });
  };

  const updateParameter = (parameter, value) => {
    setPreset('custom');
    setParameters((current) => ({
      ...current,
      [parameter]: Number(value),
    }));
  };

  useEffect(() => {
    const renderState = () => JSON.stringify({
      surface: 'DDG asset laboratory',
      collection: 'black-stone-sculpture',
      coordinateSystem: 'meters; Y up; sculpture rests on studio floor at y=-1.14',
      view,
      diagnostic,
      preset,
      lightSweep,
      parameters,
      telemetry,
    });
    const advanceTime = (milliseconds) => {
      const seconds = Math.max(0, Number(milliseconds) || 0) / 1000;
      setLightPhase((current) => current + seconds * 0.38);
    };

    window.render_game_to_text = renderState;
    window.advanceTime = advanceTime;

    return () => {
      if (window.render_game_to_text === renderState) {
        delete window.render_game_to_text;
      }
      if (window.advanceTime === advanceTime) {
        delete window.advanceTime;
      }
    };
  }, [diagnostic, lightSweep, parameters, preset, telemetry, view]);

  return (
    <div className="stone-lab" data-testid="black-stone-lab" data-asset-collection="black-stone-sculpture">
      <AssetStudio view={view} lightingPreset="black-stone">
        <StoneSweepLight active={lightSweep} phase={lightPhase} />
        <Suspense fallback={<LoadingStone />}>
          <BlackStoneSculpture
            parameters={parameters}
            diagnostic={diagnostic}
            onMetrics={setModelMetrics}
          />
        </Suspense>
        <RenderTelemetry modelMetrics={modelMetrics} onStats={setStats} />
      </AssetStudio>

      <header className="stone-lab__header">
        <div className="stone-lab__title">
          <p>ASSET LAB / BLACK STONE</p>
          <h1>Скульптура из чёрного камня</h1>
          <span>Слоистая масса · стеклянный излом · локальная влажная полировка</span>
        </div>

        <div className="stone-lab__toolbar">
          <ControlGroup
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            label="Ракурс"
          />
          <ControlGroup
            options={DIAGNOSTIC_OPTIONS}
            value={diagnostic}
            onChange={setDiagnostic}
            label="Режим материала"
          />
          <LabNav current="black-stone-sculpture" />
        </div>
      </header>

      <aside className="stone-lab__inspector" aria-label="Параметры материала">
        <div className="stone-lab__section">
          <div className="stone-lab__section-title">
            <span>Характер</span>
            <em>{preset === 'custom' ? 'ручной' : PRESET_OPTIONS.find((item) => item.id === preset)?.label}</em>
          </div>
          <ControlGroup
            options={PRESET_OPTIONS}
            value={preset}
            onChange={applyPreset}
            label="Характер камня"
          />
        </div>

        <div className="stone-lab__sliders">
          {PARAMETER_OPTIONS.map((parameter) => (
            <label key={parameter.id} className="stone-lab__slider">
              <span>{parameter.label}</span>
              <output>
                {parameter.scale ? '×' : ''}{parameters[parameter.id].toFixed(2)}
              </output>
              <input
                type="range"
                aria-label={parameter.label}
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={parameters[parameter.id]}
                onChange={(event) => updateParameter(parameter.id, event.target.value)}
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          className={`stone-lab__sweep ${lightSweep ? 'is-active' : ''}`}
          aria-pressed={lightSweep}
          onClick={() => setLightSweep((current) => !current)}
        >
          <span>Световой проход</span>
          <i>{lightSweep ? 'движется' : 'зафиксирован'}</i>
        </button>

        <div className="stone-lab__legend" aria-label="Легенда масок">
          <span><i className="is-red" />жилы</span>
          <span><i className="is-green" />влага</span>
          <span><i className="is-blue" />излом</span>
        </div>
      </aside>

      <footer className="stone-lab__telemetry" aria-live="polite">
        <span><b>{telemetry.meshes}</b> mesh</span>
        <span><b>{telemetry.calls}</b> calls</span>
        <span><b>{Math.round(telemetry.triangles / 1000)}k</b> трис</span>
        <span><b>0</b> PBR maps</span>
        <span><b>{formatMeters(telemetry.width)} × {formatMeters(telemetry.height)} × {formatMeters(telemetry.depth)} м</b></span>
        <span className="stone-lab__budget">1 процедурный physical material</span>
      </footer>

      <div className="stone-lab__note">
        <span>ЛКМ — вращение</span>
        <span>Колесо — масштаб</span>
        <span>RGB масок: жилы / влага / излом</span>
      </div>
    </div>
  );
}
