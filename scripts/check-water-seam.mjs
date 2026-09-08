import assert from 'node:assert/strict';
import {
  POND_SEAM_EDGE_DAMPING,
  simulationFragmentShader,
} from '../src/components/effects/shaders/waterRuntimeShaders.js';
import { seaRippleShader } from '../src/components/effects/water/seaRippleShader.js';
import { createTerrainDefinition, coastPondWeight } from '../src/terrain/terrainModel.js';

// The finite GPU simulation remains active beneath the sea. This check owns
// its real contract: a damped edge prevents reflected cursor wakes, and the
// ripple layer fades at the map rim and over dry terrain before SeaWater adds
// it to the analytic carrier.
assert.ok(POND_SEAM_EDGE_DAMPING > 0 && POND_SEAM_EDGE_DAMPING < 1);
assert.match(simulationFragmentShader, /uniform float uBoundaryBlendUv/);
assert.match(simulationFragmentShader, /velocity\*=pow\(mix\(0\.68,1\.0,edgeFade\),frameScale\)/);
assert.match(simulationFragmentShader, /coastPondWeight\(coastLocal\(worldXZ\)\)/);
assert.match(seaRippleShader, /uSeaRippleStateMap/);
assert.match(seaRippleShader, /uSeaRippleNormalMap/);
assert.match(seaRippleShader, /mix\(raw, smoothed, 0\.84\)/);
assert.match(seaRippleShader, /smoothstep\(vec2\(0\.035\), vec2\(0\.07\), uv\)/);
assert.match(seaRippleShader, /float wet = uCoastShape\.x > 0\.5/);

const coast = createTerrainDefinition({ terrainEnabled: true });
assert.equal(coastPondWeight(-24, 0, coast), 1, 'deep water retains local ripple detail');
assert.equal(coastPondWeight(2, 0, coast), 0, 'dry shore receives no retained ripple displacement');
const handoffWeight = coastPondWeight(-6, 0, coast);
assert.ok(handoffWeight > 0 && handoffWeight < 1, 'the shoal hands local ripples to the shoreline continuously');

console.log(JSON.stringify({
  status: 'PASS',
  retainedRuntime: 'cursor ripple + probes + caustic normal',
  boundaryVelocityMultiplierAt60fps: POND_SEAM_EDGE_DAMPING,
  shoalPondWeight: handoffWeight,
}, null, 2));
