import { cellOf, routeNetwork } from './electric.js';
import { fixtureLabels } from './fixtures.js';

// Электрика проекта из его данных: что знает electric.js о каждом
// светильнике (мощность, напряжение, управление — из типа; подъём кабеля —
// от земли клетки до точки крепления), щитки, цепи, закреплённые трассы и
// настройки участка. Одно и то же для редактора, отчёта и агента
// (scripts/lighting.mjs).
export function electricInputs(settings, types, grid) {
    const labels = fixtureLabels(settings.lightingFixtures ?? [], types);
    const groundAt = (x, z) => { const i = grid ? cellOf(grid, x, z) : -1; return i >= 0 ? grid.ground[i] : null; };
    const fixtures = (settings.lightingFixtures ?? []).filter((f) => types.has(f.type)).map((f) => {
        const { power = {}, control = [] } = types.get(f.type);
        const ground = groundAt(f.x, f.z);
        return {
            id: f.id, label: labels.get(f.id), x: f.x, y: f.y, z: f.z, circuit: f.circuit ?? null,
            watts: (Number(power.watts) || 0) * 1, volts: Number(power.volts) || 230, current: power.current ?? ((Number(power.volts) || 230) < 48 ? 'dc' : 'ac'),
            ...(power.pf ? { pf: power.pf } : {}), control, ...(power.perBreaker ? { perBreaker: power.perBreaker } : {}),
            rise: ground === null ? 0 : Math.max(0, Math.round((f.y - ground) * 100) / 100),
        };
    });
    const site = settings.lightingSite ?? {};
    return {
        fixtures,
        panels: (settings.lightingPanels ?? []).map(({ id, x, y, z }) => ({ id, x, y, z })),
        circuits: settings.lightingCircuits ?? [],
        runs: settings.lightingRuns ?? [],
        options: { depth: site.depth, slack: site.slack, tail: site.tail, drop: site.drop },
    };
}

export const lightingNetwork = (settings, types, grid) => (grid ? routeNetwork({ grid, ...electricInputs(settings, types, grid) }) : null);
