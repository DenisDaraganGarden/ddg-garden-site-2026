// Одна проверка на все служебные маршруты движка (/__*): они пишут файлы
// Дениса, публикуют сцену сайта (и по кнопке «На сайт» — на GitHub) и тратят
// ключ OpenAI. Отвечают только запросам с этого же компьютера и из того же
// origin: адрес петли, имя хоста петли (против подмены DNS), Origin с тем же
// хостом и портом, не межсайтовый запрос и не тело простой HTML-формы — такую
// форму чужая страница может отправить без предзапроса. Скрипты на этом же
// компьютере (Node, curl) Origin не шлют и проходят.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORM_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function trustedLocalRequest(request) {
  if (!LOOPBACK.has(request.socket?.remoteAddress)) return false;
  const host = request.headers.host;
  try {
    if (!LOCAL_HOSTS.has(new URL(`http://${host}`).hostname)) return false;
    if (request.headers.origin !== undefined && new URL(request.headers.origin).host !== host) return false;
  } catch {
    return false;
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  if (SAFE_METHODS.has(request.method)) return true;
  const type = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  return !FORM_TYPES.has(type);
}

// Служебные пути самого Vite (/__vite_ping и т. п.) не трогаются.
const guarded = (url = '') => url.startsWith('/__') && !url.startsWith('/__vite');

// Первый плагин в конфиге: стоит перед всеми маршрутами /__* сервера и превью.
export function localGuardPlugin() {
  const attach = (middlewares) => middlewares.use((request, response, next) => {
    if (!guarded(request.url) || trustedLocalRequest(request)) {
      next();
      return;
    }
    response.statusCode = 403;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ ok: false, message: 'Служебный адрес движка отвечает только редактору на этом компьютере.' }));
  });
  return {
    name: 'local-guard',
    configureServer(server) { attach(server.middlewares); },
    configurePreviewServer(server) { attach(server.middlewares); },
  };
}
