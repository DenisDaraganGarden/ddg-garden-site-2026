// Контракт SEO-сборки. Ломается, если страницы перестали быть различимыми для
// поиска: одинаковые title, canonical не на свой адрес, языки не связаны
// hreflang, заглушка попала в sitemap, слепок не подставился.
// Браузер и dist не нужны — секунды.

import assert from 'node:assert/strict';

import { pages, renderPage, sitemap } from './build-seo.mjs';
import { SITE_LANGUAGES, languageFromPath, localizePath, stripLanguage } from '../../src/i18n/languageRoutes.js';

const ORIGIN = 'https://denisdaragan.com';

const TEMPLATE = [
  '<!doctype html>',
  '<html lang="ru">',
  '  <head>',
  '    <!-- seo:start -->',
  '    <title>Denis Daragan Buro</title>',
  '    <!-- seo:end -->',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '    <script type="module" src="/assets/index-abc.js"></script>',
  '  </body>',
  '</html>',
].join('\n');

// --- разбор адреса: на нём стоит и приложение, и генератор ---

assert.equal(languageFromPath('/'), 'ru');
assert.equal(languageFromPath('/portfolio'), 'ru');
assert.equal(languageFromPath('/en'), 'en');
assert.equal(languageFromPath('/en/portfolio'), 'en');
// Ловушка: маршрут, который лишь начинается с букв «en», английским не является.
assert.equal(languageFromPath('/energy'), 'ru');
assert.equal(stripLanguage('/en'), '/');
assert.equal(stripLanguage('/en/portfolio'), '/portfolio');
assert.equal(stripLanguage('/portfolio'), '/portfolio');
assert.equal(localizePath('/', 'en'), '/en');
assert.equal(localizePath('/portfolio', 'en'), '/en/portfolio');
assert.equal(localizePath('/en/portfolio', 'ru'), '/portfolio');
for (const route of ['/', '/portfolio', '/portfolio/france-residence']) {
  for (const language of SITE_LANGUAGES) {
    const localized = localizePath(route, language);
    assert.equal(languageFromPath(localized), language, `Язык не читается обратно из ${localized}`);
    assert.equal(stripLanguage(localized), route, `Адрес не разбирается обратно: ${localized}`);
  }
}

// --- страницы ---

const keys = pages.map((page) => `${page.language}:${page.route}`);
assert.equal(new Set(keys).size, keys.length, 'Страница определена дважды.');

for (const language of SITE_LANGUAGES) {
  const inLanguage = pages.filter((page) => page.language === language);
  assert.ok(inLanguage.length > 8, `Слишком мало страниц на языке ${language}.`);
  assert.ok(
    inLanguage.filter((page) => page.route.startsWith('/portfolio/')).length >= 5,
    `Опубликованных проектов на ${language} меньше пяти — реестр отвалился.`,
  );

  // Одинаковый title у двух страниц одного языка — это дубликаты в выдаче,
  // ровно та болезнь, от которой всё и затевалось.
  const titles = inLanguage.map((page) => page.title);
  assert.equal(new Set(titles).size, titles.length, `Две страницы с одинаковым title на ${language}.`);
}

for (const page of pages) {
  assert.ok(page.description.length >= 50, `Слишком короткое описание: ${page.language}:${page.route}`);
  assert.ok(page.description.length <= 320, `Слишком длинное описание: ${page.language}:${page.route}`);

  const html = renderPage(TEMPLATE, page);
  const localized = localizePath(page.route, page.language);
  const expectedCanonical = `${ORIGIN}${localized === '/' ? '/' : `${localized}/`}`;

  assert.ok(html.includes(`<link rel="canonical" href="${expectedCanonical}" />`), `Canonical не на свой адрес: ${page.language}:${page.route}`);
  assert.ok(html.includes(`<html lang="${page.language}"`), `Атрибут lang не совпал с языком: ${page.language}:${page.route}`);
  assert.ok(!html.includes('<div id="root"></div>'), `Слепок не подставлен: ${page.language}:${page.route}`);
  assert.ok(html.includes('data-seo-fallback'), `Нет статического слепка: ${page.language}:${page.route}`);
  assert.ok(html.includes('/assets/index-abc.js'), `Потерян скрипт приложения: ${page.language}:${page.route}`);
  assert.equal(html.match(/<title>/g).length, 1, `Больше одного <title>: ${page.language}:${page.route}`);
  // Маркеры остаются намеренно: замена должна быть идемпотентной, иначе повторный
  // прогон по уже обработанному файлу вставил бы второй блок мета-тегов.
  assert.equal(html.match(/seo:start/g).length, 1, `Блок мета-тегов задвоился: ${page.language}:${page.route}`);
  assert.equal(renderPage(html, page), html, `Повторный прогон меняет результат: ${page.language}:${page.route}`);

  // hreflang должен вести на обе версии этой же страницы и на x-default.
  for (const code of SITE_LANGUAGES) {
    const alt = localizePath(page.route, code);
    const altUrl = `${ORIGIN}${alt === '/' ? '/' : `${alt}/`}`;
    assert.ok(
      html.includes(`<link rel="alternate" hreflang="${code}" href="${altUrl}" />`),
      `Нет hreflang ${code} на ${page.language}:${page.route}`,
    );
    // Обратная связь обязана существовать: страница, на которую указывает
    // hreflang, должна сама ссылаться назад, иначе поисковик пару игнорирует.
    assert.ok(
      pages.some((other) => other.language === code && other.route === page.route),
      `hreflang ${code} ведёт на несуществующую страницу: ${page.route}`,
    );
  }
  assert.ok(html.includes('hreflang="x-default"'), `Нет x-default: ${page.language}:${page.route}`);

  const noindex = html.includes('name="robots" content="noindex');
  assert.equal(Boolean(page.noindex), noindex, `Флаг noindex разошёлся с разметкой: ${page.language}:${page.route}`);
}

const organizationPages = pages.filter((page) => page.organization);
assert.ok(organizationPages.length > 0, 'Разметка организации нигде не выводится.');
for (const page of organizationPages) {
  const html = renderPage(TEMPLATE, page);
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json.address.addressLocality, 'Санкт-Петербург');
  assert.ok(json.telephone && json.email, 'В разметке организации нет телефона или почты.');
  // Заглушечный американский адрес не должен уехать в structured data.
  assert.ok(!JSON.stringify(json).includes('Ocean Drive'), 'В разметку попал адрес-заглушка.');
}

const xml = sitemap();
assert.ok(xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'), 'Неверное пространство имён sitemap.');
assert.ok(xml.includes(`<loc>${ORIGIN}/landscape/</loc>`), 'В sitemap нет статической страницы /landscape/.');
assert.ok(xml.includes(`<loc>${ORIGIN}/en/</loc>`), 'В sitemap нет английской главной.');
assert.ok(!/<loc>https:\/\/denisdaragan\.com\/[a-z-]+(\/[a-z0-9-]+)*<\/loc>/.test(xml), 'В sitemap есть адрес без косой черты — Pages ответит на него редиректом.');
for (const page of pages) {
  const localized = localizePath(page.route, page.language);
  const loc = `<loc>${ORIGIN}${localized === '/' ? '/' : `${localized}/`}</loc>`;
  if (page.noindex) {
    assert.ok(!xml.includes(loc), `Заглушка попала в sitemap: ${page.language}:${page.route}`);
  } else {
    assert.ok(xml.includes(loc), `Страницы нет в sitemap: ${page.language}:${page.route}`);
  }
}

console.log(`SEO-контракт в порядке: ${pages.length} страниц на ${SITE_LANGUAGES.length} языках, ${xml.match(/<loc>/g).length} адресов в sitemap.`);
