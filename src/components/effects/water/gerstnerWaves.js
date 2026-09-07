import * as THREE from 'three';

// Open-water waves as a sum of Gerstner (trochoid) trains, evaluated per vertex
// in world XZ so the surface is continuous from the camera to the horizon.
// Four trains: the primary downwind swell, two crossing trains and one long
// background swell. `steepness` is the whole-surface budget Σ Q·k·A: below 1
// a trochoid cannot loop over itself, and 0.8 leaves margin for the sets
// envelope and the ripple normal, so no slider can produce a self-intersection.

export const GERSTNER_TRAIN_COUNT = 4;
export const GERSTNER_MAX_STEEPNESS = 0.8;
const GRAVITY = 9.81;
const TRAIN_SHAPES = [
  { wavelength: 1, amplitude: 1, bearing: 0, sets: 1, cross: 0 },
  { wavelength: 0.62, amplitude: 0.45, bearing: 38, sets: 0.6, cross: 1 },
  { wavelength: 0.41, amplitude: 0.28, bearing: -51, sets: 0.4, cross: 1 },
  { wavelength: 1.9, amplitude: 0.32, bearing: 11, sets: 0.2, cross: 0 },
];

export function resolveGerstnerTrains({ wavelength, amplitude, steepness, windDirection, crossWaves }) {
  const budget = Math.min(Math.max(Number(steepness) || 0, 0), GERSTNER_MAX_STEEPNESS);
  const baseLength = Math.max(Number(wavelength) || 1, 0.5);
  const cross = Math.min(Math.max(Number(crossWaves) || 0, 0), 1);
  const trains = TRAIN_SHAPES.map((shape) => {
    const length = baseLength * shape.wavelength;
    const k = (2 * Math.PI) / length;
    const a = Math.max(Number(amplitude) || 0, 0) * shape.amplitude * (shape.cross ? cross : 1);
    const bearing = THREE.MathUtils.degToRad((Number(windDirection) || 0) + shape.bearing);
    return { direction: [Math.sin(bearing), -Math.cos(bearing)], k, amplitude: a, omega: Math.sqrt(GRAVITY * k), sets: shape.sets };
  });
  // Σ Q_i k_i A_i = budget by construction; a silent train gets no share.
  const live = trains.filter((train) => train.k * train.amplitude > 1e-6);
  trains.forEach((train) => {
    train.q = train.k * train.amplitude > 1e-6 ? budget / (train.k * train.amplitude * live.length) : 0;
  });
  return trains;
}

export function gerstnerSteepnessBudget(trains) {
  return trains.reduce((sum, train) => sum + train.q * train.k * train.amplitude, 0);
}

export function createGerstnerUniforms() {
  return {
    uGerstnerTrain: { value: Array.from({ length: GERSTNER_TRAIN_COUNT }, () => new THREE.Vector4()) },
    uGerstnerMotion: { value: Array.from({ length: GERSTNER_TRAIN_COUNT }, () => new THREE.Vector4()) },
    uGerstnerTime: { value: 0 },
    uGerstnerSets: { value: 0 },
    uGerstnerFade: { value: new THREE.Vector2(100, 250) },
  };
}

export function syncGerstnerUniforms(uniforms, settings) {
  resolveGerstnerTrains(settings).forEach((train, index) => {
    uniforms.uGerstnerTrain.value[index].set(train.direction[0], train.direction[1], train.k, train.amplitude);
    uniforms.uGerstnerMotion.value[index].set(train.omega * Math.max(Number(settings.speed) || 0, 0), train.q, index * 1.7, train.sets);
  });
  uniforms.uGerstnerSets.value = Math.min(Math.max(Number(settings.sets) || 0, 0), 1);
  uniforms.uGerstnerFade.value.set(Math.max(Number(settings.fadeStart) || 0, 1), Math.max(Number(settings.fadeEnd) || 0, Number(settings.fadeStart) + 1));
}

export const gerstnerShader = /* glsl */`
#define GERSTNER_TRAINS ${GERSTNER_TRAIN_COUNT}
uniform vec4 uGerstnerTrain[GERSTNER_TRAINS];   // direction.xy, k, amplitude
uniform vec4 uGerstnerMotion[GERSTNER_TRAINS];  // omega, Q, phase offset, sets weight
uniform float uGerstnerTime;
uniform float uGerstnerSets;
uniform vec2 uGerstnerFade;

// Waves arrive in groups: the envelope runs at a sixth of the train's own
// frequency, so every ~6 waves is a big one. It never exceeds 1, which keeps
// the steepness budget intact.
float gerstnerEnvelope(float phase, float weight) {
  return 1.0 - uGerstnerSets * weight * 0.5 * (1.0 - sin(phase * 0.1667));
}

// Displaced world position; writes the analytic normal and the Jacobian of the
// horizontal displacement (1 = flat, small = the crest is folding, <0 never).
vec3 gerstnerDisplace(vec2 p, float fade, out vec3 normal, out float jacobian) {
  vec3 offset = vec3(0.0);
  vec3 slope = vec3(0.0);
  float dxx = 0.0, dzz = 0.0, dxz = 0.0;
  for (int i = 0; i < GERSTNER_TRAINS; i++) {
    vec4 train = uGerstnerTrain[i];
    vec4 motion = uGerstnerMotion[i];
    vec2 d = train.xy;
    float k = train.z;
    float phase = k * dot(d, p) - motion.x * uGerstnerTime + motion.z;
    float a = train.w * fade * gerstnerEnvelope(phase, motion.w);
    float q = motion.y;
    float s = sin(phase), c = cos(phase);
    offset.xz += q * a * d * c;
    offset.y += a * s;
    float wa = k * a;
    slope.x += d.x * wa * c;
    slope.z += d.y * wa * c;
    slope.y += q * wa * s;
    dxx -= q * wa * d.x * d.x * s;
    dzz -= q * wa * d.y * d.y * s;
    dxz -= q * wa * d.x * d.y * s;
  }
  normal = normalize(vec3(-slope.x, 1.0 - slope.y, -slope.z));
  jacobian = (1.0 + dxx) * (1.0 + dzz) - dxz * dxz;
  return vec3(p.x, 0.0, p.y) + offset;
}
`;
