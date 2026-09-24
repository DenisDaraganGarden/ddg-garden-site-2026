// Run: node src/walk/walk.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWalkGround, groundHeight, rayDistance } from './walkGround.js';
import { createWalk, resetWalk, stepWalk } from './walkPlay.js';
import { normalizeWalkStart } from './settings.js';

// Двор: плита, лестница в пять ступеней по 17 см на площадку 0,85 м, стена,
// навес на 2,8 м, подиум 0,45 м.
const root = new THREE.Group();
const box = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
    mesh.position.set(x, y + h / 2, z);
    root.add(mesh);
};
box(30, 0.2, 30, 0, -0.2, 0);
for (let k = 0; k < 5; k += 1) box(2, 0.17 * (k + 1), 0.3, 0, 0, 2 + 0.3 * k + 0.15);
box(2, 0.85, 3, 0, 0, 3.5 + 1.5);
box(0.2, 2.5, 12, 3, 0, 0);
box(3, 0.2, 3, -5, 2.6, -3);
box(1.5, 0.45, 1.2, -5, 0, 4.4);
const g = buildWalkGround(root);
assert.equal(g.count, 10 * 12, 'ten boxes, twelve triangles each');

assert.ok(Math.abs(groundHeight(g, 0, 0, 1)) < 1e-6, 'the slab');
assert.ok(Math.abs(groundHeight(g, 0, 2.75, 1) - 0.51) < 1e-6, 'the third step');
assert.ok(Math.abs(groundHeight(g, -5, -3, 1.5)) < 1e-6, 'under the roof the floor, not the roof');
assert.ok(Math.abs(rayDistance(g, 0, 1, 0, 1, 0, 0, 5) - 2.9) < 1e-6, 'a ray meets the wall');

const walk = createWalk();
const run = (seconds, input) => { for (let t = 0; t < seconds; t += 1 / 60) stepWalk(walk, { run: 0, amount: 0, moveYaw: 0, ...input }, g, 1 / 60); };

// Вверх по лестнице на площадку.
resetWalk(walk, g, { x: 0, y: 0, z: 0, yaw: 0 });
run(5, { amount: 1, moveYaw: 0 });
assert.ok(Math.abs(walk.walker.groundY - 0.85) < 0.02, `up the stairs onto the landing (${walk.walker.groundY.toFixed(3)} m)`);
assert.ok(walk.mode === 'walk', 'climbed on foot, not by falling or jumping');

// И вниз — по ступеням, не прыжком.
let flewDown = false;
for (let t = 0; t < 5; t += 1 / 60) { stepWalk(walk, { amount: 1, moveYaw: Math.PI, run: 0 }, g, 1 / 60); flewDown ||= walk.mode === 'air'; }
assert.ok(!flewDown && Math.abs(walk.walker.groundY) < 0.02 && walk.walker.z < 1.5, `down the stairs step by step (${walk.walker.groundY.toFixed(3)} m, z ${walk.walker.z.toFixed(2)})`);

// В стену — стоп у неё.
resetWalk(walk, g, { x: 0, y: 0, z: -3, yaw: Math.PI / 2 });
run(4, { amount: 1, moveYaw: Math.PI / 2 });
assert.ok(walk.walker.x < 2.9 - 0.2 && walk.walker.x > 2, `stops at the wall (x ${walk.walker.x.toFixed(2)})`);
// Косо в стену — скользит вдоль неё.
const z0 = walk.walker.z;
run(2, { amount: 1, moveYaw: Math.PI / 4 });
assert.ok(walk.walker.z - z0 > 1, `slides along the wall (${(walk.walker.z - z0).toFixed(2)} m)`);

// Под навесом ходит по полу.
resetWalk(walk, g, { x: -5, y: 0, z: -6, yaw: 0 });
run(4, { amount: 1, moveYaw: 0 });
assert.ok(walk.walker.z > -1 && Math.abs(walk.walker.groundY) < 0.01, `walks under the roof on the floor (z ${walk.walker.z.toFixed(2)}, y ${walk.walker.groundY.toFixed(2)})`);

// Подиум — уступ: не проходит; упёршись, прыжком вперёд — на него.
resetWalk(walk, g, { x: -5, y: 0, z: 2.5, yaw: 0 });
run(3, { amount: 1, moveYaw: 0 });
assert.ok(walk.walker.z < 3.8 && Math.abs(walk.walker.groundY) < 0.01, `stops at the podium (z ${walk.walker.z.toFixed(2)})`);
stepWalk(walk, { amount: 1, moveYaw: 0, run: 0, jump: true }, g, 1 / 60);
for (let t = 0; t < 1.5; t += 1 / 60) stepWalk(walk, { amount: walk.mode === 'walk' ? 0 : 1, moveYaw: 0, run: 0 }, g, 1 / 60);
assert.ok(Math.abs(walk.walker.groundY - 0.45) < 0.02 && walk.mode === 'walk', `jumps onto the podium (${walk.walker.groundY.toFixed(3)} m, ${walk.mode})`);

// С края площадки — падает и приземляется на плиту.
resetWalk(walk, g, { x: 0, y: 0.85, z: 5, yaw: Math.PI / 2 });
let flew = false;
for (let t = 0; t < 4; t += 1 / 60) { stepWalk(walk, { amount: 1, moveYaw: Math.PI / 2, run: 0 }, g, 1 / 60); flew ||= walk.mode === 'air'; }
assert.ok(flew && walk.mode === 'walk' && Math.abs(walk.walker.groundY) < 0.02, `off the edge he falls and lands on the slab (${walk.walker.groundY.toFixed(3)} m)`);

// От глаз назад — пятится лицом вперёд.
resetWalk(walk, g, { x: -8, y: 0, z: 0, yaw: 0 });
run(1.5, { amount: 1, moveYaw: Math.PI, faceYaw: 0, instant: true });
assert.ok(walk.walker.z < -0.4 && Math.abs(walk.walker.yaw) < 1e-6, `first person backs up facing ahead (z ${walk.walker.z.toFixed(2)}, yaw ${walk.walker.yaw.toFixed(2)})`);

// Старт: мусор — нет старта; числа округлены, лицо — в пределах полуоборота.
assert.equal(normalizeWalkStart(null), null, 'no start');
assert.equal(normalizeWalkStart({ x: 'a', y: 0, z: 0 }), null, 'a broken start is none');
const start = normalizeWalkStart({ x: 0.23456789, y: 0.85, z: 5, yaw: 7 });
assert.ok(start.x === 0.2346 && Math.abs(start.yaw - (7 - 2 * Math.PI)) < 1e-4, `a start keeps its place and faces within half a turn (${JSON.stringify(start)})`);
// С него он и встаёт: на площадке, лицом куда смотрит значок.
resetWalk(walk, g, start);
assert.ok(Math.abs(walk.walker.groundY - 0.85) < 1e-6 && Math.abs(walk.walker.yaw - start.yaw) < 1e-9, 'he stands on the start, facing its way');

// Кости — числа: ни одного NaN за всё это.
assert.ok(walk.bodies.every((body) => [...body.x, ...body.q].every(Number.isFinite)), 'every bone is a number');

console.log('walk: up five steps onto a landing and down again, stopped by a wall and sliding along it, a floor under a roof, a podium to jump onto, a fall off an edge, backing up in first person, standing on the start');
