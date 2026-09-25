// Освещение сада (docs/garden-lighting-2026-09-25.md): светильники — тип,
// место, наведение, яркость, подключение; щитки, цепи и закреплённые трассы.
// Трассы, длины и нагрузки здесь не лежат — их каждый раз считает
// electric.js из этих данных, как цветник — fillBed.js.
//
// Ключи проектные, как окружение и материалы: не публикуются и не входят в
// снимки камер (их нет в publishedHomeSceneKeys) — типы светильников живут в
// библиотеке этого компьютера, а световой проект один на все камеры. Ночь у
// камеры своя — время суток, и с ним фотореле (lightingMode 'auto').
//
// Светильник: x, y, z — точка крепления на поверхности, nx, ny, nz — её
// нормаль (земля — вверх, стена — из стены). Ось луча — yaw (градусы, 0 — к
// +Z, как у старта прогулки) и pitch (градусы: −90 — вниз, 90 — вверх);
// target — точка, на которую он наведён (дерево, фасад): тогда ось считается
// от места к ней и переживает перенос. dim — рабочая яркость 0…1. by — кто
// поставил; locked — утверждён: агент его молча не двигает. finish — своя
// отделка корпуса (авторский вариант, не заводское исполнение).
export const LIGHTING_LIMITS = Object.freeze({ fixtures: 1000, panels: 16, circuits: 64, runs: 128, runPoints: 256, surfaces: 256, note: 240 });
export const LIGHTING_RANGES = Object.freeze({
    dim: [0, 1, 0.01], pitch: [-90, 90, 0.5], exposure: [-4, 4, 0.1],
    depth: [0.2, 1.5, 0.05], slack: [0, 0.3, 0.01], tail: [0, 3, 0.1], drop: [1, 10, 0.5],
});
export const LIGHTING_MODES = Object.freeze(['auto', 'on', 'off']);
export const LIGHTING_VOLTS = Object.freeze([230, 48, 24, 12]);
export const LIGHTING_CONTROLS = Object.freeze(['switch', 'dali', 'dmx', '0-10v', 'casambi']);
export const LIGHTING_BREAKERS = Object.freeze([6, 10, 16, 20, 25, 32]);
export const LIGHTING_SECTIONS = Object.freeze([1.5, 2.5, 4, 6, 10, 16]);
// Покрытие под материалом SketchUp — для цены траншеи (electric.js KIND).
export const LIGHTING_SURFACES = Object.freeze(['open', 'lawn', 'paving', 'deck', 'bed', 'roots', 'building', 'water', 'unknown', 'wall', 'outside']);
export const LIGHTING_RUN_KINDS = Object.freeze(['trench', 'wall', 'conduit']);
export const LIGHTING_SITE_DEFAULT = Object.freeze({ depth: 0.6, slack: 0.05, tail: 0.5, drop: 3, supply: null });
export const DEFAULT_LIGHTING_SETTINGS = Object.freeze({
    lightingEnabled: true,
    lightingFixtures: [],
    lightingPanels: [],
    lightingCircuits: [],
    lightingRuns: [],
    lightingSurfaces: {},
    lightingSite: LIGHTING_SITE_DEFAULT,
    lightingMode: 'auto',
    // Экспозиция света, EV: насколько ярко люксы читаются на экране.
    lightingExposure: 0,
    // Слой «Подключения»: щитки, кабели и траншеи поверх сцены.
    lightingConnections: false,
});

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const TYPE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const SPAN = 1200;
const metres = (value) => Math.round(Math.min(SPAN, Math.max(-SPAN, value)) * 1000) / 1000;
const finite = (...values) => values.every((v) => Number.isFinite(Number(v)));
const within = (value, [min, max, step], fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const clamped = Math.min(max, Math.max(min, number));
    return Math.round(Math.round(clamped / step) * step * 1000) / 1000;
};
const degrees = (value) => Math.round(((((Number(value) + 180) % 360) + 360) % 360 - 180) * 10) / 10;
const text = (value) => String(value ?? '').slice(0, LIGHTING_LIMITS.note);
const by = (value) => (value === 'agent' ? 'agent' : 'denis');
const optional = (key, value, keep) => (keep ? { [key]: value } : {});

function normal(value) {
    const [x, y, z] = [value.nx, value.ny, value.nz].map(Number);
    const length = Math.hypot(x, y, z);
    if (!finite(x, y, z) || length < 1e-6) return { nx: 0, ny: 1, nz: 0 };
    const round = (v) => Math.round((v / length) * 10000) / 10000;
    return { nx: round(x), ny: round(y), nz: round(z) };
}

export function normalizeLightingFixture(value, index = 0) {
    if (!value || !finite(value.x, value.y, value.z) || !TYPE.test(String(value.type ?? ''))) return null;
    const target = Array.isArray(value.target) && value.target.length === 3 && finite(...value.target) ? value.target.map((v) => metres(Number(v))) : null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `fixture-${index}`,
        type: value.type,
        x: metres(Number(value.x)), y: metres(Number(value.y)), z: metres(Number(value.z)),
        ...normal(value),
        yaw: finite(value.yaw) ? degrees(value.yaw) : 0,
        pitch: within(value.pitch, LIGHTING_RANGES.pitch, -90),
        ...optional('target', target, target),
        dim: within(value.dim, LIGHTING_RANGES.dim, 1),
        ...optional('circuit', value.circuit, ID.test(String(value.circuit ?? ''))),
        ...optional('note', text(value.note), value.note),
        by: by(value.by),
        ...optional('locked', true, value.locked === true),
        ...optional('finish', value.finish, COLOR.test(String(value.finish ?? ''))),
    };
}

export function normalizeLightingPanel(value, index = 0) {
    if (!value || !finite(value.x, value.y, value.z)) return null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `panel-${index}`,
        name: String(value.name || `Щ${index + 1}`).slice(0, 64),
        x: metres(Number(value.x)), y: metres(Number(value.y)), z: metres(Number(value.z)),
        yaw: finite(value.yaw) ? degrees(value.yaw) : 0,
        ...optional('note', text(value.note), value.note),
        by: by(value.by),
        ...optional('locked', true, value.locked === true),
    };
}

export function normalizeLightingCircuit(value, index = 0) {
    if (!value || !ID.test(String(value.panel ?? ''))) return null;
    const volts = LIGHTING_VOLTS.includes(Number(value.volts)) ? Number(value.volts) : 230;
    const breaker = value.breaker && ['B', 'C'].includes(value.breaker.curve) && LIGHTING_BREAKERS.includes(Number(value.breaker.amps))
        ? { curve: value.breaker.curve, amps: Number(value.breaker.amps) } : null;
    const section = LIGHTING_SECTIONS.includes(Number(value.section)) ? Number(value.section) : null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `c${index + 1}`,
        name: String(value.name || `Гр.${index + 1}`).slice(0, 64),
        panel: value.panel,
        volts,
        current: value.current === 'dc' || (value.current !== 'ac' && volts < 48) ? 'dc' : 'ac',
        ...optional('breaker', breaker, breaker),
        ...optional('section', section, section),
        control: LIGHTING_CONTROLS.includes(value.control) ? value.control : 'switch',
        ...optional('note', text(value.note), value.note),
    };
}

export function normalizeLightingRun(value, index = 0) {
    if (!value || !Array.isArray(value.points)) return null;
    const points = value.points.filter((p) => Array.isArray(p) && finite(p[0], p[1])).slice(0, LIGHTING_LIMITS.runPoints).map(([x, z]) => [metres(Number(x)), metres(Number(z))]);
    if (points.length < 2) return null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `run-${index}`,
        points,
        kind: LIGHTING_RUN_KINDS.includes(value.kind) ? value.kind : 'trench',
        ...optional('note', text(value.note), value.note),
    };
}

function normalizeSurfaces(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
        .filter(([name, kind]) => name && name.length <= 128 && LIGHTING_SURFACES.includes(kind))
        .slice(0, LIGHTING_LIMITS.surfaces));
}

function normalizeSite(value) {
    const site = value && typeof value === 'object' ? value : {};
    const d = LIGHTING_SITE_DEFAULT, r = LIGHTING_RANGES;
    const supply = site.supply && finite(site.supply.x, site.supply.z)
        ? { x: metres(Number(site.supply.x)), z: metres(Number(site.supply.z)), known: site.supply.known === true, ...optional('note', text(site.supply.note), site.supply.note) }
        : null;
    return {
        depth: within(site.depth, r.depth, d.depth), slack: within(site.slack, r.slack, d.slack),
        tail: within(site.tail, r.tail, d.tail), drop: within(site.drop, r.drop, d.drop), supply,
    };
}

const unique = (list, limit, normalize) => {
    const ids = new Set();
    return (Array.isArray(list) ? list : []).slice(0, limit).map(normalize).filter(Boolean).map((item, index) => {
        const base = item.id;
        let suffix = index;
        while (ids.has(item.id)) item.id = `${base.slice(0, 54)}-${suffix++}`;
        ids.add(item.id);
        return item;
    });
};

export function normalizeLightingSettings(settings = {}) {
    const d = DEFAULT_LIGHTING_SETTINGS;
    return {
        lightingEnabled: settings.lightingEnabled !== false,
        lightingFixtures: unique(settings.lightingFixtures, LIGHTING_LIMITS.fixtures, normalizeLightingFixture),
        lightingPanels: unique(settings.lightingPanels, LIGHTING_LIMITS.panels, normalizeLightingPanel),
        lightingCircuits: unique(settings.lightingCircuits, LIGHTING_LIMITS.circuits, normalizeLightingCircuit),
        lightingRuns: unique(settings.lightingRuns, LIGHTING_LIMITS.runs, normalizeLightingRun),
        lightingSurfaces: normalizeSurfaces(settings.lightingSurfaces),
        lightingSite: normalizeSite(settings.lightingSite),
        lightingMode: LIGHTING_MODES.includes(settings.lightingMode) ? settings.lightingMode : d.lightingMode,
        lightingExposure: within(settings.lightingExposure, LIGHTING_RANGES.exposure, d.lightingExposure),
        lightingConnections: settings.lightingConnections === true,
    };
}

// Ось луча по yaw и pitch (градусы) — единичный мировой вектор.
export function beamAxis(yaw, pitch) {
    const a = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
    return [Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p)];
}

// yaw и pitch, наводящие ось из from в to.
export function aimAt(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-6 && Math.abs(dy) < 1e-6) return null;
    return { yaw: degrees((Math.atan2(dx, dz) * 180) / Math.PI), pitch: Math.round((Math.atan2(dy, flat) * 180) / Math.PI * 10) / 10 };
}
