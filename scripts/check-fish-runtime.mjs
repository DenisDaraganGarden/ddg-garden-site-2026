import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { publishedHomeSceneKeys } from '../src/features/home-scene/data/publishedHomeSceneKeys.js';
import { publishedHomeSceneSettings } from '../src/features/home-scene/data/publishedHomeSceneSettings.js';
import { createFishHabitat } from '../src/features/home-scene/creatures/fish/fishHabitat.js';
import {
  createFishAgents,
  measureFishRuntime,
  resolveFishCounts,
  resolveFishQuality,
  stepFishAgents,
} from '../src/features/home-scene/creatures/fish/fishBehavior.js';

const settingsSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/home-scene/hooks/useHomeSceneSettings.js'),
  'utf8',
);
assert.match(settingsSource, /fishPointerInteraction:\s*true/);
assert.match(
  settingsSource,
  /fishPointerInteraction:\s*pickBoolean\(\s*merged\.fishPointerInteraction,\s*defaults\.fishPointerInteraction,/s,
  'fish cursor response must preserve an explicit disabled setting during normalization',
);
assert.ok(
  publishedHomeSceneKeys.includes('fishPointerInteraction'),
  'fish cursor response must be publishable',
);
for (const scene of [
  publishedHomeSceneSettings,
  ...publishedHomeSceneSettings.sceneCameras.map((camera) => camera.scene),
]) {
  assert.equal(
    scene.fishPointerInteraction,
    true,
    'fish cursor response must be present in the root scene and every camera snapshot',
  );
}

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
const previousStates = new Map(agents.map((agent) => [agent.id, agent.state]));
const surfaceArrivalFrames = new Set();
const surfaceArrivalsPerSecond = new Map();
let maxSimultaneousSurface = 0;
for (let frame = 0; frame < 30 * 60 * 10; frame += 1) {
  stepFishAgents(agents, 1 / 30, frame / 30, {
    habitat,
    schooling: 0.68,
    activity: 0.55,
  });
  agents.forEach((agent) => {
    if (agent.state === 'surface' && previousStates.get(agent.id) !== 'surface') {
      surfaceArrivalFrames.add(frame);
      const second = Math.floor(frame / 30);
      surfaceArrivalsPerSecond.set(second, (surfaceArrivalsPerSecond.get(second) ?? 0) + 1);
    }
    previousStates.set(agent.id, agent.state);
  });
  maxSimultaneousSurface = Math.max(
    maxSimultaneousSurface,
    agents.filter((agent) => agent.state === 'surface').length,
  );
}
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
for (const species of ['perch', 'roach']) {
  const school = agents.filter((agent) => agent.species === species);
  const xValues = school.map((agent) => agent.position.x);
  const zValues = school.map((agent) => agent.position.z);
  const speeds = school.map((agent) => agent.velocity.length());
  const normalizedNearestGaps = school.map((agent) => Math.min(
    ...school
      .filter((other) => other !== agent)
      .map((other) => (
        agent.position.distanceTo(other.position)
        / (agent.radius * agent.scale + other.radius * other.scale)
      )),
  )).sort((a, b) => a - b);
  assert.ok(
    Math.max(...xValues) - Math.min(...xValues) > 1.8
      || Math.max(...zValues) - Math.min(...zValues) > 1.8,
    `${species} school collapsed into a compact cluster`,
  );
  assert.ok(
    Math.max(...speeds) / Math.max(Math.min(...speeds), 1e-6) > 1.35,
    `${species} school has no visible pace variation`,
  );
  assert.ok(
    normalizedNearestGaps[Math.floor(normalizedNearestGaps.length * 0.5)] > 1.25,
    `${species} school collapsed into overlapping bunches`,
  );
}
assert.ok(
  surfaceArrivalFrames.size > 50,
  'surface approaches must be staggered across time rather than synchronized',
);
assert.ok(maxSimultaneousSurface <= 3, 'surface mode exceeded its asynchronous slot budget');
assert.ok(
  Math.max(...surfaceArrivalsPerSecond.values()) <= 2,
  'surface approaches synchronized within one second',
);

const threatened = createFishAgents({ requestedCount: 18, habitat });
threatened.forEach((agent, index) => {
  // Only the near part of a school receives a direct cursor hit. The rest must
  // acquire a weaker, delayed response from neighbouring fish.
  agent.pointerThreat = index < 3 ? 1 : 0;
  agent.pointerAway = new THREE.Vector3(-1, 0, 0);
  agent.pointerDirect = index < 3;
  agent.pointerDistancePx = index < 3 ? 48 : Infinity;
});
for (let frame = 0; frame < 90; frame += 1) {
  stepFishAgents(threatened, 1 / 30, frame / 30, {
    habitat,
    schooling: 0.7,
    activity: 0.55,
  });
}
assert.ok(
  threatened.some((agent) => agent.threatMemory > 0.25),
  'direct pointer threat must enter short-term fish memory',
);
assert.ok(
  threatened.some((agent) => agent.state === 'burst'),
  'direct pointer threat must trigger at least one evasive burst',
);
assert.ok(
  threatened.slice(3).some((agent) => agent.threatContagion > 0),
  'neighbouring fish must receive a soft propagated alarm',
);
threatened.forEach((agent) => {
  agent.pointerThreat = 0;
  agent.pointerDirect = false;
  agent.pointerDistancePx = Infinity;
});
for (let frame = 90; frame < 420; frame += 1) {
  stepFishAgents(threatened, 1 / 30, frame / 30, { habitat, schooling: 0.7, activity: 0.55 });
}
assert.ok(
  threatened.every((agent) => agent.threatMemory < 0.5),
  'pointer threat must decay after the cursor leaves',
);

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
assert.ok(report.motion.schools.roach.spanX > 1.8 || report.motion.schools.roach.spanZ > 1.8);
assert.ok(report.motion.schools.roach.speedP90 > report.motion.schools.roach.speedP10 * 1.25);
assert.ok(report.motion.schools.roach.medianBodyGap > 1.25);
console.log(JSON.stringify(report, null, 2));
