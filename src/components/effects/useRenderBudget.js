import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { applyRenderBudget, createGpuFrameTimer, createRenderBudgetController, RENDER_BUDGET } from './renderBudget.js';

export function useRenderBudget({ baseProfile, enabled, postEnabled }) {
  const { gl } = useThree();
  const measureEnabled = enabled || import.meta.env.DEV;
  const controllerRef = useRef(createRenderBudgetController());
  const timerRef = useRef(null);
  const frameRef = useRef({ startedAt: 0, deltaMs: 0, nextDiagnosticsAt: 0 });
  const [level, setLevel] = useState(0);

  useEffect(() => {
    timerRef.current = createGpuFrameTimer(gl);
    return () => timerRef.current?.dispose();
  }, [gl]);

  useEffect(() => {
    controllerRef.current.reset();
    setLevel(0);
  }, [enabled, baseProfile]);

  useEffect(() => {
    if (!measureEnabled) delete gl.domElement.dataset.ddgRenderBudget;
  }, [measureEnabled, gl]);

  useFrame((_state, delta) => {
    if (!measureEnabled) return;
    frameRef.current.startedAt = performance.now();
    frameRef.current.deltaMs = Math.max(0, delta * 1000);
    timerRef.current?.begin();
  }, -9999);

  useFrame(() => {
    if (!measureEnabled) return;
    const finishedAt = performance.now();
    const workMs = Math.max(0, finishedAt - frameRef.current.startedAt);
    // A timer query may resolve several frames late. Only a newly completed
    // sample is allowed to override cadence; replaying an old GPU value would
    // make one hitch look like sustained pressure.
    const gpuMs = timerRef.current?.end() ?? null;
    const snapshot = controllerRef.current.record({ frameMs: frameRef.current.deltaMs, workMs, gpuMs });
    if (enabled && snapshot.changed) setLevel(snapshot.level);
    // This is a diagnostics surface for the editor, not a per-frame telemetry
    // stream. Updating it twice per second avoids needless DOM string churn.
    if (finishedAt < frameRef.current.nextDiagnosticsAt) return;
    frameRef.current.nextDiagnosticsAt = finishedAt + 500;
    gl.domElement.dataset.ddgRenderBudget = JSON.stringify({
      level: enabled ? snapshot.level : 0,
      adaptive: Boolean(enabled),
      targetFps: RENDER_BUDGET.targetFps,
      p80Ms: Number(snapshot.p80Ms.toFixed(2)),
      // CPU time around the entire R3F frame; this is deliberately not named
      // passMs because it cannot attribute reflection, scene and post passes.
      workMs: Number(workMs.toFixed(2)),
      gpuMs: Number.isFinite(gpuMs) ? Number(gpuMs.toFixed(2)) : null,
      source: Number.isFinite(gpuMs) ? 'gpu+cpu' : 'frame-cadence',
      warm: snapshot.warm,
    });
  }, 101);

  useEffect(() => () => {
    delete gl.domElement.dataset.ddgRenderBudget;
  }, [gl]);

  return useMemo(
    () => applyRenderBudget(baseProfile, enabled ? level : 0, { postEnabled }),
    [baseProfile, enabled, level, postEnabled],
  );
}
