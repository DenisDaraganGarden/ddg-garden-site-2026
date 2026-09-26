// Огонь по следу. Одна дорожка горючего, разлитая по колее, и фронт пламени,
// который бежит по ней — как масло, горящее вдоль следа покрышки. Всё, что
// здесь есть, — числа сцены: точки сплайна в местной системе следа
// (fireX/fireZ/fireYaw/fireScale ставят след на берег), скорость фронта, время
// горения, пламя, дым, свет и копоть. Ключи входят в публикацию и в снимки
// камер, как у танкера; fireEditPoint — только редактору, на сайт не уходит.
export const FIRE_POINTS_MAX = 12;
export const FIRE_POINT_RANGE = 60;

// Заводской след — плавная «S» длиной около 40 м вдоль берега по сухому
// песку (берег сайта: урез у x≈12, сухой пляж x≈22…30, вдоль него идёт Z).
// С этого Денис начинает рисовать свою колею, двигая точки ручками в редакторе.
// Точки — в местной системе следа: X поперёк, Z вдоль.
const DEFAULT_POINTS = [[-2.5, -20], [1.5, -12], [2.5, -4], [-1.5, 4], [-2.5, 12], [1.5, 20]];

const points = Object.fromEntries(Array.from({ length: FIRE_POINTS_MAX }, (_, index) => {
  const [x, z] = DEFAULT_POINTS[index] ?? [DEFAULT_POINTS.at(-1)[0], DEFAULT_POINTS.at(-1)[1] + (index - DEFAULT_POINTS.length + 1) * 6];
  return [[`fireP${index + 1}X`, x], [`fireP${index + 1}Z`, z]];
}).flat());

export const DEFAULT_FIRE_SETTINGS = Object.freeze({
  fireEnabled: false,
  fireX: 25, fireZ: 0, fireYaw: 0, fireScale: 1,
  firePointCount: DEFAULT_POINTS.length,
  ...points,
  fireEditPoint: 0,
  // Фронт: задержка перед поджигом, скорость бега по следу (м/с — это же
  // скорость машины, когда она появится), сколько секунд горит одно место,
  // повтор после выгорания и пауза перед ним. fireBurn = 0 — горит весь след.
  fireDelay: 1, fireSpeed: 4, fireBurn: 7, fireLoop: true, fireLoopPause: 5,
  // Пламя.
  fireWidth: 0.55, fireHeight: 1.3, fireIntensity: 1, fireTurbulence: 0.6,
  fireColorHot: '#fff1c2', fireColorCool: '#ff4d0f',
  // Дым: сколько, как быстро поднимается, сколько живёт, размер, доля ветра
  // берега, цвет, плотность. Та же физика пойдёт под дым от покрышек.
  fireSmoke: true, fireSmokeAmount: 1, fireSmokeRise: 1.4, fireSmokeLife: 8,
  fireSmokeSize: 1.6, fireSmokeWind: 1, fireSmokeColor: '#3b3634', fireSmokeOpacity: 0.4,
  // Свет от огня на песке (без теней) и след на земле: колея и разлив до
  // поджига, угли в огне, копоть после; fireSootFade = 0 — копоть навсегда.
  fireLight: true, fireLightIntensity: 60, fireLightDistance: 16,
  fireTrack: true, fireTrackDark: 0.7, fireSootFade: 0,
});

const ranges = {
  fireX: [-400, 400], fireZ: [-400, 400], fireYaw: [-180, 180], fireScale: [0.1, 6],
  firePointCount: [2, FIRE_POINTS_MAX], fireEditPoint: [0, FIRE_POINTS_MAX],
  ...Object.fromEntries(Object.keys(points).map((key) => [key, [-FIRE_POINT_RANGE, FIRE_POINT_RANGE]])),
  fireDelay: [0, 60], fireSpeed: [0.2, 40], fireBurn: [0, 120], fireLoopPause: [0, 120],
  fireWidth: [0.1, 4], fireHeight: [0.2, 6], fireIntensity: [0, 4], fireTurbulence: [0, 2],
  fireSmokeAmount: [0, 4], fireSmokeRise: [0.2, 6], fireSmokeLife: [1, 30],
  fireSmokeSize: [0.3, 6], fireSmokeWind: [0, 3], fireSmokeOpacity: [0, 1],
  fireLightIntensity: [0, 400], fireLightDistance: [2, 80],
  fireTrackDark: [0, 1], fireSootFade: [0, 600],
};
export const FIRE_RANGES = Object.freeze(ranges);
const INTEGERS = new Set(['firePointCount', 'fireEditPoint']);

export function normalizeFireSettings(source = {}) {
  const out = Object.fromEntries(Object.entries(DEFAULT_FIRE_SETTINGS).map(([key, fallback]) => {
    const value = source[key];
    if (typeof fallback === 'boolean') return [key, typeof value === 'boolean' ? value : fallback];
    if (typeof fallback === 'string') return [key, /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback];
    const number = Number(value), [min, max] = ranges[key];
    const clamped = value != null && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    return [key, INTEGERS.has(key) ? Math.round(clamped) : clamped];
  }));
  // Ручка не может стоять на точке, которой нет.
  out.fireEditPoint = Math.min(out.fireEditPoint, out.firePointCount);
  return out;
}

// Что уходит на сайт и в снимки камер: всё, кроме выбранной точки редактора.
export const FIRE_PUBLISHED_KEYS = Object.freeze(Object.keys(DEFAULT_FIRE_SETTINGS).filter((key) => key !== 'fireEditPoint'));
