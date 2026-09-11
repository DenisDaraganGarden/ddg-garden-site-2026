// Проекты и детали движка живут файлами и ходят через локальный сервер — тот
// же, что публикует сцену. Причина простая: сцены собирает агент, а агент
// читает файлы, а не localStorage браузера.
//
// Черновик сайта сюда не входит. У него свой ключ в localStorage и своя кнопка
// «В проект»: проект движка не может случайно уехать на сайт.
async function call(base, path, options) {
    const response = await fetch(`${base}${path}`, {
        ...options,
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // Пустой или не-JSON ответ разбирается ниже как отказ.
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message ?? `Хранилище движка ответило ${response.status}`);
    }

    return payload;
}

const store = (base) => ({
    list: async () => (await call(base, '/')).entries ?? [],
    read: async (id) => (await call(base, `/${encodeURIComponent(id)}`)).entry,
    create: async (body) => (await call(base, '/', { method: 'POST', body: JSON.stringify(body) })).entry,
    save: async (id, patch, { keepalive = false } = {}) => (await call(base, `/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify(patch), keepalive,
    })).entry,
    remove: (id) => call(base, `/${encodeURIComponent(id)}`, { method: 'DELETE' }),
});

// Проект — сцена целиком. Деталь — настроенный вариант одного объекта.
export const projectStore = store('/__projects');
export const presetStore = store('/__presets');

export const listProjects = projectStore.list;
export const readProject = projectStore.read;
export const createProject = projectStore.create;
export const removeProject = projectStore.remove;
export const renameProject = (id, name) => projectStore.save(id, { name });

// Сохранение сцены уходит часто и не должно ничего блокировать. keepalive нужен
// для последнего сохранения при закрытии окна — обычный запрос браузер в этот
// момент отменяет.
export const saveProjectSettings = (id, settings, options) => projectStore.save(id, { settings }, options);

// Редактор узнаёт, что открыт в проекте, по адресу: /home/edit?project=<id>.
// Без параметра он остаётся тем же редактором сайта, что и был.
export function activeProjectId(search = typeof window === 'undefined' ? '' : window.location.search) {
    const id = new URLSearchParams(search).get('project');
    return id && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : null;
}
