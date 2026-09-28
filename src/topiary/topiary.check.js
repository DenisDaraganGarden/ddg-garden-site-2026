// Run: node src/topiary/topiary.check.js
import assert from 'node:assert/strict';
import { TOPIARY_LIMITS, normalizeTopiarySettings } from './settings.js';

// Нормализация без потерь: форм больше потолка кисти (32) — файл от агента или
// от более новой версии движка приходит целиком, id остаются уникальными,
// повторная нормализация ничего не меняет.
const count = TOPIARY_LIMITS.objects + 8;
const many = normalizeTopiarySettings({ topiaryObjects: Array.from({ length: count }, (_, i) => ({ id: 'same', points: [[i, 0], [i + 1, 0], [i + 1, 1]] })) });
assert.equal(many.topiaryObjects.length, count, `${count} shapes survive normalization whole`);
assert.equal(new Set(many.topiaryObjects.map((o) => o.id)).size, count, 'ids stay unique');
assert.deepEqual(normalizeTopiarySettings(many), many, 'normalized settings normalize to themselves');
assert.deepEqual(normalizeTopiarySettings({ topiaryObjects: [{ id: 'x', points: [] }, { id: 'y' }] }).topiaryObjects, [], 'a shape without points is not a shape');

console.log(`topiary: ${count} shapes survive normalization whole, ids unique, idempotent`);
