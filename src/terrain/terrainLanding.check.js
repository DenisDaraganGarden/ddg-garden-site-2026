import assert from 'node:assert/strict';
import { findPerchCandidates } from './terrainLanding.js';

// Рельеф выдуман: до x<0 — вода (ниже уреза), дальше пляж, у x>8 — крутой уступ,
// а в точке (4, 4) стоит валун. Сама выборка ходит только через surfaceAt.
const query = {
  surfaceAt: (x, z) => {
    if (Math.hypot(x - 4, z - 4) < 1) return { height: 1.1, normal: { x: 0, y: 0.99, z: 0 }, habitat: 'rock' };
    if (x < 0) return { height: -0.4, normal: { x: 0, y: 1, z: 0 }, habitat: 'water' };
    if (x > 8) return { height: 2, normal: { x: 0.6, y: 0.8, z: 0 }, habitat: 'bluff' };
    return { height: 0.5, normal: { x: 0, y: 1, z: 0 }, habitat: 'beach' };
  },
};

const sites = findPerchCandidates(query, { centerX: 4, centerZ: 0, radius: 8, count: 12, seed: 7 });
assert.ok(sites.length > 0 && sites.length <= 12, `мест ${sites.length}`);
assert.ok(sites.every((site) => site.x >= 0 && site.x <= 8), 'ни воды, ни крутого уступа');
assert.ok(sites.every((site) => Math.hypot(site.x - 4, site.z) <= 8), 'все в радиусе территории');
for (let i = 0; i < sites.length; i += 1) {
  for (let j = i + 1; j < sites.length; j += 1) {
    assert.ok(Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z) >= 2.4, 'места не плечом к плечу');
  }
}

// Валун попадает как отдельная поверхность, и его можно отключить.
const withRocks = findPerchCandidates(query, { centerX: 4, centerZ: 4, radius: 3, count: 20, seed: 3 });
assert.ok(withRocks.some((site) => site.surface === 'rock'), 'валун найден через surfaceAt');
const noRocks = findPerchCandidates(query, { centerX: 4, centerZ: 4, radius: 3, count: 20, seed: 3, rocks: false });
assert.ok(noRocks.every((site) => site.surface === 'shore'));
const noLand = findPerchCandidates(query, { centerX: 4, centerZ: 4, radius: 3, count: 20, seed: 3, terrain: false });
assert.ok(noLand.length > 0 && noLand.every((site) => site.surface === 'rock'), 'только валуны');

// Одни настройки — одни и те же места: сайт и редактор садят птиц одинаково.
assert.deepEqual(
  findPerchCandidates(query, { centerX: 4, centerZ: 0, radius: 8, count: 6, seed: 7 }).map((s) => [s.x, s.z]),
  findPerchCandidates(query, { centerX: 4, centerZ: 0, radius: 8, count: 6, seed: 7 }).map((s) => [s.x, s.z]),
);
assert.deepEqual(findPerchCandidates(query, { count: 0 }), []);
assert.deepEqual(findPerchCandidates(null), []);

console.log(`terrainLanding: процедурные места для посадки — ок (${sites.length} на пляже, валун найден)`);
