// Аннотации проекта — пометки проектировщика поверх сцены, а не её вещи.
// Первая из них — отметка уровня: место на поверхности модели или земли и
// число — высота этого места от нулевой отметки, как на чертеже («+0,450»).
//
// Отметка хранит x, z и высоту y, у которой её искать: число берётся с живой
// поверхности (AnnotationLayer снова находит её лучом сверху, когда модель
// заменили или сдвинули) и записывается сюда же — отчёт и список видят ту же
// высоту. zero — нулевая отметка (одна на проект); первая поставленная —
// ноль, пока нулём не назначат другую. ground — стоит на плоскости проекта,
// а не на модели: ищется только там (пока модель грузится, отметка на
// модели не падает на плоскость). Всё общее для камер.
export const ANNOTATION_LIMITS = Object.freeze({ marks: 200 });
export const ANNOTATION_UNITS = Object.freeze(['m', 'cm', 'mm']);
// Округление, метры: 1 мм, 5 мм, 1 см, 5 см, 10 см.
export const ANNOTATION_STEPS = Object.freeze([0.001, 0.005, 0.01, 0.05, 0.1]);
export const DEFAULT_ANNOTATION_SETTINGS = Object.freeze({
    annotationsEnabled: true,
    annotationMarks: [],
    annotationColor: '#b0473f',
    annotationUnits: 'm',
    annotationStep: 0.001,
    annotationSize: 1,
    annotationFade: 150,
});
export const ANNOTATION_RANGES = Object.freeze({ size: [0.5, 2.5, 0.05], fade: [10, 2000, 5] });

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const metres = (value) => Math.round(Math.min(5000, Math.max(-5000, value)) * 10000) / 10000;
const clamp = (value, [min, max], fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback);

export function normalizeAnnotationMark(value, index = 0) {
    if (!value || ![value.x, value.y, value.z].every((v) => Number.isFinite(Number(v)))) return null;
    return {
        id: ID.test(String(value.id ?? '')) ? value.id : `mark-${index}`,
        x: metres(Number(value.x)), y: metres(Number(value.y)), z: metres(Number(value.z)),
        ...(value.zero === true ? { zero: true } : {}),
        ...(value.ground === true ? { ground: true } : {}),
    };
}

export function normalizeAnnotationSettings(settings = {}) {
    const ids = new Set();
    const marks = (Array.isArray(settings.annotationMarks) ? settings.annotationMarks : [])
        .slice(0, ANNOTATION_LIMITS.marks).map(normalizeAnnotationMark).filter(Boolean)
        .map((mark, index) => { while (ids.has(mark.id)) mark.id = `${mark.id.slice(0, 54)}-${index}`; ids.add(mark.id); return mark; });
    // Ноль один: лишние снимаются, а без него нулём становится первая.
    const zero = marks.findIndex((mark) => mark.zero);
    marks.forEach((mark, index) => { if (index !== zero) delete mark.zero; });
    if (zero < 0 && marks.length) marks[0].zero = true;
    const d = DEFAULT_ANNOTATION_SETTINGS;
    return {
        annotationsEnabled: settings.annotationsEnabled !== false,
        annotationMarks: marks,
        annotationColor: COLOR.test(String(settings.annotationColor ?? '')) ? settings.annotationColor : d.annotationColor,
        annotationUnits: ANNOTATION_UNITS.includes(settings.annotationUnits) ? settings.annotationUnits : d.annotationUnits,
        annotationStep: ANNOTATION_STEPS.includes(Number(settings.annotationStep)) ? Number(settings.annotationStep) : d.annotationStep,
        annotationSize: clamp(settings.annotationSize, ANNOTATION_RANGES.size, d.annotationSize),
        annotationFade: clamp(settings.annotationFade, ANNOTATION_RANGES.fade, d.annotationFade),
    };
}

// Число отметки, как на чертеже: знак («+», «−», у нуля «±»), единицы и
// округление из настроек; в метрах запятая (ГОСТ 21.101), знаков после неё —
// сколько нужно шагу: 1 мм → «+1,250», 1 см → «+1,25».
const UNIT = { m: 1, cm: 100, mm: 1000 };
export function formatLevel(height, { units = 'm', step = 0.001, ru = true } = {}) {
    const scale = UNIT[units] ?? 1;
    const rounded = Math.round(height / step) * step;
    const shown = Math.abs(rounded * scale);
    const decimals = Math.max(0, Math.ceil(-Math.log10(step * scale) - 1e-9));
    const text = shown.toFixed(decimals).replace('.', ru ? ',' : '.');
    const sign = Math.abs(rounded) < step / 2 ? '±' : rounded > 0 ? '+' : '−';
    return `${sign}${text}`;
}

// Высота отметки от нулевой; без нуля — от уровня 0 сцены.
export function markLevels(marks) {
    const zero = marks.find((mark) => mark.zero);
    return new Map(marks.map((mark) => [mark.id, mark.y - (zero?.y ?? 0)]));
}

// Отметки не налезают друг на друга: ярлык каждой — прямоугольник на экране
// над её точкой; кто ближе к камере — остаётся внизу, дальние поднимаются на
// следующую полку (выноска длиннее), пока не найдут свободное место.
// rects: [{ id, x, y (точка на экране, px), width, height, depth }], step — высота полки.
export function stackLabels(rects, step, levels = 4) {
    const placed = [], out = new Map();
    for (const rect of [...rects].sort((a, b) => a.depth - b.depth)) {
        let level = 0;
        for (; level < levels - 1; level += 1) {
            const box = { left: rect.x, right: rect.x + rect.width, top: rect.y - rect.height - level * step, bottom: rect.y - level * step };
            if (!placed.some((other) => other.left < box.right && box.left < other.right && other.top < box.bottom && box.top < other.bottom)) break;
        }
        placed.push({ left: rect.x, right: rect.x + rect.width, top: rect.y - rect.height - level * step, bottom: rect.y - level * step });
        out.set(rect.id, level);
    }
    return out;
}
