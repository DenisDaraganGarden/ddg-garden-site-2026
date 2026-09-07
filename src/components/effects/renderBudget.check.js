import assert from 'node:assert/strict';
import { applyRenderBudget, createGpuFrameTimer, createRenderBudgetController } from './renderBudget.js';

const controller = createRenderBudgetController();
const feed = (milliseconds, seconds) => {
  let latest;
  for (let elapsed = 0; elapsed < seconds; elapsed += milliseconds / 1000) {
    latest = controller.record({ frameMs: milliseconds, workMs: 2 });
  }
  return latest;
};

// Warm-up shields shader/texture construction. Then each 2-second p80 may
// reduce only one level, with a three-second hold between transitions.
assert.equal(feed(50, 8).level, 0);
assert.equal(feed(50, 3).level, 1);
assert.equal(feed(50, 3).level, 2);
assert.equal(feed(50, 4).level, 3);
assert.equal(feed(33.333, 12).level, 3, 'a normal 30-FPS cap cannot prove recovery without GPU headroom');
assert.equal(feed(16, 10).level, 2, 'sustained headroom recovers one level');

const cpuBoundController = createRenderBudgetController();
let cpuBoundSnapshot;
for (let elapsed = 0; elapsed < 11; elapsed += .05) {
  cpuBoundSnapshot = cpuBoundController.record({ frameMs: 50, workMs: 50, gpuMs: 2 });
}
assert.equal(cpuBoundSnapshot.level, 1, 'fast GPU timing does not hide a CPU-bound frame');

const profile = applyRenderBudget({ reflectionActiveFps: 30, reflectionIdleFps: 20, refractionActiveFps: 24, refractionIdleFps: 16, postRenderScale: 1 }, 3, { postEnabled: true });
assert.deepEqual([profile.reflectionActiveFps, profile.refractionActiveFps, profile.postRenderScale], [15, 12, .8]);
assert.equal(applyRenderBudget(profile, 0, { postEnabled: false }).postRenderScale, .8, 'budget composes from its supplied base profile only');

function createTimerGl() {
  const queries = [];
  const deleted = [];
  let active = null;
  let disjoint = false;
  const context = {
    QUERY_RESULT_AVAILABLE: 'available',
    QUERY_RESULT: 'result',
    createQuery() {
      const query = { available: false, nanos: 0 };
      queries.push(query);
      return query;
    },
    beginQuery(_target, query) { active = query; },
    endQuery() { active = null; },
    getQueryParameter(query, parameter) {
      return parameter === 'available' ? query.available : query.nanos;
    },
    getParameter() { return disjoint; },
    deleteQuery(query) { deleted.push(query); },
    getExtension(name) { return name === 'EXT_disjoint_timer_query_webgl2' ? { TIME_ELAPSED_EXT: 'elapsed', GPU_DISJOINT_EXT: 'disjoint' } : null; },
  };
  return {
    // Matches THREE.WebGLRenderer: WebGL2 query methods exist only on its
    // context, not on the renderer facade.
    gl: { getContext() { return context; } },
    queries,
    deleted,
    setDisjoint(value) { disjoint = value; },
    get active() { return active; },
  };
}

const mock = createTimerGl();
const gpuTimer = createGpuFrameTimer(mock.gl);
assert.ok(gpuTimer, 'WebGL2 extension enables optional GPU telemetry');
for (let index = 0; index < 4; index += 1) {
  gpuTimer.begin();
  gpuTimer.end();
}
gpuTimer.begin();
assert.equal(mock.queries.length, 4, 'pending queries are bounded when the GPU is late');
mock.queries[0].available = true;
mock.queries[0].nanos = 4_500_000;
gpuTimer.begin();
assert.equal(gpuTimer.end(), 4.5, 'a completed query is consumed once as milliseconds');
mock.queries[1].available = true;
mock.setDisjoint(true);
gpuTimer.begin();
assert.equal(gpuTimer.end(), null, 'disjoint GPU timing is never used as a performance sample');
gpuTimer.dispose();
assert.ok(mock.deleted.length >= 4, 'all completed and pending GPU queries are released');

console.log('renderBudget: warm-up, paced cadence, hysteresis and transient policy are stable');
