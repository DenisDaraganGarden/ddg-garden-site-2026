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
const sea = read('./SeaWater.jsx');
const coastFrame = read('./coastFrame.js');
const activeScene = read('../WaterScene.jsx');
const terrainScene = read('../../../terrain/AzovTerrain.jsx');
const legacyReadme = read('./legacy/README.md');

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

// 8. Optional surf is not an absent hand-over: its swell still dies only in
// shallow water. With terrain hidden, the synthetic shore map must not erase
// a radial sea that has no terrain mesh to meet.
assert.ok(coastFrame.includes('if (uSwellFade.y <= 0.0) return shore;'), 'no-surf keeps shallow-water attenuation');
assert.ok(sea.includes('swellFadeWidth: effectiveSettings.surfEnabled ? 30 : 0'), 'SeaWater disables only the breaker hand-over');
assert.ok(sea.includes('coast={definition.terrainEnabled ? coast : null}'), 'terrain-off sea has no synthetic land mask');
assert.ok(sea.includes('{definition.terrainEnabled ? <ShoreDepthMap coast={coast} /> : null}'), 'terrain-off sea does not render a shore depth map');
assert.ok(shore.includes('float cell = waterCell(p)'), 'ShoreWater derives its cell from waterCell');
assert.ok(open.includes('float cell = waterCell(p)'), 'GerstnerWaterSurface derives its cell from waterCell');

// The sea is now the sole visual surface. Before this migration AzovTerrain
// mounted a second, old WaterSurface for every terrain strip whenever water
// was visible — independently of the sea setting — so it overlapped the new
// surface at the coast. Keep the retirement structural, not just hidden by a
// runtime flag; the old modules stay only in the reversible archive.
assert.ok(activeScene.includes("import SeaWater from './water/SeaWater.jsx';"), 'active scene owns the SeaWater adapter');
assert.ok(!/WaterSurfaceV2|FarWaterSurface/.test(activeScene), 'active scene imports no retired visual water');
assert.ok(!/name="coast-water"|WaterSurfaceV2|<TerrainStrip[^>]*\bwater\b/.test(terrainScene), 'terrain mounts land strips only, never a second visual water surface');
assert.ok(legacyReadme.includes('outside the active import graph'), 'retired visual water has a reversible archive note');

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
assert.ok(surf.includes('uniform float uBreakVisible[BREAK_SAMPLES + 1]'), 'a discontinuous coast can split the crest');
assert.ok(surf.includes('* surfBreakVisibleAt(s);'), 'the split fades out before a ruled triangle crosses land');
assert.ok(surf.includes('vec3 n = cross(ws1 - ws0, wt1 - wt0);'), 'normals are centred within their profile section');
assert.ok(surf.includes('uniform float uRibbonVisible;'), 'inactive frozen ribbons have an explicit visibility uniform');
assert.ok(surf.includes('uRibbonVisible * sp.alpha'), 'both surf passes discard frozen ghost ribbons');
assert.ok(surf.includes('ribbon.uniforms.uRibbonVisible.value = alive ? 1 : 0;'), 'only the inspected frozen ribbon remains visible');

// 4. The shore band cuts its edge per pixel, from the depth map and the sheet,
// not from its own vertices: a contour of a varying is a straight segment
// inside every triangle, which is where the staircase at the waterline came from.
// The map is coarse (a third of a metre, clamped to a metre), so the higher of
// it and the vertex's own ground wins: otherwise water is drawn over sand the
// map failed to notice. Still per pixel — that is what this guards.
assert.ok(/float bed = uShoreReady > 0\.5 \? max\(coastGround\(coastLocal\(vWorld\.xz\)\), vGround\) : vGround;/.test(shore), 'the band reads the bed per pixel, and land wins over the map');
// The deeper of the swell and the swash sheet, with a floor: a trough may not
// take the water away, which is what punched the lattice of holes.
assert.ok(/float depth = max\(max\(vLevel - bed, sheet\), 0\.004\);/.test(shore), 'the water is the deeper of the swell and the swash sheet, and never negative');
assert.ok(/if \(bed > 0\.02 && sheet <= 0\.001\) discard;/.test(shore), 'land is decided by the bed against the still line, not by the wave');
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

// 7. The boat cockpit writes a stencil seal before water. The new sea has
// three material families, and every one must reject that seal just as the
// retired pond surface did, otherwise the cockpit fills only after sea mode.
for (const [name, source] of [['BreakingWaves', surf], ['ShoreWater', shore], ['GerstnerWaterSurface', open]]) {
  assert.ok(source.includes('BOAT_CUTOUT_STENCIL_REF'), `${name} keeps the boat cockpit dry`);
  assert.ok(source.includes('stencilFunc: THREE.NotEqualStencilFunc') || source.includes('stencilFunc={THREE.NotEqualStencilFunc}'), `${name} rejects the cockpit stencil`);
  assert.ok(source.includes('sceneDepthVertex'), `${name} uses the canvas logarithmic-depth vertex contract`);
  assert.ok(source.includes('sceneDepthFragment'), `${name} uses the canvas logarithmic-depth fragment contract`);
}

console.log(`surfGeometry: one cell for three surfaces, the loft rides the bed (${(worstNow * 100).toFixed(1)} cm under, was ${(worstBefore * 100).toFixed(0)}), the section follows the crest's normal`);
