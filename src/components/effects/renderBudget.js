// The adaptive budget acts on transient render work only. It never changes an
// authored population, placement, geometry LOD or device pixel ratio.
export const RENDER_BUDGET = Object.freeze({
  targetFps: 30,
  warmupSeconds: 8,
  sampleSeconds: 2,
  // A small scheduling margin above 33.3 ms, not a second 26-FPS target.
  degradeP80Ms: 35.5,
  recoverP80Ms: 24,
  minimumLevelHoldSeconds: 3,
  recoverySeconds: 10,
  maximumLevel: 3,
});

const percentile80 = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * .8))];
};

export function createRenderBudgetController(config = RENDER_BUDGET) {
  let level = 0;
  let activeSeconds = 0;
  let sampleSeconds = 0;
  let recoverySeconds = 0;
  let heldSeconds = 0;
  let samples = [];
  let p80 = 0;

  const snapshot = (changed = false) => ({
    level,
    changed,
    warm: activeSeconds >= config.warmupSeconds,
    p80Ms: p80,
    recoverySeconds,
  });

  return {
    reset() {
      level = 0;
      activeSeconds = 0;
      sampleSeconds = 0;
      recoverySeconds = 0;
      heldSeconds = 0;
      samples = [];
      p80 = 0;
      return snapshot();
    },
    record({ frameMs, workMs = null, gpuMs = null }) {
      // Frame cadence is the conservative fallback. A 30-FPS cap normally
      // reports ~33 ms and therefore cannot be mistaken for overload; a busy
      // capped frame still exceeds 35.5 ms. When available, GPU time is combined
      // with CPU work so either constrained side can protect quality.
      const measured = Number.isFinite(gpuMs) && gpuMs > 0
        // A finished GPU query measures GPU execution, while workMs covers CPU
        // traversal/submission for the same full R3F span. Retain the slower
        // side so a CPU-bound scene cannot recover merely because its GPU is
        // idle.
        ? Math.max(gpuMs, Number.isFinite(workMs) && workMs > 0 ? workMs : 0)
        : (Number.isFinite(frameMs) && frameMs > 0 ? frameMs : workMs);
      const deltaSeconds = Number.isFinite(frameMs) && frameMs > 0
        ? Math.min(frameMs / 1000, .25)
        : 0;
      if (!Number.isFinite(measured) || measured <= 0 || deltaSeconds <= 0) return snapshot();

      activeSeconds += deltaSeconds;
      sampleSeconds += deltaSeconds;
      heldSeconds += deltaSeconds;
      samples.push(measured);
      if (sampleSeconds < config.sampleSeconds) return snapshot();

      p80 = percentile80(samples);
      sampleSeconds = 0;
      samples = [];
      if (activeSeconds < config.warmupSeconds) return snapshot();

      let changed = false;
      if (p80 > config.degradeP80Ms) {
        recoverySeconds = 0;
        if (level < config.maximumLevel && heldSeconds >= config.minimumLevelHoldSeconds) {
          level += 1;
          heldSeconds = 0;
          changed = true;
        }
      } else if (p80 < config.recoverP80Ms) {
        recoverySeconds += config.sampleSeconds;
        if (level > 0 && recoverySeconds >= config.recoverySeconds && heldSeconds >= config.minimumLevelHoldSeconds) {
          level -= 1;
          heldSeconds = 0;
          recoverySeconds = 0;
          changed = true;
        }
      } else {
        recoverySeconds = 0;
      }
      return snapshot(changed);
    },
    get snapshot() { return snapshot(); },
  };
}

const OPTICS_RATIOS = [1, .8, .65, .5];

export function applyRenderBudget(profile, level = 0, { postEnabled = false } = {}) {
  const safeLevel = Math.max(0, Math.min(RENDER_BUDGET.maximumLevel, Math.round(level) || 0));
  const ratio = OPTICS_RATIOS[safeLevel];
  const rate = (value) => Math.max(8, Math.round((Number(value) || 8) * ratio));
  const postScale = postEnabled && safeLevel >= 2
    ? (safeLevel === 2 ? .9 : .8)
    : 1;
  return {
    ...profile,
    renderBudgetLevel: safeLevel,
    reflectionActiveFps: rate(profile.reflectionActiveFps),
    reflectionIdleFps: rate(profile.reflectionIdleFps),
    // Refraction remains enabled and has the same 8 FPS floor at every level;
    // urgent submerged motion is therefore never replaced with an analytic path.
    refractionActiveFps: rate(profile.refractionActiveFps),
    refractionIdleFps: rate(profile.refractionIdleFps),
    postRenderScale: profile.postRenderScale * postScale,
  };
}

// EXT_disjoint_timer_query_webgl2 is optional. One frame query spans the full
// R3F pass sequence (reflections, scene and post), never nests, polls lazily and
// keeps at most four pending query objects. CPU timing remains the safe fallback.
export function createGpuFrameTimer(gl) {
  const context = gl?.getContext?.();
  const extension = context?.getExtension?.('EXT_disjoint_timer_query_webgl2');
  if (!extension || typeof context.createQuery !== 'function') return null;
  const pending = [];
  let active = null;
  let availableMs = null;
  const poll = () => {
    let completedMs = null;
    while (pending.length > 0) {
      const query = pending[0];
      if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      const disjoint = context.getParameter(extension.GPU_DISJOINT_EXT);
      const nanos = context.getQueryParameter(query, context.QUERY_RESULT);
      context.deleteQuery(query);
      // A disjoint event invalidates outstanding timer measurements. Do not let
      // a value sampled before the GPU reset leak into the next budget window.
      if (disjoint) {
        availableMs = null;
        completedMs = null;
        // Any unresolved query belongs to the same disjoint GPU interval. Drop
        // it now instead of accepting an invalid value several frames later.
        pending.splice(0).forEach((pendingQuery) => context.deleteQuery(pendingQuery));
        break;
      } else if (Number.isFinite(nanos)) {
        completedMs = nanos / 1e6;
      }
    }
    return completedMs;
  };

  return {
    begin() {
      availableMs = poll() ?? availableMs;
      if (active || pending.length >= 4) return;
      active = context.createQuery();
      if (!active) return;
      context.beginQuery(extension.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (active) {
        context.endQuery(extension.TIME_ELAPSED_EXT);
        pending.push(active);
        active = null;
      }
      const completedMs = poll() ?? availableMs;
      availableMs = null;
      return completedMs;
    },
    dispose() {
      if (active) context.deleteQuery(active);
      active = null;
      pending.splice(0).forEach((query) => context.deleteQuery(query));
    },
  };
}
