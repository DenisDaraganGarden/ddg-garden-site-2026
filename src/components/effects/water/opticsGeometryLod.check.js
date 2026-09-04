// Run: node src/components/effects/water/opticsGeometryLod.check.js

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseOpticsGeometryLod } from './opticsGeometryLod.js';

const readLod = (path) => {
  const file = fs.readFileSync(path);
  return parseOpticsGeometryLod(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
};

const boat = readLod('public/models/boat/boat-optics.rlod');
const sculpture = readLod('public/models/sculpture/sculpture-optics.rlod');

assert.ok(boat.get('Object019_OBJ_wire_000000000')?.length < 31328 * 3);
assert.ok(sculpture.get('sculpt25_005')?.length < 59972 * 3);
assert.equal(
  [...boat.values(), ...sculpture.values()].every((indices) => indices.length % 3 === 0),
  true,
  'every optics LOD must remain a triangle list',
);

console.log('opticsGeometryLod: all checks passed');
