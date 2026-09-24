// Окружение участка (проект «Участок»): где участок на Земле, сколько карты
// вокруг, как она стоит относительно модели и каких она цветов. Сами дома и
// дороги — в файле проекта (~/Ouroboros/projects/<id>/surroundings.json,
// scripts/surroundings.mjs), здесь только числа, которыми его показывают.
//
// Ключи не публикуются и не входят в снимки камер (их нет в
// publishedHomeSceneKeys): адрес и координаты заказчика не уходят на сайт, а
// окружение одно на все камеры. northAngle — тот же север, что у компаса
// участка: градусы по часовой стрелке от зелёной оси SketchUp до истинного севера.
export const SURROUNDINGS_RANGES = Object.freeze({
    radius: [100, 1500, 10], clear: [0, 150, 1], relief: [0, 2, 0.05], offset: [-300, 300, 0.1], north: [-180, 180, 0.5],
});
export const SURROUNDINGS_COLORS = Object.freeze({
    surroundingsBuildingColor: '#eceae5',
    surroundingsGroundColor: '#d8d5cc',
    surroundingsRoadColor: '#b3b0a8',
    surroundingsGreenColor: '#b4bda6',
    surroundingsWaterColor: '#a7bac4',
});
export const DEFAULT_SURROUNDINGS_SETTINGS = Object.freeze({
    surroundingsEnabled: true,
    geoLatitude: null,
    geoLongitude: null,
    geoAddress: '',
    surroundingsRadius: 300,
    surroundingsClear: 15,
    surroundingsRelief: 1,
    surroundingsOffsetX: 0,
    surroundingsOffsetZ: 0,
    northAngle: 0,
    surroundingsBuildings: true,
    surroundingsTrees: true,
    surroundingsFences: true,
    ...SURROUNDINGS_COLORS,
    // Метка загруженного файла: другая метка — редактор перечитывает файл
    // (агент поправил дом — сменил метку, и окружение перестроилось).
    surroundingsStamp: '',
});

const number = (value, fallback, [min, max, step]) => {
    const parsed = Number(value);
    if (value === null || value === '' || !Number.isFinite(parsed)) return fallback;
    const clamped = Math.min(max, Math.max(min, parsed));
    return step >= 1 ? Math.round(clamped) : Math.round(clamped * 1000) / 1000;
};
const degrees = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(((((parsed + 180) % 360) + 360) % 360 - 180) * 1000) / 1000 : 0;
};
const coordinate = (value, limit) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? Math.round(parsed * 1e7) / 1e7 : null;
};
const color = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : fallback);

export function normalizeSurroundingsSettings(settings = {}) {
    const lat = coordinate(settings.geoLatitude, 85), lon = coordinate(settings.geoLongitude, 180);
    const located = lat !== null && lon !== null;
    return {
        surroundingsEnabled: settings.surroundingsEnabled !== false,
        geoLatitude: located ? lat : null,
        geoLongitude: located ? lon : null,
        geoAddress: String(settings.geoAddress ?? '').slice(0, 240),
        surroundingsRadius: number(settings.surroundingsRadius, DEFAULT_SURROUNDINGS_SETTINGS.surroundingsRadius, SURROUNDINGS_RANGES.radius),
        surroundingsClear: number(settings.surroundingsClear, DEFAULT_SURROUNDINGS_SETTINGS.surroundingsClear, SURROUNDINGS_RANGES.clear),
        surroundingsRelief: number(settings.surroundingsRelief, DEFAULT_SURROUNDINGS_SETTINGS.surroundingsRelief, SURROUNDINGS_RANGES.relief),
        surroundingsOffsetX: number(settings.surroundingsOffsetX, 0, SURROUNDINGS_RANGES.offset),
        surroundingsOffsetZ: number(settings.surroundingsOffsetZ, 0, SURROUNDINGS_RANGES.offset),
        northAngle: degrees(settings.northAngle),
        surroundingsBuildings: settings.surroundingsBuildings !== false,
        surroundingsTrees: settings.surroundingsTrees !== false,
        surroundingsFences: settings.surroundingsFences !== false,
        ...Object.fromEntries(Object.entries(SURROUNDINGS_COLORS).map(([key, fallback]) => [key, color(settings[key], fallback)])),
        surroundingsStamp: typeof settings.surroundingsStamp === 'string' ? settings.surroundingsStamp.slice(0, 40) : '',
    };
}
