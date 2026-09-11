// Выполняется внутри страницы редактора. Редактор регистрирует все свои
// контролы в одном каталоге — он для поиска по ⌘K, и в нём лежит ровно то, что
// нужно справочнику: подпись, вид, пределы, шаг и единица каждого параметра.
// Поэтому справочник снимается отсюда, а не пересказывается по исходникам:
// параметр не может попасть в редактор и не попасть в справочник.
(async () => {
    const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
    const catalog = () => window.__ouroborosControls?.all() ?? [];

    // Каталог наполняется по мере монтирования разделов: ждём, пока перестанет расти.
    let previous = -1;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const count = catalog().length;
        if (count > 0 && count === previous) break;
        previous = count;
        await wait(500);
    }

    const kindOf = (item) => ({
        toggle: 'выключатель', color: 'цвет', select: 'список',
    }[item.kind] ?? 'число');

    const rows = catalog().map((item) => {
        const [path, key = ''] = String(item.id).split(':');
        const [group = '', node = ''] = path.split('/');
        return {
            key,
            group,
            node,
            label: item.label ?? '',
            kind: kindOf(item),
            min: item.min,
            max: item.max,
            step: item.step,
            unit: item.unit || undefined,
            options: item.options?.map((option) => option.value),
        };
    });

    // Заводские значения берутся из тех же модулей настроек, из которых собран
    // заводской проект. Страница — это dev-сервер, её граф импортов доступен.
    const settings = await import('/src/features/home-scene/hooks/useHomeSceneSettings.js');
    const defaults = settings.getBaseHomeSceneSettings();

    return {
        collected: new Date().toISOString(),
        rows: rows.filter((row) => row.key),
        defaults: Object.fromEntries(Object.entries(defaults)
            .filter(([, value]) => typeof value !== 'object' || value === null)),
    };
})()
