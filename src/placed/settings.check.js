// Run: node src/placed/settings.check.js
import assert from 'node:assert/strict';
import { createPlacedObject, normalizePlacedObject, normalizePlacedSettings, PLACED_LIMITS } from './settings.js';

// A tree keeps its species, its own knobs and its place; junk is clamped.
{
    const tree = normalizePlacedObject({ kind: 'tree', species: 'willow', x: 12.3456, z: -4, y: 'nope', height: 99, seed: 3.7, name: 'Ива у воды' }, 0);
    assert.equal(tree.kind, 'tree');
    assert.equal(tree.species, 'willow');
    assert.equal(tree.x, 12.346);
    assert.equal(tree.y, 0, 'a non-number falls back to the default');
    assert.equal(tree.height, 12, 'height is clamped to the tree range');
    assert.equal(tree.seed, 4, 'integer steps round');
    assert.equal(tree.name, 'Ива у воды');
    assert.ok(!('size' in tree), 'a tree carries no rock knobs');
}

// An unknown kind or species falls out or falls back.
assert.equal(normalizePlacedObject({ kind: 'boat' }), null);
assert.equal(normalizePlacedObject({ kind: 'tree', species: 'baobab' }).species, 'elm');
assert.equal(normalizePlacedObject({ kind: 'rock', variant: 9 }).variant, 5);

// The list is bounded and ids stay unique.
{
    const many = Array.from({ length: PLACED_LIMITS.objects + 5 }, () => ({ kind: 'rock', id: 'same' }));
    const settings = normalizePlacedSettings({ placedObjects: many });
    assert.equal(settings.placedObjects.length, PLACED_LIMITS.objects);
    assert.equal(new Set(settings.placedObjects.map((o) => o.id)).size, PLACED_LIMITS.objects);
    assert.equal(settings.placedEnabled, true);
    assert.deepEqual(normalizePlacedSettings({}), { placedEnabled: true, placedObjects: [] });
}

// Creating gives a fresh id and seed at the asked place; normalising it again is a no-op.
{
    const rock = createPlacedObject('rock', { x: 5, y: 1.5, z: -2, name: 'Камень 1' });
    assert.ok(rock.id.startsWith('placed-'));
    assert.deepEqual([rock.x, rock.y, rock.z], [5, 1.5, -2]);
    assert.ok(rock.seed >= 1 && rock.seed <= 200);
    assert.deepEqual(normalizePlacedObject(rock), rock);
}

// A model: its file, a scale as wide as scans need, tilts, its switches; no file, no object.
{
    const model = createPlacedObject('model', { x: 3, z: 4, name: 'Риф', model: 'beach-reef-mfq1x2' });
    assert.equal(model.kind, 'model');
    assert.equal(model.model, 'beach-reef-mfq1x2');
    assert.equal(model.species, 'lit');
    assert.equal(model.wet, true, 'wet by default: the sea reaches it');
    assert.equal(model.collision, false);
    assert.ok(!('hidden' in model), 'shown by default, and only a hidden object says so');
    assert.deepEqual(normalizePlacedObject(model), model);
    const scaled = normalizePlacedObject({ ...model, scale: 0.02, tiltX: 400, hidden: true, collision: true });
    assert.equal(scaled.scale, 0.02, 'a model scales below the other kinds\' quarter');
    assert.equal(scaled.tiltX, 180);
    assert.equal(scaled.hidden, true);
    assert.equal(scaled.collision, true);
    assert.equal(normalizePlacedObject({ ...model, model: '../../etc/passwd' }), null, 'a file name that is a path is no model');
    assert.equal(normalizePlacedObject({ ...model, model: undefined }), null);
    assert.equal(normalizePlacedObject({ kind: 'tree', scale: 0.02 }).scale, 0.25, 'the other kinds keep their range');
}

console.log('placed: all checks passed');
