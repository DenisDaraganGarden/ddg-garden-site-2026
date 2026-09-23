import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrainDefinition } from '../../../terrain/terrainModel.js';
import { DEFAULT_TERRAIN_SETTINGS } from '../../../terrain/settings.js';
import { buildHomeSceneLighting } from '../homeSceneLighting.js';
import { createSurfWater } from '../../surfboard/surfWater.js';
import { resolveEffectiveSeaSettings, resolveSeaSettings } from './seaSettings.js';
import { createSurfRibbons } from './surfRibbons.js';
import { LENS_RADIUS, lensWaterline, setUnderside, underwaterFog, underwaterVisibility } from './underwaterOptics.js';

// The numbers UnderwaterView hands the renderer: how far the murk lets one
// see, what colour it is by day and by night, and where the surface cuts the
// lens for a camera held at the waterline.

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// Visibility: 25 m clear, 3 m at full turbidity, falling all the way.
near(underwaterVisibility(0), 25, 1e-9, 'clear water shows 25 m');
near(underwaterVisibility(1), 3, 1e-9, 'full turbidity shows 3 m');
assert.ok(underwaterVisibility(0.3) > underwaterVisibility(0.6), 'more turbidity, less visibility');

const sea = resolveEffectiveSeaSettings(resolveSeaSettings({ seaAmplitude: 0.3 }));
const day = buildHomeSceneLighting({ timeOfDay: 12 });
const night = buildHomeSceneLighting({ timeOfDay: 23 });
const fogAt = (lighting, depth, turbidity = sea.bedTurbidity) => underwaterFog({ ...sea, bedTurbidity: turbidity }, lighting, depth, new THREE.FogExp2(0, 0));
const luminance = ({ color }) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

// The fog hides 98% of anything at the visibility distance, at the surface.
for (const turbidity of [0, 0.5, 1]) {
  const fog = fogAt(day, 0, turbidity);
  near(1 - Math.exp(-((fog.density * underwaterVisibility(turbidity)) ** 2)), 0.982, 0.001, `98% hidden at the visibility (turbidity ${turbidity})`);
}
const surface = fogAt(day, 0);
const deep = fogAt(day, 10);
assert.ok(deep.density > surface.density && deep.density < surface.density * 1.5, 'the water thickens a little with depth');
assert.ok(luminance(deep) < luminance(surface), 'less light reaches deeper water');
assert.ok(luminance(fogAt(night, 0)) < luminance(surface) * 0.1, 'night water is dark');
assert.equal(luminance(fogAt(day, -3)), luminance(surface), 'above the surface the murk is the surface\'s own');
assert.ok(surface.color.g > surface.color.r && [surface.color.r, surface.color.g, surface.color.b].every((c) => Number.isFinite(c) && c >= 0), 'the default sea murks green, finite and non-negative');

// The lens. A 60° perspective camera, level water facing up.
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 1000);
const level = { nx: 0, ny: 1, nz: 0 };
const lineFor = (height, lookAt, roll = 0, water = level) => {
  camera.position.set(0, 0, 0);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(...lookAt);
  camera.updateMatrixWorld();
  return lensWaterline(height, water, camera.matrixWorld.elements, camera.projectionMatrix.elements);
};
const lensAt = ([a, b, c], x, y) => a + b * x + c * y;
const crossesFrame = ([a, b, c]) => Math.abs(a) < Math.abs(b) + Math.abs(c);
const tanHalf = Math.tan(THREE.MathUtils.degToRad(30));

// Eye in the surface, looking level: the horizon of the lens is its middle row, air above.
let line = lineFor(0, [0, 0, -1]);
near(line[0], 0, 1e-12, 'eye in the surface: the line through the middle');
near(line[1], 0, 1e-12, 'level water, level camera: a level line');
near(line[2], LENS_RADIUS * tanHalf, 1e-9, 'the glass spans ±r·tan(fov/2) across the line');
assert.ok(lensAt(line, 0, 0.5) > 0 && lensAt(line, 0, -0.5) < 0, 'air in the upper half, water in the lower');
// Five centimetres up, the water reaches the lower glass: 5 / (12·tan 30°) of the half frame.
line = lineFor(0.05, [0, 0, -1]);
near(-line[0] / line[2], -0.05 / (LENS_RADIUS * tanHalf), 1e-9, 'the line sits where the water meets the glass');
// A metre up or down, looking level: the whole lens on the eye's side.
assert.ok(!crossesFrame(lineFor(1, [0, 0, -1])) && !crossesFrame(lineFor(-1, [0, 0, -1])), 'a metre from the surface no line crosses the lens');
// Just above, looking straight down: the whole glass is under.
line = lineFor(0.05, [0, -1, -1e-4]);
assert.ok(!crossesFrame(line) && line[0] < 0, 'a lens aimed down from 5 cm dips whole');
// Rolled 30°, the line rolls with it (ndc is stretched by the aspect).
line = lineFor(0, [0, 0, -1], THREE.MathUtils.degToRad(30));
near(Math.atan2(line[1] * camera.projectionMatrix.elements[0], line[2] * camera.projectionMatrix.elements[5]), -THREE.MathUtils.degToRad(30), 1e-9, 'a rolled camera sees the line rolled');
// A tilted swell tilts the line the other way.
const tilt = 0.2;
line = lineFor(0, [0, 0, -1], 0, { nx: Math.sin(tilt), ny: Math.cos(tilt), nz: 0 });
assert.ok(line[1] > 0, 'water leaning toward +x raises the line on that side');

// The material switch: once each way, idempotent, and back to exactly what it was.
const material = new THREE.ShaderMaterial();
const version = material.version;
setUnderside(material, false);
assert.equal(material.version, version, 'no change, no program switch');
setUnderside(material, true);
assert.ok(material.side === THREE.BackSide && 'WATER_UNDERSIDE' in material.defines && material.version === version + 1, 'under: back faces, the underside branch');
setUnderside(material, true);
assert.equal(material.version, version + 1, 'staying under asks for nothing');
setUnderside(material, false);
assert.ok(material.side === THREE.FrontSide && Object.keys(material.defines).length === 0, 'surfacing restores the material exactly');

// The per-frame cost: one water sample under the eye, the fog and the lens.
const water = createSurfWater({ seaSettings: sea, coastDefinition: createTerrainDefinition(DEFAULT_TERRAIN_SETTINGS), getCamera: () => camera.position, surfRibbons: createSurfRibbons() });
const sample = {};
const fog = new THREE.FogExp2(0, 0);
const out = [0, 0, 0];
const frames = 20000;
const started = performance.now();
for (let frame = 0; frame < frames; frame += 1) {
  const s = water.sample(3 + frame * 1e-3, -20, frame / 60, sample);
  underwaterFog(sea, day, s.height + 0.5, fog);
  lensWaterline(-0.5 * s.ny, s, camera.matrixWorld.elements, camera.projectionMatrix.elements, out);
}
const microseconds = ((performance.now() - started) / frames) * 1000;
assert.ok(microseconds < 200, `per-frame CPU work stays small (${microseconds.toFixed(1)} µs)`);

console.log(`underwaterOptics: visibility 25 → 3 m (98% hidden there), night murk ${(luminance(fogAt(night, 0)) / luminance(surface) * 100).toFixed(1)}% of noon, 10 m down ${(luminance(deep) / luminance(surface) * 100).toFixed(0)}% as bright; the lens line level through the middle at the surface, at ${(-0.05 / (LENS_RADIUS * tanHalf)).toFixed(2)} of the half frame 5 cm up, off the lens a metre away; ${microseconds.toFixed(1)} µs per frame`);
