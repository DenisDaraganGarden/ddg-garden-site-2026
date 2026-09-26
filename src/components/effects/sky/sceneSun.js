// Солнце сцены — одно на свет, небо и компас (homeSceneLighting.js,
// NorthCompass.jsx), чтобы кадр и стрелка не разошлись.
//
// Художественное (сайт и проекты без адреса): дуга skyModel — час, азимут в
// полдень и высота в полдень, как их поставил автор.
// Настоящее (sunReal в «Участке» с координатами из «Окружения»): солнце над
// этим местом в этот день и час по NOAA (solarPosition.js), повёрнутое по
// северу участка. Луна и звёзды ходят по небесному экватору этого места:
// полюс мира стоит на севере на высоте широты, кульминация — в настоящий
// солнечный полдень (arcTime — час от него).
import { solveSunElevationAzimuth } from './skyModel.js';
import { DAYS_IN_YEAR, defaultUtcOffset, sceneSunAzimuth, solarNoonHours, solarPosition } from './solarPosition.js';
import { siteNorth } from '../../../planting/siteNorth.js';

// Как finiteNumber света: художественная дуга читает ключи ровно как раньше.
const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
// Пустое значение (null — «по долготе») не ноль.
const given = (value, fallback) => (value !== null && value !== undefined && value !== '' ? number(value, fallback) : fallback);

export const REAL_SUN_DEFAULT_DAY = 172;

// Есть ли у сцены всё для настоящего солнца.
export const hasSiteLocation = (settings) => [settings?.geoLatitude, settings?.geoLongitude]
    .every((value) => given(value, null) !== null);
export const hasRealSun = (settings) => settings?.sunReal === true && hasSiteLocation(settings);

export function resolveSceneSun(settings = {}) {
    const timeOfDay = number(settings.timeOfDay, 12);
    if (hasRealSun(settings)) {
        const lat = Number(settings.geoLatitude), lon = Number(settings.geoLongitude);
        const utcOffset = given(settings.sunUtcOffset, defaultUtcOffset(lon));
        const dayOfYear = Math.min(DAYS_IN_YEAR, Math.max(1, Math.round(given(settings.sunDayOfYear, REAL_SUN_DEFAULT_DAY))));
        const north = siteNorth(settings);
        const now = solarPosition({ lat, lon, dayOfYear, clockHours: timeOfDay, utcOffset });
        const noonHours = solarNoonHours({ lon, dayOfYear, utcOffset });
        // Экватор кульминирует на юге (в южном полушарии — на севере) на 90° − |широта|.
        const equatorBearing = sceneSunAzimuth(lat >= 0 ? 180 : 0, north);
        return {
            real: true,
            elevationDeg: now.elevationDeg,
            azimuthDeg: sceneSunAzimuth(now.azimuthDeg, north),
            compassAzimuthDeg: now.azimuthDeg,
            arcTime: ((12 + timeOfDay - noonHours) % 24 + 24) % 24,
            arcBearing: equatorBearing,
            arcNoonElevation: 90 - Math.abs(lat),
            dayOfYear,
            utcOffset,
            noonHours,
        };
    }
    const sunBearing = number(settings.sunBearing, number(settings.moonAzimuth, 42));
    const sunNoonElevation = number(settings.sunNoonElevation, number(settings.moonElevation, 18));
    return { real: false, ...solveSunElevationAzimuth(timeOfDay, sunBearing, sunNoonElevation), arcTime: timeOfDay, arcBearing: sunBearing, arcNoonElevation: sunNoonElevation };
}
