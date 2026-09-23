import assert from 'node:assert/strict';
import { HOUSE_DEFAULTS, HOUSE_RANGES, HOUSE_ROLES, buildBeachHouse, buildBeachShed, disposeBuilding } from './beachHouse.js';
import { RIDER_HEIGHT } from '../surfboard/riderSkeleton.js';

// The house is for walking: hold its measures to the surfer's (1.74 m) and to
// the carpenter's rules, at the defaults and at both ends of every slider.
const triangles = (building) => [...building.parts.values()].reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0);
const finite = (building) => [...building.parts.values()].every((geometry) => ['position', 'uv', 'aSurface'].every((name) => geometry.attributes[name].array.every(Number.isFinite)));

function holds(house, label) {
  const { plan } = house;
  const { rise, run, risers, top, foot } = plan.stairs;
  assert.ok(Math.abs(rise * risers - plan.floor) < 1e-9, `${label}: the stairs climb exactly to the porch`);
  assert.ok(rise > 0.14 && rise <= 0.19, `${label}: rise ${rise.toFixed(3)} m`);
  assert.ok(2 * rise + run >= 0.56 && 2 * rise + run <= 0.66, `${label}: 2 rises + 1 run = ${(2 * rise + run).toFixed(3)} m`);
  assert.ok(Math.abs(top[0] - foot[0] - (risers - 1) * run) < 1e-9, `${label}: one run per tread`);
  assert.ok(plan.door.height >= RIDER_HEIGHT + 0.25, `${label}: the door clears the surfer`);
  assert.ok(plan.porch.underBeam >= RIDER_HEIGHT + 0.5, `${label}: headroom under the porch beam`);
  assert.ok(plan.rail >= 0.9, `${label}: the rail is 90 cm or more`);
  assert.ok(plan.porch.roofAtWall < plan.upperSill - 0.1, `${label}: the porch roof (${plan.porch.roofAtWall.toFixed(2)}) passes under the upper sills (${plan.upperSill.toFixed(2)})`);
  assert.ok(plan.porch.pitch >= 10, `${label}: the porch roof still sheds rain (${plan.porch.pitch.toFixed(1)}°)`);
  assert.ok(finite(house), `${label}: every vertex is a number`);
  assert.ok(house.bounds.min.y > -0.03, `${label}: nothing below the sand (${house.bounds.min.y.toFixed(3)})`);
  assert.ok(plan.ridge > plan.eaves + 1, `${label}: the ridge stands above the eaves`);
  for (const [role, geometry] of house.parts) {
    assert.ok(HOUSE_ROLES.includes(role), `${label}: unknown finish ${role}`);
    // Laid for the material: metric UVs, and a surface of a seed in [0, 1)
    // and a layout it knows (houseMaterial.js).
    const { uv, aSurface } = geometry.attributes;
    assert.ok(uv?.itemSize === 2 && aSurface?.itemSize === 3, `${label}: ${role} has uv and aSurface`);
    for (let i = 0; i < aSurface.count; i += 1) {
      const seed = aSurface.getX(i), layout = aSurface.getY(i);
      assert.ok(seed >= 0 && seed < 1 && Number.isInteger(layout) && layout >= 0 && layout <= 8, `${label}: ${role} surface ${seed}, ${layout}`);
    }
  }
  // A sagging house is cut short to bend: the biggest one, bent most, ~41k.
  assert.ok(triangles(house) < 48000, `${label}: ${triangles(house)} triangles`);
}

const house = buildBeachHouse();
holds(house, 'default');
assert.equal(house.plan.stairs.risers, 8, 'eight risers of 18 cm at the default floor');
assert.ok(house.plan.ridge > 8 && house.plan.ridge < 10, `a two-storey house: ridge ${house.plan.ridge.toFixed(2)} m`);
assert.ok(triangles(house) < 32000, `the default house: ${triangles(house)} triangles`);
const defaultTriangles = triangles(house);
disposeBuilding(house);

for (const [key, [min, max]] of Object.entries(HOUSE_RANGES)) {
  for (const value of [min, max]) {
    const variant = buildBeachHouse({ ...HOUSE_DEFAULTS, [key]: value });
    holds(variant, `${key} = ${value}`);
    disposeBuilding(variant);
  }
}
for (const end of [0, 1]) {
  const settings = Object.fromEntries(Object.entries(HOUSE_RANGES).map(([key, range]) => [key, range[end]]));
  const variant = buildBeachHouse(settings);
  holds(variant, end ? 'every slider at its top' : 'every slider at its bottom');
  disposeBuilding(variant);
}
assert.deepEqual(
  [...buildBeachHouse({ seed: 3 }).parts.get('deck').attributes.position.array.slice(0, 9)],
  [...buildBeachHouse({ seed: 3 }).parts.get('deck').attributes.position.array.slice(0, 9)],
  'the same seed builds the same boards',
);

// Age. A new house has no gaps; more damage only opens more of them (every
// piece draws its fate whatever the damage) and takes porch boards away.
const trianglesOf = (building, role) => (building.parts.get(role)?.attributes.position.count ?? 0) / 3;
const fresh = buildBeachHouse({ damage: 0, sag: 0 });
assert.ok(!fresh.parts.has('void'), 'a new house has no holes');
let holes = 0;
for (const damage of [0.25, 0.5, 0.75, 1]) {
  const aged = buildBeachHouse({ damage, sag: 0 });
  assert.ok(trianglesOf(aged, 'void') >= holes, `damage ${damage}: holes only grow`);
  holes = trianglesOf(aged, 'void');
  if (damage === 1) assert.ok(trianglesOf(aged, 'deck') < trianglesOf(fresh, 'deck'), 'damage takes porch boards away');
  disposeBuilding(aged);
}
assert.ok(holes > 0, 'a derelict house has holes');
const seedOf = (damage) => buildBeachHouse({ damage, sag: 0 }).parts.get('siding').attributes.aSurface.getX(0);
assert.equal(seedOf(0), seedOf(1), 'a board keeps its patch of texture whatever the damage');
// Sagging bends the roof (a straight ridge has no vertex at its middle; a
// sagging one is cut there) and leaves the stilts on the sand.
const ridgeMiddle = (building) => {
  const position = building.parts.get('roof').attributes.position;
  let top = -Infinity;
  for (let i = 0; i < position.count; i += 1) if (Math.abs(position.getZ(i)) < 0.4) top = Math.max(top, position.getY(i));
  return top;
};
const sagged = buildBeachHouse({ damage: 0, sag: 1 });
const swayback = fresh.plan.ridge - ridgeMiddle(sagged);
assert.ok(swayback > 0.2, `the ridge swaybacks (${swayback.toFixed(2)} m)`);
assert.ok(Math.abs(sagged.bounds.min.y) < 0.03, 'the stilts stay on the sand');
disposeBuilding(fresh);
disposeBuilding(sagged);

const shed = buildBeachShed();
assert.ok(Math.abs(shed.plan.stepRise * shed.plan.steps - shed.plan.deck) < 1e-9 && shed.plan.stepRise <= 0.19, 'the shed steps climb to its deck');
assert.ok(shed.plan.door.height >= RIDER_HEIGHT + 0.1, 'the shed door clears the surfer');
assert.ok(finite(shed) && shed.bounds.min.y > -0.03, 'the shed is whole and stands on the sand');
assert.ok(triangles(shed) < 15000, `shed: ${triangles(shed)} triangles`);
const shedTriangles = triangles(shed);
disposeBuilding(shed);

console.log(`beach house: ${defaultTriangles} + ${shedTriangles} triangles, stairs ${house.plan.stairs.risers} × ${(house.plan.stairs.rise * 100).toFixed(0)} cm, ridge ${house.plan.ridge.toFixed(2)} m; ${Object.keys(HOUSE_RANGES).length * 2 + 2} slider ends hold.`);
