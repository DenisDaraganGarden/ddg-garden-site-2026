import assert from 'node:assert/strict';
import { HOUSE_DEFAULTS, HOUSE_RANGES, HOUSE_ROLES, buildBeachHouse, buildBeachShed, decodeRoom, disposeBuilding, garlandBulbs } from './beachHouse.js';
import { houseMapFamily } from './houseMaterial.js';
import { RIDER_HEIGHT } from '../surfboard/riderSkeleton.js';
import * as THREE from 'three';
import { CAMP_BOARDS, RING_PAINTS, boardPoints, houseCamp, shedCamp } from './surfCamp.js';

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
      assert.ok(seed >= 0 && seed < 1 && Number.isInteger(layout) && layout >= 0 && layout <= 9, `${label}: ${role} surface ${seed}, ${layout}`);
      const family = layout === 4 ? 'shingle' : layout === 5 ? 'metal' : [0, 1, 2, 3, 8].includes(layout) ? 'wood' : null;
      if (family) assert.equal(houseMapFamily(role), family, `${label}: ${role} layout ${layout} uses its assigned texture family`);
      // A pane's room: the pane's half width and its centre over a floor.
      if (layout === 9) {
        const { halfWidth, above } = decodeRoom(aSurface.getZ(i));
        const { blinds } = decodeRoom(aSurface.getZ(i));
        assert.ok(halfWidth >= 0.2 && halfWidth <= 0.55 && above >= 1 && above <= 2 && (blinds === 0 || blinds === 1), `${label}: a room behind a pane ${halfWidth} × ${above}, blinds ${blinds}`);
      }
    }
  }
  const points = [...plan.lamps, plan.yardAnchor, ...plan.garlands.flatMap(({ a, b }) => [a, b])];
  assert.ok(plan.lamps.length > 0 && plan.garlands.length > 4 && points.every((point) => point.every(Number.isFinite)), `${label}: lamps and garlands in place`);
  // A sagging house is cut short to bend; sashes, glazing bars and rails are
  // most of the rest: the biggest one, bent most, ~46k.
  assert.ok(triangles(house) < 54000, `${label}: ${triangles(house)} triangles`);
}

const house = buildBeachHouse();
holds(house, 'default');
// Festoon lights hang where one walks: on a porch that has not settled, no
// bulb's foot (9 cm under the flex, StringLights.jsx) lower than 2.15 m over
// the boards.
{
  const level = buildBeachHouse({ sag: 0 });
  const lowest = Math.min(...level.plan.garlands.flatMap((span) => garlandBulbs(span).map(([, y]) => y - 0.09))) - level.plan.floor;
  assert.ok(lowest >= 2.15, `garland headroom ${lowest.toFixed(2)} m`);
  disposeBuilding(level);
}
assert.equal(house.plan.stairs.risers, 8, 'eight risers of 18 cm at the default floor');
assert.ok(house.plan.ridge > 8 && house.plan.ridge < 10, `a two-storey house: ridge ${house.plan.ridge.toFixed(2)} m`);
assert.ok(triangles(house) < 38000, `the default house: ${triangles(house)} triangles`);
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

// Age. A new house has no gaps but its open front door (one box); more
// damage only opens more of them (every piece draws its fate whatever the
// damage) and takes porch boards away.
const trianglesOf = (building, role) => (building.parts.get(role)?.attributes.position.count ?? 0) / 3;
const fresh = buildBeachHouse({ damage: 0, sag: 0 });
assert.equal(trianglesOf(fresh, 'void'), 12, 'a new house has no holes but its open door');
let holes = 12;
for (const damage of [0.25, 0.5, 0.75, 1]) {
  const aged = buildBeachHouse({ damage, sag: 0 });
  assert.ok(trianglesOf(aged, 'void') >= holes, `damage ${damage}: holes only grow`);
  holes = trianglesOf(aged, 'void');
  if (damage === 1) assert.ok(trianglesOf(aged, 'deck') < trianglesOf(fresh, 'deck'), 'damage takes porch boards away');
  disposeBuilding(aged);
}
assert.ok(holes > 12, 'a derelict house has holes');
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

// Bikini Point's things rest on something, whatever the sliders: every board's
// lowest point on the sand (the one stuck in it 30 cm down) or on the porch
// boards; every pose a number; the same seed, the same mess.
const lowest = ({ settings, position, quaternion }) => {
  const turn = new THREE.Quaternion().fromArray(quaternion);
  return Math.min(...boardPoints(settings).map((point) => point.clone().applyQuaternion(turn).y)) + position[1];
};
const numbers = (camp) => JSON.stringify(camp, (key, value) => (typeof value === 'number' && !Number.isFinite(value) ? 'NaN' : value)).indexOf('NaN') < 0;
const campChecks = [['default', {}], ...Object.entries(HOUSE_RANGES).flatMap(([key, [min, max]]) => [[`${key} = ${min}`, { [key]: min }], [`${key} = ${max}`, { [key]: max }]])];
let things = 0;
for (const [label, settings] of campChecks) {
  const building = buildBeachHouse({ ...HOUSE_DEFAULTS, ...settings }), camp = houseCamp(building);
  assert.ok(numbers(camp), `${label}: the camp's poses are numbers`);
  assert.ok(camp.rings.every(({ paint }) => RING_PAINTS[paint]) && camp.boards.every(({ slot }) => CAMP_BOARDS[slot]), `${label}: rings painted, boards from their slots`);
  for (const board of camp.boards) {
    const low = lowest(board), floor = building.plan.floor;
    const onSand = board.slot === 5 ? Math.abs(low + 0.3) < 0.01 : low > -0.03 && low < 0.02, onPorch = low > floor - 0.35 && low < floor + 0.02;
    assert.ok(onSand || onPorch, `${label}: board ${board.slot} rests on something (${low.toFixed(3)})`);
  }
  things = camp.rings.length + camp.boards.length + camp.chairs.length + camp.flags.length + camp.line.washing.length + 2;
  disposeBuilding(building);
}
{
  const a = buildBeachHouse(), b = buildBeachHouse();
  assert.deepEqual(houseCamp(a), houseCamp(b), 'the same seed, the same mess');
  const shedThings = shedCamp(buildBeachShed());
  assert.ok(numbers(shedThings) && shedThings.boards.every((board) => lowest(board) > -0.03 && lowest(board) < 0.02), 'the shed\'s board stands on the sand');
}

console.log(`beach house: ${defaultTriangles} + ${shedTriangles} triangles, stairs ${house.plan.stairs.risers} × ${(house.plan.stairs.rise * 100).toFixed(0)} cm, ridge ${house.plan.ridge.toFixed(2)} m; ${Object.keys(HOUSE_RANGES).length * 2 + 2} slider ends hold; Bikini Point: ${things} things in place.`);
