import assert from 'node:assert/strict';
import { coastPoint, createTerrainDefinition } from '../../terrain/terrainModel.js';
import { DEFAULT_TERRAIN_SETTINGS } from '../../terrain/settings.js';
import { resolveEffectiveSeaSettings, resolveSeaSettings } from '../effects/water/seaSettings.js';
import { surfPeelSpan, surfProfileParams } from '../effects/water/surfProfile.js';
import { createSurfRibbons, surfRibbonBreakLine } from '../effects/water/surfRibbons.js';
import { RISE_SHARE, createSurfWater } from './surfWater.js';

// The water's velocity has to belong to the surface that moves: a particle on
// the surface stays on it, ∂η/∂t = w − u·∇η. Measure η itself in time and
// space and hold the sampled velocity to that, on a breaker running in and on
// one frozen for inspection; and calm water must hold still.

const T0 = 40;
// One ribbon, as BreakingWaves leaves the holder after a frame.
const holderFor = (settings, definition, travel) => {
  const holder = createSurfRibbons();
  const coast = { definition, along0: definition.terrainSpitPosition - 430, length: 760 };
  const { line, visible, mean } = surfRibbonBreakLine(coast, settings.surfHeight, settings);
  Object.assign(holder, { count: 1, time: T0, frozen: settings.surfFreeze, speed: Math.max(settings.surfSpeed, 0.1), settings });
  Object.assign(holder.coast, coast);
  Object.assign(holder.loft, { refraction: settings.surfRefraction, peelSpan: surfPeelSpan(settings), runup: settings.surfRunup, spent: settings.surfBoreLength + 30, meander: settings.surfMeander, smooth: settings.surfSmooth, gusts: settings.gusts });
  Object.assign(holder.profile, surfProfileParams(settings));
  Object.assign(holder.ribbons[0], { visible: 1, travel, pose: settings.surfFreeze ? Math.max(1.4, travel) : travel, height: settings.surfHeight, peel: settings.surfFreeze ? 0 : settings.surfPeel, breakMean: mean });
  holder.ribbons[0].breakLine.set(line);
  holder.ribbons[0].breakVisible.set(visible);
  return holder;
};

const shelf = createTerrainDefinition(DEFAULT_TERRAIN_SETTINGS);
const steep = createTerrainDefinition({ ...DEFAULT_TERRAIN_SETTINGS, waterDepthMeters: 4.5 });
const calmSea = resolveEffectiveSeaSettings(resolveSeaSettings({ seaAmplitude: 0, seaSurfHeight: 1.8, seaSurfWidth: 18, seaSurfSpeed: 5 }));
const liveSea = resolveEffectiveSeaSettings(resolveSeaSettings({ seaAmplitude: 0.3, seaSurfHeight: 1.8, seaSurfWidth: 18, seaSurfSpeed: 5 }));

// Calm water with no breaker: flat, still, facing up — with or without a sea.
for (const water of [createSurfWater(), createSurfWater({ seaSettings: calmSea, coastDefinition: shelf, surfRibbons: createSurfRibbons() })]) {
  const flat = water.sample(12, -30, T0);
  assert.equal(flat.height, 0, 'calm water lies on the still-water plane');
  assert.ok(Math.hypot(flat.vx, flat.vy, flat.vz) === 0, 'calm water holds still');
  assert.ok(flat.ny === 1 && flat.nx === 0 && flat.nz === 0, 'calm water faces up');
}

// The kinematic condition, measured: η differenced in time at a fixed world
// point and in space at a fixed time.
const residualAt = (water, x, z) => {
  const here = water.sample(x, z, T0, {});
  const e = 1e-3;
  const dt = (water.sample(x, z, T0 + e, {}).height - water.sample(x, z, T0 - e, {}).height) / (2 * e);
  const dx = (water.sample(x + e, z, T0, {}).height - water.sample(x - e, z, T0, {}).height) / (2 * e);
  const dz = (water.sample(x, z + e, T0, {}).height - water.sample(x, z - e, T0, {}).height) / (2 * e);
  return { here, dt, residual: dt - (here.vy - here.vx * dx - here.vz * dz) };
};
// Points across a crest: from its back, over the top, down the face. The
// crest keeps the break line's shape by the refraction share.
const across = (holder, definition, sAlong, span = 16) => {
  const { breakLine, breakMean, pose } = holder.ribbons[0];
  const breakAt = breakLine[Math.round((breakLine.length - 1) * (sAlong - holder.coast.along0) / holder.coast.length)];
  const centre = holder.loft.refraction * breakAt + (1 - holder.loft.refraction) * breakMean + pose;
  return Array.from({ length: 81 }, (_, i) => coastPoint(centre - span + (2 * span * i) / 80, sAlong, definition));
};

let checked = 0;
let bounded = 0;
const worst = { calm: 0, live: 0 };
let fastest = 0;
for (const [label, sea, definition, travel, tolerance] of [
  ['rearing on the shelf, calm sea', calmSea, shelf, -3, 0.01],
  ['landed on the shelf, calm sea', calmSea, shelf, 6, 0.01],
  ['a bore up the beach, calm sea', calmSea, steep, 9, 0.01],
  // The swell under it: the sea's part is exact, the breaker's crossing it is
  // taken with the breaker's slope in the sea's own parameter, which the
  // swell's displacement stretches by a few per cent.
  ['rearing on the shelf, live sea', liveSea, shelf, -3, 0.08],
]) {
  const holder = holderFor(sea, definition, travel);
  const camera = coastPoint(holder.ribbons[0].breakMean, holder.coast.along0 + 380, definition);
  const water = createSurfWater({ seaSettings: sea, coastDefinition: definition, getCamera: () => ({ x: camera.x, y: 20, z: camera.z }), surfRibbons: holder });
  let onWave = 0;
  for (const sAlong of [holder.coast.along0 + 200, holder.coast.along0 + 380, holder.coast.along0 + 560]) {
    for (const point of across(holder, definition, sAlong)) {
      const { here, dt, residual } = residualAt(water, point.x, point.z);
      // A face rising faster than the bound: the shape outruns its water
      // there, the water is held to RISE_SHARE of the wave's speed.
      const bound = RISE_SHARE * holder.speed;
      if (Math.abs(here.vy + residual) > 0.98 * bound) {
        if (sea === calmSea) assert.ok(Math.abs(here.vy) <= bound + 1e-6, `${label}: the breaker's water rises no faster than the wave runs (${here.vy.toFixed(2)} m/s)`);
        bounded += 1;
        continue;
      }
      const scale = Math.abs(dt) + Math.hypot(here.vx, here.vz);
      assert.ok(Math.abs(residual) < tolerance * (1 + scale), `${label}: ∂η/∂t ${dt.toFixed(4)} but w − u·∇η leaves ${residual.toFixed(4)} m/s at q ${point.x.toFixed(2)}`);
      const kind = sea === calmSea ? 'calm' : 'live';
      worst[kind] = Math.max(worst[kind], Math.abs(residual) / (1 + scale));
      checked += 1;
      if (here.onBreaker > 0.5) onWave += 1;
      // On calm water all of the motion is the breaker's own.
      if (here.onBreaker > 0.5 && sea === calmSea) {
        const along = here.vx * definition.landX + here.vz * definition.landZ;
        assert.ok(along > 0 && along <= 0.9 * 5 + 1e-9, `${label}: the breaker carries its water shoreward, below its own speed (${along.toFixed(2)} m/s)`);
        fastest = Math.max(fastest, along);
      }
    }
  }
  assert.ok(onWave > 20, `${label}: the line crosses the wave (${onWave} points on it)`);
}

// Frozen for inspection: the breaker stands, and so does its water.
{
  const frozenSea = { ...calmSea, surfFreeze: true, surfPhase: 0.3 };
  const holder = holderFor(frozenSea, shelf, 2);
  const water = createSurfWater({ seaSettings: frozenSea, coastDefinition: shelf, surfRibbons: holder });
  let lifted = 0;
  for (const point of across(holder, shelf, holder.coast.along0 + 380, 18)) {
    const { here, dt } = residualAt(water, point.x, point.z);
    assert.equal(dt, 0, 'a frozen breaker does not move');
    assert.ok(Math.hypot(here.vx, here.vy, here.vz) === 0, 'nor does its water');
    if (here.onBreaker > 0.5) lifted += 1;
  }
  assert.ok(lifted > 10, 'the frozen breaker is there to stand on');
}

// A plunging wall ('testy': 4.5 m, lean 0.71): the crest's edge drops onto
// the floor, a step the board must feel as a steep face, not as the hundreds
// of m/s its differenced rise rate would be.
let wall = 0;
{
  const plunging = resolveEffectiveSeaSettings(resolveSeaSettings({ seaAmplitude: 0, seaSurfHeight: 4.5, seaSurfWidth: 15.5, seaSurfBreakLength: 34, seaSurfLean: 0.71, seaSurfJet: 4.9, seaSurfLift: 3.15, seaSurfSpeed: 7.4 }));
  const out = {};
  for (const travel of [2, 3, 4, 5, 6]) {
    const holder = holderFor(plunging, shelf, travel);
    const water = createSurfWater({ seaSettings: plunging, coastDefinition: shelf, surfRibbons: holder });
    // Every 2 mm across the crest: the step is thinner than a centimetre.
    const [a, b] = [across(holder, shelf, holder.coast.along0 + 380, 10)[0], across(holder, shelf, holder.coast.along0 + 380, 10)[80]];
    for (let k = 0; k <= 10000; k += 1) {
      const here = water.sample(a.x + (b.x - a.x) * k / 10000, a.z + (b.z - a.z) * k / 10000, T0, out);
      assert.ok([here.height, here.vx, here.vy, here.vz].every(Number.isFinite), 'the wall is finite');
      wall = Math.max(wall, Math.hypot(here.vx, here.vy, here.vz));
    }
  }
  assert.ok(wall < 4 * 7.4, `water at a plunging wall moves ${wall.toFixed(1)} m/s`);
}

console.log(`surfWater: ${checked} points (${bounded} under a face outrunning its water) keep their water on the moving surface (kinematic condition) within ${(worst.calm * 100).toFixed(2)}% on calm water, ${(worst.live * 100).toFixed(1)}% over a live swell, breaker water up to ${fastest.toFixed(2)} m/s under a 5 m/s wave, calm and frozen water still, a plunging wall's water ≤ ${wall.toFixed(1)} m/s`);
