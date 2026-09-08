import * as THREE from 'three';
import { gerstnerWeatherAt, resolveGerstnerTrains } from './gerstnerWaves.js';

// CPU twin of the resolved part of gerstnerDisplace. Actors need a water
// height and normal at a few points, while the visible sea is evaluated on the
// GPU. Keeping this small analytic path avoids a fence readback for the boat,
// fish and birds once the sea replaces the old visible height field.

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function envelope(phase, sets) {
  return 1 - Math.min(Math.max(finite(sets, 0), 0), 1) * 0.5 * (1 - Math.sin(phase * 0.1667));
}

function envelopeDerivative(phase, sets) {
  return Math.min(Math.max(finite(sets, 0), 0), 1) * 0.08335 * Math.cos(phase * 0.1667);
}

export function createGerstnerSurfaceSampler(settings) {
  const trains = resolveGerstnerTrains(settings);
  const gusts = Math.min(Math.max(finite(settings.gusts, 0), 0), 1);
  const speed = Math.max(finite(settings.speed, 0), 0);
  const sets = Math.min(Math.max(finite(settings.sets, 0), 0), 1);

  const evaluate = (px, pz, elapsed, target, fade = 1, cell = 0) => {
    const weather = gerstnerWeatherAt(px, pz, gusts);
    // Keep the phase twin in step with GERSTNER_WEATHER.wander in GLSL. The
    // amplitude weather helper is exported, while the phase terms are folded
    // here deliberately so the scene's probes have no dependency on a GPU
    // readback.
    const wander = (
      Math.sin(0.0083 * px - 0.0097 * pz + 2.1) * 1
      + Math.sin(0.0173 * px + 0.0059 * pz + 0.9) * 0.6
    ) * 1.6 * gusts;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    const dPdx = new THREE.Vector3(1, 0, 0);
    const dPdz = new THREE.Vector3(0, 0, 1);

    trains.forEach((train, index) => {
      const phase = train.k * (train.direction[0] * px + train.direction[1] * pz)
        - train.omega * speed * elapsed + index * 1.7 + wander;
      const envelopeWeight = sets * train.sets;
      const envelopeValue = envelope(phase, envelopeWeight);
      const resolved = 1 - (() => {
        const t = Math.min(Math.max((cell * train.k * 0.15915494 - 0.08) / 0.22, 0), 1);
        return t * t * (3 - 2 * t);
      })();
      const amplitude = train.amplitude * weather * envelopeValue * fade * resolved;
      const sine = Math.sin(phase);
      const cosine = Math.cos(phase);
      const envelopeSlope = envelopeDerivative(phase, envelopeWeight);
      const phaseX = train.k * train.direction[0];
      const phaseZ = train.k * train.direction[1];
      const horizontalSlope = envelopeSlope * cosine - envelopeValue * sine;
      const verticalSlope = envelopeSlope * sine + envelopeValue * cosine;
      const baseAmplitude = train.amplitude * weather * fade * resolved;
      ox += train.q * amplitude * train.direction[0] * cosine;
      oz += train.q * amplitude * train.direction[1] * cosine;
      oy += amplitude * sine;
      dPdx.x += train.q * baseAmplitude * train.direction[0] * phaseX * horizontalSlope;
      dPdx.z += train.q * baseAmplitude * train.direction[1] * phaseX * horizontalSlope;
      dPdx.y += baseAmplitude * phaseX * verticalSlope;
      dPdz.x += train.q * baseAmplitude * train.direction[0] * phaseZ * horizontalSlope;
      dPdz.z += train.q * baseAmplitude * train.direction[1] * phaseZ * horizontalSlope;
      dPdz.y += baseAmplitude * phaseZ * verticalSlope;
    });

    const normal = target.normal ?? new THREE.Vector3();
    normal.crossVectors(dPdz, dPdx).normalize();
    target.x = px + ox;
    target.y = oy;
    target.z = pz + oz;
    target.worldY = oy;
    target.height = oy;
    target.normal = normal;
    return target;
  };

  return (x, z, time, target = {}, { fadeAt = null, cellAt = null } = {}) => {
    const worldX = finite(x, 0);
    const worldZ = finite(z, 0);
    const elapsed = finite(time, 0);
    // The shader receives the undisplaced mesh coordinate p. Actors ask at a
    // visible world point, so solve p + horizontalOffset(p) = world xz before
    // reading the height. Fixed-point iteration converges under the same
    // steepness budget that prevents the Gerstner surface from folding over.
    let px = worldX;
    let pz = worldZ;
    const scratch = { normal: new THREE.Vector3() };
    for (let iteration = 0; iteration < 6; iteration += 1) {
      evaluate(px, pz, elapsed, scratch, fadeAt?.(px, pz) ?? 1, cellAt?.(px, pz) ?? 0);
      px += worldX - scratch.x;
      pz += worldZ - scratch.z;
    }
    const surface = evaluate(px, pz, elapsed, target, fadeAt?.(px, pz) ?? 1, cellAt?.(px, pz) ?? 0);
    // Kept as diagnostic metadata for the focused CPU/GLSL parity check. The
    // public x/z remain the reconstructed visible point.
    surface.parameterX = px;
    surface.parameterZ = pz;
    return surface;
  };
}
