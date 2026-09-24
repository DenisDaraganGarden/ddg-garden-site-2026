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
        const error = new Error(payload?.message ?? `Хранилище движка ответило ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
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
    thumbnailUrl: (id) => `${base}/${encodeURIComponent(id)}/thumbnail`,
    saveThumbnail: (id, image, { keepalive = false } = {}) => call(base, `/${encodeURIComponent(id)}/thumbnail`, {
        method: 'PUT', body: JSON.stringify({ image }), keepalive,
    }),
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
// момент отменяет. base — «обновлён» записи, которую редактор видел последней:
// если файл изменили снаружи, сервер отвечает 409 с нынешней записью.
export const saveProjectSettings = (id, settings, { base, ...options } = {}) => projectStore.save(id, { settings, ...(base ? { base } : {}) }, options);

// Модели проекта (.glb): файл уходит на локальный сервер как есть и ложится в
// папку проекта; в сцене объект ссылается на него по имени файла. Из SketchUp
// (source: 'sketchup') сервер сначала готовит файл и отвечает отчётом;
// replaces — модель, чью версию файл заменяет (см. vite.config.js).
export async function uploadProjectModel(projectId, file, { source, replaces } = {}) {
    const response = await fetch(`/__projects/${encodeURIComponent(projectId)}/models`, {
        method: 'POST',
        headers: {
            'Content-Type': 'model/gltf-binary',
            'X-Model-Name': encodeURIComponent(file.name ?? 'model.glb'),
            ...(source ? { 'X-Model-Source': source } : {}),
            ...(replaces ? { 'X-Replaces': replaces } : {}),
        },
        body: file,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Модель не загрузилась (${response.status})`);
    return payload;
}
export const projectModelUrl = (projectId, model) => `/__projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(model)}.glb`;

// Редактор узнаёт, что открыт в проекте, по адресу: /home/edit?project=<id>.
// Без параметра он остаётся тем же редактором сайта, что и был.
export function activeProjectId(search = typeof window === 'undefined' ? '' : window.location.search) {
    const id = new URLSearchParams(search).get('project');
    return id && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : null;
}
