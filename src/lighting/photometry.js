// Фотометрия светильников: кривая силы света (КСС), люмены → канделы, цвет по
// CCT, паспорта IES и EULUMDAT, освещённость в точке. Чистые функции — одни и
// те же в браузере (строка текстуры профилей светового поля) и в узле
// (проверки, scripts/lighting.mjs).
//
// КСС здесь осесимметрична: I(θ) — сила под углом θ от оси луча, 0…π.
// Профиль — PROFILE_SAMPLES отсчётов по θ, пик = 1; абсолютная сила — пик в
// канделах отдельно (peakCandela или паспорт).
export const PROFILE_SAMPLES = 128;

// Сцена не физическая по абсолютным числам (солнце к луне ≈ 64:1), поэтому
// один коэффициент: E_сцены = 0,2 · E_лк, т. е. сила в сцене = 0,2 · кд.
// Подобран при ACES и альбедо 0,3: 2 лк ≈ 55/255, 10 лк ≈ 138, 30 лк ≈ 206 —
// дорожка в 10 лк читается светлой плиткой, лунная земля ≈ 18. Ручка
// «Экспозиция света» (EV) сдвигает это в шейдере, данные не трогает.
export const LUX_TO_SCENE = 0.2;

const DEG = Math.PI / 180;
// Шаги интеграла по θ: у луча 8° полуугол 4° — это ~180 шагов, Симпсон точен.
const STEPS = 8192;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEFAULT_BEAM = { spot: 24, flood: 60, updown: 24, lambert: 120 };

// Поток через сферу: Φ = 2π ∫₀^π I(θ) sin θ dθ (Симпсон).
function sphereIntegral(fn) {
    const h = Math.PI / STEPS;
    let sum = 0;
    for (let i = 0; i <= STEPS; i += 1) sum += (i === 0 || i === STEPS ? 1 : i % 2 ? 4 : 2) * fn(i * h) * Math.sin(i * h);
    return (2 * Math.PI * sum * h) / 3;
}

function peakOne(f) {
    let peak = 0;
    for (let i = 0; i <= STEPS; i += 1) peak = Math.max(peak, f((i * Math.PI) / STEPS));
    return peak > 0 ? (t) => f(t) / peak : f;
}

// Луч прожектора — обобщённая гауссиана I = exp(−a·θ^b): 50 % на полуугле
// луча (beam, по CIE/IES — «beam angle»), 10 % на полуугле поля (field).
// Из двух точек: b = ln(ln10/ln2) / ln(θ₁₀/θ₅₀), a = ln2 / θ₅₀^b. b в
// [1,2; 8]: ниже — хвост на всю полусферу, выше — «прожектор-стакан» со
// ступенькой. Где сила падает до 1 %, хвост плавно гасится в точный ноль за
// 8 % угла — у профиля есть граница, дальность и клетки поля не тянутся зря.
function beamShape(beam, field) {
    const half = (beam / 2) * DEG, edge = (Math.max(field ?? 1.8 * beam, beam * 1.01) / 2) * DEG;
    const b = clamp(Math.log(Math.LN10 / Math.LN2) / Math.log(edge / half), 1.2, 8);
    const a = Math.LN2 / half ** b;
    const cut = Math.min((Math.log(100) / a) ** (1 / b), 175 * DEG), end = Math.min(cut * 1.08, Math.PI);
    return (t) => Math.exp(-a * t ** b) * (1 - smoothstep(cut, end, t));
}

const SHAPES = {
    spot: (beam, field) => beamShape(beam, field),
    flood: (beam, field) => beamShape(beam, field),
    // Рассеиватель: cos^m θ, m — чтобы 50 % было на полуугле луча
    // (луч 120° → m = 1, чистый Ламберт).
    lambert: (beam) => {
        const m = Math.log(0.5) / Math.log(Math.cos((beam / 2) * DEG));
        return (t) => (t < Math.PI / 2 ? Math.cos(t) ** m : 0);
    },
    // Столбик: ось вниз, свет выходит вбок и вниз, выше горизонта — ничего
    // (колпак). Под собой слабее (0,15): лампа смотрит в отражатель, не в землю.
    bollard: () => (t) => (0.15 + 0.85 * Math.sin(t) ** 2) * (1 - smoothstep(80 * DEG, 92 * DEG, t)),
    // Вверх-вниз (настенный): два одинаковых луча по оси и против неё; силы
    // складываются — это два источника.
    updown: (beam, field) => { const lobe = beamShape(beam, field); return (t) => lobe(t) + lobe(Math.PI - t); },
    // Шар: во все стороны, кроме цоколя — последние 30° к π провал до 0,5.
    omni: () => (t) => 1 - 0.5 * smoothstep(150 * DEG, 180 * DEG, t),
};

// optics = { profile, beam, field? }, углы — полные, в градусах.
// Возвращает θ (рад) → относительная сила, пик = 1. Не число в угле — как
// пропуск (иначе весь профиль NaN и свет молча гаснет).
// Луч не уже 6°: шейдер берёт строку из 128 отсчётов (шаг 1,42°) с линейной
// интерполяцией, а люмены считаются по гладкой функции — у узкого луча
// треугольник между отсчётами 0 и 1 толще гауссианы и несёт лишний поток:
// 1° → +90 %, 2° → +17 %, 4° → +5,5 %, 6° → +2,6 %, 8° → +1,6 %.
// ponytail: «стакан» 6° (поле ≈ луч, край уже шага строки) всё ещё +10 %;
// понадобится — поправка пика на Φ_функции/Φ_строки в fixtures.js.
export function shapeFunction(optics) {
    const profile = optics?.profile;
    if (!Object.hasOwn(SHAPES, profile)) throw new Error(`Фотометрия: неизвестная форма «${profile}»`);
    const finite = (v) => (Number.isFinite(v) ? v : undefined);
    const beam = clamp(finite(optics.beam) ?? DEFAULT_BEAM[profile] ?? 60, 6, 179);
    return peakOne(SHAPES[profile](beam, finite(optics.field)));
}

// Строка текстуры профилей: отсчёт i — θ = i/(N−1)·π, пик снова 1 (сетка
// может пройти мимо вершины, как у столбика около 81°).
export function profileSamples(fn) {
    const out = new Float32Array(PROFILE_SAMPLES);
    let peak = 0;
    for (let i = 0; i < PROFILE_SAMPLES; i += 1) { out[i] = Math.max(0, fn((i / (PROFILE_SAMPLES - 1)) * Math.PI)); peak = Math.max(peak, out[i]); }
    if (peak > 0) for (let i = 0; i < PROFILE_SAMPLES; i += 1) out[i] /= peak;
    return out;
}

// Кандела на пике: Φ = I₀ · 2π ∫ fn(θ) sin θ dθ. Интегрируется сама функция,
// а не 128 отсчётов — у узкого луча в них всего три точки.
export function peakCandela(fn, lumens) {
    const solid = sphereIntegral(fn);
    return solid > 0 ? lumens / solid : 0;
}

// Кривая Планка в xy — кубический сплайн Kim et al. (2002), 1667–25000 K.
function planckXY(T) {
    const x = T <= 4000
        ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
        : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
    const y = T <= 2222 ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
        : T <= 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
            : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
    return [x, y];
}

// Дневной свет CIE (серия D), 4000–25000 K: при 6504 K это ровно D65.
function daylightXY(T) {
    const x = T <= 7000
        ? -4.607e9 / T ** 3 + 2.9678e6 / T ** 2 + 0.09911e3 / T + 0.244063
        : -2.0064e9 / T ** 3 + 1.9018e6 / T ** 2 + 0.24748e3 / T + 0.23704;
    return [x, -3 * x * x + 2.87 * x - 0.275];
}

// CCT → линейный sRGB (Rec.709, D65), яркость Y = 1.
// Холоднее 4500 K — кривая Планка (Kim), теплее 5500 K — дневной свет CIE,
// между ними — смесь, как у опорного источника TM-30. Почему не чистый
// Планк: при 6500 K он на Δuv ≈ 0,003 ниже D65, и «холодный белый» вышел бы
// [1,04; 0,98; 1,04] — пурпурный оттенок, в сцене с белым D65 это ошибка.
export function cctToLinear(kelvin) {
    const T = clamp(kelvin, 1700, 12000);
    const w = clamp((T - 4500) / 1000, 0, 1), p = planckXY(T), d = w > 0 ? daylightXY(T) : p;
    const x = p[0] + (d[0] - p[0]) * w, y = p[1] + (d[1] - p[1]) * w;
    const X = x / y, Z = (1 - x - y) / y;
    // XYZ → линейный sRGB, IEC 61966-2-1.
    const rgb = [
        3.2404542 * X - 1.5371385 - 0.4985314 * Z,
        -0.969266 * X + 1.8760108 + 0.041556 * Z,
        0.0556434 * X - 0.2040259 + 1.0572252 * Z,
    ].map((v) => Math.max(0, v));
    // Отрицательный синий у 1700 K срезан — яркость собирается заново.
    const Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return rgb.map((v) => v / Y);
}

// Разбор чисел паспорта: по счёту, с понятной ошибкой, где кончилось.
function reader(numbers, format) {
    let at = 0;
    return (n) => {
        if (at + n > numbers.length) throw new Error(`${format}: файл оборван — ждали ещё ${at + n - numbers.length} чисел`);
        const out = numbers.slice(at, at + n);
        const bad = out.findIndex((v) => !Number.isFinite(v));
        if (bad >= 0) throw new Error(`${format}: не число на месте ${at + bad + 1}`);
        at += n;
        return out;
    };
}

const count = (value, what, format, least = 1) => {
    if (!Number.isInteger(value) || value < least) throw new Error(`${format}: ${what} — ${value}, нужно целое не меньше ${least}`);
    return value;
};

const ascending = (angles, what, format) => {
    if (angles.some((v, i) => i > 0 && v <= angles[i - 1])) throw new Error(`${format}: ${what} не по возрастанию`);
    return angles;
};

// IES LM-63 (1991/1995/2002). candela[h][v] — уже канделы: × multiplier ×
// коэффициенты балласта. Только фотометрия типа C (ось 0° — надир), как у
// всех садовых и архитектурных приборов; тип A/B — ошибка, а не тихая ложь.
export function parseIES(text) {
    // Концы строк — любые: у старых маковских выгрузок голый CR.
    const lines = String(text).split(/\r\n|\r|\n/);
    const tiltAt = lines.findIndex((line) => /^\s*TILT\s*=/i.test(line));
    if (tiltAt < 0) throw new Error('IES: нет строки TILT= — это не файл LM-63');
    const keywords = {};
    let last = null;
    for (const line of lines.slice(0, tiltAt)) {
        const m = line.match(/^\s*\[([^\]]+)\]\s*(.*?)\s*$/);
        if (!m) continue;
        const key = m[1].trim().toUpperCase();
        if (key === 'MORE' && last) keywords[last] += ` ${m[2]}`;
        else { last = key; keywords[key] = m[2]; }
    }
    const tilt = lines[tiltAt].split('=')[1].trim().toUpperCase();
    // Числа идут как угодно по строкам, разделители — пробелы или запятые.
    const take = reader(lines.slice(tiltAt + 1).join(' ').split(/[\s,]+/).filter(Boolean).map(Number), 'IES');
    if (tilt === 'INCLUDE') { const [, pairs] = take(2); take(2 * count(pairs, 'число углов TILT', 'IES')); }
    else if (tilt !== 'NONE') throw new Error(`IES: TILT=${tilt} ссылается на внешний файл — не поддерживается`);
    const [lamps, lumensPerLamp, multiplier, nv, nh, type, units, width, length, height] = take(10);
    const [ballast, lampFactor, watts] = take(3);
    if (type !== 1) throw new Error(`IES: фотометрия типа ${type === 2 ? 'B' : type === 3 ? 'A' : type} — поддерживается только тип C`);
    // В LM-63-1995 второе число — фотометрический коэффициент балласта и лампы,
    // в 2002 — «на будущее» (1); ноль в кривых файлах — как 1.
    const factor = multiplier * (ballast > 0 ? ballast : 1) * (lampFactor > 0 ? lampFactor : 1);
    const verticalAngles = ascending(take(count(nv, 'число углов γ', 'IES', 2)), 'углы γ', 'IES');
    const horizontalAngles = ascending(take(count(nh, 'число плоскостей C', 'IES')), 'плоскости C', 'IES');
    const candela = horizontalAngles.map(() => take(nv).map((v) => v * factor));
    // Без симметрии LM-63 велит кончать на 360°, но «0…350» встречается: круг
    // замыкаем плоскостью C0, как Isym 0 у EULUMDAT, — иначе среднее по азимуту
    // теряет последний сектор и половину веса крайних плоскостей.
    const end = horizontalAngles[nh - 1];
    if (horizontalAngles[0] === 0 && end > 180 && end < 360) { horizontalAngles.push(360); candela.push(candela[0]); }
    const metre = units === 1 ? 0.3048 : 1;
    return {
        verticalAngles, horizontalAngles, candela, lamps,
        // −1 — абсолютная фотометрия (светодиоды): потока лампы нет.
        lumensPerLamp: lumensPerLamp > 0 ? lumensPerLamp : null,
        multiplier, watts, size: [width * metre, length * metre, height * metre], keywords,
    };
}

// EULUMDAT (.ldt): строка — одно значение, десятичная запятая допустима.
// Силы в файле — кд на 1000 лм потока ламп, поэтому кд = значение ·
// Φ_ламп/1000 · коэффициент пересчёта (стр. 24). LOR в эти числа уже входит
// (интеграл по сфере даёт Φ_ламп · LOR) — второй раз на него не множим.
export function parseLDT(text) {
    const lines = String(text).split(/\r\n|\r|\n/).map((line) => line.trim());
    const num = (i) => {
        const v = Number((lines[i] ?? '').replace(',', '.'));
        if (!lines[i] || !Number.isFinite(v)) throw new Error(`LDT: строка ${i + 1} — не число («${lines[i] ?? ''}»)`);
        return v;
    };
    const isym = num(2), mc = count(num(3), 'число плоскостей C', 'LDT'), ng = count(num(5), 'число углов γ', 'LDT', 2);
    if (![0, 1, 2, 3, 4].includes(isym)) throw new Error(`LDT: признак симметрии ${isym} — бывает 0…4`);
    if ((isym === 2 && mc % 2) || ((isym === 3 || isym === 4) && mc % 4)) throw new Error(`LDT: ${mc} плоскостей C не делятся для симметрии ${isym}`);
    const sets = count(num(25), 'число комплектов ламп', 'LDT');
    // Комплекты ламп — варианты оснащения одной оптики, а не лампы разом:
    // силы пересчитываются по первому, стандартному (DIALux, pyldt). Сумма
    // потоков дала бы прибор ярче в Σ/Φ₀ раз. Отрицательное число ламп —
    // абсолютная фотометрия; тогда поток комплекта — поток прибора.
    const lamps = Math.abs(num(26)), flux = num(26 + 2 * sets);
    if (!(flux > 0)) throw new Error('LDT: поток ламп не задан');
    const scale = (flux / 1000) * (num(23) || 1);
    const start = 26 + 6 * sets + 10;
    const take = reader(lines.slice(start).join(' ').replace(/,/g, '.').split(/\s+/).filter(Boolean).map(Number), 'LDT');
    const planeAngles = take(mc), verticalAngles = ascending(take(ng), 'углы γ', 'LDT');
    // Какие плоскости C лежат в файле: 0 — все; 1 — одна (ось); 2 — C0…C180;
    // 3 — C270…C0…C90 (с C270 через ноль, номера 3Mc/4+1 … 3Mc/4+Mc/2+1);
    // 4 — C0…C90. Для среднего по азимуту половины и четверти хватает
    // (остальное — зеркало), без симметрии круг замыкается на 360°. Номер
    // плоскости идёт по кругу: у Isym 3 за C(Mc−1) следует C0 как 360°.
    const [from, to] = [[0, mc - 1], [0, 0], [0, mc / 2], [(3 * mc) / 4, (5 * mc) / 4], [0, mc / 4]][isym];
    const candela = [], horizontalAngles = [];
    for (let p = from; p <= to; p += 1) {
        candela.push(take(ng).map((v) => v * scale));
        horizontalAngles.push(isym === 1 ? 0 : planeAngles[p % mc] + 360 * Math.floor(p / mc));
    }
    if (isym === 0) { candela.push(candela[0]); horizontalAngles.push(horizontalAngles[0] + 360); }
    ascending(horizontalAngles, 'плоскости C', 'LDT');
    return {
        verticalAngles, horizontalAngles, candela, lamps: lamps || 1, lumensPerLamp: flux / (lamps || 1),
        multiplier: scale, lor: num(22) / 100, size: [num(12), num(13) || num(12), num(14)].map((mm) => mm / 1000),
        name: lines[8] ?? '',
    };
}

// Паспорт → { fn, peak (кд), lumens }. Средняя по азимуту сила — плоскость C
// весит своей долей охвата файла (трапеции), поэтому 0–90, 0–180 и 0–360 дают
// одно и то же для симметричного прибора. γ от надира — ось луча даунлайта.
// ponytail: асимметрия (дорожные, настенные «в одну сторону») теряется, пятно
// круглое при том же потоке; когда понадобится — профиль (θ, C) в 2D-текстуре.
export function fromPhotometricFile({ verticalAngles, horizontalAngles: h, candela }) {
    const span = h[h.length - 1] - h[0];
    const weights = h.map((_, j) => (span > 0 ? (h[Math.min(j + 1, h.length - 1)] - h[Math.max(j - 1, 0)]) / 2 / span : 1 / h.length));
    const mean = verticalAngles.map((_, i) => candela.reduce((sum, plane, j) => sum + weights[j] * plane[i], 0));
    const peak = Math.max(...mean);
    if (!(peak > 0)) throw new Error('Фотометрия: все силы света нулевые');
    const rel = mean.map((v) => v / peak), rad = verticalAngles.map((v) => v * DEG), n = rad.length;
    const fn = (t) => {
        if (t < rad[0] || t > rad[n - 1]) return 0;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rad[mid] <= t) lo = mid; else hi = mid; }
        return rel[lo] + ((rel[hi] - rel[lo]) * (t - rad[lo])) / (rad[hi] - rad[lo]);
    };
    return { fn, peak, lumens: peak * sphereIntegral(fn) };
}

const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

// Освещённость поверхности, лк: E = I(θ) · cos(падения) / d². Нормаль —
// наружу, к свету; с изнанки — ноль.
export function illuminance(light, point, normal) {
    const [px, py, pz] = vec(point), [nx, ny, nz] = vec(normal), [ax, ay, az] = vec(light.axis);
    const dx = px - light.x, dy = py - light.y, dz = pz - light.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-8) return 0;
    const d = Math.sqrt(d2), incidence = -(dx * nx + dy * ny + dz * nz) / d;
    if (incidence <= 0) return 0;
    return (light.peak * light.fn(Math.acos(clamp((dx * ax + dy * ay + dz * az) / d, -1, 1))) * incidence) / d2;
}

// Дальность света: где по оси E = I/d² падает до cutLux (~0,3 лк — порог,
// ниже которого вклад в кадр неразличим). От 0,5 м (подсветка ступени) до
// 80 м (прожектор на крону) — дальше клетки поля не должны тянуться.
export const rangeFor = (peak, cutLux = 0.3) => clamp(Math.sqrt(Math.max(0, peak) / cutLux), 0.5, 80);
