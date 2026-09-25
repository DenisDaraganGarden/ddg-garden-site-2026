import assert from 'node:assert/strict';
import { rendererContextRevision, subscribeRendererContext } from './useRendererContextRevision.js';
import { createGpuFrameTimer } from './renderBudget.js';
import { createCloudGpuTimer } from './sky/painterly/gpuCloudTimer.js';

const renderer = { domElement: new EventTarget() };
let notices = 0;
const unsubscribe = subscribeRendererContext(renderer, () => { notices += 1; });
renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
assert.equal(rendererContextRevision(renderer), 1);
assert.equal(notices, 1);
unsubscribe();
renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
assert.equal(rendererContextRevision(renderer), 2, 'cached bakes age even between mounts');
assert.equal(notices, 1);

let deleted = 0, ended = 0, lost = false;
const context = {
    getExtension: () => ({ TIME_ELAPSED_EXT: 1 }), createQuery: () => ({}),
    beginQuery() {}, endQuery() { ended += 1; }, deleteQuery() { deleted += 1; },
    getQueryParameter: () => false, isContextLost: () => lost,
};
const timer = createGpuFrameTimer({ getContext: () => context });
timer.begin(); timer.end();
lost = true;
timer.begin(); assert.equal(timer.end(), null);
lost = false;
timer.dispose({ contextLost: true });
assert.equal(deleted, 0, 'old context handles are forgotten, not sent to restored context');
const fresh = createGpuFrameTimer({ getContext: () => context });
fresh.begin(); fresh.dispose();
assert.equal(deleted, 1);
assert.equal(ended, 2, 'normal disposal closes an active query');
console.log('renderer restore: shared revision, subscription lifetime, invalid query teardown');

context.getParameter = () => false;
context.getQuery = () => null;
const cloud = createCloudGpuTimer({ getContext: () => context });
assert.equal(cloud.begin(), true);
cloud.end();
cloud.dispose({ contextLost: true });
assert.equal(deleted, 1, 'cloud cleanup must also forget obsolete handles');
const restoredCloud = createCloudGpuTimer({ getContext: () => context });
assert.equal(restoredCloud.begin(), true);
restoredCloud.dispose();
assert.equal(deleted, 2);
assert.equal(ended, 4);
console.log('cloud timer: reset after context loss and close active query on teardown');
