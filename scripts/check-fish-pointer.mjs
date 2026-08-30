import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  advanceFishCursorResponse,
  createFishCursorInteractionState,
  sampleFishCursorField,
  worldUnitsPerPixel,
} from '../src/features/home-scene/creatures/fish/fishPointerInteraction.js';

const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
camera.position.set(0, 1.3, 6);
camera.lookAt(0, -0.6, 0);
camera.updateMatrixWorld();
camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
camera.updateProjectionMatrix();

const makeAgent = (id, position) => ({
  id,
  index: Number(id.slice(-1)),
  species: 'roach',
  scale: 1,
  position: new THREE.Vector3(...position),
  velocity: new THREE.Vector3(0.35, 0, 0),
});
const agents = [
  makeAgent('fish-0', [0, -0.55, 0]),
  makeAgent('fish-1', [0.56, -0.56, 0.1]),
  makeAgent('fish-2', [1.75, -0.58, -0.2]),
];
const viewport = { width: 1280, height: 720 };
const pointer = new THREE.Vector2(0, 0);

const sampled = sampleFishCursorField(agents, camera, viewport, pointer, true);
assert.equal(sampled.focus?.id, 'fish-0');
assert.ok(agents[0].cursorSample.influence > 0.1, 'cursor should create a local soft field');
assert.equal(agents[0].cursorSample.away.isVector3, true);
assert.ok(worldUnitsPerPixel(camera, viewport.height, 8) > worldUnitsPerPixel(camera, viewport.height, 4));

const state = createFishCursorInteractionState();
state.pointerActive = true;
state.pointerNdc = pointer;
state.viewport = viewport;
advanceFishCursorResponse(agents, state, 0.04, 0.04, camera);
advanceFishCursorResponse(agents, state, 0.09, 0.05, camera);
assert.equal(state.waveCount, 1, 'hover should release exactly one panic wave');
advanceFishCursorResponse(agents, state, 0.42, 0.05, camera);

for (const agent of agents) {
  assert.ok(agent.pointerThreat >= 0 && agent.pointerThreat <= 1, `${agent.id}: threat must be normalized`);
  assert.equal(agent.pointerAway.isVector3, true, `${agent.id}: behavior direction missing`);
  assert.ok(Number.isFinite(agent.pointerDistancePx), `${agent.id}: screen distance missing`);
}
assert.ok(agents[0].pointerDirect > 0, 'focused fish needs direct threat');
assert.ok(agents[1].cursorWaveInfluence > 0, 'nearby fish should receive delayed wave');
assert.equal(state.directTargets >= 1, true);
assert.equal(state.propagatedTargets >= 1, true);

console.log(JSON.stringify({
  focus: state.focusId,
  waveCount: state.waveCount,
  directTargets: state.directTargets,
  propagatedTargets: state.propagatedTargets,
  raycastsPerFish: 0,
}, null, 2));
