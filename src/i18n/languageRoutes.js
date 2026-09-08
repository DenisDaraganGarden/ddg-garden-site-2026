// Язык живёт в адресе, а не в localStorage.
//
// Раньше русская и английская версии сидели на одном URL, а выбор языка хранился
// в браузере. Для человека это работало, но у английской версии не было адреса,
// который можно отдать поисковику: в выдаче её просто не существовало. Теперь
// русская версия лежит в корне, английская — под /en, и обе индексируются.
//
// Модуль намеренно без зависимостей: его импортирует и приложение, и
// scripts/seo/build-seo.mjs, чтобы адреса на сайте и в sitemap не разъехались.

export const SITE_LANGUAGES = ['ru', 'en'];
export const DEFAULT_SITE_LANGUAGE = 'ru';

const PREFIX = '/en';

export function languageFromPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`) ? 'en' : 'ru';
}

// Адрес без языкового префикса: '/en/portfolio' → '/portfolio', '/en' → '/'.
export function stripLanguage(pathname) {
  if (pathname === PREFIX) return '/';
  if (pathname.startsWith(`${PREFIX}/`)) return pathname.slice(PREFIX.length) || '/';
  return pathname || '/';
}

// Тот же адрес на другом языке. Русский — корень, английский — под /en.
export function localizePath(pathname, language) {
  const base = stripLanguage(pathname);
  if (language !== 'en') return base;
  return base === '/' ? PREFIX : `${PREFIX}${base}`;
}
