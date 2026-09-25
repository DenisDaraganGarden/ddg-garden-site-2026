// Освещение сада для агента (docs/garden-lighting-2026-09-25.md): тот же
// расчёт, что в редакторе, — из файла проекта, без сцены. Агент собирает
// световой проект, а длины, нагрузки и люксы считают эти функции, не он.
//
//   node scripts/lighting.mjs <проект> report [--json]
//        светильники, щитки, цепи с длинами, нагрузками, ΔU, сечениями и
//        автоматами, траншеи по покрытиям, конфликты, поля «догадка» у типов;
//   node scripts/lighting.mjs <проект> lux x,y,z [nx,ny,nz]
//        освещённость точки поверхности (лк) и кто её даёт;
//   node scripts/lighting.mjs <проект> panels x,z x,z …
//        места для щитка по цене траншей до всех приборов;
//   node scripts/lighting.mjs <проект> circuits [--apply]
//        разложить неподключённые приборы по цепям у ближайших щитков;
//   node scripts/lighting.mjs <проект> apply план.json [--force]
//        записать план: {fixtures, panels, circuits, runs, surfaces, site, remove}
//        — новые добавляются (by: 'agent'), с тем же id — правятся;
//        утверждённые (locked) без --force не трогаются, а называются;
//        светильник или щиток без y встаёт на землю по сетке участка.
//
// Трассы считаются по сетке участка, которую редактор кладёт в папку проекта
// (site-grid.json), когда модель загружена: нет сетки — открыть проект в
// редакторе. Запись — через хранилище с base: открытый редактор подхватит
// правку, когда окно вернётся в фокус.
import { projects } from './projectStore.mjs';
import { listLuminaires } from './luminaireLibrary.mjs';
import { BUILTIN_LUMINAIRES } from '../src/lighting/types.js';
import { normalizeLightingSettings, normalizeLightingCircuit, normalizeLightingFixture, normalizeLightingPanel, normalizeLightingRun } from '../src/lighting/settings.js';
import { fixtureLabels, gardenLights, typePhotometry } from '../src/lighting/fixtures.js';
import { illuminance } from '../src/lighting/photometry.js';
import { cableSchedule, cellOf, proposeCircuits, rankPanelSpots } from '../src/lighting/electric.js';
import { electricInputs, lightingNetwork } from '../src/lighting/network.js';
import { decodeGrid } from '../src/lighting/gridCodec.js';

const [id, command = 'report', ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const args = rest.filter((arg) => !arg.startsWith('--'));
if (!id) {
    console.error('node scripts/lighting.mjs <проект> report|lux|panels|circuits|apply …');
    process.exit(1);
}

const project = await projects.read(id);
if (!project) { console.error(`Проекта «${id}» нет.`); process.exit(1); }
const types = new Map([...BUILTIN_LUMINAIRES, ...(await listLuminaires())].map((type) => [type.id, type]));
const settings = { ...project.settings, ...normalizeLightingSettings(project.settings) };
const grid = decodeGrid(await projects.readSiteGrid(id));
const numbers = (text) => String(text ?? '').split(',').map(Number);
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// Запись с base; чужая правка между чтением и записью — ещё раз, три попытки.
async function write(patch) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await projects.read(id);
        const result = await projects.save(id, { settings: { ...current.settings, ...patch(current.settings) }, base: current.updated });
        if (!result?.conflict) return result;
    }
    throw new Error('Проект всё время меняется снаружи — не записано.');
}

// Поля типа, которые агент угадал: видны в ведомости, чтобы не выдавать за паспорт.
const guesses = (type) => Object.entries(type.source ?? {}).filter(([, from]) => from === 'guess').map(([field]) => field);

function report() {
    const labels = fixtureLabels(settings.lightingFixtures, types);
    const network = lightingNetwork(settings, types, grid);
    const circuitName = new Map(settings.lightingCircuits.map((circuit) => [circuit.id, circuit.name]));
    const used = new Map();
    for (const fixture of settings.lightingFixtures) used.set(fixture.type, (used.get(fixture.type) ?? 0) + 1);
    const data = {
        fixtures: settings.lightingFixtures.map((f) => ({ label: labels.get(f.id), id: f.id, type: f.type, x: f.x, y: f.y, z: f.z, circuit: f.circuit ?? null, dim: f.dim, target: f.target ?? null, locked: f.locked === true, by: f.by, note: f.note ?? '' })),
        types: [...used].map(([typeId, count]) => {
            const type = types.get(typeId);
            return type ? { id: typeId, name: type.ru, count, watts: type.power?.watts, lumens: type.optics?.lumens, volts: type.power?.volts, guessed: guesses(type) } : { id: typeId, count, missing: true };
        }),
        panels: settings.lightingPanels,
        circuits: network?.circuits.map((c) => ({ id: c.id, name: circuitName.get(c.id), fixtures: c.fixtures.map((f) => labels.get(f)), loadW: round(c.loadW), currentA: round(c.currentA, 2), cable: round(c.cableLength), section: c.section, breaker: `${c.breaker.curve}${c.breaker.amps}`, dropPct: round(c.dropPct, 2), worst: labels.get(c.worst), perBreaker: c.perBreaker })) ?? null,
        trenches: network ? cableSchedule(network) : null,
        totals: network?.totals ?? null,
        conflicts: network?.conflicts ?? null,
        grid: grid ? `${grid.cols}×${grid.rows} по ${grid.cell} м` : null,
    };
    if (flags.has('--json')) { console.log(JSON.stringify(data, null, 2)); return; }
    console.log(`${project.name}: ${data.fixtures.length} светильников, ${data.panels.length} щитков, ${settings.lightingCircuits.length} цепей`);
    for (const type of data.types) {
        const known = types.get(type.id);
        const note = known?.generic ? ' — заготовка: все числа ориентировочные' : type.guessed?.length ? ` — догадка: ${type.guessed.join(', ')}` : '';
        console.log(`  ${type.missing ? `${type.id} — типа нет в библиотеке` : `${type.name} (${type.id}) × ${type.count}: ${type.lumens} лм, ${type.watts} Вт, ${type.volts} В`}${note}`);
    }
    for (const f of data.fixtures) console.log(`  ${f.label.padEnd(6)} ${f.type.padEnd(16)} ${[f.x, f.y, f.z].map((v) => v.toFixed(2)).join(', ').padEnd(24)} ${f.circuit ?? '—'}${f.locked ? ' утверждён' : ''}${f.note ? ` · ${f.note}` : ''}`);
    if (!grid) { console.log('Сетки участка нет: откройте проект в редакторе — он положит её, когда модель загрузится.'); return; }
    for (const c of data.circuits) console.log(`  ${c.name ?? c.id}: ${c.fixtures.length} шт., ${c.loadW} Вт, ${c.currentA} А, кабель ${c.cable} м ${c.section} мм², ${c.breaker}, ΔU ${c.dropPct}% (хуже всего ${c.worst}), автомат по паспорту: ${{ ok: 'проходит', over: 'больше допустимого', unknown: 'не проверено — пусковые токи по паспорту драйвера' }[c.perBreaker]}`);
    console.log(`  траншеи ${round(data.totals.trenchLength)} м: ${data.trenches.trenches.map((t) => `${t.ru} ${t.length}`).join(', ') || '—'}`);
    console.log(`  кабель: ${data.trenches.cables.map((c) => `${c.section} мм² — ${c.length} м`).join(', ') || '—'}`);
    for (const conflict of data.conflicts) console.log(`  ! ${conflict.ru}`);
}

function lux() {
    const [x, y, z] = numbers(args[0]), normal = args[1] ? numbers(args[1]) : [0, 1, 0];
    const labels = fixtureLabels(settings.lightingFixtures, types);
    const { lights } = gardenLights(settings.lightingFixtures, types);
    const parts = lights.map((light) => {
        const type = types.get(settings.lightingFixtures.find((f) => f.id === light.id).type);
        return { label: labels.get(light.id), lux: illuminance({ ...light, fn: typePhotometry(type).fn }, [x, y, z], normal) };
    }).filter((part) => part.lux > 0.05).sort((a, b) => b.lux - a.lux);
    console.log(`${round(parts.reduce((sum, part) => sum + part.lux, 0))} лк в (${x}, ${y}, ${z}): ${parts.slice(0, 8).map((part) => `${part.label} ${round(part.lux)}`).join(', ') || 'света нет'}`);
}

async function main() {
    if (command === 'report') return report();
    if (command === 'lux') return lux();
    if (!grid && command !== 'apply') { console.error('Сетки участка нет: откройте проект в редакторе.'); process.exit(1); }
    if (command === 'panels') {
        const { fixtures } = electricInputs(settings, types, grid);
        for (const spot of rankPanelSpots({ grid, fixtures, candidates: args.map((pair) => { const [x, z] = numbers(pair); return { x, z }; }) })) console.log(`  (${spot.x}, ${spot.z}): траншей ${round(spot.length)} м, цена ${round(spot.cost)}`);
        return undefined;
    }
    if (command === 'circuits') {
        // План считается из тех самых данных, поверх которых пишется: правка
        // в редакторе между чтением и записью — план заново.
        const plan = (raw) => {
            const current = { ...raw, ...normalizeLightingSettings(raw) };
            const known = new Set(current.lightingCircuits.map((circuit) => circuit.id));
            const free = electricInputs(current, types, grid).fixtures.filter((f) => !f.circuit || !known.has(f.circuit));
            const proposal = proposeCircuits({ fixtures: free, panels: current.lightingPanels });
            let next = current.lightingCircuits.length;
            const rename = new Map(proposal.circuits.map((c) => { let fresh; do { fresh = `c${++next}`; } while (known.has(fresh)); return [c.id, fresh]; }));
            return { current, proposal, rename };
        };
        const { proposal, rename } = plan(project.settings);
        for (const c of proposal.circuits) console.log(`  ${rename.get(c.id)}: щиток ${c.panel}, ${c.volts} В ${c.current}, ${c.control}, ${Object.values(proposal.assign).filter((v) => v === c.id).length} шт.`);
        if (!flags.has('--apply')) { console.log('Ничего не записано: --apply запишет.'); return undefined; }
        await write((raw) => {
            const { current, proposal: fresh, rename: names } = plan(raw);
            return {
                lightingCircuits: [...current.lightingCircuits, ...fresh.circuits.map((c) => normalizeLightingCircuit({ ...c, id: names.get(c.id), name: `Гр.${names.get(c.id).slice(1)}` }))],
                lightingFixtures: current.lightingFixtures.map((f) => (fresh.assign[f.id] ? { ...f, circuit: names.get(fresh.assign[f.id]) } : f)),
            };
        });
        console.log('Записано.');
        return undefined;
    }
    if (command === 'apply') {
        const fs = await import('node:fs/promises');
        const plan = JSON.parse(await fs.readFile(args[0], 'utf8'));
        const force = flags.has('--force'), skipped = [];
        const given = [];
        // Новому без высоты — земля клетки (настенным высоту надо дать);
        // правка существующего высоту не трогает.
        const grounded = (item) => {
            if (item.y !== undefined && item.y !== null) return item;
            const i = grid ? cellOf(grid, Number(item.x), Number(item.z)) : -1;
            if (i < 0) { console.error(`  ${item.id ?? '?'}: нет y, а сетки участка под ним нет — пропущен`); return item; }
            return { ...item, y: Math.round(grid.ground[i] * 1000) / 1000 };
        };
        await write((current) => {
            const merge = (list, incoming, normalize, key, { ground = false, circuit = false } = {}) => {
                const out = (list ?? []).filter((item) => {
                    if (!(plan.remove ?? []).includes(item.id)) return true;
                    if (item.locked && !force) { skipped.push(item.id); return true; }
                    return false;
                });
                for (const raw of incoming ?? []) {
                    const at = out.findIndex((item) => item.id === raw.id);
                    if (at >= 0 && out[at].locked && !force) { skipped.push(raw.id); continue; }
                    let merged = at >= 0 ? { ...out[at], ...raw } : { by: 'agent', ...(ground ? grounded(raw) : raw) };
                    // Сменили напряжение цепи, не назвав род тока, — он выводится заново.
                    if (circuit && at >= 0 && 'volts' in raw && !('current' in raw) && Number(raw.volts) !== out[at].volts) { merged = { ...merged }; delete merged.current; }
                    const item = normalize(merged, out.length);
                    if (!item) { console.error(`  ${key}: запись ${JSON.stringify(raw).slice(0, 80)} не прошла проверку`); continue; }
                    // Новое — со свободным номером: чужой id в файле не повторится.
                    if (at < 0) {
                        const base = item.id;
                        for (let n = 2; out.some((other) => other.id === item.id); n += 1) item.id = `${base.slice(0, 54)}-${n}`;
                        given.push(item.id);
                    }
                    if (at >= 0) out[at] = item; else out.push(item);
                }
                return out;
            };
            return {
                lightingEnabled: true,
                lightingFixtures: merge(current.lightingFixtures, plan.fixtures, normalizeLightingFixture, 'светильник', { ground: true }),
                lightingPanels: merge(current.lightingPanels, plan.panels, normalizeLightingPanel, 'щиток', { ground: true }),
                lightingCircuits: merge(current.lightingCircuits, plan.circuits, normalizeLightingCircuit, 'цепь', { circuit: true }),
                lightingRuns: merge(current.lightingRuns, plan.runs, normalizeLightingRun, 'трасса'),
                ...(plan.surfaces ? { lightingSurfaces: { ...(current.lightingSurfaces ?? {}), ...plan.surfaces } } : {}),
                ...(plan.site ? { lightingSite: { ...(current.lightingSite ?? {}), ...plan.site } } : {}),
            };
        });
        if (skipped.length) console.log(`Утверждены — не тронуты (нужен --force): ${[...new Set(skipped)].join(', ')}`);
        if (given.length) console.log(`Новые: ${[...new Set(given)].join(', ')}`);
        console.log('Записано.');
        return undefined;
    }
    console.error(`Нет команды «${command}».`);
    process.exit(1);
}

await main();
