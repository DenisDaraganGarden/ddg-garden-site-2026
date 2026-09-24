// Месяц → как выглядит растение из библиотеки. Картинка одна (снятая в
// цветении или в полной листве), поэтому сезон — это правка картинки:
//   grow    — доля ширины и высоты: отросло, срезано;
//   bloom   — цветки видны (1) или вместо них листва/сухие головки (0);
//   seed    — вместо цветков сухие головки, а не листва;
//   tint    — цвет, в который уводится вся картинка (осень, солома), и сила;
//   bare    — голые ветки: листва редеет до веточек цвета twig;
//   visible — многолетник, ушедший под землю, не рисуется.
// Правила — по типу листвы из записи (foliage, winter, cutBack, bloom), без
// календарей по сортам: их для Ростова никто не публикует (план §9).
const DRY = '#7b6245', STRAW = '#cdb47e', FRESH = '#8fb35a', SPRING = '#a9c97a', GOLD = '#c8a458', AUTUMN = '#b08a4a', WINTER_GREEN = '#6f7560', TWIG = '#6b5a4a';
const FROST = 11;

const inBloom = (plant, month) => {
    if (!Array.isArray(plant.bloom)) return false;
    const [a, b] = plant.bloom;
    return a <= b ? month >= a && month <= b : month >= a || month <= b;
};
// Сколько месяцев от `from` до `month` по кругу года (0…11).
const since = (from, month) => (month - from + 12) % 12;
const GROWTH = [[0.7, 0.3], [0.85, 0.6], [1, 0.85]];

export function seasonLook(plant, month) {
    const look = { visible: true, grow: [1, 1], bloom: inBloom(plant, month) ? 1 : 0, seed: 0, tint: null, tintAmount: 0, bare: 0, twig: plant.twigColor ?? TWIG };
    const foliage = plant.foliage ?? 'evergreen';

    if (foliage === 'evergreen') {
        if (month === 12 || month <= 2) Object.assign(look, { tint: WINTER_GREEN, tintAmount: 0.2 });
        return look;
    }

    if (foliage === 'deciduous') {
        const leafOut = plant.leafOut ?? 4;
        if (month === leafOut) Object.assign(look, { bare: 0.3, tint: SPRING, tintAmount: 0.3 });
        else if (month === 10) Object.assign(look, { tint: plant.autumnColor ?? GOLD, tintAmount: 0.7 });
        else if (month === FROST) Object.assign(look, { tint: plant.autumnColor ?? GOLD, tintAmount: 0.8, bare: 0.6 });
        else if (since(leafOut, month) > since(leafOut, FROST)) Object.assign(look, { bare: 1 });
        return look;
    }

    // Злак (grass) и многолетник (herbaceous). Стоящие зимой срезаются в
    // cutBack и отрастают со следующего месяца; уходящие под землю
    // (winter: gone) появляются в апреле. С ноября — зима.
    const grass = foliage === 'grass';
    const cut = plant.cutBack ?? 3;
    const gone = plant.winter === 'gone';
    const start = gone ? 4 : (cut % 12) + 1;
    const age = since(start, month);

    if (age < since(start, FROST)) {
        if (!look.bloom) look.grow = GROWTH[age] ?? [1, 1];
        if (age === 0) Object.assign(look, { tint: FRESH, tintAmount: 0.2 });
        // Отцвёл: у злака метёлки стоят до срезки; у многолетника — сухие
        // головки, если он стоит зимой, иначе снова листва.
        if (!look.bloom && Array.isArray(plant.bloom) && age > since(start, plant.bloom[1])) {
            look.bloom = grass ? 1 : 0;
            look.seed = !grass && plant.winter === 'stands' ? 1 : 0;
        }
        if (month === 10) Object.assign(look, { tint: grass ? GOLD : AUTUMN, tintAmount: grass ? 0.35 : 0.3 });
        return look;
    }
    if (gone) return { ...look, visible: false };
    const dry = { bloom: grass ? 1 : 0, seed: 1, tint: grass ? STRAW : DRY };
    if (month === cut) return { ...look, ...dry, bloom: 0, grow: [0.6, plant.cutHeight ?? 0.12], tintAmount: 0.85 };
    return { ...look, ...dry, grow: [1, 0.95], tintAmount: 0.8 };
}

export const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
