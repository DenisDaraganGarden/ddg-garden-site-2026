import assert from 'node:assert/strict';
import {
  FAR_WATER_BLEND_WIDTH,
  buildFarWaterFieldData,
  pondSurfaceEdgeFade,
} from '../src/components/effects/water/farWaterGeometry.js';
import {
  POND_SEAM_EDGE_DAMPING,
  simulationFragmentShader,
} from '../src/components/effects/shaders/waterRuntimeShaders.js';
import { createTerrainDefinition, coastPondWeight } from '../src/terrain/terrainModel.js';
import { buildTerrainStrip } from '../src/terrain/terrainGeometry.js';
import { readFile } from 'node:fs/promises';

const field = buildFarWaterFieldData(34);
const compactField = buildFarWaterFieldData(12);
const edge = field.surfaceEdgeBlendUv;
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} !== ${expected}`);

assert.equal(FAR_WATER_BLEND_WIDTH, 1.5, 'the seam should dissipate a visible ripple over metres, not pixels');
close(field.pondHalfExtent - field.innerHalfExtent, FAR_WATER_BLEND_WIDTH);
close(compactField.surfaceEdgeBlendUv * 12, FAR_WATER_BLEND_WIDTH);
close(pondSurfaceEdgeFade({ x: .5, y: .5 }, edge), 1);
close(pondSurfaceEdgeFade({ x: 1, y: .5 }, edge), 0);
close(pondSurfaceEdgeFade({ x: 1 - edge, y: .5 }, edge), 1);
const midpoint = pondSurfaceEdgeFade({ x: 1 - edge * .5, y: .5 }, edge);
assert.ok(midpoint > .45 && midpoint < .55, 'the seam must crossfade smoothly at its midpoint');
assert.ok(POND_SEAM_EDGE_DAMPING > 0 && POND_SEAM_EDGE_DAMPING < 1);
assert.match(simulationFragmentShader, /uniform float uBoundaryBlendUv/);
assert.match(simulationFragmentShader, /velocity\*=pow\(mix\(0\.68,1\.0,edgeFade\),frameScale\)/);
assert.match(simulationFragmentShader, /coastPondWeight\(coastLocal\(worldXZ\)\)/);

const coast = createTerrainDefinition({ terrainEnabled: true });
assert.equal(coastPondWeight(-24, 0, coast), 1, 'deep water remains owned by the pond simulation');
assert.equal(coastPondWeight(2, 0, coast), 0, 'dry shore remains owned by shoreline water/terrain');
const handoffWeight = coastPondWeight(-6, 0, coast);
assert.ok(handoffWeight > 0 && handoffWeight < 1, 'the 0.8–0.4 m shoal must use a real transition');
const waterV2Source = await readFile(new URL('../src/components/effects/shaders/waterV2Shaders.js', import.meta.url), 'utf8');
assert.match(waterV2Source, /uniform float uShoreMode/);
assert.match(waterV2Source, /baseWorldXZ\.x \/ uWaterExtent \+ \.5/);
assert.match(waterV2Source, /texture2D\(uState, vUv\)/);
assert.doesNotMatch(waterV2Source, /texture2D\(uState, uv\)/);
assert.match(waterV2Source, /coastQS\.x>-96\.0 && coastQS\.x<8\.0/);
assert.doesNotMatch(waterV2Source, /coastPondCoverage/);
const farWaterSource = await readFile(new URL('../src/components/effects/water/FarWaterSurface.jsx', import.meta.url), 'utf8');
assert.match(farWaterSource, /uShoreMode<\.5 && abs\(qs\.y\)<uCoastDimensions\.x\*\.5 && qs\.x>-96\.0 && qs\.x<8\.0/);
assert.doesNotMatch(farWaterSource, /coastPondCoverage/);
const coastSurfaceSource = await readFile(new URL('../src/terrain/AzovTerrain.jsx', import.meta.url), 'utf8');
assert.match(coastSurfaceSource, /WaterSurfaceV2 geometryOverride=\{geometry\} shoreMode runtime=\{runtime\}/);
const shoreGeometry = buildTerrainStrip(coast, 0, 0, true);
assert.equal(shoreGeometry.userData.water, true);
assert.ok(shoreGeometry.boundingBox.min.x < shoreGeometry.boundingBox.max.x);
shoreGeometry.dispose();

console.log(JSON.stringify({
  status: 'PASS',
  pondExtentMetres: 34,
  overlapMetres: FAR_WATER_BLEND_WIDTH,
  activeCoreMetres: field.innerHalfExtent * 2,
  boundaryVelocityMultiplierAt60fps: POND_SEAM_EDGE_DAMPING,
  shoalPondWeight: handoffWeight,
}, null, 2));
