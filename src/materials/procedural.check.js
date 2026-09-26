import assert from 'node:assert/strict';
import { generateSurface, surfacePreset, surfaceSize } from './procedural.js';
import { mapsFromRecipe, seamRatio } from '../../scripts/materialMaps.mjs';
import { surfaceRecipe } from './procedural.js';
const side = 256;
for (const kind of ['pebble', 'gravel', 'carpet', 'standing-seam', 'tiles']) {
    const s = surfacePreset(kind), extent = kind === 'carpet' ? [.2, .2] : [.5, .5];
    const original = generateSurface(s, side, side, extent);
    const recoloured = generateSurface({ ...s, tint: '#222a38', tint2: '#403c31' }, side, side, extent);
    assert.deepEqual(original.height, recoloured.height, `${kind}: recolouring must not invent different geometry`);
    assert.notDeepEqual(original.rgb, recoloured.rgb);
    const deeper = generateSurface({ ...s, relief: 30 }, side, side, extent);
    assert.deepEqual(deeper.rgb, original.rgb, `${kind}: depth must not bake shadows into colour`);
    assert.ok(seamRatio(original.rgb, side, side, 3) < 3, `${kind}: borders must join as naturally as adjacent pixels`);
    const maps = mapsFromRecipe(original.rgb, side, side, surfaceRecipe(s), original.extent, original.height);
    assert.deepEqual(maps.height, original.height, `${kind}: map generation must retain shared relief`);
}
assert.deepEqual(surfaceSize({ ...surfacePreset('standing-seam'), spacing: 430 }, [2, 3]), [1.72, 3]);
assert.deepEqual(surfaceSize({ ...surfacePreset('tiles'), tileWidth: 120, tileHeight: 900 }), [.48, 1.8]);
const red = { rgb: new Uint8Array([180, 30, 20]), width: 1, height: 1 };
const tiles = generateSurface(surfacePreset('tiles'), side, side, [1, 1], red);
assert.deepEqual([...tiles.rgb.subarray((32 * side + 32) * 3, (32 * side + 32) * 3 + 3)], [...red.rgb], 'imported albedo retained inside each tile');
assert.throws(() => generateSurface({ kind: 'carpet', stoneSize: 2 }, 16, 16, [50, 50]), /256/, 'reject pathological sample density');
console.log('procedural materials: consistent maps, independent colour/depth, wrapping, physical seam spacing, imported source and bounded density — ok');
