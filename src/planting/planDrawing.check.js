import assert from 'node:assert/strict';
import { plantingInstances, plantingSchedule } from './fillBed.js';
import { drawingSheets, layoutPlanLabels, makePlantingDrawing, PLAN_SHEET, plantingGroups, planLeadersOverlap, planOpacity, planProjector, sheetProjection } from './planDrawing.js';

const library = new Map([
    ['a', { id: 'a', latin: 'Aster', height: 0.6, spread: 0.6, density: 4 }],
    ['b', { id: 'b', latin: 'Betula', height: 12, spread: 6, category: 'tree', density: 0.1 }],
]);
const bed = { id: 'bed', name: 'Bed', y: 0, density: 1, points: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[4, 0], [6, 0], [6, 10], [4, 10]]], recipe: [{ plant: 'a', share: 1 }] };
const point = (id, x, z, more = {}) => ({ id, plant: 'a', x, y: 0, z, scale: 1, ...more });
const plants = [point('a1', 2.5, 3, { bed: 'bed', plant: 'b' }), point('a2', 7.5, 3, { bed: 'bed', plant: 'b' }), point('a3', 2.5, 4, { bed: 'bed', plant: 'b' }), point('a4', 2.8, 3.5, { bed: 'other', plant: 'b' }), point('a5', 2.7, 3.5, { bed: 'bed', plant: 'b', existing: true })];
const groups = plantingGroups(plants, library, [bed]);
assert.deepEqual(groups.map((g) => g.count).sort(), [1, 1, 1, 2], 'separate beds, existing plants and hole-separated groups');
assert.deepEqual(groups, plantingGroups([...plants].reverse(), library, [bed]), 'input order never changes group identity or its spanning links');
assert.equal(groups.reduce((n, g) => n + g.links.length, 0), 1);
assert.ok(groups.every((g) => g.members.includes(g.anchor)), 'anchors are actual planting positions');
assert.ok(planOpacity(0.3) > planOpacity(1) && planOpacity(1) > planOpacity(12));
assert.ok(planOpacity(99) >= 0.1 && planOpacity(-2) <= 0.62);

const p = planProjector(90)({ x: 3, z: 5 });
assert.ok(Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y + 3) < 1e-9, 'north rotation preserves metre coordinates');
const fill = Array.from({ length: 20 }, (_, i) => ({ key: `a:${i}:0`, plant: 'a', x: i % 4, y: 0, z: Math.floor(i / 4), scale: 1 }));
const points = [{ ...point('existing', 12, 3), status: 'existing', seed: 1 }, { ...point('single', 15, 3), seed: 2 }];
const instances = [...plantingInstances([bed], [fill], points).values()].flat();
const schedule = plantingSchedule([bed], [fill], points, library);
const drawing = makePlantingDrawing({ instances, beds: [bed], library, schedule });
assert.equal(drawing.plants.length, 22);
assert.equal(new Set(drawing.plants.map((i) => i.id)).size, 22, 'every position has a durable source key');
assert.deepEqual(drawing.mismatches, []);
assert.equal(drawing.groups.reduce((n, g) => n + g.count, 0), 22);
assert.equal(schedule[0].order, 23, '20 bed positions plus one new single; reserve rounded once, existing excluded');

// Dense sheets, repeated coordinates and collinear anchors must paginate;
// neither label text nor leader lines may collide or silently disappear.
for (const count of [1, 44, 87, 160]) {
    const singles = Array.from({ length: count }, (_, i) => {
        const member = point(`point-${i}`, i % 5, Math.floor(i / 5));
        return { id: `group-${i}`, plant: 'a', number: 1, anchor: member, members: [member], links: [], count: 1 };
    });
    const sheets = drawingSheets({ groups: singles }, library, 0);
    assert.equal(sheets.flatMap((sheet) => sheet.groups).length, count);
    assert.equal(new Set(sheets.flatMap((sheet) => sheet.groups.map((g) => g.id))).size, count);
    for (const sheet of sheets) {
        assert.ok(sheet.groups.length <= PLAN_SHEET.groups);
        const projection = sheetProjection(sheet.bounds, 0), labels = layoutPlanLabels(sheet.groups, projection.at);
        assert.equal(labels.length, sheet.groups.length);
        assert.equal(planLeadersOverlap(labels), false, 'crossing or coincident leaders trigger subdivision');
        for (const label of labels) {
            assert.ok(label.y - label.height >= PLAN_SHEET.top - 4 && label.y <= PLAN_SHEET.bottom);
            for (const other of labels) if (label !== other) {
                const overlaps = label.x < other.x + other.width && label.x + label.width > other.x && label.y - label.height < other.y && label.y > other.y - other.height;
                assert.equal(overlaps, false, 'callout rectangles are disjoint');
            }
        }
    }
}
console.log('plant plan: group identity, holes, counts, reserve, north, pagination and collision-free labels hold');
