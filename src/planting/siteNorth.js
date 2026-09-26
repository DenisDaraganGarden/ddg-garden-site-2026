import { wrapDegrees } from './settings.js';

// Север проекта без React: его читают и свет сцены (настоящее солнце,
// sceneSun.js), и компас с генпланом (north.js). В сцене −Z — север, +X —
// восток (terrainModel WORLD_AXES); туда же после выгрузки смотрит зелёная ось
// SketchUp. Модель несёт свой север с собой: повернули её «Поворотом» —
// повернулся и север. northAngle — поправка на случай, когда зелёная ось
// чертежа смотрит не на север: на сколько градусов по часовой стрелке (сверху)
// от неё истинный север. Азимуты здесь — как на компасе: градусы по часовой
// от севера.
const DEG = Math.PI / 180;
export const bearingOf = (x, z) => (Math.atan2(x, -z) / DEG + 360) % 360;

// Модель участка — первая модель SketchUp в расстановке.
export function siteNorth(settings) {
    const model = (settings.placedObjects ?? []).find((object) => object.kind === 'model' && settings.sketchupModels?.[object.id]);
    return wrapDegrees((Number(settings.northAngle) || 0) - (Number(model?.rotation) || 0));
}
