// Run: node scripts/check-grass.mjs — the meadow's contracts without a browser:
// deterministic cells, every kind in its niche, budgets per level, atlases sane.
import assert from 'node:assert/strict';
import { createTerrainDefinition, createTerrainQuery, coastCoordinates, shorePosition } from '../src/terrain/terrainModel.js';
import { coastProfile } from '../src/terrain/terrainLandforms.js';
import { buildCoastRocks, attachRockCollisions } from '../src/terrain/terrainRocks.js';
import { DEFAULT_GRASS_SETTINGS, DEFAULT_SHRUB_SETTINGS, grassAssetSettings } from '../src/plants/settings.js';
import { grassCell, gatherGrass, GRASS_CELL } from '../src/plants/grassMeadow.js';
import { makeGrassTuft, GRASS_KINDS, GRASS_SPECIES_DEFAULTS } from '../src/plants/grassModel.js';
import { GRASS_ATLASES } from '../src/plants/grassAtlas.js';

const p = createTerrainDefinition({ terrainSeed: 37 });
const query = attachRockCollisions(createTerrainQuery(p), buildCoastRocks(p));
const settings = { ...DEFAULT_GRASS_SETTINGS, ...DEFAULT_SHRUB_SETTINGS };
const context = { definition: p, query, settings };

// 1. Determinism: a cell is a function of its coordinates and the seed only.
{
  const a = grassCell(3, -2, context), b = grassCell(3, -2, context);
  assert.deepEqual(a, b, 'a cell must regrow identically');
  const c = grassCell(3, -2, { ...context, settings: { ...settings, grassSeed: 24 } });
  assert.notDeepEqual(a, c, 'another seed must plant another cell');
}

// 2. Niches: gather a wide window around the shore and test every tuft.
const cache = new Map();
const shoreCentre = { x: p.terrainOffset * p.landX, z: p.terrainOffset * p.landZ };
const all = gatherGrass(cache, shoreCentre.x + p.landX * 30, shoreCentre.z + p.landZ * 30, 120, context, 1e9);
assert.ok(all, 'first gather returns placements');
const counts = Object.fromEntries(GRASS_KINDS.map((kind) => [kind, all[kind].length]));
console.log('tufts within 120 m of the shore:', JSON.stringify(counts));
assert.ok(counts.stipa > 500 && counts.festuca > 500, 'the plateau carries the steppe');
assert.ok(counts.leymus > 10, 'dune grass on the back beach');
assert.ok(counts.phragmites > 5, 'reed at the calm edge');
for (const kind of GRASS_KINDS) for (const t of all[kind]) {
  const s = query.surfaceAt(t.x, t.z, 0), local = coastCoordinates(t.x, t.z, p), q = local.u - shorePosition(local.s, p), f = coastProfile(local.s, p);
  assert.ok(s.path < .3, `${kind} stands on a path`);
  assert.ok(s.normal.y >= .7, `${kind} stands on a rock face`);
  assert.ok(Math.abs(t.y - s.height) < 1e-6, `${kind} root is on the analytic ground`);
  if (kind === 'phragmites') assert.ok(t.y > -.8 && t.y < .35 && q < f.foot + 6, 'reed only at the edge, seepage or a ravine mouth');
  else assert.ok(t.y > .1, `${kind} stands out of the water`);
  if (kind === 'stipa') assert.ok(q > f.top + 1 && s.habitat === 'plateau', 'feather grass only on the plateau');
  if (kind === 'leymus') assert.ok(q > p.terrainBeachWidth * .35 && q < f.top + 3, 'dune grass on the back beach or the scree');
  assert.ok(t.scale > .3 && t.scale < 2, `${kind} scale ${t.scale}`);
}
// The cache answers the same camera cell with null and a moved camera with a new set.
assert.equal(gatherGrass(cache, shoreCentre.x + p.landX * 30, shoreCentre.z + p.landZ * 30, 120, context), null, 'same cell, nothing to rebuild');
assert.ok(gatherGrass(cache, shoreCentre.x + p.landX * 30 + GRASS_CELL * 3, shoreCentre.z + p.landZ * 30, 120, context), 'a moved camera rebuilds');

// 3. Tufts: budgets per level, height, atlas cells inside the atlas.
for (const kind of GRASS_KINDS) {
  const model = makeGrassTuft(kind, { seed: 5 });
  const near = model.geometry(0), mid = model.geometry(1);
  const tri = (g) => g.leaf.index.count / 3;
  assert.ok(tri(near) <= 220 && tri(near) >= 40, `${kind} near ${tri(near)} triangles`);
  assert.ok(tri(mid) <= tri(near) * .6, `${kind} middle level ${tri(mid)} is not lighter enough than ${tri(near)}`);
  // Blades arch: the apex sits below the nominal height; plumes and panicles rise above it.
  assert.ok(model.height > GRASS_SPECIES_DEFAULTS[kind].height * .6 && model.height < GRASS_SPECIES_DEFAULTS[kind].height * 2.2, `${kind} height ${model.height}`);
  assert.deepEqual(makeGrassTuft(kind, { seed: 5 }).leaves.length, model.leaves.length, 'a tuft regrows the same');
  const uv = near.leaf.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${kind} uv out of the atlas`); }
  assert.equal(model.selectLod(1, 500, 0), 0); assert.equal(model.selectLod(1000, 1, 0), 2);
  for (const rects of Object.values(GRASS_ATLASES[kind].parts)) for (const [x, y, w, h] of rects) assert.ok(x + w <= GRASS_ATLASES[kind].width + 1e-6 && y + h <= GRASS_ATLASES[kind].height + 1e-6, `${kind} atlas cell outside the image`);
  console.log(kind.padEnd(11), 'near', tri(near), 'mid', tri(mid), 'height', model.height.toFixed(2), 'pieces', model.leaves.length);
}
// 4. Asset settings: dryness rides the shrubs' with the grass offset, clamped.
const asset = grassAssetSettings({ ...settings, shrubsDryness: .9, grassDryness: .5 }, { speed: 4, bearing: 290 });
assert.equal(asset.dryness, 1); assert.equal(asset.windBearing, 290);
console.log('grass: all checks passed');
