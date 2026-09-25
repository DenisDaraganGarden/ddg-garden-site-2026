// Предварительная электрика садового света (docs/garden-lighting-2026-09-25.md,
// «Электрика»): траншеи и кабели по сетке участка, нагрузки, падение
// напряжения, сечения, автоматы, конфликты, ведомость. Чистые функции: их зовут
// агент и редактор, в проект ничего не пишется — как посадки fillBed.js, всё
// заново выходит из данных при каждом открытии. Перенесли щиток — свободные
// трассы пересчитались; закреплённые (lightingRuns) — траншеи с самого начала.
//
// Это схема для проектирования, не для монтажа: сечения и автоматы проверяет
// электрик по нормам региона (УЗО 30 мА на наружные цепи — всегда).

export const KIND = Object.freeze({ open: 0, lawn: 1, paving: 2, deck: 3, bed: 4, roots: 5, building: 6, water: 7, unknown: 8, wall: 9, outside: 10 });
// Цена метра траншеи в долях открытого грунта: газон снять и вернуть — 1,
// настил поднять — 2, мощение разобрать и переложить — 3, зона корней (руками,
// не рвать корни) — 5, цветник (пересадить многолетники) — 8; сквозь здание и
// воду не копают. Неизвестное чуть дороже газона: при равном пути — в обход.
// Стена, ограждение, подпорная стенка — насквозь гильзой или под ней: дорого
// (12), но можно; здание — только то, что так названо в таблице покрытий.
// За моделью участка (ни одной её поверхности) — чужая земля: только если
// иначе никак (10).
export const KIND_COST = Object.freeze({ open: 1, lawn: 1, paving: 3, deck: 2, bed: 8, roots: 5, building: Infinity, water: Infinity, unknown: 1.5, wall: 12, outside: 10 });
export const KIND_NAMES = Object.freeze({
    open: { ru: 'грунт', en: 'open ground' },
    lawn: { ru: 'газон', en: 'lawn' },
    paving: { ru: 'мощение', en: 'paving' },
    deck: { ru: 'настил', en: 'decking' },
    bed: { ru: 'цветник', en: 'planting bed' },
    roots: { ru: 'зона корней', en: 'root zone' },
    building: { ru: 'здание', en: 'building' },
    water: { ru: 'вода', en: 'water' },
    unknown: { ru: 'не определено', en: 'unknown' },
    wall: { ru: 'сквозь стену', en: 'through a wall' },
    outside: { ru: 'за участком', en: 'outside the site' },
});
const NAMES = Object.keys(KIND);
const COST = NAMES.map((name) => KIND_COST[name]);
const kindName = (grid, i) => NAMES[grid.kind[i]] ?? 'unknown';

// Медь при рабочей температуре жилы (~70 °C): 0,0175 · (1 + 0,004 · 50) ≈ 0,021…
// 0,0225 Ом·мм²/м — берём верх.
export const RHO_CU = 0.0225;
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16];
// Допустимый ток, А: медь, две нагруженные жилы, кабель в трубе в земле —
// ориентировочно по IEC 60364-5-52, способ D1, без поправок на грунт,
// температуру и соседние кабели в траншее: их вводит электрик.
export const AMPACITY = Object.freeze({ 1.5: 22, 2.5: 29, 4: 37, 6: 46, 10: 61, 16: 79 });
export const BREAKERS = [6, 10, 16, 20, 25, 32];

// depth — глубина траншеи, м; slack — слабина, доля; tail — запас на конец
// кабеля, м; drop — предел падения, %; share / pinnedShare — множитель цены
// клетки, где траншея уже есть / где она закреплена.
const DEFAULTS = { depth: 0.6, slack: 0.05, tail: 0.5, drop: 3, share: 0.3, pinnedShare: 0.1 };
// Ключ без числа (network.js передаёт { depth: site.depth, … } и из пустых
// настроек участка) — значение по умолчанию, а не undefined поверх него.
const withDefaults = (options) => ({ ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => Number.isFinite(v))) });

export function makeGrid({ x0, z0, cell, cols, rows }) {
    const n = cols * rows;
    return { x0, z0, cell, cols, rows, kind: new Uint8Array(n).fill(KIND.open), ground: new Float32Array(n) };
}
export function cellOf(grid, x, z) {
    const c = Math.floor((x - grid.x0) / grid.cell), r = Math.floor((z - grid.z0) / grid.cell);
    return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows ? r * grid.cols + c : -1;
}
export const centreOf = (grid, i) => [grid.x0 + ((i % grid.cols) + 0.5) * grid.cell, grid.z0 + (Math.floor(i / grid.cols) + 0.5) * grid.cell];
// Соседние клетки: шаг в клетку или по диагонали в √2 клетки.
const stepLength = (grid, a, b) => (a % grid.cols !== b % grid.cols && Math.floor(a / grid.cols) !== Math.floor(b / grid.cols) ? Math.SQRT2 : 1) * grid.cell;
const chainLength = (grid, cells) => cells.reduce((sum, c, i) => (i ? sum + stepLength(grid, cells[i - 1], c) : 0), 0);
// Центры клеток цепочки; подряд идущие одинаковые шаги — один отрезок (разность
// индексов соседних клеток однозначно задаёт направление шага).
const polyline = (grid, cells) => cells.filter((c, i) => i === 0 || i === cells.length - 1 || c - cells[i - 1] !== cells[i + 1] - c).map((c) => centreOf(grid, c));
// Метры по покрытиям: ребро пополам между его клетками — поперёк полосы в k
// клеток выходит ровно k клеток.
function addSurface(surface, grid, a, b) {
    const half = stepLength(grid, a, b) / 2;
    for (const c of [a, b]) { const k = kindName(grid, c); surface[k] = (surface[k] ?? 0) + half; }
}
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
// Протоколы прибора; пустой список — простое включение. Одно правило и для
// предложения цепей, и для проверки управления, иначе предложение само
// рождает конфликт «control».
const protocols = (f) => (f.control?.length ? f.control : ['switch']);
// Ток прибора I = P / (U · cos φ) при напряжении цепи: драйвер берёт мощность.
const ampsAt = (f, V) => f.watts / (V * (f.pf ?? (f.current === 'dc' ? 1 : 0.9)));
const nameOf = (f) => f.label ?? f.id;
const m1 = (x) => x.toFixed(1);

// Двоичная куча с ленивым удалением: устаревшие записи отбрасываются при выемке.
function push(h, key, node) {
    let i = h.size++;
    while (i > 0) {
        const p = (i - 1) >> 1;
        if (h.key[p] <= key) break;
        h.key[i] = h.key[p]; h.node[i] = h.node[p]; i = p;
    }
    h.key[i] = key; h.node[i] = node;
}
function pop(h) {
    const top = h.node[0], key = h.key[--h.size], node = h.node[h.size];
    let i = 0;
    for (;;) {
        let c = 2 * i + 1;
        if (c >= h.size) break;
        if (c + 1 < h.size && h.key[c + 1] < h.key[c]) c += 1;
        if (h.key[c] >= key) break;
        h.key[i] = h.key[c]; h.node[i] = h.node[c]; i = c;
    }
    h.key[i] = key; h.node[i] = node;
    return top;
}

// Состояние трассировки: цена клетки по покрытию, множитель (траншея уже есть —
// дешевле), какие клетки и рёбра уже траншея.
function router(grid, o) {
    const n = grid.cols * grid.rows, base = new Float64Array(n);
    for (let i = 0; i < n; i += 1) base[i] = COST[grid.kind[i]] ?? KIND_COST.unknown;
    return { grid, o, n, base, factor: new Float64Array(n).fill(1), trenched: new Uint8Array(n), edges: new Set(), laid: new Set(), want: new Uint8Array(n), dist: new Float64Array(n), prev: new Int32Array(n), heap: { key: [], node: [], size: 0 } };
}
const edgeKey = (s, a, b) => (a < b ? a * s.n + b : b * s.n + a);
function dig(s, a, b, factor) {
    s.edges.add(edgeKey(s, a, b));
    for (const c of [a, b]) { s.trenched[c] = 1; s.factor[c] = Math.min(s.factor[c], factor); }
}

// Восемь соседей, диагонали последними. Диагональ не срезает угол здания или
// воды: кабель не проходит сквозь угол стены.
const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

// Дейкстра от всех клеток дерева сразу до ближайшей нужной клетки (s.want).
// Шаг в клетку = цена покрытия × длина шага × множитель. Между двумя клетками,
// где траншея уже есть, скидка — только вдоль неё: иначе рядом с траншеей
// дёшево срезается угол второй, параллельной. Поперёк (две траншеи в 0,5 м
// друг от друга) шаг возможен по полной цене — это новая траншея.
function nearest(s, sources) {
    const { grid: { cols, rows, cell }, base, factor, trenched, edges, want, dist, prev, heap } = s;
    dist.fill(Infinity);
    heap.size = 0;
    for (const c of sources) { dist[c] = 0; prev[c] = -1; push(heap, 0, c); }
    while (heap.size) {
        const du = heap.key[0], u = pop(heap);
        if (du > dist[u]) continue;
        if (want[u]) return u;
        const uc = u % cols, ur = (u - uc) / cols;
        for (let k = 0; k < 8; k += 1) {
            const c = uc + DC[k], r = ur + DR[k];
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const v = r * cols + c;
            if (base[v] === Infinity || (k > 3 && (base[ur * cols + c] === Infinity || base[r * cols + uc] === Infinity))) continue;
            const along = !(trenched[u] && trenched[v]) || edges.has(edgeKey(s, u, v));
            const dv = du + base[v] * (along ? factor[v] : 1) * STEP[k] * cell;
            if (dv < dist[v]) { dist[v] = dv; prev[v] = u; push(heap, dv, v); }
        }
    }
    return -1;
}

// Дерево Штейнера от корня эвристикой кратчайших путей: раз за разом
// присоединять к построенному дереву ближайшую неподключённую клетку.
// Возвращает parent (клетка → клетка ближе к корню, у корня −1) и цену.
function steiner(s, root, cells) {
    const parent = new Map([[root, -1]]);
    let left = 0, cost = 0;
    for (const c of cells) if (!parent.has(c) && !s.want[c]) { s.want[c] = 1; left += 1; }
    while (left > 0) {
        const t = nearest(s, parent.keys());
        if (t < 0) break;
        cost += s.dist[t]; s.want[t] = 0; left -= 1;
        for (let v = t; s.prev[v] >= 0; v = s.prev[v]) { parent.set(v, s.prev[v]); dig(s, v, s.prev[v], s.o.share); }
    }
    for (const c of cells) s.want[c] = 0;
    return { parent, cost };
}
const treeLength = (grid, parent) => { let total = 0; for (const [v, p] of parent) if (p >= 0) total += stepLength(grid, v, p); return total; };

// Точка прибора или щитка → клетка. Своя клетка — здание или вода (фонарь на
// фасаде, щиток на стене) — ближайшая доступная клетка по кольцам вокруг, а
// разрыв до неё — кабель по стене, в метрах плана. Вне сетки — null.
function anchor(s, x, z) {
    const { grid, base } = s, i = cellOf(grid, x, z);
    if (i < 0) return null;
    if (base[i] < Infinity) return { cell: i, gap: 0 };
    const c0 = i % grid.cols, r0 = (i - c0) / grid.cols;
    for (let k = 1; k < Math.max(grid.cols, grid.rows); k += 1) {
        let best = -1, gap = Infinity;
        for (let r = Math.max(0, r0 - k); r <= Math.min(grid.rows - 1, r0 + k); r += 1) {
            for (let c = Math.max(0, c0 - k); c <= Math.min(grid.cols - 1, c0 + k); c += 1) {
                const j = r * grid.cols + c;
                if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== k || base[j] === Infinity) continue;
                const [cx, cz] = centreOf(grid, j), d = Math.hypot(cx - x, cz - z);
                if (d < gap) { gap = d; best = j; }
            }
        }
        if (best >= 0) return { cell: best, gap };
    }
    return null;
}

// Закреплённая трасса — 8-связная цепочка клеток по Брезенхэму (так ходит и
// роутер), с самого начала дешёвый путь. Траншею (kind 'trench', по умолчанию)
// копают; по стене и в готовой трубе ('wall', 'conduit') — нет: их клетки
// проходимы даже в здании, как открытый грунт, но в траншеи не идут
// (s.laid). Возвращает её рёбра [a, b].
// ponytail: выход из траншеи на глубину считается и у приборов на стене или в
// трубе — запас в пользу кабеля; точнее — со «стенами по плану» (этап 3).
function pin(s, points, dug) {
    const { grid } = s, chain = [];
    const at = ([x, z]) => [Math.floor((x - grid.x0) / grid.cell), Math.floor((z - grid.z0) / grid.cell)];
    // Точка без двух конечных координат — разрыв трассы: по NaN Брезенхэм не
    // дошёл бы до конца никогда.
    const ok = (p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]);
    for (let k = 1; k < points.length; k += 1) {
        if (!ok(points[k - 1]) || !ok(points[k])) continue;
        let [c, r] = at(points[k - 1]);
        const [c1, r1] = at(points[k]);
        const dc = Math.abs(c1 - c), dr = Math.abs(r1 - r), sc = c < c1 ? 1 : -1, sr = r < r1 ? 1 : -1;
        let err = dc - dr;
        for (;;) {
            if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && chain.at(-1) !== r * grid.cols + c) chain.push(r * grid.cols + c);
            if (c === c1 && r === r1) break;
            const e2 = 2 * err;
            if (e2 > -dr) { err -= dr; c += sc; }
            if (e2 < dc) { err += dc; r += sr; }
        }
    }
    if (!dug) for (const c of chain) s.base[c] = Math.min(s.base[c], KIND_COST.open);
    const pairs = [];
    for (let i = 1; i < chain.length; i += 1) {
        const a = chain[i - 1], b = chain[i];
        // Трасса выходила за сетку — разрыв, а не ребро.
        if (Math.abs((a % grid.cols) - (b % grid.cols)) > 1 || Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols)) > 1) continue;
        pairs.push([a, b]);
        dig(s, a, b, s.o.pinnedShare);
    }
    return pairs;
}

// Одна цепь: дерево от щитка, участки, токи, падение, сечение, автомат, длины.
function routeCircuit(s, circuit, panel, list, say) {
    const { grid, o } = s, id = circuit.id, V = circuit.volts;
    for (const f of list) {
        if (f.volts !== V || f.current !== circuit.current) say('volts', [f.id, id], `Светильник ${nameOf(f)} — ${f.volts} В ${f.current}, а цепь ${id} — ${V} В ${circuit.current}`, `Fixture ${nameOf(f)} is ${f.volts} V ${f.current}, circuit ${id} is ${V} V ${circuit.current}`);
        if (!protocols(f).includes(circuit.control)) say('control', [f.id, id], `Светильник ${nameOf(f)} не понимает управление «${circuit.control}» цепи ${id} (умеет: ${protocols(f).join(', ')})`, `Fixture ${nameOf(f)} does not take the «${circuit.control}» control of circuit ${id} (takes: ${protocols(f).join(', ')})`);
    }
    const amps = (f) => ampsAt(f, V);
    const root = anchor(s, panel.x, panel.z);
    if (!root) say('unreachable', [panel.id, id], `Щиток ${panel.id} вне участка`, `Panel ${panel.id} is off the site`);
    const at = new Map(list.map((f) => [f, root && anchor(s, f.x, f.z)]));
    const { parent } = root ? steiner(s, root.cell, [...at.values()].filter(Boolean).map((a) => a.cell)) : { parent: new Map() };
    const reached = list.filter((f) => at.get(f) && parent.has(at.get(f).cell));
    if (root) for (const f of list) if (!reached.includes(f)) say('unreachable', [f.id, id], `Светильник ${nameOf(f)} недостижим от щитка ${panel.id}: вне участка или отрезан зданием и водой`, `Fixture ${nameOf(f)} cannot be reached from panel ${panel.id}: off the site or cut off by building and water`);

    // Участки кабеля — цепочки между ветвлениями и приборами, сверху вниз.
    const kids = new Map();
    for (const [v, p] of parent) if (p >= 0) (kids.get(p) ?? kids.set(p, []).get(p)).push(v);
    const ends = new Set(reached.map((f) => at.get(f).cell));
    const isBreak = (v) => ends.has(v) || (kids.get(v)?.length ?? 0) !== 1;
    const segments = [], segmentAt = new Map(), stack = root ? [root.cell] : [];
    while (stack.length) {
        const b = stack.pop();
        for (const first of kids.get(b) ?? []) {
            const chain = [b];
            let v = first;
            while (!isBreak(v)) { chain.push(v); v = kids.get(v)[0]; }
            chain.push(v);
            const segment = { points: polyline(grid, chain), length: chainLength(grid, chain), current: 0, downstream: [] };
            segments.push(segment); segmentAt.set(v, segment); stack.push(v);
        }
    }
    const up = (cell, fn) => { for (let v = cell; v !== root.cell; v = parent.get(v)) if (segmentAt.has(v)) fn(segmentAt.get(v)); };
    for (const f of reached) up(at.get(f).cell, (segment) => { segment.downstream.push(f.id); segment.current += amps(f); });

    // ΔU = 2ρ·L·I / S по участкам (две жилы: однофазный переменный или
    // постоянный). Сечение пока не выбрано — копим 2ρ·L·I, делим потом. Кабель по
    // стене у щитка несёт ток всей цепи, подъём и кабель по стене у прибора — его.
    const k2 = 2 * RHO_CU;
    const panelLeg = root ? k2 * root.gap * sum(reached, amps) : 0;
    let worst = null, worstD = 0;
    for (const f of reached) {
        let d = panelLeg + k2 * ((f.rise ?? 0) + at.get(f).gap) * amps(f);
        up(at.get(f).cell, (segment) => { d += k2 * segment.length * segment.current; });
        if (worst === null || d > worstD) { worst = f.id; worstD = d; }
    }

    // Автомат — по току цепи с запасом 1,25; сечение — наименьшее, где падение не
    // выше предела и кабель держит ток автомата.
    const loadW = sum(list, (f) => f.watts), currentA = sum(list, amps);
    const need = 1.25 * currentA;
    const breaker = circuit.breaker ? { curve: circuit.breaker.curve, amps: circuit.breaker.amps, auto: false } : { curve: 'B', amps: BREAKERS.find((a) => a >= need) ?? BREAKERS.at(-1), auto: true };
    if (breaker.auto && need > BREAKERS.at(-1)) say('breaker', [id], `Цепь ${id}: ток ${currentA.toFixed(1)} А — больше, чем берёт автомат ${BREAKERS.at(-1)} А; разделите цепь`, `Circuit ${id}: ${currentA.toFixed(1)} A is more than a ${BREAKERS.at(-1)} A breaker takes; split the circuit`);
    const fits = (S) => (worstD / S / V) * 100 <= o.drop + 1e-9 && (AMPACITY[S] ?? Infinity) >= breaker.amps;
    const section = circuit.section ?? SECTIONS.find(fits) ?? SECTIONS.at(-1);
    const dropV = worstD / section, dropPct = (dropV / V) * 100;
    if (dropPct > o.drop + 1e-9) say('drop', [id, worst], `Цепь ${id}: падение напряжения до ${worst} — ${dropPct.toFixed(1)} % при ${section} мм², больше ${o.drop} %`, `Circuit ${id}: voltage drop to ${worst} is ${dropPct.toFixed(1)} % at ${section} mm², over ${o.drop} %`);
    if ((AMPACITY[section] ?? Infinity) < breaker.amps) say('breaker', [id], `Цепь ${id}: кабель ${section} мм² держит ${AMPACITY[section]} А — меньше автомата ${breaker.curve}${breaker.amps}`, `Circuit ${id}: a ${section} mm² cable carries ${AMPACITY[section]} A, less than the ${breaker.curve}${breaker.amps} breaker`);

    // Драйверов на автомат — только по таблице паспорта (пусковой ток); решает
    // самый строгий прибор цепи. Нет таблицы — «не проверено».
    const key = `${breaker.curve}${breaker.amps}`;
    const limits = list.map((f) => f.perBreaker?.[key]).filter(Number.isFinite);
    const tight = limits.length ? Math.min(...limits) : Infinity;
    const perBreaker = list.length > tight ? 'over' : limits.length === list.length ? 'ok' : 'unknown';
    if (perBreaker === 'over') say('breaker', [id], `Цепь ${id}: ${list.length} светильников на ${key}, паспорт допускает ${tight}`, `Circuit ${id}: ${list.length} fixtures on ${key}, the data sheet allows ${tight}`);

    // Длина кабеля: дерево + по стене + подъёмы + глубина на каждом выходе из
    // траншеи (у щитка один, у прибора посреди линии — вниз и обратно, у
    // последнего — один) + запас на концы + слабина.
    const planLength = sum(segments, (segment) => segment.length);
    const wallLength = (root?.gap ?? 0) + sum(reached, (f) => at.get(f).gap);
    const riseLength = sum(reached, (f) => f.rise ?? 0);
    const depthLength = reached.length ? o.depth * (1 + sum(reached, (f) => (kids.has(at.get(f).cell) ? 2 : 1))) : 0;
    const tailLength = o.tail * 2 * reached.length;
    const net = planLength + wallLength + riseLength + depthLength + tailLength, slackLength = o.slack * net;

    // Покрытия — по траншеям цепи; по стене и в трубе не копают.
    const surface = {};
    for (const [v, p] of parent) if (p >= 0 && !s.laid.has(edgeKey(s, v, p))) addSurface(surface, grid, v, p);
    if (surface.bed > 0) say('bed', [id], `Цепь ${id} проходит через цветник: ${m1(surface.bed)} м`, `Circuit ${id} crosses a planting bed: ${m1(surface.bed)} m`);

    return {
        parent,
        result: {
            id, panel: panel.id, fixtures: list.map((f) => f.id), segments,
            planLength, wallLength, riseLength, depthLength, tailLength, slackLength, cableLength: net + slackLength,
            loadW, currentA, volts: V, section, sectionAuto: circuit.section == null, breaker,
            dropV, dropPct, worst, perBreaker, surface,
        },
    };
}

// Траншеи: объединение деревьев всех цепей и закреплённых трасс, нарезанное на
// линии между развилками, концами и местами, где меняется набор цепей. Общая
// траншея трёх цепей — одна, её длина считается один раз.
function trenches(s, trees, pinnedKeys) {
    const { grid, n } = s, edges = new Map();
    const edge = (a, b) => {
        const k = edgeKey(s, a, b);
        if (!edges.has(k)) edges.set(k, { a: Math.min(a, b), b: Math.max(a, b), circuits: [], pinned: pinnedKeys.has(k) });
        return edges.get(k);
    };
    for (const k of pinnedKeys) edge(Math.floor(k / n), k % n);
    for (const { id, parent } of trees) for (const [v, p] of parent) if (p >= 0 && !s.laid.has(edgeKey(s, v, p))) edge(v, p).circuits.push(id);
    const adj = new Map();
    for (const e of edges.values()) {
        e.circuits = [...new Set(e.circuits)].sort();
        e.tag = `${e.pinned}|${e.circuits.join(',')}`;
        for (const c of [e.a, e.b]) (adj.get(c) ?? adj.set(c, []).get(c)).push(e);
    }
    const isBreak = (c) => { const list = adj.get(c); return list.length !== 2 || list[0].tag !== list[1].tag; };
    const out = [], seen = new Set();
    const walk = (start, first) => {
        const cells = [start];
        for (let v = start, e = first; ;) {
            seen.add(e); v = e.a === v ? e.b : e.a; cells.push(v);
            if (v === start || isBreak(v)) break;
            e = adj.get(v).find((x) => x !== e);
            if (seen.has(e)) break;
        }
        const surface = {};
        for (let i = 1; i < cells.length; i += 1) addSurface(surface, grid, cells[i - 1], cells[i]);
        out.push({ id: `t${out.length + 1}`, points: polyline(grid, cells), length: chainLength(grid, cells), circuits: first.circuits, pinned: first.pinned, surface });
    };
    const cells = [...adj.keys()].sort((a, b) => a - b);
    for (const c of cells) if (isBreak(c)) for (const e of adj.get(c)) if (!seen.has(e)) walk(c, e);
    // Что осталось — замкнутые кольца без развилок (закреплённый контур).
    for (const c of cells) for (const e of adj.get(c)) if (!seen.has(e)) walk(c, e);
    return out;
}

export function routeNetwork({ grid, panels = [], circuits = [], fixtures = [], runs = [], options = {} }) {
    const s = router(grid, withDefaults(options));
    const conflicts = [];
    const say = (kind, ids, ru, en) => conflicts.push({ kind, ids, ru, en });
    const pinned = runs.map((run) => {
        const dug = run.kind !== 'wall' && run.kind !== 'conduit';
        return { id: run.id, dug, keys: pin(s, run.points ?? [], dug).map(([a, b]) => edgeKey(s, a, b)) };
    });
    const pinnedKeys = new Set(pinned.filter((run) => run.dug).flatMap((run) => run.keys));
    for (const run of pinned) if (!run.dug) for (const k of run.keys) if (!pinnedKeys.has(k)) s.laid.add(k);
    const known = new Set(circuits.map((c) => c.id));
    for (const f of fixtures) if (!known.has(f.circuit)) say('unassigned', [f.id], `Светильник ${nameOf(f)} не подключён ни к одной цепи`, `Fixture ${nameOf(f)} is not on any circuit`);
    const panelOf = new Map(panels.map((p) => [p.id, p]));
    const out = [], trees = [];
    for (const circuit of circuits) {
        const panel = panelOf.get(circuit.panel);
        if (!panel) { say('panel', [circuit.id], `Цепь ${circuit.id}: щиток ${circuit.panel} не найден`, `Circuit ${circuit.id}: panel ${circuit.panel} not found`); continue; }
        const { result, parent } = routeCircuit(s, circuit, panel, fixtures.filter((f) => f.circuit === circuit.id), say);
        out.push(result); trees.push({ id: circuit.id, parent });
    }
    const used = new Set();
    for (const { parent } of trees) for (const [v, p] of parent) if (p >= 0) used.add(edgeKey(s, v, p));
    for (const run of pinned) if (!run.keys.some((k) => used.has(k))) say('run', [run.id], `Закреплённая трасса ${run.id} не используется ни одной цепью`, `Pinned run ${run.id} is used by no circuit`);
    const list = trenches(s, trees, pinnedKeys);
    const cableBySection = {};
    for (const c of out) cableBySection[c.section] = (cableBySection[c.section] ?? 0) + c.cableLength;
    return { circuits: out, trenches: list, conflicts, totals: { trenchLength: sum(list, (t) => t.length), cableBySection, loadW: sum(out, (c) => c.loadW) } };
}

// «Предложи цепи»: приборы группируются по напряжению, роду тока, общему
// протоколу (из тех, что прибор умеет, — самый частый в группе) и ближайшему
// щитку, группа режется по углу вокруг щитка — соседние приборы в одной цепи.
// ponytail: жадная нарезка по кругу, последняя цепь может выйти короткой;
// уравнивать по мощности — когда это заметят в ведомости.
// maxA — ток цепи: 16 / 1,25 = 12,8 А ложится на B16; на 12/24 В цепь режет
// ток, а не мощность (1200 Вт при 24 В — 50 А).
export function proposeCircuits({ fixtures, panels = [], maxW = 1200, maxFixtures = 20, maxA = 16 / 1.25 }) {
    const votes = new Map();
    for (const f of fixtures) for (const p of protocols(f)) { const k = `${f.volts}|${f.current}|${p}`; votes.set(k, (votes.get(k) ?? 0) + 1); }
    const far = (p, f) => Math.hypot(p.x - f.x, p.z - f.z);
    const groups = new Map();
    for (const f of fixtures) {
        const vc = `${f.volts}|${f.current}`;
        // Ничья голосов — по имени протокола, а не по порядку в списке прибора:
        // ['switch', 'dali'] и ['dali', 'switch'] попадают в одну группу.
        const control = protocols(f).reduce((best, p) => ((votes.get(`${vc}|${p}`) - votes.get(`${vc}|${best}`) || (p < best ? 1 : -1)) > 0 ? p : best));
        const panel = panels.reduce((best, p) => (!best || far(p, f) < far(best, f) ? p : best), null);
        const key = `${panel?.id}|${vc}|${control}`;
        if (!groups.has(key)) groups.set(key, { panel, volts: f.volts, current: f.current, control, list: [] });
        groups.get(key).list.push(f);
    }
    const circuits = [], assign = {};
    for (const g of groups.values()) {
        // Без щитка — угол вокруг середины группы.
        const px = g.panel?.x ?? sum(g.list, (f) => f.x) / g.list.length, pz = g.panel?.z ?? sum(g.list, (f) => f.z) / g.list.length;
        const ring = g.list.map((f) => ({ f, a: Math.atan2(f.z - pz, f.x - px) })).sort((p, q) => p.a - q.a);
        // Разрез круга — по самой широкой пустоте, чтобы не рвать кучку приборов.
        let cut = 0, gap = -1;
        ring.forEach((item, i) => {
            const next = i + 1 < ring.length ? ring[i + 1].a : ring[0].a + 2 * Math.PI;
            if (next - item.a > gap) { gap = next - item.a; cut = (i + 1) % ring.length; }
        });
        let open = null, watts = 0, amps = 0, count = 0;
        for (const { f } of [...ring.slice(cut), ...ring.slice(0, cut)]) {
            const I = ampsAt(f, g.volts);
            if (!open || watts + f.watts > maxW || amps + I > maxA || count >= maxFixtures) {
                open = { id: `c${circuits.length + 1}`, panel: g.panel?.id ?? null, volts: g.volts, current: g.current, breaker: null, section: null, control: g.control };
                circuits.push(open); watts = 0; amps = 0; count = 0;
            }
            watts += f.watts; amps += I; count += 1; assign[f.id] = open.id;
        }
    }
    return { circuits, assign };
}

// Места для щитка: цена одного дерева Штейнера от места до всех приборов по
// той же сетке. Недостижимые приборы — цена ∞, в конец списка.
export function rankPanelSpots({ grid, fixtures, candidates, options = {} }) {
    const o = withDefaults(options);
    return candidates.map(({ x, z }) => {
        const s = router(grid, o), root = anchor(s, x, z), cells = fixtures.map((f) => anchor(s, f.x, f.z));
        if (!root || cells.some((c) => !c)) return { x, z, cost: Infinity, length: Infinity };
        const { parent, cost } = steiner(s, root.cell, cells.map((c) => c.cell));
        return cells.every((c) => parent.has(c.cell)) ? { x, z, cost, length: treeLength(grid, parent) } : { x, z, cost: Infinity, length: Infinity };
    }).sort((a, b) => a.cost - b.cost || 0);
}

// Ведомость: кабель по сечениям и траншеи по покрытиям, вверх до 0,5 м.
export function cableSchedule(network) {
    const up = (x) => Math.ceil(x * 2 - 1e-9) / 2;
    const cables = Object.entries(network.totals.cableBySection).map(([section, length]) => ({ section: Number(section), length: up(length) })).sort((a, b) => a.section - b.section);
    const bySurface = {};
    for (const t of network.trenches) for (const [kind, metres] of Object.entries(t.surface)) bySurface[kind] = (bySurface[kind] ?? 0) + metres;
    const trenches = Object.entries(bySurface).map(([surface, length]) => ({ surface, ...KIND_NAMES[surface], length: up(length) }));
    return { cables, trenches };
}
