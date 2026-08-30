import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFishHabitat } from '../src/features/home-scene/creatures/fish/fishHabitat.js';
import {
  createFishAgents,
  measureFishRuntime,
  resolveFishCounts,
  resolveFishQuality,
  stepFishAgents,
} from '../src/features/home-scene/creatures/fish/fishBehavior.js';

assert.deepEqual(resolveFishCounts({ requestedCount: 50 }), { pike: 1, perch: 11, roach: 38 });
assert.deepEqual(resolveFishCounts({ requestedCount: 0 }), { pike: 0, perch: 0, roach: 0 });
assert.deepEqual(resolveFishCounts({ requestedCount: 1 }), { pike: 1, perch: 0, roach: 0 });
assert.deepEqual(resolveFishCounts({ requestedCount: 2 }), { pike: 1, perch: 1, roach: 0 });
assert.equal(resolveFishQuality({ requestedCount: 50, quality: 'low' }).effectiveCount, 14);
assert.equal(resolveFishQuality({ requestedCount: 50, qualityProfile: { fishMaxInstances: 18 } }).effectiveCount, 18);
for (let requestedCount = 0; requestedCount <= 50; requestedCount += 1) {
  const counts = resolveFishCounts({ requestedCount });
  assert.equal(
    counts.pike + counts.perch + counts.roach,
    requestedCount,
    `species mix must preserve requested count ${requestedCount}`,
  );
}
for (const limit of [14, 18, 30, 50]) {
  assert.equal(
    resolveFishQuality({ requestedCount: 50, qualityProfile: { fishMaxInstances: limit } }).effectiveCount,
    limit,
  );
}

const habitat = createFishHabitat({
  min: [-3, -1.2, -2], max: [3, -0.08, 2], waterY: 0,
  sampleSurfaceY: (x, z) => 0.03 * Math.sin(x * 2 + z),
  obstacles: [{ id: 'boat', min: [-0.45, -1.2, -0.35], max: [0.45, 0.1, 0.35], clearance: 0.24 }],
});
const agents = createFishAgents({ requestedCount: 50, habitat });
for (let frame = 0; frame < 30 * 60 * 10; frame += 1) stepFishAgents(agents, 1 / 30, frame / 30, {
  habitat,
  schooling: 0.68,
  activity: 0.55,
});
for (const agent of agents) {
  assert.ok(agent.position.x >= habitat.min.x && agent.position.x <= habitat.max.x, `${agent.id} escaped x bounds`);
  assert.ok(agent.position.z >= habitat.min.z && agent.position.z <= habitat.max.z, `${agent.id} escaped z bounds`);
  const physicalRadius = agent.radius * agent.scale;
  const surfaceY = habitat.sampleSurfaceY(agent.position.x, agent.position.z);
  assert.ok(
    agent.position.y + physicalRadius <= surfaceY - habitat.surfaceClearance + 1e-6,
    `${agent.id} broke the sampled water surface`,
  );
  const box = new THREE.Box3(new THREE.Vector3(-0.45, -1.2, -0.35), new THREE.Vector3(0.45, 0.1, 0.35));
  assert.ok(
    box.distanceToPoint(agent.position) >= physicalRadius - 1e-6,
    `${agent.id} geometry intersected obstacle core`,
  );
}

const deterministicA = createFishAgents({ requestedCount: 18, habitat });
const deterministicB = createFishAgents({ requestedCount: 18, habitat });
for (let frame = 0; frame < 300; frame += 1) {
  const options = { habitat, schooling: 0.41, activity: 0.77 };
  stepFishAgents(deterministicA, 1 / 30, frame / 30, options);
  stepFishAgents(deterministicB, 1 / 30, frame / 30, options);
}
deterministicA.forEach((agent, index) => {
  assert.ok(
    agent.position.distanceToSquared(deterministicB[index].position) < 1e-18,
    `${agent.id} is not deterministic`,
  );
});
const report = measureFishRuntime(agents, { requestedCount: 50 });
assert.equal(report.total, 50);
assert.equal(report.triangles, 25692);
assert.equal(report.expectedDrawCalls, 3);
console.log(JSON.stringify(report, null, 2));
