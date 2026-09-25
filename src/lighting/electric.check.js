// Run: node src/lighting/electric.check.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { cableSchedule, centreOf, KIND, makeGrid, proposeCircuits, rankPanelSpots, RHO_CU, routeNetwork } from './electric.js';

const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} vs ${b} (±${tolerance})`);
const has = (net, kind, id) => net.conflicts.some((c) => c.kind === kind && c.ids.includes(id));
// Сетка 0,5 м, у которой целые метры — центры клеток.
const grid = (cols, rows, x0 = -5.25, z0 = -5.25) => makeGrid({ x0, z0, cell: 0.5, cols, rows });
const paint = (g, kind, inside) => { for (let i = 0; i < g.kind.length; i += 1) if (inside(...centreOf(g, i))) g.kind[i] = kind; };
const fixture = (id, x, z, extra) => ({ id, x, y: 0, z, circuit: 'c1', watts: 20, volts: 230, current: 'ac', pf: 1, control: ['switch'], rise: 0, ...extra });
const circuit = (id, extra) => ({ id, panel: 'p1', volts: 230, current: 'ac', breaker: null, section: null, control: 'switch', ...extra });
const route = (g, fixtures, extra = {}) => routeNetwork({ grid: g, panels: [{ id: 'p1', x: 0, y: 0, z: 0 }], circuits: [circuit('c1')], fixtures, ...extra });
const lines = [];

// Прямая: щиток в 0, пять приборов по 20 Вт 230 В через 10 м. Участки 10 м с
// токами 5, 4, 3, 2, 1 × 20/230 А; ΔU = Σ 2ρ·10·I_k / 1,5.
const line = route(grid(130, 21), [1, 2, 3, 4, 5].map((k) => fixture(`f${k}`, 10 * k, 0)));
const c = line.circuits[0];
near(c.planLength, 50, 0.5, 'straight line plan length');
const currents = c.segments.map((s) => s.current).sort((a, b) => b - a);
[0.435, 0.348, 0.261, 0.174, 0.087].forEach((I, k) => near(currents[k], I, 0.001, `segment ${k} current`));
const closed = currents.reduce((total, I) => total + (2 * RHO_CU * 10 * I) / 1.5, 0);
near(c.dropV, closed, closed * 0.01, 'drop matches the closed form');
assert.ok(c.section === 1.5 && c.breaker.amps === 6 && c.breaker.curve === 'B' && c.worst === 'f5', 'line: 1.5 mm² on B6, the far end is the worst');
// Кабель: 50 + глубина 0,6 × (щиток 1 + четыре проходных × 2 + последний 1) + концы 0,5 × 2 × 5, и 5 % слабины.
near(c.cableLength, (50 + 6 + 5) * 1.05, 1e-6, 'line cable length');
const schedule = cableSchedule(line);
assert.deepEqual(schedule.cables, [{ section: 1.5, length: 64.5 }], 'schedule rounds the cable up to 0.5 m');
assert.ok(schedule.trenches.length === 1 && schedule.trenches[0].surface === 'open' && schedule.trenches[0].length === 50, 'one open-ground trench of 50 m');
lines.push(`line 5 × 20 W 230 V: plan ${c.planLength} m, currents ${currents.map((I) => I.toFixed(3)).join(' ')} A, drop ${c.dropV.toFixed(4)} V (closed form ${closed.toFixed(4)}), ${c.section} mm² ${c.breaker.curve}${c.breaker.amps}, cable ${c.cableLength.toFixed(2)} m`);

// 24 В постоянного: 10 × 6 Вт через 3 м. Σ I_k = 0,25 · 55 = 13,75 А, 2ρ·3·13,75 =
// 1,856 В·мм²: 1,5 → 5,2 %, 2,5 → 3,09 %, 4 → 1,93 % — берёт 4.
const lowInput = [grid(130, 21), Array.from({ length: 10 }, (_, k) => fixture(`d${k + 1}`, 3 * (k + 1), 0, { watts: 6, volts: 24, current: 'dc', pf: undefined })), { circuits: [circuit('c1', { volts: 24, current: 'dc' })] }];
const low = route(...lowInput).circuits[0];
assert.ok(low.section === 4 && low.sectionAuto, `24 V picks 4 mm² (${low.section})`);
near(low.dropV, (2 * RHO_CU * 3 * 13.75) / 4, 1e-9, '24 V drop at 4 mm²');
// network.js передаёт { depth: site.depth, … } и из пустых настроек участка —
// undefined не затирает значения по умолчанию.
const blank = route(lowInput[0], lowInput[1], { ...lowInput[2], options: { depth: undefined, slack: undefined, tail: undefined, drop: undefined } }).circuits[0];
assert.ok(blank.section === 4 && blank.cableLength === low.cableLength, `undefined options fall back to defaults (${blank.section} mm², ${blank.cableLength} m)`);
lines.push(`24 V dc 10 × 6 W: ${low.section} mm², drop ${low.dropV.toFixed(3)} V = ${low.dropPct.toFixed(2)} % (2.5 mm² would be ${((2 * RHO_CU * 3 * 13.75) / 2.5 / 24 * 100).toFixed(2)} %)`);

// Препятствия: щиток в 0, прибор в 20 м.
const site = () => grid(60, 81, -5.25, -20.25);
const far = [fixture('f1', 20, 0)];
const walled = site();
paint(walled, KIND.building, (x, z) => x >= 8 && x <= 12 && Math.abs(z) <= 5);
const around = route(walled, far).circuits[0];
assert.ok(around.planLength > 21 && !around.surface.building, `a house forces a detour (${around.planLength.toFixed(2)} m)`);
// Фонарь на фасаде: своя клетка — дом, кабель по стене до ближайшей клетки у стены.
const facade = route(walled, [fixture('w1', 7.9, 3)]).circuits[0];
near(facade.wallLength, 0.4, 1e-9, 'facade light runs 0.4 m up the wall');
const shortBed = site();
paint(shortBed, KIND.bed, (x, z) => x >= 9.5 && x <= 10 && Math.abs(z) <= 1);
const skirt = route(shortBed, far);
assert.ok(!skirt.circuits[0].surface.bed && skirt.circuits[0].planLength > 20 && !has(skirt, 'bed', 'c1'), 'a short bed is skirted');
const longBed = site();
paint(longBed, KIND.bed, (x, z) => x >= 9.5 && x <= 10 && Math.abs(z) <= 15);
const cross = route(longBed, far);
near(cross.circuits[0].surface.bed, 1, 1e-9, 'a long bed is crossed, 1 m of it');
near(cross.circuits[0].planLength, 20, 1e-9, 'crossing keeps the line straight');
assert.ok(has(cross, 'bed', 'c1'), 'crossing a bed is reported');
lines.push(`obstacles: house detour ${around.planLength.toFixed(2)} m vs 20 straight; facade wall run ${facade.wallLength.toFixed(2)} m; short bed skirted for +${(skirt.circuits[0].planLength - 20).toFixed(2)} m (crossing would cost +7); long bed crossed, ${cross.circuits[0].surface.bed} m in the bed`);

// Общая траншея: две цепи в одну сторону.
const shared = {
    grid: grid(130, 21), panels: [{ id: 'p1', x: 0, y: 0, z: 0 }], circuits: [circuit('c1'), circuit('c2')],
    fixtures: [fixture('a1', 10, 0), fixture('a2', 20, 0), fixture('b1', 15, 3, { circuit: 'c2' }), fixture('b2', 20, 3, { circuit: 'c2' })],
};
const both = routeNetwork(shared);
const [c1, c2] = both.circuits;
assert.ok(both.totals.trenchLength < c1.planLength + c2.planLength, 'shared trench is dug once');
const common = both.trenches.filter((t) => t.circuits.join() === 'c1,c2');
assert.ok(common.length > 0, 'the shared trench lists both circuits');
lines.push(`shared: trenches ${both.totals.trenchLength.toFixed(2)} m < cables' plan ${c1.planLength.toFixed(2)} + ${c2.planLength.toFixed(2)} m; common ${common.reduce((s, t) => s + t.length, 0).toFixed(2)} m for c1+c2`);
// Одинаковый вход — одинаковый выход; щиток сдвинут — трассы другие.
assert.equal(JSON.stringify(routeNetwork(shared)), JSON.stringify(both), 'deterministic');
const moved = routeNetwork({ ...shared, panels: [{ id: 'p1', x: 0, y: 0, z: 4 }] });
assert.notEqual(JSON.stringify(moved.trenches), JSON.stringify(both.trenches), 'moving the panel reroutes');
assert.ok(moved.circuits[0].planLength !== c1.planLength, 'moving the panel changes the length');

// Закреплённая Г-образная трасса: 20 м по ней дешевле 14,1 м наискось.
const square = grid(60, 60);
const corner = [fixture('f1', 10, 10)];
const free = route(square, corner).circuits[0];
const pinned = route(square, corner, { runs: [{ id: 'r1', points: [[0, 0], [10, 0], [10, 10]] }, { id: 'r2', points: [[-3, 15], [-3, 20]] }] });
near(free.planLength, 10 * Math.SQRT2, 1e-9, 'free route is the diagonal');
near(pinned.circuits[0].planLength, 20, 1e-9, 'the pinned L is followed');
assert.ok(pinned.trenches.some((t) => t.pinned && t.circuits.join() === 'c1'), 'the pinned trench carries c1');
assert.ok(has(pinned, 'run', 'r2') && !has(pinned, 'run', 'r1'), 'the far pinned run is reported unused, the L is not');
// Две закреплённые траншеи во всю ширину в 0,5 м друг от друга — не стена:
// поперёк шаг по полной цене. Трасса наискось 12,07 м; с ними раньше — обход
// концов 53,4 м, а во всю ширину — «недостижим».
const toFar = [fixture('f1', 5, 10)];
const parallel = route(square, toFar, { runs: [{ id: 'r1', points: [[-6, 5], [30, 5]] }, { id: 'r2', points: [[-6, 5.5], [30, 5.5]] }] });
assert.ok(!has(parallel, 'unreachable', 'f1'), 'two adjacent trenches can be crossed');
assert.ok(parallel.circuits[0].planLength < 16, `crossing them is no detour (${parallel.circuits[0].planLength.toFixed(2)} m)`);
// Закреплённая трасса по стене дома: клетки здания на ней проходимы, но это
// не траншея — ни конфликта «run», ни «здания» в ведомости траншей.
const house = site();
paint(house, KIND.building, (x, z) => z >= 5 && z <= 12 && x >= -2 && x <= 14);
const wallRun = route(house, [fixture('w1', 6, 5.1), fixture('w2', 12, 5.1)], { panels: [{ id: 'p1', x: 0, y: 1, z: 5.1 }], runs: [{ id: 'wall1', kind: 'wall', points: [[0, 5.2], [12, 5.2]] }] });
assert.ok(!has(wallRun, 'run', 'wall1') && !has(wallRun, 'unreachable', 'w2'), 'the wall run is used');
near(wallRun.circuits[0].planLength, 12, 1e-9, 'the cable follows the wall run');
assert.ok(wallRun.trenches.length === 0 && cableSchedule(wallRun).trenches.length === 0, 'nothing is dug along a wall');
// Точка трассы без числа — разрыв, а не вечный цикл Брезенхэма (отдельный
// процесс: зависание — провал, а не тишина).
const probe = `import { makeGrid, routeNetwork } from ${JSON.stringify(new URL('./electric.js', import.meta.url).href)};
const n = routeNetwork({ grid: makeGrid({ x0: 0, z0: 0, cell: 0.5, cols: 60, rows: 60 }), runs: [{ id: 'a', points: [[0, 0], [NaN, 3]] }, { id: 'b', points: [[0, 0], [3]] }, { id: 'c', points: [[0, 0], [Infinity, 0]] }] });
if (n.conflicts.filter((c) => c.kind === 'run').length !== 3) process.exit(2);`;
assert.equal(spawnSync(process.execPath, ['--input-type=module', '-e', probe], { timeout: 5000 }).status, 0, 'a run with NaN, missing or infinite coordinates finishes');
lines.push(`pinned: free ${free.planLength.toFixed(2)} m, along the L ${pinned.circuits[0].planLength.toFixed(2)} m; far run → 'run'; across two adjacent trenches ${parallel.circuits[0].planLength.toFixed(2)} m; along a wall ${wallRun.circuits[0].planLength.toFixed(2)} m, trenches ${wallRun.trenches.length}`);

// Конфликты.
const moat = site();
paint(moat, KIND.water, (x, z) => { const d = Math.max(Math.abs(x - 15), Math.abs(z - 10)); return d >= 1.5 && d <= 2; });
const table = { B16: 3 };
const bad = routeNetwork({
    grid: moat, panels: [{ id: 'p1', x: 0, y: 0, z: 0 }],
    circuits: [circuit('c1', { breaker: { curve: 'B', amps: 16 } }), circuit('c2'), circuit('c3', { panel: 'p9' })],
    fixtures: [
        ...[1, 2, 3, 4].map((k) => fixture(`t${k}`, 2 * k, -5, { perBreaker: table })),
        fixture('v1', 5, 5, { circuit: 'c2', volts: 24, current: 'dc' }),
        fixture('k1', 6, 5, { circuit: 'c2', control: ['dali'] }),
        fixture('u1', 7, 5, { circuit: null }),
        fixture('i1', 15, 10, { circuit: 'c2' }),
    ],
});
assert.ok(has(bad, 'breaker', 'c1') && bad.circuits[0].perBreaker === 'over', 'four drivers on a B16 that takes three');
assert.ok(has(bad, 'volts', 'v1'), '24 V fixture on a 230 V circuit');
assert.ok(has(bad, 'control', 'k1'), 'DALI-only fixture on a switched circuit');
assert.ok(has(bad, 'unassigned', 'u1'), 'fixture on no circuit');
assert.ok(has(bad, 'panel', 'c3'), 'circuit with a missing panel');
assert.ok(has(bad, 'unreachable', 'i1'), 'fixture behind a moat');
assert.equal(bad.circuits[1].perBreaker, 'unknown', 'no data sheet table — not checked');
lines.push(`conflicts: ${[...new Set(bad.conflicts.map((x) => x.kind))].join(', ')}`);

// Места щитка: из середины линии дерево короче, чем с края.
const spots = rankPanelSpots({ grid: grid(130, 21), fixtures: [1, 2, 3, 4, 5].map((k) => fixture(`f${k}`, 10 * k, 0)), candidates: [{ x: 0, z: 0 }, { x: 30, z: 4 }, { x: 30, z: 0 }] });
assert.ok(spots[0].x === 30 && spots[0].z === 0 && spots[0].length === 40 && spots[2].x === 0 && spots[2].length === 50, 'panel spots ranked by tree cost');
lines.push(`panel spots: ${spots.map((p) => `(${p.x}, ${p.z}) ${p.length.toFixed(2)} m / cost ${p.cost.toFixed(2)}`).join(', ')}`);

// Цепи по предложению: 24 В отдельно от 230; общий протокол — dali.
const offer = proposeCircuits({
    panels: [{ id: 'p1', x: 0, z: 0 }],
    fixtures: [fixture('m1', 5, 0, { control: ['switch', 'dali'] }), fixture('m2', 0, 5, { control: ['dali'] }), fixture('m3', -5, 0, { control: ['dali'] }), fixture('s1', 3, 3, { volts: 24, current: 'dc' })],
});
assert.ok(offer.circuits.length === 2 && offer.assign.m1 === offer.assign.m2 && offer.assign.m2 === offer.assign.m3 && offer.assign.s1 !== offer.assign.m1, 'groups by voltage');
assert.equal(offer.circuits.find((x) => x.id === offer.assign.m1).control, 'dali', 'the common protocol wins');
// Ничья — по имени протокола, не по порядку в списке прибора.
const tie = proposeCircuits({ panels: [{ id: 'p1', x: 0, z: 0 }], fixtures: [fixture('a', 1, 0, { control: ['switch', 'dali'] }), fixture('b', 2, 0, { control: ['dali', 'switch'] })] });
assert.ok(tie.circuits.length === 1 && tie.assign.a === tie.assign.b, 'a protocol tie does not split the group');
// Прибор без протоколов — на 'switch' в предложении и без конфликта при расчёте.
const plain = [fixture('a', 1, 0, { control: [] }), fixture('b', 2, 0, { control: [] })];
const plainPlan = proposeCircuits({ panels: [{ id: 'p1', x: 0, z: 0 }], fixtures: plain });
for (const f of plain) f.circuit = plainPlan.assign[f.id];
assert.ok(!has(route(grid(30, 30), plain, { circuits: plainPlan.circuits }), 'control', 'a'), 'the proposal and the check read an empty control list alike');
// 24 В: 20 × 50 Вт — 41,7 А одной цепью; предложение режет по току 12,8 А.
const heavy = Array.from({ length: 20 }, (_, k) => fixture(`h${k}`, 1 + k, 0, { watts: 50, volts: 24, current: 'dc', pf: undefined, circuit: null }));
const heavyPlan = proposeCircuits({ panels: [{ id: 'p1', x: 0, z: 0 }], fixtures: heavy });
for (const f of heavy) f.circuit = heavyPlan.assign[f.id];
const heavyNet = route(grid(60, 21), heavy, { circuits: heavyPlan.circuits });
assert.ok(heavyPlan.circuits.length === 4 && heavyNet.circuits.every((x) => x.currentA <= 12.8) && !heavyNet.conflicts.some((x) => x.kind === 'breaker'), `24 V circuits are cut by current (${heavyNet.circuits.map((x) => x.currentA.toFixed(1)).join(', ')} A)`);
lines.push(`proposal: protocol tie → ${tie.circuits.length} circuit '${tie.circuits[0].control}'; 20 × 50 W 24 V → ${heavyPlan.circuits.length} circuits of ${heavyNet.circuits.map((x) => `${x.currentA.toFixed(1)} A ${x.breaker.curve}${x.breaker.amps} ${x.section} mm²`).join(', ')}`);

// Скорость: 160 × 160 клеток (80 × 80 м), дом со щитком на фасаде, сарай, пруд,
// цветники, дорожка; 120 приборов, цепи — предложением.
const big = makeGrid({ x0: -40, z0: -40, cell: 0.5, cols: 160, rows: 160 });
paint(big, KIND.paving, (x, z) => Math.abs(z) < 1.5);
paint(big, KIND.building, (x, z) => Math.abs(x) <= 10 && z >= 5 && z <= 20);
paint(big, KIND.building, (x, z) => x >= 25 && x <= 32 && z >= -30 && z <= -22);
paint(big, KIND.water, (x, z) => Math.hypot(x + 25, z + 20) < 6);
paint(big, KIND.bed, (x, z) => (Math.abs(x + 20) < 2 && z > 5 && z < 30) || (Math.abs(z - 30) < 1.5 && x > -5 && x < 30));
paint(big, KIND.roots, (x, z) => Math.hypot(x - 20, z - 10) < 4);
let seed = 7;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const many = [];
while (many.length < 120) {
    const x = -38 + 76 * random(), z = -38 + 76 * random();
    const kind = big.kind[Math.floor((z + 40) / 0.5) * 160 + Math.floor((x + 40) / 0.5)];
    if (kind !== KIND.building && kind !== KIND.water) many.push(fixture(`g${many.length + 1}`, x, z, { circuit: null }));
}
const panels = [{ id: 'p1', x: 0, y: 0, z: 5.1 }];
const plan = proposeCircuits({ fixtures: many, panels });
assert.ok(plan.circuits.length === 6 && many.every((f) => plan.assign[f.id]), `120 fixtures → 6 circuits (${plan.circuits.length})`);
for (const f of many) f.circuit = plan.assign[f.id];
const t0 = performance.now();
const garden = routeNetwork({ grid: big, panels, circuits: plan.circuits, fixtures: many });
const ms = performance.now() - t0;
assert.ok(ms < 1500, `routes in ${ms.toFixed(0)} ms`);
assert.ok(garden.circuits.every((x) => x.fixtures.length === 20 && x.wallLength > 0), 'every circuit leaves the facade panel down the wall');
assert.ok(garden.totals.trenchLength < garden.circuits.reduce((s, x) => s + x.planLength, 0), 'circuits share trenches');
lines.push(`160 × 160 grid, 120 fixtures on 6 circuits: ${ms.toFixed(0)} ms, trenches ${garden.totals.trenchLength.toFixed(1)} m for ${garden.circuits.reduce((s, x) => s + x.planLength, 0).toFixed(1)} m of cable plan, ${garden.conflicts.length} conflicts (${[...new Set(garden.conflicts.map((x) => x.kind))].join(', ') || 'none'})`);

console.log(`electric:\n  ${lines.join('\n  ')}`);
