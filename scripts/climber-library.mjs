// Лианы в библиотеке растений (~/Ouroboros/library/plants): записи и
// карточки. Картинки у лиан не из SketchUp, а нарисованы по форме листа
// (src/planting/vineLeaves.js) — той же, что рисует лист в сцене: побег с
// листьями, цветками или плодами, лето. Денис может приложить свою картинку
// в карточке растения, как к любому другому.
//
// Запуск: node scripts/climber-library.mjs [--force]  (без --force готовые
// записи не трогаются).
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PLANTS_DIR } from './plantLibrary.mjs';
import { flowerShape, flowerSvg, leafShape, leafSvg, mulberry } from '../src/planting/vineLeaves.js';

const SOURCE = { data: 'Claude по общим справочникам (RHS, Missouri BG, питомники юга России)', confidence: 'средняя', checked: false };
const CAP = '#9a6fb0';
export const CLIMBERS = [
    { id: 'parthenocissus-quinquefolia', latin: 'Parthenocissus quinquefolia', ru: 'Девичий виноград пятилисточковый', en: 'Virginia creeper', height: 15, foliage: 'deciduous', leafOut: 5, leafColor: '#4f7436', autumnColor: '#b52a22', autumnColor2: '#7b2d4f', twigColor: '#8a7461', bloom: [6, 7], zone: '3', light: 'солнце — полутень', water: 'умеренно',
        rostov: 'Самая надёжная лиана для стен в Ростове: присоски, опора не нужна; осенью малиновый. Сажать через 1–1,5 м.',
        vine: { leaf: 'creeper', leafSize: 0.176, spread: 1.2, density: 0.9, fruit: 'bunch', fruitSize: 0.07, fruitColor: '#28334d', fruitMonths: [9, 11], support: 'присоски — опора не нужна' } },
    { id: 'parthenocissus-tricuspidata-veitchii', latin: "Parthenocissus tricuspidata 'Veitchii'", ru: "Девичий виноград триостренный 'Вейча'", en: "Boston ivy 'Veitchii'", height: 15, foliage: 'deciduous', leafOut: 5, leafColor: '#3f6632', autumnColor: '#c0392b', autumnColor2: '#8a2c52', twigColor: '#806b5a', zone: '5', light: 'солнце — полутень', water: 'умеренно',
        rostov: 'Плотный глянцевый ковёр по стене. Южные и западные стены надёжнее.', risk: 'В суровые зимы подмерзают концы побегов.',
        vine: { leaf: 'boston', leafSize: 0.135, spread: 1, density: 1.25, gloss: true, fruit: 'bunch', fruitSize: 0.06, fruitColor: '#2a3150', fruitMonths: [10, 11], support: 'присоски — опора не нужна' } },
    { id: 'hedera-helix', latin: 'Hedera helix', ru: 'Плющ обыкновенный', en: 'English ivy', height: 12, foliage: 'evergreen', leafColor: '#34512f', twigColor: '#6f5e4d', zone: '6', light: 'тень — полутень', water: 'умеренно',
        rostov: 'Вечнозелёный: в Ростове — в тени и полутени, у северных стен. Годится и почвопокровом.', risk: 'На южной стене зимой обгорает.',
        vine: { leaf: 'ivy', leafSize: 0.095, spread: 0.8, density: 1.45, gloss: true, veins: 'pale', fruit: 'bunch', fruitSize: 0.05, fruitColor: '#1d2027', fruitMonths: [3, 5], support: 'воздушные корни — опора не нужна' } },
    { id: 'vitis-vinifera', latin: 'Vitis vinifera', ru: 'Виноград культурный', en: 'Grapevine', height: 10, foliage: 'deciduous', leafOut: 5, leafColor: '#65853c', autumnColor: '#d2a23b', autumnColor2: '#a4512b', twigColor: '#8d6f55', bloom: [6, 6], zone: '6', light: 'солнце', water: 'умеренно',
        rostov: 'Ростов — винодельческий край: неукрывные сорта (Изабелла, Лидия, Молдова) растут на перголах и сетках. Нужна опора и обрезка.',
        vine: { leaf: 'grape', leafSize: 0.216, spread: 1.4, density: 0.7, fruit: 'bunch', fruitSize: 0.17, fruitColor: '#3a2340', fruitMonths: [8, 10], support: 'усики — нужна опора: пергола, сетка' } },
    { id: 'campsis-radicans', latin: 'Campsis radicans', ru: 'Кампсис укореняющийся', en: 'Trumpet vine', height: 10, foliage: 'deciduous', leafOut: 5, leafColor: '#57793c', autumnColor: '#c8a53f', twigColor: '#7a6250', bloom: [7, 9], bloomColor: '#e3602b', zone: '5', light: 'солнце', water: 'умеренно',
        rostov: 'Любимая лиана юга: оранжевые трубки с июля до сентября. Воздушные корни, но тяжёл — лучше с опорой.', risk: 'Корневые отпрыски на метры вокруг.',
        vine: { leaf: 'pinnate', leafSize: 0.297, spread: 1.2, density: 0.75, flower: 'trumpet', flowerSize: 0.2, support: 'воздушные корни; тяжёлый — нужна опора' } },
    { id: 'lonicera-caprifolium', latin: 'Lonicera caprifolium', ru: 'Жимолость каприфоль', en: 'Italian honeysuckle', height: 5, foliage: 'deciduous', leafOut: 4, leafColor: '#648a5a', autumnColor: '#b59f45', twigColor: '#7a624c', bloom: [5, 6], bloomColor: '#f0dcc6', zone: '5', light: 'солнце — полутень', water: 'умеренно',
        rostov: 'Душистые цветки в мае–июне, к вечеру запах сильнее. Вьётся — нужна сетка или шпалера.',
        vine: { leaf: 'ovate', leafSize: 0.095, spread: 0.8, density: 1.1, flower: 'tube', flowerSize: 0.1, support: 'вьётся — нужна сетка, шпалера' } },
    { id: 'clematis-jackmanii', latin: 'Clematis × jackmanii', ru: 'Клематис Жакмана', en: "Clematis 'Jackmanii'", height: 3, foliage: 'deciduous', leafOut: 4, leafColor: '#557540', autumnColor: '#8f7c3c', twigColor: '#6a5847', bloom: [6, 9], bloomColor: '#5b3b8d', zone: '4', light: 'солнце — полутень', water: 'умеренно',
        rostov: '«Голова на солнце, ноги в тени»: корни притенить. Обрезка третьей группы — в марте почти до земли.',
        vine: { leaf: 'trifoliate', leafSize: 0.135, spread: 0.7, density: 1, flower: 'star', flowerSize: 0.16, support: 'цепляется черешками — нужна сетка' } },
    { id: 'fallopia-baldschuanica', latin: 'Fallopia baldschuanica', ru: 'Горец Обера', en: 'Russian vine', height: 12, foliage: 'deciduous', leafOut: 4, leafColor: '#678746', autumnColor: '#b8a24c', twigColor: '#7b6553', bloom: [7, 10], bloomColor: '#f3f0e6', zone: '4', light: 'солнце — полутень', water: 'умеренно',
        rostov: 'Самая быстрая: 5–8 м за лето, белая пена цветков с июля до октября. Быстро закрывает сетку-рабицу.', risk: 'Без обрезки глушит соседей.',
        vine: { leaf: 'ovate', leafSize: 0.095, spread: 1.4, density: 1.2, flower: 'foam', flowerSize: 0.2, support: 'вьётся — нужна опора: рабица, пергола' } },
    { id: 'hydrangea-petiolaris', latin: 'Hydrangea anomala subsp. petiolaris', ru: 'Гортензия черешковая', en: 'Climbing hydrangea', height: 12, foliage: 'deciduous', leafOut: 4, leafColor: '#46733a', autumnColor: '#d9c34a', twigColor: '#8a6a4f', bloom: [6, 7], bloomColor: '#f4f1e6', zone: '4', light: 'тень — полутень', water: 'влажно',
        rostov: 'Для северных стен и тени; присоски — опора не нужна. Первые два-три года растёт медленно.',
        vine: { leaf: 'serrate', leafSize: 0.121, spread: 1, density: 1.1, flower: 'lace', flowerSize: 0.2, support: 'присоски — опора не нужна' } },
];

// Карточка: побег снизу вверх с боковыми веточками, листья попеременно, на
// концах — цветки, в пазухах — грозди плодов. Кадр — семь с половиной листьев
// в высоту: у мелколистного плюща веточка короче, у винограда длиннее.
const W = 600, H = 900;
const cardMetres = (plant) => +(plant.vine.leafSize * 7.5).toFixed(3);
const darker = (hex, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
function cardSvg(plant) {
    const rand = mulberry(97), v = plant.vine;
    const px = (metres) => (metres / cardMetres(plant)) * H, leafPx = px(v.leafSize);
    const branches = [], stems = [];
    const grow = (from, angle, length, bend) => {
        const points = [];
        for (let i = 0; i <= 24; i += 1) { const t = i / 24, a = angle + bend * t; points.push([from[0] + Math.sin(a) * length * t, from[1] - Math.cos(a) * length * t]); }
        branches.push(points);
        return points;
    };
    const main = grow([W / 2 - 30, H - 10], 0.12, H * 0.9, -0.35);
    for (const [t, side] of [[0.3, 1], [0.48, -1], [0.66, 1], [0.8, -1]]) grow(main[Math.round(t * 24)], side * (0.55 + rand() * 0.25), H * (0.28 - t * 0.12), -side * 0.3);
    const vein = v.veins === 'pale' ? '#dde4cc' : darker(plant.leafColor, 0.72);
    const leaves = [], extras = [];
    branches.forEach((points, b) => {
        const total = b ? 0.9 : 0.97;
        for (let t = b ? 0.18 : 0.06, k = 0; t < total; t += (leafPx * 0.62) / (b ? H * 0.22 : H * 0.9), k += 1) {
            const [x, y] = points[Math.round(t * 24)], side = k % 2 ? 1 : -1, size = leafPx * (1 - 0.28 * t) * (0.85 + rand() * 0.3);
            leaves.push(`<g transform="rotate(${(side * (40 + rand() * 25)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}) translate(${(x - size / 2).toFixed(1)} ${(y - size).toFixed(1)})">${leafSvg(leafShape(v.leaf, Math.floor(rand() * 3)), size, { fill: plant.leafColor, vein, stem: plant.twigColor })}</g>`);
            if (v.fruit && !b && k % 3 === 2) { const f = px(v.fruitSize); extras.push(`<g transform="translate(${(x - side * 6 - f / 2).toFixed(1)} ${(y + 4).toFixed(1)})">${flowerSvg(flowerShape(v.fruit), f, v.fruitColor)}</g>`); }
        }
        if (v.flower) { const [x, y] = points[24], f = px(v.flowerSize); extras.push(`<g transform="translate(${(x - f / 2).toFixed(1)} ${(y - f * 0.75).toFixed(1)})">${flowerSvg(flowerShape(v.flower), f, plant.bloomColor)}</g>`); }
    });
    for (const points of branches) stems.push(`<polyline points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${plant.twigColor}" stroke-width="${points === main ? 6 : 3.5}" stroke-linecap="round"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${stems.join('')}${leaves.join('')}${extras.join('')}</svg>`;
}

export async function writeClimber(climber, { dir = PLANTS_DIR, force = false } = {}) {
    const file = path.join(dir, `${climber.id}.json`);
    if (!force && await fs.access(file).then(() => true, () => false)) return false;
    const record = {
        ...climber, category: 'climber', spread: 1, density: 1, winter: climber.foliage === 'evergreen' ? 'evergreen' : 'bare', cap: CAP,
        card: { file: 'card.webp', px: [W, H], width: +(cardMetres(climber) * (W / H)).toFixed(3), height: cardMetres(climber), anchorX: 0.5 },
        source: SOURCE,
    };
    await fs.mkdir(path.join(dir, climber.id), { recursive: true });
    await sharp(Buffer.from(cardSvg(record))).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(dir, climber.id, 'card.webp'));
    await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const force = process.argv.includes('--force');
    for (const climber of CLIMBERS) console.log(`${(await writeClimber(climber, { force })) ? 'записана' : 'уже есть'}: ${climber.ru}`);
}
