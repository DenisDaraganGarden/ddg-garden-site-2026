import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  collectVisibleWaterFrustum,
  createRefractionCapturePolicy,
  refractionCaptureNeedsUrgentUpdate,
  syncRefractionCaptureCamera,
  commitRefractionCapture,
} from '../src/components/effects/water/refractionCapture.js';

const makeCamera = ({ position = [0, 8, 14], target = [0, 0, 0], fov = 50, aspect = 16 / 9, near = 0.1, far = 1000 } = {}) => {
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.fromArray(position);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

const record = (camera, policy) => {
  const capture = new THREE.PerspectiveCamera();
  syncRefractionCaptureCamera(capture, camera, policy);
  commitRefractionCapture(policy, camera, capture);
  return capture;
};

const assertCaptureContainsCurrentWater = (policy, camera, message) => {
  const count = collectVisibleWaterFrustum(policy, camera);
  assert.ok(count > 0, `${message}: current frustum intersects water`);
  for (let index = 0; index < count; index++) {
    const point = policy.intersections[index];
    const projected = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(policy.captureMatrix);
    const u = projected.x / projected.w * 0.5 + 0.5;
    const v = projected.y / projected.w * 0.5 + 0.5;
    assert.ok(Number.isFinite(u) && Number.isFinite(v), `${message}: capture UV is finite`);
    assert.ok(u >= policy.validUvInset && u <= 1 - policy.validUvInset, `${message}: capture U contains visible water`);
    assert.ok(v >= policy.validUvInset && v <= 1 - policy.validUvInset, `${message}: capture V contains visible water`);
  }
};

const policy = createRefractionCapturePolicy({ overscan: 1.2, validUvInset: 0.01, waveEnvelope: 0.5 });
const camera = makeCamera();
const capture = record(camera, policy);

assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), false, 'the captured view is valid');
assert.ok(collectVisibleWaterFrustum(policy, camera) > 0, 'downward view intersects the water envelope');
assert.notEqual(capture.projectionMatrix.elements[0], camera.projectionMatrix.elements[0], 'capture projection has horizontal guard band');
assert.notEqual(capture.projectionMatrix.elements[5], camera.projectionMatrix.elements[5], 'capture projection has vertical guard band');
assertCaptureContainsCurrentWater(policy, camera, 'symmetric projection');

// Ordinary damping movement remains within the guard band.
camera.position.add(new THREE.Vector3(0.08, 0, -0.06));
camera.lookAt(0.18, 0, 0);
camera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), false, 'small orbit and translation remain covered');

// A newly revealed side of the water plane cannot be reconstructed from the
// old target, so this must request the current-frame capture.
camera.lookAt(12, 0, 0);
camera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), true, 'large yaw leaves the capture guard');

record(camera, policy);
camera.fov += 14;
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), true, 'zoom-out invalidates the old projection');

record(camera, policy);
camera.aspect = 1;
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), true, 'aspect change invalidates the old projection');

record(camera, policy);
camera.near = 0.35;
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(policy, camera), true, 'near-plane change invalidates the old projection');

// The envelope catches a low camera crossing the wave band, where only testing
// the y=0 slice can miss a newly exposed crest or trough.
const lowPolicy = createRefractionCapturePolicy({ overscan: 1.2, waveEnvelope: 0.5 });
const lowCamera = makeCamera({ position: [0, 0.25, 4], target: [0, 0.1, -10] });
record(lowCamera, lowPolicy);
lowCamera.position.x = 1.8;
lowCamera.lookAt(8, 0.1, -10);
lowCamera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(lowPolicy, lowCamera), true, 'near-water crossing detects uncovered wave envelope');

// A near-plane corner inside the wave envelope must be included even when no
// frustum edge crosses the exact y=0 slice at that corner.
const cornerPolicy = createRefractionCapturePolicy({ overscan: 1.2, waveEnvelope: 0.5 });
const cornerCamera = makeCamera({ position: [0, 0.2, 4], target: [0, 0.2, -50], near: 0.01 });
record(cornerCamera, cornerPolicy);
assert.ok(collectVisibleWaterFrustum(cornerPolicy, cornerCamera) >= 8, 'near-water frustum corners join the wave envelope coverage');
assert.equal(refractionCaptureNeedsUrgentUpdate(cornerPolicy, cornerCamera), false, 'near-water corners are covered by a fresh capture');

// A camera aimed into the sky has no water-plane perimeter to protect. It does
// not waste a full scene capture merely because the capture is old.
const skyPolicy = createRefractionCapturePolicy();
const skyCamera = makeCamera({ position: [0, 8, 14], target: [0, 300, 14] });
record(skyCamera, skyPolicy);
assert.equal(collectVisibleWaterFrustum(skyPolicy, skyCamera), 0, 'sky view has no visible water-plane slice');
assert.equal(refractionCaptureNeedsUrgentUpdate(skyPolicy, skyCamera), false, 'sky view does not force refraction');

// The construction is world-axis independent: repeat the covered/escaped
// cases at an arbitrary compass bearing.
const bearingPolicy = createRefractionCapturePolicy();
const bearingCamera = makeCamera({ position: [19, 10, -7], target: [3, 0, -12] });
record(bearingCamera, bearingPolicy);
assert.equal(refractionCaptureNeedsUrgentUpdate(bearingPolicy, bearingCamera), false, 'arbitrary bearing starts covered');
bearingCamera.lookAt(-14, 0, 8);
bearingCamera.updateMatrixWorld(true);
assert.equal(refractionCaptureNeedsUrgentUpdate(bearingPolicy, bearingCamera), true, 'arbitrary bearing detects a newly visible water side');

// Film and view offsets produce non-zero asymmetric projection terms. Scaling
// the complete clip rows must still contain the current water polygon, and the
// source camera is immutable throughout capture setup.
const offsetPolicy = createRefractionCapturePolicy();
const offsetCamera = makeCamera({ position: [4, 9, 17], target: [0, 0, 0] });
offsetCamera.setViewOffset(1920, 1080, 240, 80, 1280, 720);
offsetCamera.filmOffset = 3;
offsetCamera.updateProjectionMatrix();
offsetCamera.updateMatrixWorld(true);
const sourceProjection = offsetCamera.projectionMatrix.clone();
record(offsetCamera, offsetPolicy);
assert.ok(Math.abs(offsetCamera.projectionMatrix.elements[8]) > 0 || Math.abs(offsetCamera.projectionMatrix.elements[9]) > 0, 'offset test has asymmetric projection');
assert.deepEqual(offsetCamera.projectionMatrix.elements, sourceProjection.elements, 'capture setup does not mutate source projection');
assertCaptureContainsCurrentWater(offsetPolicy, offsetCamera, 'asymmetric projection');

console.log(JSON.stringify({ status: 'PASS', overscan: policy.overscan, checks: 25 }, null, 2));
