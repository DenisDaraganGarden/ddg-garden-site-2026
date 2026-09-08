import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./seaCausticNormals.js', import.meta.url), 'utf8');
assert.match(source, /SEA_CAUSTIC_NORMAL_RESOLUTION = 256/, 'caustic carrier starts within the agreed 256² budget');
assert.match(source, /SEA_CAUSTIC_INVERSE_STEPS = 5/, 'visible-world normal map keeps a bounded inverse horizontal solve');
assert.match(source, /seaCausticSurface/, 'the normal map must solve from its visible world coordinate');
assert.match(source, /uniform vec3 uSeaCausticCamera;\n {2}\${coastWaterShader}\n {2}\${causticGerstnerShader}/, 'the scene camera uniform must be declared before the embedded Gerstner functions');
assert.match(source, /return \(1\.0 - smoothstep\(uGerstnerFade\.x, uGerstnerFade\.y, distance\(p, uSeaCausticCamera\.xz\)\)\) \* coastSwellFade/, 'carrier fade must close before multiplying the shared coast attenuation');
assert.match(source, /0\.5 - vUv\.y/, 'the carrier uses the receivers’ world-XZ texture orientation');
assert.match(source, /coastWaterShader/, 'the coast handover reads the shared shore-depth map, not coastHeight in the pass');
assert.doesNotMatch(source, /coastHeight\(/, 'the water data pass must not evaluate terrain height per fragment');
assert.match(source, /uSeaCausticRippleState/, 'retained interaction height remains part of the caustic carrier');
assert.match(source, /vec3 seaCausticRippleNormal/, 'retained interaction slope must be composed into the carrier');
assert.match(source, /n = seaCausticRippleNormal\(n, visible\);/, 'the emitted carrier normal must apply the retained ripple slope');
assert.match(source, /createTarget\(SEA_CAUSTIC_NORMAL_RESOLUTION/, 'carrier is a bounded data target, not a scene capture');
assert.match(source, /holder\.texture/, 'receivers share one stable holder rather than creating a target each');
console.log('seaCausticNormals: bounded Gerstner carrier, coast depth and retained ripple contract present');
