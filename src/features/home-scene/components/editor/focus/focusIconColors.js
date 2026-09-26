// Existing hex values remain stable so saved labels keep their colours.
// Bright and deeper tones stay legible against the charcoal editor panels.
export const FOCUS_ICON_COLORS = [
    ['Алый', 'Scarlet', '#ff5454'], ['Мандарин', 'Tangerine', '#ff8740'], ['Янтарь', 'Amber', '#ffb22e'], ['Лимонный', 'Lemon', '#f0dc4a'],
    ['Салатовый', 'Lime', '#a8e04c'], ['Изумруд', 'Emerald', '#34d27f'], ['Бирюза', 'Turquoise', '#2fd4c6'], ['Лазурь', 'Azure', '#40b4ff'],
    ['Коралловый', 'Coral', '#ff786b'], ['Абрикос', 'Apricot', '#ffb071'], ['Золото', 'Gold', '#ffd166'], ['Цитрон', 'Citron', '#d5ed39'],
    ['Зелёное яблоко', 'Apple green', '#70ce48'], ['Мята', 'Mint', '#68e5aa'], ['Аквамарин', 'Aquamarine', '#66e1df'], ['Небесный', 'Sky blue', '#79caff'],
    ['Терракота', 'Terracotta', '#e0714f'], ['Медь', 'Copper', '#c98a50'], ['Олива', 'Olive', '#b9b35a'], ['Хвоя', 'Pine', '#5fa97c'],
    ['Нефрит', 'Jade', '#31b595'], ['Морская волна', 'Sea blue', '#4a9cb5'], ['Кобальт', 'Cobalt', '#4c9aee'], ['Ультрамарин', 'Ultramarine', '#6f8cff'],
    ['Барвинок', 'Periwinkle', '#9eaaff'], ['Фиолетовый', 'Violet', '#9a77ff'], ['Сиреневый', 'Lilac', '#c49aff'], ['Аметист', 'Amethyst', '#b36de3'],
    ['Фуксия', 'Fuchsia', '#e55cf0'], ['Орхидея', 'Orchid', '#ed8ad7'], ['Малиновый', 'Raspberry', '#ff4f8e'], ['Роза', 'Rose', '#e875a0'],
    ['Мел', 'Chalk', '#f1eee6'], ['Серебро', 'Silver', '#aab2ba'], ['Сталь', 'Steel', '#838d9e'], ['Лён', 'Linen', '#e3d7bd'],
    ['Песок', 'Sand', '#dcc49a'], ['Карамель', 'Caramel', '#cfa06d'], ['Глина', 'Clay', '#bf9584'], ['Кварц', 'Quartz', '#b7a1bb'],
];

// A stable token is saved; SVG strokes and swatches use these same two stops.
export const FOCUS_ICON_GRADIENTS = [
    ['Рассвет', 'Sunrise', 'gradient:sunrise', '#ffce59', '#ff647a'],
    ['Пламя', 'Flame', 'gradient:flame', '#f5ec53', '#ff8740'],
    ['Цитрус', 'Citrus', 'gradient:citrus', '#e1ed4b', '#34d27f'],
    ['Лагуна', 'Lagoon', 'gradient:lagoon', '#68e5aa', '#40b4ff'],
    ['Океан', 'Ocean', 'gradient:ocean', '#66e1df', '#6f8cff'],
    ['Ирис', 'Iris', 'gradient:iris', '#79caff', '#b36de3'],
    ['Орхидея · ирис', 'Orchid · iris', 'gradient:orchid', '#e55cf0', '#6f8cff'],
    ['Ягодный', 'Berry', 'gradient:berry', '#ff786b', '#e55cf0'],
    ['Опал', 'Opal', 'gradient:opal', '#68e5aa', '#c49aff'],
    ['Бронза', 'Bronze', 'gradient:bronze', '#f0dc4a', '#c98a50'],
];

export const FOCUS_ICON_PALETTE = [...FOCUS_ICON_COLORS, ...FOCUS_ICON_GRADIENTS];
export const focusIconGradient = (value) => FOCUS_ICON_GRADIENTS.find(([, , token]) => token === value);
