// Настоящее солнце: где оно на небе над участком в данный день и час. Формулы
// солнечного калькулятора NOAA (по Меесу): склонение, уравнение времени,
// часовой угол, высота с атмосферной рефракцией и азимут. Точность — сотые
// градуса, для эскизной инсоляции с запасом. Сверка — solarPosition.check.js.
//
// Азимуты — как на компасе: градусы по часовой от истинного севера. В сцену
// их переводит sceneSunAzimuth по северу участка (src/planting/north.js).
const DEG = Math.PI / 180;
const sin = (d) => Math.sin(d * DEG), cos = (d) => Math.cos(d * DEG), tan = (d) => Math.tan(d * DEG);
const wrap = (value, span) => ((value % span) + span) % span;

// Год для дня года: невисокосный, чтобы 365 дней шли по одному календарю.
// От года к году солнце в тот же день сдвигается на сотые доли градуса.
export const SOLAR_YEAR = 2026;
export const DAYS_IN_YEAR = 365;

// Часовой пояс по долготе, если он не задан: целые часы от Гринвича. Для
// России совпадает с поясами, кроме пограничных долгот — там пояс задают.
export const defaultUtcOffset = (lon) => (Number.isFinite(lon) ? Math.max(-12, Math.min(14, Math.round(lon / 15))) : 0);

// Юлианский день момента: день года, часы по местным часам, пояс.
function julianDay(dayOfYear, clockHours, utcOffset, year = SOLAR_YEAR) {
    const ms = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000 + (clockHours - utcOffset) * 3600000;
    return ms / 86400000 + 2440587.5;
}

// Высота над горизонтом (с рефракцией) и азимут от севера, градусы.
export function solarPosition({ lat, lon, dayOfYear, clockHours, utcOffset = defaultUtcOffset(lon), year = SOLAR_YEAR }) {
    const T = (julianDay(dayOfYear, clockHours, utcOffset, year) - 2451545) / 36525;
    const L0 = wrap(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
    const omega = 125.04 - 1934.136 * T;
    const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
    const epsilon0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const epsilon = epsilon0 + 0.00256 * cos(omega);
    const declination = Math.asin(sin(epsilon) * sin(lambda)) / DEG;
    const y = tan(epsilon / 2) ** 2;
    const equationOfTime = 4 * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0)
        - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)) / DEG;
    const trueSolarMinutes = wrap(clockHours * 60 + equationOfTime + 4 * lon - 60 * utcOffset, 1440);
    const hourAngle = trueSolarMinutes / 4 < 0 ? trueSolarMinutes / 4 + 180 : trueSolarMinutes / 4 - 180;
    const cosZenith = Math.max(-1, Math.min(1, sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle)));
    const zenith = Math.acos(cosZenith) / DEG;
    const geometric = 90 - zenith;
    // Рефракция приподнимает солнце у горизонта — на полградуса на закате.
    const refraction = geometric > 85 ? 0
        : geometric > 5 ? 58.1 / tan(geometric) - 0.07 / tan(geometric) ** 3 + 0.000086 / tan(geometric) ** 5
            : geometric > -0.575 ? 1735 + geometric * (-518.2 + geometric * (103.4 + geometric * (-12.79 + geometric * 0.711)))
                : -20.772 / tan(geometric);
    const denominator = cos(lat) * sin(zenith);
    const cosAzimuth = Math.abs(denominator) < 1e-9 ? 1 : Math.max(-1, Math.min(1, (sin(lat) * cos(zenith) - sin(declination)) / denominator));
    const azimuth = hourAngle > 0 ? wrap(Math.acos(cosAzimuth) / DEG + 180, 360) : wrap(540 - Math.acos(cosAzimuth) / DEG, 360);
    return { elevationDeg: geometric + refraction / 3600, azimuthDeg: azimuth, declinationDeg: declination, equationOfTimeMin: equationOfTime, hourAngleDeg: hourAngle };
}

// Солнечный полдень по местным часам (часы) — солнце выше всего.
export function solarNoonHours({ lon, dayOfYear, utcOffset = defaultUtcOffset(lon), year = SOLAR_YEAR }) {
    let hours = 12;
    for (let i = 0; i < 3; i += 1) {
        const { equationOfTimeMin } = solarPosition({ lat: 0, lon, dayOfYear, clockHours: hours, utcOffset, year });
        hours = (720 - 4 * lon - equationOfTimeMin + 60 * utcOffset) / 60;
    }
    return hours;
}

// Восход и закат по местным часам (часы): верхний край диска на горизонте с
// рефракцией — 0,833° под геометрическим горизонтом, как в NOAA. Полярный
// день или ночь — polar: 'day' | 'night', восхода и заката тогда нет.
export function sunTimes({ lat, lon, dayOfYear, utcOffset = defaultUtcOffset(lon), year = SOLAR_YEAR }) {
    const noon = solarNoonHours({ lon, dayOfYear, utcOffset, year });
    const event = (sign) => {
        let hours = noon;
        for (let i = 0; i < 3; i += 1) {
            const { declinationDeg: d, equationOfTimeMin } = solarPosition({ lat, lon, dayOfYear, clockHours: hours, utcOffset, year });
            const cosH = (sin(-0.833) - sin(lat) * sin(d)) / (cos(lat) * cos(d));
            if (cosH > 1) return 'night';
            if (cosH < -1) return 'day';
            hours = (720 - 4 * (lon + sign * Math.acos(cosH) / DEG) - equationOfTimeMin + 60 * utcOffset) / 60;
        }
        return hours;
    };
    const sunrise = event(1), sunset = event(-1);
    const polar = typeof sunrise === 'string' ? sunrise : typeof sunset === 'string' ? sunset : null;
    return polar ? { noon, sunrise: null, sunset: null, polar } : { noon, sunrise, sunset, polar: null };
}

// Азимут по компасу → азимут неба сцены (skyModel: от +Z к +X). В сцене −Z —
// север чертежа; north — на сколько градусов по часовой от него истинный
// север (siteNorth). Солнце на истинном азимуте B стоит в сцене на B + north
// по часовой от −Z, а небо считает от +Z.
export const sceneSunAzimuth = (azimuthDeg, north = 0) => wrap(180 - (azimuthDeg + north), 360);

// День года ↔ дата для подписи ползунка.
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayOfYearLabel(dayOfYear, ru = true) {
    const date = new Date(Date.UTC(SOLAR_YEAR, 0, Math.round(dayOfYear)));
    return ru ? `${date.getUTCDate()} ${MONTHS_RU[date.getUTCMonth()]}` : `${MONTHS_EN[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
export const dayOfYearOf = (month, day) => Math.round((Date.UTC(SOLAR_YEAR, month - 1, day) - Date.UTC(SOLAR_YEAR, 0, 1)) / 86400000) + 1;
