import assert from 'node:assert/strict';
import { preserveUnknownFields } from './preserveUnknown.js';

// A root key this code does not know comes back as it was; a migrated old key
// does not; nothing changes when there is nothing unknown.
const known = { waterVisible: true, placedObjects: [] };
assert.equal(preserveUnknownFields({ waterVisible: false }, known), known, 'nothing unknown: the same object');
assert.deepEqual(preserveUnknownFields({ futureObjectEnabled: true, planeTrailSpan: 9 }, known, { dropped: ['planeTrailSpan'] }),
  { ...known, futureObjectEnabled: true }, 'unknown root key kept, migrated old key dropped');

// Items of a list with ids keep fields no output item has; the output wins
// for fields it knows; an item the output does not have is not brought back.
const input = { placedObjects: [
  { id: 'a', kind: 'model', x: 99, futureWind: 0.4 },
  { id: 'gone', kind: 'model', futureWind: 1 },
] };
const output = { placedObjects: [{ id: 'a', kind: 'model', x: 1 }] };
assert.deepEqual(preserveUnknownFields(input, output).placedObjects, [{ id: 'a', kind: 'model', x: 1, futureWind: 0.4 }],
  'unknown item field kept, known field normalized, removed item stays removed');

// A field another output item has is known to this code: the normalizer
// dropped it here on purpose and it is not carried back.
assert.deepEqual(preserveUnknownFields(
  { list: [{ id: 'a', origin: { x: 'bad' } }, { id: 'b', origin: { x: 1 } }] },
  { list: [{ id: 'a' }, { id: 'b', origin: { x: 1 } }] },
).list, [{ id: 'a' }, { id: 'b', origin: { x: 1 } }], 'a known optional field is not resurrected');

// A dictionary of records (sketchupModels) keeps unknown fields of the
// entries that remain; a removed entry and a dictionary of plain values
// (a map someone can delete keys from) are never refilled.
assert.deepEqual(preserveUnknownFields(
  { sketchupModels: { m1: { hidden: [1], futureLayer: 'roof' }, m2: { hidden: [] } }, modelMaterials: { brick: 'lib-1', glass: 'lib-2' } },
  { sketchupModels: { m1: { hidden: [1] } }, modelMaterials: { brick: 'lib-1' } },
), { sketchupModels: { m1: { hidden: [1], futureLayer: 'roof' } }, modelMaterials: { brick: 'lib-1' } },
'entry fields kept; removed entries and removed keys stay removed');

// Catalogues the caller handles itself are not entered.
const cameras = { sceneCameras: [{ id: 'c1', scene: {} }] };
assert.equal(preserveUnknownFields({ sceneCameras: [{ id: 'c1', scene: {}, legacyPose: 1 }] }, cameras, { skip: ['sceneCameras'] }), cameras);

// Lists without ids are values, not items: left to the normalizer.
const points = { points: [[0, 0], [1, 1]] };
assert.equal(preserveUnknownFields({ points: [[0, 0], [1, 1], [2, 2]] }, points), points);

console.log('preserveUnknown: root keys, list items, record dictionaries, removals and skips passed');
