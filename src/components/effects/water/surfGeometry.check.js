import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURF_SHAPE, surfShape } from './surfProfile.js';
import { coastHeight, createTerrainDefinition } from '../../../terrain/terrainModel.js';

// The geometry contract between the water and the ground. Everything here was
// broken at once and showed as one thing on screen: the surf ran through the
// beach and the crest sheared where the coast bends.

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const surf = read('./BreakingWaves.jsx');
const shore = read('./ShoreWater.jsx');
const open = read('./GerstnerWaterSurface.jsx');

// 1. One cell for every water surface. Each surface fades the trains its mesh
// cannot resolve; hand two neighbours different cells and they compute
// different swells in the same place, and their seam steps by centimetres.
for (const [name, source] of [['BreakingWaves', surf], ['ShoreWater', shore], ['GerstnerWaterSurface', open]]) {
  const calls = source.match(/gerstnerDisplace\([^;]*?\)/gs) ?? [];
  assert.ok(calls.length >= 1, `${name} draws water`);
  for (const call of calls) {
    const cell = call.split(',')[2]?.trim();
    assert.ok(cell === 'waterCell(p)' || cell === 'cell', `${name}: gerstnerDisplace takes the shared cell, not ${cell}`);
  }
}
assert.ok(shore.includes('float cell = waterCell(p)'), 'ShoreWater derives its cell from waterCell');
assert.ok(open.includes('float cell = waterCell(p)'), 'GerstnerWaterSurface derives its cell from waterCell');

// 2. The loft stands on the bed and is cut by it. Without the first the surf
// runs at the still line and the beach swallows it; without the second the
// only thing stopping it is the depth buffer, which cuts a knife-straight line.
assert.ok(/max\(coastGround\(vec2\(u - coastShore\(along\), along\)\), 0\.0\)/.test(surf), 'surfWorld lifts the section onto the bed');
assert.equal((surf.match(/if \(vWorld\.y < vGround \+ 0\.005\) discard;/g) ?? []).length, 2, 'both the sheet and the shell are clipped by the bed');
assert.ok(/varying float vGround;/.test(surf), 'the bed reaches the fragment');

// 3. The section is swept along the crest's own normal. Extruded along a fixed
// direction to the shore it shears wherever the break line bends.
assert.ok(surf.includes('float k = surfCenterU(s + h) - surfCenterU(s - h)'), 'the crest slope is measured');
assert.ok(surf.includes('inversesqrt(1.0 + k * k)'), 'the section is normalised across that slope');
assert.ok(surf.includes('float along = sAlong - k * x;'), 'the section leans along the shore with the crest');

// 4. The shore band cuts its edge per pixel, from the depth map and the sheet,
// not from its own vertices: a contour of a varying is a straight segment
// inside every triangle, which is where the staircase at the waterline came from.
assert.ok(shore.includes('float bed = uShoreReady > 0.5 ? coastGround(coastLocal(vWorld.xz)) : vGround;'), 'the band reads the bed per pixel');
assert.ok(shore.includes('float depth = max(vLevel - bed, sheet);'), 'the water is the deeper of the swell and the swash sheet');
assert.ok(!/if \(film > 0\.0/.test(shore), 'no threshold on the swash lift');

// 5. How far under the sand the loft can still reach. The profile dips below
// its own edges by this share of its height, and the edges now sit on the bed,
// so this is the whole of it — the 5 mm cut above takes what is left.
const baseLevel = surfShape(SURF_SHAPE.thetaPeak + Math.PI) / SURF_SHAPE.range;
const dip = baseLevel - SURF_SHAPE.trough;
assert.ok(dip > 0.06 && dip < 0.09, `the profile dips ${dip.toFixed(4)} H below its edges`);

const coast = createTerrainDefinition({ terrainSpitEnabled: true, terrainSpitPosition: -320, terrainSpitLength: 320, terrainSpitBend: 0.85, terrainSpitWidth: 28, terrainSpitShoal: 28, waterDepthMeters: 2.75, terrainShelfSlope: 1.2, terrainSeed: 37 });
const s = coast.terrainSpitPosition - 160;
const height = 0.45;
let worstNow = 0, worstBefore = 0;
for (let q = 0; q <= 12; q += 0.25) {
  const ground = coastHeight(q, s, coast);
  const mapped = Math.max(Math.min(ground, 1), -1);   // the shore depth map clamps to a metre
  worstNow = Math.max(worstNow, ground - (Math.max(mapped, 0) - dip * height));
  worstBefore = Math.max(worstBefore, ground - (0 - dip * height));   // the base at the still line
}
// What is left under the sand is the trough of the section — water the sea
// does not have there — and the fragment cut above removes exactly that. What
// matters is that it no longer grows with the beach: it is the same few
// centimetres at the waterline and twelve metres up it.
assert.ok(Math.abs(worstNow - dip * height) < 1e-6, `the burial is the profile's own dip, ${(worstNow * 100).toFixed(1)} cm`);
assert.ok(worstNow < 0.04, `the loft reaches ${(worstNow * 100).toFixed(1)} cm under the sand`);
assert.ok(worstBefore > 0.5, `with the base at the still line it was ${(worstBefore * 100).toFixed(0)} cm`);

// 6. The break line is read as a curve, not as a polyline of 6 m chords.
const line = read('./coastBreakLine.js');
assert.ok(line.includes('0.25 * line[i - 1] + 0.5 * line[i] + 0.25 * line[i + 1]'), 'the break line is smoothed once');
assert.ok(surf.includes('f * f * (3.0 - 2.0 * f)'), 'and read with a smooth step between samples');

console.log(`surfGeometry: one cell for three surfaces, the loft rides the bed (${(worstNow * 100).toFixed(1)} cm under, was ${(worstBefore * 100).toFixed(0)}), the section follows the crest's normal`);
