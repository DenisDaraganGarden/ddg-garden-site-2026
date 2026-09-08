import * as THREE from 'three';
import { radialCellFactor } from './radialWaterGeometry.js';

// Open-water waves as a sum of Gerstner (trochoid) trains, evaluated per vertex
// in world XZ so the surface is continuous from the camera to the horizon.
// Four trains: the primary downwind swell, two crossing trains and one long
// background swell. `steepness` is the whole-surface budget Σ Q·k·A: below 1
// a trochoid cannot loop over itself, and 0.8 leaves margin for the sets
// envelope and the ripple normal, so no slider can produce a self-intersection.

export const GERSTNER_TRAIN_COUNT = 4;
export const GERSTNER_MAX_STEEPNESS = 0.8;
const GRAVITY = 9.81;

// The weather over the water: slow sine fields in world xz. One table for the
// GLSL and the JS below, so the loft's heights along a crest and the break
// line computed on the CPU agree. Each term: [fx, fz, phase, weight].
export const GERSTNER_WEATHER = Object.freeze({
  // Amplitude in gusts: sum / 2.1 is -1..1.
  gusts: [[0.0113, 0.0071, 0, 1], [0.0047, -0.0129, 1.7, 0.7], [0.0231, 0.0187, 0.4, 0.4]],
  // Phase: crests wander instead of running as ruled lines.
  wander: [[0.0083, -0.0097, 2.1, 1], [0.0173, 0.0059, 0.9, 0.6]],
});
const sineSum = (terms, x, z, drift = 0) => terms.reduce((sum, [fx, fz, phase, weight]) => sum + weight * Math.sin(fx * x + fz * z + phase + drift), 0);
const sineSumGlsl = (terms, drift = '') => terms.map(([fx, fz, phase, weight]) => `${weight.toFixed(2)} * sin(p.x * ${fx.toFixed(4)} + p.y * ${fz.toFixed(4)} + ${phase.toFixed(2)}${drift})`).join(' + ');
// Amplitude factor of the swell here, 1 - 0.7 * gusts .. 1.
export const gerstnerWeatherAt = (x, z, gusts) => 1 - Math.min(Math.max(Number(gusts) || 0, 0), 1) * 0.35 * (1 - sineSum(GERSTNER_WEATHER.gusts, x, z) / 2.1);
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
  // One Q for every train, sized so that Σ Q·k_i·A_i = budget: the steepest
  // train (the primary swell) takes the largest share of the folding, which is
  // where the whitecaps have to be. A silent train contributes nothing.
  const total = trains.reduce((sum, train) => sum + train.k * train.amplitude, 0);
  const q = total > 1e-6 ? budget / total : 0;
  trains.forEach((train) => { train.q = q; });
  return trains;
}

// When the primary swell's crest next passes a point, in seconds from now.
// The breakers are not independent waves: a breaker IS the crest of the swell
// arriving, so its birth has to be locked to that phase or the surf drifts out
// of step with the sea behind it — which is exactly what reads as wrong.
// phase = k·(d·p) − ω·t + φ; a crest is where phase ≡ π/2 (mod 2π).
export function gerstnerCrestDelay(trains, x, z, time, speed = 1, index = 0) {
  const train = trains[index];
  const omega = train.omega * Math.max(Number(speed) || 0, 0);
  if (omega < 1e-6) return Infinity;
  const phase = train.k * (train.direction[0] * x + train.direction[1] * z) - omega * time + index * 1.7;
  // The phase falls as time runs, so the crest is reached from above.
  const wrapped = ((phase - Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return wrapped / omega;
}
export const gerstnerPeriod = (trains, speed = 1, index = 0) => {
  const omega = trains[index].omega * Math.max(Number(speed) || 0, 0);
  return omega < 1e-6 ? Infinity : (2 * Math.PI) / omega;
};

export function gerstnerSteepnessBudget(trains) {
  return trains.reduce((sum, train) => sum + train.q * train.k * train.amplitude, 0);
}

export function createGerstnerUniforms() {
  return {
    uGerstnerTrain: { value: Array.from({ length: GERSTNER_TRAIN_COUNT }, () => new THREE.Vector4()) },
    uGerstnerMotion: { value: Array.from({ length: GERSTNER_TRAIN_COUNT }, () => new THREE.Vector4()) },
    uGerstnerTime: { value: 0 },
    uGerstnerSets: { value: 0 },
    uGerstnerGusts: { value: 0 },
    uGerstnerPatches: { value: 0.65 },
    uGerstnerFade: { value: new THREE.Vector2(100, 250) },
    uCellFactor: { value: radialCellFactor() },
  };
}

export function syncGerstnerUniforms(uniforms, settings) {
  resolveGerstnerTrains(settings).forEach((train, index) => {
    uniforms.uGerstnerTrain.value[index].set(train.direction[0], train.direction[1], train.k, train.amplitude);
    uniforms.uGerstnerMotion.value[index].set(train.omega * Math.max(Number(settings.speed) || 0, 0), train.q, index * 1.7, train.sets);
  });
  uniforms.uGerstnerSets.value = Math.min(Math.max(Number(settings.sets) || 0, 0), 1);
  uniforms.uGerstnerGusts.value = Math.min(Math.max(Number(settings.gusts) || 0, 0), 1);
  uniforms.uGerstnerPatches.value = Math.min(Math.max(Number(settings.windPatches ?? 0.65), 0), 1);
  uniforms.uGerstnerFade.value.set(Math.max(Number(settings.fadeStart) || 0, 1), Math.max(Number(settings.fadeEnd) || 0, Number(settings.fadeStart) + 1));
  // Every water surface resolves the trains by the same cell, whatever its own
  // mesh: the open water, the shore band and the surf ribbons meet at seams,
  // and a seam is only invisible when both sides compute the same swell there.
  if (uniforms.uCellFactor) uniforms.uCellFactor.value = radialCellFactor({ rings: settings.meshRings, segments: settings.meshSegments });
}

// How much of the sea a wave field of this steepness whitecaps at a given
// threshold. Measured, not guessed: the Jacobian of the four-train sum was
// sampled over the plane, and its distribution collapses onto one curve in
// r = (1 - threshold) / sigma, where sigma = sqrt(Σ (Q·k·A)² / 2) is the
// spread of the folding. gerstnerWaves.check.js re-measures and asserts the
// fit. The shader uses the same curve where a wave no longer resolves in a
// pixel, so the foam neither appears nor vanishes as the camera moves.
export const WHITECAP_FIT = Object.freeze({ peak: 0.42, from: 0.3, to: 1.9, shape: 1.2 });
const smooth01 = (a, b, x) => { const u = Math.min(Math.max((x - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
export const gerstnerWhitecapCoverage = (sigma, threshold) => {
  const r = (1 - threshold) / Math.max(sigma, 1e-4);
  return WHITECAP_FIT.peak * (1 - smooth01(WHITECAP_FIT.from, WHITECAP_FIT.to, r)) ** WHITECAP_FIT.shape;
};
export const gerstnerSigma = (trains) => Math.sqrt(trains.reduce((sum, train) => sum + (train.q * train.k * train.amplitude) ** 2, 0) / 2);

export const gerstnerShader = /* glsl */`
#define GERSTNER_TRAINS ${GERSTNER_TRAIN_COUNT}
#define WATER_PI_G 3.14159265
uniform vec4 uGerstnerTrain[GERSTNER_TRAINS];   // direction.xy, k, amplitude
uniform vec4 uGerstnerMotion[GERSTNER_TRAINS];  // omega, Q, phase offset, sets weight
uniform float uGerstnerTime;
uniform float uGerstnerSets;
uniform float uGerstnerGusts;
uniform float uGerstnerPatches;
uniform vec2 uGerstnerFade;
uniform float uCellFactor;

// The vertex spacing every water surface pretends to have here. Not its own
// mesh's spacing: the shared one, so the trains a surface drops are the trains
// its neighbour drops, and the water is one surface across their seam.
float waterCell(vec2 p) { return distance(p, cameraPosition.xz) * uCellFactor; }

// The sea is never one clean train: a slow field over the water bends every
// train's phase, so crests wander instead of running as ruled lines, and
// scales the amplitude in patches, the gusts. The envelope never exceeds 1,
// so the steepness budget holds. Generated from GERSTNER_WEATHER.
vec2 gerstnerWeather(vec2 p) {
  float a = ${sineSumGlsl(GERSTNER_WEATHER.gusts)};
  float b = ${sineSumGlsl(GERSTNER_WEATHER.wander)};
  return vec2(1.0 - uGerstnerGusts * 0.35 * (1.0 - a / 2.1), b * 1.6 * uGerstnerGusts);
}
// Waves arrive in groups: the envelope runs at a sixth of the train's own
// frequency, so every ~6 waves is a big one. It never exceeds 1, which keeps
// the steepness budget intact.
float gerstnerEnvelope(float phase, float weight) {
  return 1.0 - uGerstnerSets * weight * 0.5 * (1.0 - sin(phase * 0.1667));
}

// Patches of whitecapping. Value noise from a hash — no texture and no sine
// lattice, so nothing can repeat: four octaves on domains rotated between
// each other and warped by a fifth, drifting downwind. A sea that shows a
// tile is worse than a sea with no foam at all.
float gerstnerHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.53);
  return fract(p.x * p.y);
}
float gerstnerNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gerstnerHash(i), gerstnerHash(i + vec2(1.0, 0.0)), f.x),
             mix(gerstnerHash(i + vec2(0.0, 1.0)), gerstnerHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Cat's paws. The wind does not touch the whole sea at once: patches hundreds
// of metres across where the air is still stay glassy, and there the sun
// gathers into a path instead of scattering over ripple. Slow, drifting, and
// without a period — the sea's own variety at distance. It lives here because
// every water shader includes this chunk, and the foam field needs it too.
float waterWindPatch(vec2 p) {
  if (uGerstnerPatches <= 0.001) return 1.0;
  vec2 q = p * 0.0042 + uGerstnerTrain[0].xy * uGerstnerTime * 0.004;
  float f = gerstnerNoise(q) * 0.62 + gerstnerNoise(q * 2.37 + 4.1) * 0.38;
  return mix(1.0, smoothstep(0.28, 0.72, f), uGerstnerPatches);
}

float gerstnerWhitecapMask(vec2 p) {
  vec2 q = p * 0.018 + uGerstnerTrain[0].xy * uGerstnerTime * 0.02;
  q += (vec2(gerstnerNoise(q * 0.37), gerstnerNoise(q * 0.37 + 7.31)) - 0.5) * 1.8;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  float sum = 0.0, amp = 0.5, total = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * gerstnerNoise(q);
    total += amp;
    q = rot * q * 2.13 + 11.7;
    amp *= 0.58;
  }
  return sum / total;
}

// How well the mesh resolves a train here: 1 with twelve or more vertices per
// wavelength, 0 with three or fewer. The unresolved share moves to the pixel
// normal (gerstnerPixelShader), so nothing aliases and nothing goes flat.
float gerstnerResolve(float k, float cell) {
  return 1.0 - smoothstep(0.08, 0.3, cell * k * 0.15915494);
}

// Displaced world position; writes the analytic normal, the Jacobian of the
// horizontal displacement (1 = flat, small = the crest is folding, <0 never)
// and the horizontal orbital velocity, which is what carries floating foam
// forward on a crest and back in a trough. cell is the vertex spacing here.
vec3 gerstnerDisplace(vec2 p, float fade, float cell, out vec3 normal, out float jacobian, out vec2 drift) {
  vec3 offset = vec3(0.0);
  vec3 slope = vec3(0.0);
  drift = vec2(0.0);
  float dxx = 0.0, dzz = 0.0, dxz = 0.0;
  vec2 weather = gerstnerWeather(p);
  for (int i = 0; i < GERSTNER_TRAINS; i++) {
    vec4 train = uGerstnerTrain[i];
    vec4 motion = uGerstnerMotion[i];
    vec2 d = train.xy;
    float k = train.z;
    float phase = k * dot(d, p) - motion.x * uGerstnerTime + motion.z + weather.y;
    float a = train.w * fade * weather.x * gerstnerResolve(k, cell) * gerstnerEnvelope(phase, motion.w);
    float q = motion.y;
    float s = sin(phase), c = cos(phase);
    offset.xz += q * a * d * c;
    offset.y += a * s;
    drift += q * a * motion.x * d * s;
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

// Fragment-only (fwidth): the share of every train the mesh could not carry,
// as a slope per pixel plus its folding term, so far waves keep their shading
// and whitecaps from above. A crest that spans a pixel or more of phase is
// averaged out instead of shimmering as the camera moves.
export const gerstnerPixelShader = /* glsl */`
// Whitecap coverage here, 0..1, at any distance. Near the camera it is the
// wave field's own folding — the same determinant gerstnerDisplace computes,
// 1 on flat water and small where the crest folds. Where a train no longer
// resolves in a pixel its share does not vanish (that is why the foam used to
// die halfway to the horizon): it becomes the share of that train's phase
// that folds past the threshold, which for one train is exact —
// jacobian = 1 - Q·k·A·sin(phase), so the fraction is acos((1-T)/QkA)/pi.
// Every scale of the sea therefore keeps its foam, and nothing shimmers.
float gerstnerWhitecaps(vec2 p, float threshold, float softness) {
  vec2 weather = gerstnerWeather(p);
  float dxx = 0.0, dzz = 0.0, dxz = 0.0;
  float variance = 0.0, blurred = 0.0, energy = 0.0;
  for (int i = 0; i < GERSTNER_TRAINS; i++) {
    vec4 train = uGerstnerTrain[i];
    vec4 motion = uGerstnerMotion[i];
    vec2 d = train.xy;
    float phase = train.z * dot(d, p) - motion.x * uGerstnerTime + motion.z + weather.y;
    float aa = 1.0 - smoothstep(0.35, 1.5, fwidth(phase));
    float qka = motion.y * train.z * train.w * weather.x * gerstnerEnvelope(phase, motion.w);
    variance += qka * qka;
    energy += qka;
    blurred += qka * (1.0 - aa);
    float wa = qka * aa * sin(phase);
    dxx -= wa * d.x * d.x;
    dzz -= wa * d.y * d.y;
    dxz -= wa * d.x * d.y;
  }
  float jacobian = (1.0 + dxx) * (1.0 + dzz) - dxz * dxz;
  float resolved = smoothstep(threshold + softness, threshold - softness, jacobian);
  // The same coverage this field has on average (WHITECAP_FIT, measured).
  float r = (1.0 - threshold) / max(sqrt(variance * 0.5), 1e-4);
  float mean = ${WHITECAP_FIT.peak} * pow(1.0 - smoothstep(${WHITECAP_FIT.from}, ${WHITECAP_FIT.to}, r), ${WHITECAP_FIT.shape});
  float share = clamp(blurred / max(energy, 1e-4), 0.0, 1.0);
  return mix(resolved, mean, share) * gerstnerWhitecapMask(p) * mix(0.15, 1.0, waterWindPatch(p));
}
vec2 gerstnerPixelSlope(vec2 p, float fade, float cell, out float fold) {
  vec2 slope = vec2(0.0);
  fold = 0.0;
  vec2 weather = gerstnerWeather(p);
  for (int i = 0; i < GERSTNER_TRAINS; i++) {
    vec4 train = uGerstnerTrain[i];
    vec4 motion = uGerstnerMotion[i];
    float k = train.z;
    float share = 1.0 - gerstnerResolve(k, cell);
    float phase = k * dot(train.xy, p) - motion.x * uGerstnerTime + motion.z + weather.y;
    float a = train.w * fade * weather.x * share * gerstnerEnvelope(phase, motion.w);
    float aa = 1.0 - smoothstep(0.35, 1.5, fwidth(phase));
    float wa = k * a * aa;
    slope += train.xy * wa * cos(phase);
    fold += motion.y * wa * sin(phase);
  }
  return slope;
}
`;
