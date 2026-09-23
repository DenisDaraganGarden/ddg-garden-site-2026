import * as THREE from 'three';
import { gerstnerWeatherAt, resolveGerstnerTrains } from './gerstnerWaves.js';

// CPU twin of the resolved part of gerstnerDisplace. Actors need a water
// height and normal at a few points, while the visible sea is evaluated on the
// GPU. Keeping this small analytic path avoids a fence readback for the boat,
// fish and birds once the sea replaces the old visible height field.

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const GERSTNER_INVERSE_ITERATIONS = 6;

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
  // One sampler serves every probe of an actor each frame, so the forward pass
  // writes into these instead of allocating: the offset of the last evaluate,
  // and, for the final one, its tangents and the particle velocity.
  const offset = { x: 0, y: 0, z: 0 };
  const dPdx = new THREE.Vector3();
  const dPdz = new THREE.Vector3();
  const velocity = { x: 0, y: 0, z: 0 };

  // full: the inverse iterations need the position only; the last pass also
  // builds the tangents and the velocity.
  const evaluate = (px, pz, elapsed, fade, cell, full) => {
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
    if (full) {
      dPdx.set(1, 0, 0);
      dPdz.set(0, 0, 1);
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
    }

    for (let index = 0; index < trains.length; index += 1) {
      const train = trains[index];
      const phase = train.k * (train.direction[0] * px + train.direction[1] * pz)
        - train.omega * speed * elapsed + index * 1.7 + wander;
      const envelopeWeight = sets * train.sets;
      const envelopeValue = envelope(phase, envelopeWeight);
      const lod = Math.min(Math.max((cell * train.k * 0.15915494 - 0.08) / 0.22, 0), 1);
      const resolved = 1 - lod * lod * (3 - 2 * lod);
      const amplitude = train.amplitude * weather * envelopeValue * fade * resolved;
      const sine = Math.sin(phase);
      const cosine = Math.cos(phase);
      ox += train.q * amplitude * train.direction[0] * cosine;
      oz += train.q * amplitude * train.direction[1] * cosine;
      oy += amplitude * sine;
      if (!full) continue;
      const envelopeSlope = envelopeDerivative(phase, envelopeWeight);
      const phaseX = train.k * train.direction[0];
      const phaseZ = train.k * train.direction[1];
      // d/dphase of E·cos and E·sin: the sets envelope rides the phase too.
      const horizontalSlope = envelopeSlope * cosine - envelopeValue * sine;
      const verticalSlope = envelopeSlope * sine + envelopeValue * cosine;
      const baseAmplitude = train.amplitude * weather * fade * resolved;
      dPdx.x += train.q * baseAmplitude * train.direction[0] * phaseX * horizontalSlope;
      dPdx.z += train.q * baseAmplitude * train.direction[1] * phaseX * horizontalSlope;
      dPdx.y += baseAmplitude * phaseX * verticalSlope;
      dPdz.x += train.q * baseAmplitude * train.direction[0] * phaseZ * horizontalSlope;
      dPdz.z += train.q * baseAmplitude * train.direction[1] * phaseZ * horizontalSlope;
      dPdz.y += baseAmplitude * phaseZ * verticalSlope;
      // A Gerstner surface is Lagrangian: p labels one water particle, and the
      // displacement is where that particle is now. Its velocity is therefore
      // the time derivative of the displacement at fixed p, and time enters
      // only through the phase, at -omega * speed per second.
      const phaseRate = -train.omega * speed;
      velocity.x += phaseRate * train.q * baseAmplitude * train.direction[0] * horizontalSlope;
      velocity.z += phaseRate * train.q * baseAmplitude * train.direction[1] * horizontalSlope;
      velocity.y += phaseRate * baseAmplitude * verticalSlope;
    }
    offset.x = ox;
    offset.y = oy;
    offset.z = oz;
  };

  return (x, z, time, target = {}, { fadeAt = null, cellAt = null, inverseIterations = GERSTNER_INVERSE_ITERATIONS } = {}) => {
    const worldX = finite(x, 0);
    const worldZ = finite(z, 0);
    const elapsed = finite(time, 0);
    // The shader receives the undisplaced mesh coordinate p. Actors ask at a
    // visible world point, so solve p + horizontalOffset(p) = world xz before
    // reading the height. Fixed-point iteration converges under the same
    // steepness budget that prevents the Gerstner surface from folding over.
    let px = worldX;
    let pz = worldZ;
    const iterations = Math.max(1, Math.round(finite(inverseIterations, GERSTNER_INVERSE_ITERATIONS)));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      evaluate(px, pz, elapsed, fadeAt?.(px, pz) ?? 1, cellAt?.(px, pz) ?? 0, false);
      px = worldX - offset.x;
      pz = worldZ - offset.z;
    }
    evaluate(px, pz, elapsed, fadeAt?.(px, pz) ?? 1, cellAt?.(px, pz) ?? 0, true);
    const normal = target.normal ?? new THREE.Vector3();
    normal.crossVectors(dPdz, dPdx).normalize();
    const particle = target.velocity ?? new THREE.Vector3();
    particle.x = velocity.x;
    particle.y = velocity.y;
    particle.z = velocity.z;
    target.x = px + offset.x;
    target.y = offset.y;
    target.z = pz + offset.z;
    target.worldY = offset.y;
    target.height = offset.y;
    target.normal = normal;
    // m/s of the water particle standing at this point of the surface.
    target.velocity = particle;
    // Kept as diagnostic metadata for the focused CPU/GLSL parity check, and
    // the point the surf loft stands on. The public x/z remain the
    // reconstructed visible point.
    target.parameterX = px;
    target.parameterZ = pz;
    return target;
  };
}
