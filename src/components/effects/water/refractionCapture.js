import * as THREE from 'three';

// The capture is deliberately a little wider than the displayed camera. This
// lets a rate-limited refraction texture survive ordinary input between
// captures. A frame that would reveal water outside that guard is detected
// before the final render and can request a current capture instead.
export const REFRACTION_CAPTURE_OVERSCAN = 1.2;

const FRUSTUM_CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];

const FRUSTUM_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const PROJECTION_XY_ROWS = [0, 4, 8, 12, 1, 5, 9, 13];

const EPSILON = 1e-7;

export function createRefractionCapturePolicy({
  overscan = REFRACTION_CAPTURE_OVERSCAN,
  validUvInset = 0.01,
  waveEnvelope = 0.5,
} = {}) {
  const safeOverscan = Math.max(Number(overscan) || REFRACTION_CAPTURE_OVERSCAN, 1.001);

  return {
    overscan: safeOverscan,
    validUvInset: THREE.MathUtils.clamp(validUvInset, 0, 0.49),
    waveEnvelope: Math.max(Number(waveEnvelope) || 0, 0),
    initialized: false,
    captureMatrix: new THREE.Matrix4(),
    sourceProjectionMatrix: new THREE.Matrix4(),
    sourceNear: 0,
    sourceFar: 0,
    sourceAspect: 0,
    currentProjectionView: new THREE.Matrix4(),
    inverseCurrentProjectionView: new THREE.Matrix4(),
    corners: Array.from({ length: 8 }, () => new THREE.Vector3()),
    intersections: Array.from({ length: 80 }, () => new THREE.Vector3()),
    intersectionCount: 0,
    projected: new THREE.Vector4(),
    currentProjected: new THREE.Vector4(),
    levels: [0, 0, 0],
  };
}

// Copy the live camera without touching its projection. Scaling the entire X
// and Y clip rows preserves the projection's zoom, film offset and asymmetric
// view while widening the captured field in both dimensions.
export function syncRefractionCaptureCamera(captureCamera, sourceCamera, policy) {
  captureCamera.copy(sourceCamera, false);
  captureCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
  const elements = captureCamera.projectionMatrix.elements;
  for (let index = 0; index < PROJECTION_XY_ROWS.length; index++) {
    elements[PROJECTION_XY_ROWS[index]] /= policy.overscan;
  }
  captureCamera.projectionMatrixInverse.copy(captureCamera.projectionMatrix).invert();
  captureCamera.matrixWorld.copy(sourceCamera.matrixWorld);
  captureCamera.matrixWorldInverse.copy(sourceCamera.matrixWorldInverse);
  captureCamera.layers.mask = sourceCamera.layers.mask;
  return captureCamera;
}

export function commitRefractionCapture(policy, sourceCamera, captureCamera) {
  policy.captureMatrix.copy(captureCamera.projectionMatrix).multiply(captureCamera.matrixWorldInverse);
  policy.sourceProjectionMatrix.copy(sourceCamera.projectionMatrix);
  policy.sourceNear = sourceCamera.near;
  policy.sourceFar = sourceCamera.far;
  policy.sourceAspect = sourceCamera.aspect;
  policy.initialized = true;
}

function projectionChanged(policy, camera) {
  return policy.sourceNear !== camera.near
    || policy.sourceFar !== camera.far
    || policy.sourceAspect !== camera.aspect
    || !policy.sourceProjectionMatrix.equals(camera.projectionMatrix);
}

function addIntersection(policy, start, end, level) {
  const startOffset = start.y - level;
  const endOffset = end.y - level;
  const startOnPlane = Math.abs(startOffset) <= EPSILON;
  const endOnPlane = Math.abs(endOffset) <= EPSILON;

  if (startOnPlane) {
    policy.intersections[policy.intersectionCount++].copy(start);
  }
  if (endOnPlane && !startOnPlane) {
    policy.intersections[policy.intersectionCount++].copy(end);
  }
  if ((startOffset < -EPSILON && endOffset > EPSILON)
    || (startOffset > EPSILON && endOffset < -EPSILON)) {
    policy.intersections[policy.intersectionCount++]
      .copy(start)
      .lerp(end, startOffset / (startOffset - endOffset));
  }
}

// Returns the water-plane perimeter samples of the current camera frustum.
// Intersecting all twelve edges at y and at the wave envelope bounds is
// conservative: if those convex slices fit the old capture, the visible water
// sheet between them fits too. No samples means the current frustum sees no
// horizontal water plane, so refraction need not force a render.
export function collectVisibleWaterFrustum(policy, camera, waterLevel = 0) {
  const current = policy.currentProjectionView;
  const inverse = policy.inverseCurrentProjectionView;
  current.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  inverse.copy(current).invert();
  policy.intersectionCount = 0;

  const lower = waterLevel - policy.waveEnvelope;
  const upper = waterLevel + policy.waveEnvelope;
  for (let index = 0; index < FRUSTUM_CORNERS.length; index++) {
    const [x, y, z] = FRUSTUM_CORNERS[index];
    policy.corners[index].set(x, y, z).applyMatrix4(inverse);
    const currentProjected = policy.currentProjected
      .set(policy.corners[index].x, policy.corners[index].y, policy.corners[index].z, 1)
      .applyMatrix4(current);
    if (currentProjected.w > EPSILON
      && policy.corners[index].y >= lower
      && policy.corners[index].y <= upper) {
      policy.intersections[policy.intersectionCount++].copy(policy.corners[index]);
    }
  }

  const envelope = policy.waveEnvelope;
  const levelCount = envelope > EPSILON ? 3 : 1;
  policy.levels[0] = waterLevel - envelope;
  policy.levels[1] = waterLevel;
  policy.levels[2] = waterLevel + envelope;
  for (let levelIndex = 0; levelIndex < levelCount; levelIndex++) {
    const level = policy.levels[envelope > EPSILON ? levelIndex : 1];
    for (let edgeIndex = 0; edgeIndex < FRUSTUM_EDGES.length; edgeIndex++) {
      const [from, to] = FRUSTUM_EDGES[edgeIndex];
      addIntersection(policy, policy.corners[from], policy.corners[to], level);
    }
  }
  return policy.intersectionCount;
}

export function refractionCaptureNeedsUrgentUpdate(policy, camera, waterLevel = 0) {
  if (!policy.initialized || projectionChanged(policy, camera)) {
    return true;
  }

  const count = collectVisibleWaterFrustum(policy, camera, waterLevel);
  if (count === 0) {
    return false;
  }

  const inset = policy.validUvInset;
  for (let index = 0; index < count; index++) {
    const point = policy.intersections[index];
    const projected = policy.projected
      .set(point.x, point.y, point.z, 1)
      .applyMatrix4(policy.captureMatrix);
    if (!Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
      || !Number.isFinite(projected.z)
      || !Number.isFinite(projected.w)
      || projected.w <= EPSILON) {
      return true;
    }
    const inverseW = 1 / projected.w;
    const u = projected.x * inverseW * 0.5 + 0.5;
    const v = projected.y * inverseW * 0.5 + 0.5;
    if (u < inset || u > 1 - inset || v < inset || v > 1 - inset) {
      return true;
    }
  }
  return false;
}
