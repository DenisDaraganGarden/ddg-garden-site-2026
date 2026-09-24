// Обзор посадок — то, что Денис читает, выбрав часть сада: цветник, все
// цветники, деревья новые, существующие или все. Всё считается из тех же
// заполнений, что рисует сцена, поэтому числа совпадают с нарисованным.
import { bedArea } from './fillBed.js';
import { vineLength } from './vines.js';

// Часть сада: { kind: 'beds', bed: id | null }, { kind: 'trees', status:
// 'all' | 'new' | 'existing' } или { kind: 'vines' } — лианы, штука на растение
// и длина побегов.
export function scopeRows(scope, beds, fills, points, library, vines = []) {
    const rows = new Map();
    const row = (id) => {
        if (!rows.has(id)) rows.set(id, { id, plant: library.get(id) ?? { id, ru: id, category: 'perennial' }, count: 0, area: 0, length: 0 });
        return rows.get(id);
    };
    let area = 0;
    if (scope.kind === 'beds') {
        beds.forEach((bed, index) => {
            if (scope.bed && bed.id !== scope.bed) return;
            const size = bedArea(bed);
            area += size;
            const shares = bed.recipe.filter((r) => library.has(r.plant));
            const total = shares.reduce((sum, r) => sum + r.share, 0) || 1;
            for (const r of shares) row(r.plant).area += (size * r.share) / total;
            for (const plant of fills[index] ?? []) row(plant.plant).count += 1;
        });
    } else if (scope.kind === 'vines') {
        for (const vine of vines) { const r = row(vine.plant); r.count += 1; r.length += vineLength(vine); }
    } else {
        for (const point of points) {
            const existing = point.status === 'existing';
            if (scope.status === 'new' && existing) continue;
            if (scope.status === 'existing' && !existing) continue;
            row(point.plant).count += 1;
        }
    }
    const list = [...rows.values()].filter((r) => r.count > 0).sort((a, b) => b.count - a.count || String(a.plant.ru).localeCompare(String(b.plant.ru), 'ru'));
    const count = list.reduce((sum, r) => sum + r.count, 0);
    return { rows: list, count, species: list.length, area, length: list.reduce((sum, r) => sum + r.length, 0) };
}

// Цветение по месяцам: строка на вид, месяцы цветения (с переходом через
// Новый год), цвет — с картинки растения.
export const bloomMonths = (plant) => {
    if (!Array.isArray(plant?.bloom)) return [];
    const [a, b] = plant.bloom;
    return Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
};

// Сколько видов цветёт в каждом месяце — «сезонный интерес» цветника.
export const bloomCurve = (rows) => Array.from({ length: 12 }, (_, i) => rows.filter((r) => bloomMonths(r.plant).includes(i + 1)).length);

// Свет и влага — как записаны в библиотеке («солнце — полутень»), по числу растений.
export function conditionMix(rows, field) {
    const mix = new Map();
    for (const r of rows) {
        const key = r.plant[field] || '—';
        mix.set(key, (mix.get(key) ?? 0) + r.count);
    }
    return [...mix.entries()].sort((a, b) => b[1] - a[1]);
}

export const risks = (rows) => rows.filter((r) => r.plant.risk).map((r) => ({ plant: r.plant, text: r.plant.risk }));

export const CATEGORY_LABELS = {
    tree: ['Дерево', 'Tree'], conifer: ['Хвойное', 'Conifer'], topiary: ['Стриженое', 'Topiary'], shrub: ['Кустарник', 'Shrub'],
    grass: ['Злак', 'Grass'], perennial: ['Многолетник', 'Perennial'], groundcover: ['Почвопокров', 'Groundcover'], climber: ['Лиана', 'Climber'],
};
export const CATEGORY_ORDER = ['tree', 'conifer', 'topiary', 'shrub', 'climber', 'grass', 'perennial', 'groundcover'];
export const byCategory = (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || String(a.ru).localeCompare(String(b.ru), 'ru');
