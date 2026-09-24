import * as THREE from 'three';
import { randomSequence } from '../../plants/oleasterModel.js';
import { boardDimensions, bottomHeight, deckHeight, finLayout, halfWidth } from '../surfboard/boardShape.js';

// Bikini Point: a surf commune's things round the house and the shed, left
// the way young surfers leave them. Boards leaning on the porch front and on
// the rail from inside, one stuck in the sand, one dropped fins up; life
// rings hung on the rail by the stairs, on the wall by the door, on the shed,
// one propped on the sand, old ones stacked in a corner; the sign, red
// chairs, the lifeguards' flags, a washing line, a curtain in the open door. Poses only, as numbers (SurfCampModel.jsx draws them). Every piece rests on
// what it rests on — the sand, the boards, the rail as it is in section, the
// house as it has settled — and the seed moves things about, never repaints
// them: each board keeps its colours in its slot.

// A life ring, 75 cm across, 11 cm thick; its axis is its own +z. Painted
// as the old ones are, a colour and bands of another: [body, bands].
export const LIFE_RING = Object.freeze({ radius: 0.3, tube: 0.075, depth: 0.11 });
export const RING_PAINTS = Object.freeze([
  ['#c0392a', '#ece7dc'], ['#e8894a', '#9a9a92'], ['#26407a', '#ece7dc'], ['#ece7dc', '#26407a'],
  ['#9cc0e0', '#ece7dc'], ['#8fbfbf', '#ece7dc'], ['#d4502e', '#a09a8a'],
]);

const board = (length, width, thickness, deck, rail, stripe, stripes, fin = '#2b2d2e') => Object.freeze({
  surfboardLength: length, surfboardWidth: width, surfboardThickness: thickness,
  surfboardDeckColor: deck, surfboardRailColor: rail, surfboardStripeColor: stripe, surfboardStripes: stripes,
  surfboardStringerColor: '#c9a46a', surfboardFinColor: fin,
});
// The boards, by slot: shortboards, a fish-width mid, a cream longboard.
export const CAMP_BOARDS = Object.freeze([
  board(1.78, 0.5, 0.062, '#f2efe6', '#2a2e2e', '#0b0b0b', 2),
  board(2.75, 0.57, 0.075, '#e9dcbc', '#8a5a36', '#8a5a36', 0, '#8a5a36'),
  board(1.9, 0.52, 0.064, '#6cc3b5', '#f2efe6', '#f2efe6', 1, '#f2efe6'),
  board(2.2, 0.54, 0.068, '#f0c64a', '#c8452c', '#c8452c', 3),
  board(1.83, 0.51, 0.062, '#d65a45', '#f2efe6', '#f2efe6', 0, '#f2efe6'),
  board(2.4, 0.55, 0.07, '#4f7fa8', '#1e2a36', '#f2efe6', 2),
  board(1.75, 0.5, 0.06, '#e59aa6', '#f2efe6', '#2a2e2e', 1),
  board(1.95, 0.52, 0.064, '#26292b', '#f0c64a', '#f0c64a', 1, '#f0c64a'),
]);

// How wide what dries on the line is (campProps.js draws it).
const WASHING = { towel: 0.5, bottom: 0.3, bra: 0.4, top: 0.34, tee: 0.48 };

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const GAP = 0.004; // between a thing and what it leans on
const axis = (vector, angle) => new THREE.Quaternion().setFromAxisAngle(vector, angle);
const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

// Points on a board's skin — both faces, down the middle and just in from the
// rails, every 2.5 cm — and its fin tips, in its own frame: enough to rest it
// to a few millimetres.
const skins = new Map();
export function boardPoints(settings) {
  const dims = boardDimensions(settings), key = JSON.stringify(dims);
  if (!skins.has(key)) {
    const points = [], n = Math.ceil(dims.length / 0.025);
    for (let i = 0; i <= n; i += 1) {
      const u = 0.002 + (0.996 * i) / n, z = (u - 0.5) * dims.length, side = halfWidth(dims, u) * 0.96;
      for (const x of [-side, 0, side]) points.push(new THREE.Vector3(x, deckHeight(dims, x, z), z), new THREE.Vector3(x, bottomHeight(dims, x, z), z));
    }
    for (const fin of finLayout(dims)) points.push(new THREE.Vector3(0, -fin.depth, 0).applyQuaternion(fin.quaternion).add(fin.position));
    skins.set(key, points);
  }
  return skins.get(key);
}
const RING_POINTS = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2, out = LIFE_RING.radius + LIFE_RING.tube;
  return [-1, 1].map((s) => new THREE.Vector3(out * Math.cos(a), out * Math.sin(a), (s * LIFE_RING.depth) / 2));
}).flat();

// A place to rest a thing, in a frame on a face of the building: x along the
// face, y up, z out of it. `at` is the plan point on the face's line and
// `height` the frame's height there, both as built; `out` the face's outward
// normal in plan. The face's section — [from, to, how far out], heights as
// built — and the frame itself are carried by the settled building (`bend`).
function place(bend, [x, z], height, out, section = []) {
  const normal = new THREE.Vector3(out[0], 0, out[1]);
  const origin = new THREE.Vector3(...bend([x, height, z]));
  const wall = section.map(([from, to, d]) => {
    const [a, b] = [from, to].map((h) => new THREE.Vector3(...bend([x + out[0] * d, h, z + out[1] * d])).sub(origin));
    return [a.y, b.y, Math.max(a.dot(normal), b.dot(normal))];
  });
  return { origin, normal, along: new THREE.Vector3().crossVectors(Y, normal), wall };
}

// Rests `points` turned by `turn` (in the place's frame): down on the ground
// at height `ground`, or hung with its top at `top`; then back against the
// wall until it touches. The pose in the building's frame.
function rest(points, turn, where, { ground = 0, top = null, slide = 0 } = {}) {
  const turned = points.map((p) => p.clone().applyQuaternion(turn));
  const y = top === null ? ground - Math.min(...turned.map((p) => p.y)) : top - Math.max(...turned.map((p) => p.y));
  let z = where.wall.length ? -Infinity : 0;
  for (const p of turned) {
    for (const [from, to, out] of where.wall) if (p.y + y >= from && p.y + y <= to) z = Math.max(z, out - p.z);
  }
  if (z === -Infinity) z = 0;
  const position = where.origin.clone().addScaledVector(where.along, slide).addScaledVector(Y, y).addScaledVector(where.normal, z + GAP);
  const quaternion = basis(where.along, Y, where.normal).multiply(turn);
  return { position: position.toArray(), quaternion: quaternion.toArray() };
}

// A board stood on its tail, leaning `lean` back onto the wall, tipped `tip`
// along it, rolled `roll` onto a rail; its deck out, or its fins.
function standing(lean, tip, roll, deckOut) {
  const face = deckOut ? basis(new THREE.Vector3(-1, 0, 0), Z, Y) : basis(X, new THREE.Vector3(0, 0, -1), Y);
  return axis(Z, tip).multiply(axis(X, -lean)).multiply(face).multiply(axis(Z, roll));
}
// A board dropped fins up, lying on its deck on its nose and tail, turned `yaw`.
function dropped(points, yaw) {
  const flat = basis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), Z);
  const turned = points.map((p) => p.clone().applyQuaternion(flat));
  const low = (half) => turned.filter((p) => half * p.z > 0).reduce((a, b) => (b.y < a.y ? b : a));
  const nose = low(1), tail = low(-1);
  return axis(Y, yaw).multiply(axis(X, Math.atan2(nose.y - tail.y, nose.z - tail.z))).multiply(flat);
}
// A ring standing up, its face to the wall, leaning back `lean`, turned `spin`
// round its own axis (the red bands fall where they fall).
const upright = (lean, spin) => axis(X, -lean).multiply(axis(Z, spin));

const between = (random, a, b) => a + (b - a) * random();

// The house's things. Front porch bays counted from the stairs.
export function houseCamp({ plan }) {
  const random = randomSequence(plan.seed * 131 + 7);
  const { floor: F, bend, stairs, porch } = plan;
  const { front, side, size } = porch.posts;
  const faceZ = front[0][1] + size / 2, faceX = side.length ? side[0][0] + size / 2 : front.at(-1)[0] + size / 2;
  const railLine = front[0][1], sideLine = faceX - size / 2;
  const railCap = porch.railSection.at(-1)[1];
  const inside = porch.railSection.map(([a, b, d]) => [F + a, F + b, d]);
  const rings = [], boards = [];
  const put = (slot, pose) => boards.push({ slot, settings: CAMP_BOARDS[slot], ...pose });
  const lean = () => between(random, 0.2, 0.34), tip = () => between(random, -0.07, 0.07), roll = () => between(random, -0.12, 0.12);

  // On the rail by the stairs, hung outside by its line over the cap.
  const ringX = front[0][0] + size / 2 + LIFE_RING.radius + LIFE_RING.tube + 0.07 + random() * 0.3;
  rings.push({ paint: 0, ...rest(RING_POINTS, upright(-0.07, random() * 6.3), place(bend, [ringX, faceZ], F, [0, 1], porch.face), { top: railCap - 0.02 }) });
  // Boards on the sand against the porch front, a pair in the next bay and
  // one further along; one on the porch, on the rail from inside, the last bay.
  const room = (i) => front[i + 1][0] - front[i][0] - size, middle = (i) => (front[i][0] + front[i + 1][0]) / 2;
  const loose = (i, half) => between(random, -1, 1) * Math.max(0, room(i) / 2 - half);
  const outside = (slot, x, deckOut) => put(slot, rest(boardPoints(CAMP_BOARDS[slot]), standing(lean(), tip(), roll(), deckOut), place(bend, [x, faceZ], 0, [0, 1], porch.face), { ground: -0.015 }));
  const bays = front.length - 1;
  if (bays > 1) {
    if (room(1) > 1.45) {
      const x = middle(1) + loose(1, 0.95);
      outside(1, x - 0.32, random() < 0.7);
      outside(4, x + 0.32, random() < 0.5);
    } else outside(1, middle(1), true);
    if (bays > 2) outside(0, middle(2) + loose(2, 0.5), random() < 0.7);
    const last = bays - 1;
    put(2, rest(boardPoints(CAMP_BOARDS[2]), standing(lean(), tip(), roll(), random() < 0.6), place(bend, [middle(last) + loose(last, 0.5), railLine], F, [0, -1], inside), { ground: -0.004 }));
  }
  // On the side porch: a board on the rail from inside.
  const sideBay = [front.at(-1), ...side];
  if (sideBay.length > 1) {
    const z = sideBay[1][1] + size / 2 + 0.45 + random() * (sideBay[0][1] - sideBay[1][1] - size - 0.9);
    put(6, rest(boardPoints(CAMP_BOARDS[6]), standing(lean(), tip(), roll(), random() < 0.6), place(bend, [sideLine, z], F, [-1, 0], inside), { ground: -0.004 }));
  }
  // By the back corner of the side porch, on the sand: a ring propped on
  // the skirt, a board dropped fins up.
  const corner = porch.wrapBack;
  rings.push({ paint: 1, ...rest(RING_POINTS, upright(between(random, 0.25, 0.4), random() * 6.3), place(bend, [faceX, corner + 0.55 + random() * 0.3], 0, [1, 0], porch.face), { ground: -0.02 }) });
  const drop = new THREE.Vector3(faceX + between(random, 0.9, 1.5), 0, corner + between(random, -0.2, 0.6));
  put(3, rest(boardPoints(CAMP_BOARDS[3]), dropped(boardPoints(CAMP_BOARDS[3]), between(random, -0.6, 0.6) + Math.PI / 2), place(bend, [drop.x, drop.z], 0, [0, 1]), { ground: -0.01 }));
  // On the wall between the lantern and the window, on a nail.
  if (porch.wall.to - porch.wall.from > 2 * (LIFE_RING.radius + LIFE_RING.tube)) {
    const u = between(random, porch.wall.from + 0.4, porch.wall.to - 0.4);
    rings.push({ paint: 2, ...rest(RING_POINTS, upright(0, random() * 6.3), place(bend, [u, porch.wall.z], F + between(random, 1.9, 2.05), [0, 1], [[F, F + 2.4, 0]]), { top: 0 }) });
  }
  // Stuck in the sand off the foot of the stairs, nose up, a little askew.
  const [footX, , footZ] = stairs.foot;
  const facing = random() * Math.PI * 2;
  const stuck = place(bend, [footX - between(random, 0.8, 1.3), footZ - between(random, 1.2, 1.8)], 0, [Math.sin(facing), Math.cos(facing)]);
  put(5, rest(boardPoints(CAMP_BOARDS[5]), standing(between(random, 0.03, 0.12), tip(), roll(), true), stuck, { ground: -0.3 }));

  // A stack of old rings in the side porch's back corner, against the wall.
  const stack = new THREE.Vector3(...bend([plan.houseWidth / 2 + 0.52, F, corner + 0.62]));
  const paints = [3, 4, 5, 6].sort(() => random() - 0.5);
  paints.forEach((paint, k) => {
    const at = stack.clone().add(new THREE.Vector3(between(random, -0.03, 0.03), 0.058 + k * (LIFE_RING.depth + 0.002), between(random, -0.03, 0.03)));
    const turn = axis(Y, random() * 6.3).multiply(axis(X, -Math.PI / 2 + between(random, -0.03, 0.03)));
    rings.push({ paint, position: at.toArray(), quaternion: turn.toArray() });
  });

  // On the sand before the stairs, towards the sea: the Bikini Point sign
  // turned to whoever comes down them, two red chairs looking out, the
  // lifeguards' flags stuck in anyhow.
  const sign = { position: [footX + between(random, 0.2, 0.6), 0, footZ + between(random, 2.1, 2.5)], yaw: 0.64 + between(random, -0.15, 0.15), lean: between(random, -0.03, 0.03) };
  const chairs = [[1.7, 2.8], [2.6, 3.2]].map(([dx, dz]) => ({ position: [footX + dx + between(random, -0.2, 0.2), 0, footZ + dz + between(random, -0.2, 0.2)], yaw: between(random, -0.45, 0.45) }));
  const flags = [[-0.9, 10.3, 'pennant'], [2.3, 9.7, 'pennant'], [-6.5, 9.5, 'halves']].map(([x, z, kind]) => {
    const heading = random() * Math.PI * 2, tilt = between(random, 0.15, 0.45);
    return { foot: [x + between(random, -0.6, 0.6), -0.35, z + between(random, -0.6, 0.6)], up: [Math.sin(tilt) * Math.sin(heading), Math.cos(tilt), Math.sin(tilt) * Math.cos(heading)], length: 2.6, kind, phase: random() * 6.3 };
  });
  // A washing line from the side porch's back post along the house's side to
  // a pole in the sand.
  const post = side.at(-1) ?? front.at(-1);
  const pole = [faceX + between(random, 1.3, 1.8), post[1] - between(random, 3, 3.5)];
  const line = { a: bend([post[0] + size / 2 + 0.01, F + porch.railSection.at(-1)[1] + 0.3, post[1]]), b: [pole[0] + 0.02, 2.3, pole[1]], sag: 0.14, pole };
  // Spaced by their widths along the line, a hand's breadth between them.
  const kinds = ['towel', 'bottom', 'bra', 'top', 'tee', 'bottom'], length = Math.hypot(line.b[0] - line.a[0], line.b[2] - line.a[2]);
  const gap = (0.8 * length - kinds.reduce((sum, kind) => sum + WASHING[kind], 0)) / (kinds.length - 1);
  let along = 0.1 * length;
  const washing = kinds.map((kind) => {
    const t = (along + WASHING[kind] / 2) / length;
    along += WASHING[kind] + gap;
    return { kind, t: t + between(random, -0.01, 0.01), phase: random() * 6.3 };
  });
  // The curtain in the open front door, on a rod under the head casing.
  const door = plan.door;
  const curtain = { rod: door.rod, width: door.width - 0.04, height: door.height - 0.08 };
  return { rings, boards, sign, chairs, flags, line: { ...line, washing }, curtain };
}

// The shed's: a ring on the hut's front wall left of the door, a board on the
// sand against its side.
export function shedCamp({ plan }) {
  const random = randomSequence(plan.seed * 173 + 11);
  const { hut, deck: H, bend } = plan;
  const spot = hut.z0 + 0.1 + LIFE_RING.radius + LIFE_RING.tube + random() * 0.1;
  const rings = [{ paint: 4, ...rest(RING_POINTS, upright(0, random() * 6.3), place(bend, [hut.front, spot], H + between(random, 1.8, 1.95), [1, 0], [[0, H + hut.walls, 0.02]]), { top: 0 }) }];
  const side = place(bend, [between(random, -0.03, 0.05), hut.z1], 0, [0, 1], [[0, H, 0], [H, H + hut.walls, 0.02]]);
  const boards = [{ slot: 7, settings: CAMP_BOARDS[7], ...rest(boardPoints(CAMP_BOARDS[7]), standing(between(random, 0.2, 0.3), between(random, -0.04, 0.04), between(random, -0.1, 0.1), random() < 0.6), side, { ground: -0.015 }) }];
  return { rings, boards };
}
