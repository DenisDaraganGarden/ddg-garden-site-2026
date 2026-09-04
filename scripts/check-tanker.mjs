import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTanker, disposeTanker } from '../src/tanker/model.js';
import { sampleTankerMotion, getTankerAcoustics, KNOTS_TO_METERS_PER_SECOND } from '../src/tanker/motion.js';

for (const lod of ['near', 'horizon']) {
  const asset = createTanker({ lod });
  assert.equal(asset.metrics.length, 138);
  assert.ok(asset.metrics.beam >= 16 && asset.metrics.beam <= 19);
  assert.ok(asset.metrics.triangles < (lod === 'near' ? 25000 : 2600), `${lod}: ${asset.metrics.triangles} triangles`);
  assert.ok(asset.metrics.meshes <= 12);
  const bounds = new THREE.Box3().setFromObject(asset.group);
  assert.equal(bounds.min.y, -4.5);
  assert.ok(bounds.max.y >= 28);
  const positions = asset.group.getObjectByName('tanker_red').geometry.attributes.position;
  const normals = asset.group.getObjectByName('tanker_red').geometry.attributes.normal;
  // Port shell must face away from the centreline. Catch inside-out station winding.
  let checked = 0;
  for (let i = 0; i < positions.count; i += 1) {
    if (positions.getZ(i) < -8 && positions.getX(i) > -35 && positions.getX(i) < 35) {
      assert.ok(normals.getZ(i) < -0.8);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
  asset.group.traverse((object) => {
    if (!object.isMesh) return;
    for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  });
  console.log(`${lod}: ${asset.metrics.triangles} triangles, ${asset.metrics.meshes} batches`);
  disposeTanker(asset);
}
for (const heading of [0, 90, 180, 270]) {
  const state = sampleTankerMotion(3600, { speedKnots: 10, heading });
  assert.ok(Math.abs(Math.hypot(state.x, state.z) - 3600 * 10 * KNOTS_TO_METERS_PER_SECOND) < 1e-6);
}
for (let t = 0; t < 720; t += 0.37) {
  const pose = sampleTankerMotion(t, { seaState: 1 });
  assert.ok(Math.abs(pose.y) < 0.43 && Math.abs(pose.roll) < 0.027 && Math.abs(pose.pitch) < 0.013);
}
assert.equal(sampleTankerMotion(10, { speedKnots: -1 }).rpm, 55);
assert.equal(sampleTankerMotion(10, { speedKnots: NaN }).speed, 0);
const close = getTankerAcoustics({ distance: 45 });
const far = getTankerAcoustics({ distance: 1200 });
assert.ok(far.distanceGain < close.distanceGain / 20);
assert.ok(far.cutoff < 400 && close.cutoff > 5000);
assert.equal(getTankerAcoustics({ distance: 100, enabled: false }).gain, 0);
assert.equal(getTankerAcoustics({ distance: 100, masterGain: 0 }).gain, 0);
assert.equal(getTankerAcoustics({ distance: 1200, spatialEnabled: false }).distanceGain, 1);
assert.ok(getTankerAcoustics({ distance: 100, radialVelocity: -8 }).doppler > 1);
console.log('Hull winding, physical scale, long-duration motion and sound distance/mute contracts pass.');
