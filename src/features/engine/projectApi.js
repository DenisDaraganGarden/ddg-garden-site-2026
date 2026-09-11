// Проекты движка живут файлами в папке projects/ и ходят через локальный
// сервер — тот же, что публикует сцену. Причина простая: сцену собирает агент,
// а агент читает файлы, а не localStorage браузера.
//
// Черновик сайта сюда не входит. У него свой ключ в localStorage и своя кнопка
// «В проект»: проект движка не может случайно уехать на сайт.
const BASE = '/__projects';

async function call(path, options) {
    const response = await fetch(`${BASE}${path}`, {
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
        throw new Error(payload?.message ?? `Хранилище проектов ответило ${response.status}`);
    }

    return payload;
}

export const listProjects = async () => (await call('/')).projects ?? [];
export const readProject = async (id) => (await call(`/${encodeURIComponent(id)}`)).project;
export const createProject = async (body) => (await call('/', { method: 'POST', body: JSON.stringify(body) })).project;
export const renameProject = async (id, name) => (await call(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ name }) })).project;
export const removeProject = (id) => call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Сохранение сцены уходит часто и не должно ничего блокировать: ответ не ждём,
// ошибку показываем вызывающему. keepalive нужен для последнего сохранения при
// закрытии окна — обычный запрос браузер в этот момент отменяет.
export const saveProjectSettings = (id, settings, { keepalive = false } = {}) => call(
    `/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify({ settings }), keepalive },
);

// Редактор узнаёт, что открыт в проекте, по адресу: /home/edit?project=<id>.
// Без параметра он остаётся тем же редактором сайта, что и был.
export function activeProjectId(search = typeof window === 'undefined' ? '' : window.location.search) {
    const id = new URLSearchParams(search).get('project');
    return id && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : null;
}
