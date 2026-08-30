import * as THREE from 'three';

// Values the whole home scene agrees on. Split out of WaterScene so a number can
// be found and changed without scrolling past three thousand lines of rendering.

export const PUBLIC_CAMERA_POSITION = [0, 5.8, 8.9];
export const DEFAULT_CLEAR_COLOR = '#000000';
export const DRAWING_BUFFER_SIZE = new THREE.Vector2();
export const DEFAULT_BOAT_ANCHOR = Object.freeze({ x: 2.1, z: -1.4 });
export const DEFAULT_SCULPTURE_ANCHOR = Object.freeze({ x: 0.6, z: 1.2 });
// The water surface rejects this stencil value; a narrow cockpit seal writes it
// before the water pass so the interior stays dry without cutting around the hull.
export const BOAT_CUTOUT_STENCIL_REF = 1;
export const SCULPTURE_DRAG_EDGE_MARGIN = 0.35;
export const BOAT_PROBE_OFFSETS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0.95),
  new THREE.Vector3(0, 0, -0.95),
  new THREE.Vector3(-0.42, 0, 0),
  new THREE.Vector3(0.42, 0, 0),
];
export const DEBUG_VIEW_IDS = {
  beauty: 0,
  height: 1,
  normals: 2,
  caustics: 3,
  'seabed-depth': 4,
};
// HDRI presets we ship locally (no runtime CDN dependency in production). The published
// look uses `night`; other presets still fall back to drei's CDN for in-editor experiments.
export const SELF_HOSTED_HDRI = {
  night: 'hdri/dikhololo_night_1k.hdr',
};
export const SIMULATION_RESOLUTION_STEPS = Object.freeze([128, 256, 384, 512]);
export const REFLECTION_CAMERA_POSITION_EPSILON_SQ = 0.00006;
export const REFLECTION_CAMERA_ROTATION_EPSILON = 0.00008;
export const REFLECTION_BOAT_POSITION_EPSILON_SQ = 0.00004;
export const REFLECTION_BOAT_ROTATION_EPSILON = 0.00008;
export const CURSOR_BOAT_IMPACT_DURATION = 1.35;
export const CURSOR_BOAT_IMPACT_RADIUS_FACTOR = 5.2;
export const BOAT_NEUTRAL_Y = 0.26;
export const BOAT_TARGET_Y_MIN = 0.02;
export const BOAT_TARGET_Y_MAX = 0.44;
export const BOAT_MAX_PITCH = 0.24;
export const BOAT_MAX_ROLL = 0.28;
// Buoyancy probes need a GPU->CPU pixel readback, which stalls the pipeline.
// Reading more often than the wave simulation updates is wasted work, so cap it.
export const BOAT_PROBE_INTERVAL = 1 / 40;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const quaternionDelta = (a, b) => 1 - Math.abs(a.dot(b));

// The published scene receives the next simulation tier whenever the hardware cap
// allows it. Low-power devices intentionally stay at 128: a stable 30 fps carries
// more visible quality than a 256 simulation that thermally collapses after a minute.
export function resolveRuntimeSimulationResolution(requestedResolution, mode, maximumResolution) {
  const requested = Number(requestedResolution);
  const requestedIndex = SIMULATION_RESOLUTION_STEPS.findIndex((value) => value >= requested);
  const normalizedIndex = requestedIndex >= 0
    ? requestedIndex
    : SIMULATION_RESOLUTION_STEPS.length - 1;
  const runtimeIndex = mode === 'public'
    ? Math.min(normalizedIndex + 1, SIMULATION_RESOLUTION_STEPS.length - 1)
    : normalizedIndex;

  return Math.min(SIMULATION_RESOLUTION_STEPS[runtimeIndex], maximumResolution);
}

export function isDocumentCurrentlyVisible() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
}

// The shader clamps the radius after the divide, so the metres the water really
// feels can differ from the authored number. One place computes it for both the
// readout and the marker, so they cannot disagree.
export function effectiveImpulseRadius(settings) {
  const extent = Math.max(settings.waterExtent, 0.001);
  return clamp(settings.rippleRadius / extent, 0.0025, 0.12) * extent;
}
