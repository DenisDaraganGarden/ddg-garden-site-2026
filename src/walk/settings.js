// Старт прогулки — откуда он начинает путь: точка на поверхности и куда
// лицом (yaw, рад: 0 — к +Z, к востоку — положительный). Один на проект,
// общий для камер. Нет старта — встаёт там, куда смотрит камера.
export const DEFAULT_WALK_SETTINGS = Object.freeze({ walkStart: null });

const metres = (value) => Math.round(Math.min(5000, Math.max(-5000, value)) * 10000) / 10000;

export function normalizeWalkStart(value) {
    if (!value || ![value.x, value.y, value.z].every((v) => Number.isFinite(Number(v)))) return null;
    const yaw = Number(value.yaw);
    return {
        x: metres(Number(value.x)), y: metres(Number(value.y)), z: metres(Number(value.z)),
        yaw: Number.isFinite(yaw) ? Math.round(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 10000) / 10000 : 0,
    };
}

export const normalizeWalkSettings = (settings = {}) => ({ walkStart: normalizeWalkStart(settings.walkStart) });
