// Встроенные типовые светильники — «вот такой внешний вид» без изделия.
// Форма записи — как у библиотеки (docs/garden-lighting-2026-09-25.md, «Типы
// и библиотека»). Все числа — прикидка по типовым садовым приборам, а не
// паспорт: каждое поле записи в source — 'guess', ведомость покажет их как
// непроверенные.
const GRAPHITE = { color: '#2b2d2f', metal: 0.4, rough: 0.5 };
// Кольцо грунтовых — нержавейка: по нему ходят и ездят. h грунтовых — глубина
// корпуса в земле, как высота в паспорте; кольцо выступает на 15 мм при любой.
const STEEL = { color: '#9a9c9e', metal: 1, rough: 0.35 };
const MAINS = { volts: 230, current: 'ac', driver: 'integrated' };
const LOW = { volts: 24, current: 'dc', driver: 'remote' };

// Пути всех листьев записи: 'optics.lumens', 'control' (массив — один лист).
const leaves = (value, path) => (value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, v]) => leaves(v, path ? `${path}.${key}` : key))
    : [path]);
const freeze = (value) => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};
const generic = ({ id, ru, en, ...data }) => ({ id, ru, en, ...data, source: Object.fromEntries(leaves(data, '').map((path) => [path, 'guess'])), generic: true });

export const BUILTIN_LUMINAIRES = freeze([
    generic({
        id: 'bollard-80', ru: 'Боллард 0,8 м', en: 'Bollard 0.8 m',
        housing: { shape: 'bollard', h: 0.8, d: 0.16, ...GRAPHITE },
        optics: { lumens: 450, beam: 120, cct: 3000, profile: 'bollard' },
        mount: 'ground', pitch: -90, power: { watts: 8, ...MAINS }, control: ['switch', 'dali'], ip: 65,
    }),
    generic({
        id: 'bollard-50', ru: 'Боллард 0,5 м', en: 'Bollard 0.5 m',
        housing: { shape: 'bollard', h: 0.5, d: 0.16, ...GRAPHITE },
        optics: { lumens: 300, beam: 120, cct: 3000, profile: 'bollard' },
        mount: 'ground', pitch: -90, power: { watts: 6, ...MAINS }, control: ['switch', 'dali'], ip: 65,
    }),
    generic({
        id: 'spike-24', ru: 'Спот на колышке 24°', en: 'Spike spot 24°',
        housing: { shape: 'spike', h: 0.12, d: 0.07, ...GRAPHITE },
        optics: { lumens: 500, beam: 24, field: 40, cct: 3000, profile: 'spot' },
        mount: 'ground', pitch: 35, power: { watts: 7, ...MAINS }, control: ['switch'], ip: 65,
    }),
    generic({
        id: 'spike-lv-36', ru: 'Спот 24 В 36°', en: 'Spike spot 24 V 36°',
        housing: { shape: 'spike', h: 0.1, d: 0.06, ...GRAPHITE },
        optics: { lumens: 350, beam: 36, field: 60, cct: 3000, profile: 'spot' },
        mount: 'ground', pitch: 35, power: { watts: 5, ...LOW }, control: ['switch', 'dali'], ip: 65,
    }),
    generic({
        id: 'uplight-15', ru: 'Грунтовый вверх 15°', en: 'In-ground uplight 15°',
        housing: { shape: 'inground', h: 0.1, d: 0.16, ...STEEL },
        optics: { lumens: 900, beam: 15, field: 30, cct: 3000, profile: 'spot' },
        mount: 'ground', pitch: 88, power: { watts: 12, ...MAINS }, control: ['switch'], ip: 67,
    }),
    generic({
        id: 'uplight-40', ru: 'Грунтовый вверх 40°', en: 'In-ground uplight 40°',
        housing: { shape: 'inground', h: 0.1, d: 0.16, ...STEEL },
        optics: { lumens: 700, beam: 40, field: 70, cct: 3000, profile: 'flood' },
        mount: 'ground', pitch: 85, power: { watts: 10, ...MAINS }, control: ['switch'], ip: 67,
    }),
    generic({
        id: 'wall-down', ru: 'Настенный вниз', en: 'Wall downlight',
        housing: { shape: 'wall', w: 0.12, h: 0.2, d: 0.1, ...GRAPHITE },
        optics: { lumens: 450, beam: 100, cct: 3000, profile: 'lambert' },
        mount: 'wall', pitch: -90, power: { watts: 7, ...MAINS }, control: ['switch'], ip: 65,
    }),
    // Два луча по 350 лм — одна запись 700 лм с профилем «вверх-вниз».
    generic({
        id: 'wall-updown', ru: 'Настенный вверх-вниз', en: 'Wall up-down light',
        housing: { shape: 'wall', w: 0.1, h: 0.24, d: 0.1, ...GRAPHITE },
        optics: { lumens: 700, beam: 30, field: 50, cct: 3000, profile: 'updown' },
        mount: 'wall', pitch: 90, power: { watts: 9, ...MAINS }, control: ['switch'], ip: 65,
    }),
    generic({
        id: 'step', ru: 'Для ступеней', en: 'Step light',
        housing: { shape: 'step', w: 0.16, h: 0.08, d: 0.004, ...GRAPHITE },
        optics: { lumens: 80, beam: 100, field: 140, cct: 3000, profile: 'flood' },
        mount: 'wall', pitch: -35, power: { watts: 2, ...LOW }, control: ['switch'], ip: 65,
    }),
    generic({
        id: 'post-3', ru: 'Фонарь 3 м', en: 'Post lantern 3 m',
        housing: { shape: 'post', h: 3, d: 0.08, ...GRAPHITE },
        optics: { lumens: 1200, beam: 120, cct: 3000, profile: 'bollard' },
        mount: 'ground', pitch: -90, power: { watts: 14, ...MAINS }, control: ['switch'], ip: 65,
    }),
]);

export const luminaireById = (list, id) => list?.find((type) => type.id === id) ?? null;
