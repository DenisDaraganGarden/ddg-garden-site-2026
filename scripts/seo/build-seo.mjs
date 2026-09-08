// Делает страницы сайта видимыми поисковикам. Запускается после `vite build`.
//
// Зачем вообще: сайт лежит на GitHub Pages, роутинг клиентский. Реального файла
// по адресу /portfolio нет, поэтому Pages отвечает 404 и отдаёт public/404.html,
// который редиректит на /?/portfolio. Для человека это незаметно, а для робота
// страница просто не существует: 404 не индексируется. Плюс собранный index.html —
// это пустой <div id="root">, то есть даже у главной нет ни текста, ни заголовка.
//
// Что делает скрипт: на каждый публичный маршрут в каждом языке кладёт в dist
// настоящий index.html — тот же собранный каркас со скриптами приложения, но со
// своим <title>, описанием, canonical, hreflang, Open Graph и статическим текстом
// внутри #root. Pages отдаёт такой файл со статусом 200, робот видит содержимое
// сразу, а React при монтировании заменяет статический слепок живым приложением.
//
// Тексты не выдумываются: всё берётся из projectRegistry и infoContacts —
// тех же данных, что показывает сайт, в русском и английском вариантах.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { projectRegistry } from '../../src/data/projectRegistry.js';
import { infoContacts } from '../../src/data/infoContacts.js';
import { SITE_LANGUAGES, localizePath } from '../../src/i18n/languageRoutes.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = path.join(rootDir, 'dist');

const ORIGIN = 'https://denisdaragan.com';
const SITE_NAME = 'Denis Daragan Buro';
const SHARE_IMAGE = `${ORIGIN}/landscape/assets/share-cover.jpg`;
// Один источник правды: тот же адрес показывает страница /info и карточки в картах.
const EMAIL = infoContacts.email;

// Офис США в infoContacts — «123 Ocean Drive, Santa Monica» — очевидная заглушка.
// В разметку организации идёт только петербургский адрес: выдуманный адрес в
// structured data ломает доверие карточки в Яндексе и Google.
const spbOffice = infoContacts.offices.find((office) => office.id === 'spb');
const [spbLat, spbLng] = spbOffice.coords.split(',').map((part) => Number(part.trim()));

const publishedProjects = projectRegistry.filter((project) => project.status === 'published');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// GitHub Pages отдаёт каталог только по адресу с косой чертой: запрос /portfolio
// он разворачивает редиректом на /portfolio/. Поэтому и canonical, и sitemap, и
// ссылки внутри слепка используют форму с чертой — иначе поисковик получает
// canonical, указывающий на редирект, и просто его игнорирует.
const href = (route, language) => {
  const localized = localizePath(route, language);
  return localized === '/' ? '/' : `${localized}/`;
};
const absolute = (route, language) => `${ORIGIN}${href(route, language)}`;

const copy = {
  ru: {
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    tagline: 'Бюро ландшафтной архитектуры Дениса Дарагана. Парки, частные резиденции и сады.',
    works: 'Работы',
    portfolio: 'Портфолио',
    info: 'Инфо',
    map: 'Карта',
    home: 'На главную',
    contacts: 'Контакты',
    allWorks: 'Все работы',
    phone: 'Телефон',
    email: 'Почта',
    landscape: 'Ландшафт — избранное',
    soon: 'Раздел готовится.',
    image: 'изображение',
    kinds: { parks: 'парк', residences: 'частная резиденция', city: 'городской проект', fallback: 'проект' },
    yearWord: 'год',
    by: 'бюро ландшафтной архитектуры Дениса Дарагана',
    homeTitle: `${SITE_NAME} — ландшафтная архитектура, парки и частные резиденции`,
    homeDescription: 'Бюро ландшафтной архитектуры Дениса Дарагана: парки, частные резиденции и сады в России и Европе. Офис в Санкт-Петербурге.',
    worksTitle: `Работы — ${SITE_NAME}`,
    worksDescription: (names) => `Проекты бюро: ${names}.`,
    infoTitle: `Контакты и офисы — ${SITE_NAME}`,
    infoDescription: `Контакты бюро ландшафтной архитектуры Дениса Дарагана: ${spbOffice.address.ru}. Телефон ${infoContacts.phoneNumber}.`,
    mapTitle: `Карта проектов — ${SITE_NAME}`,
    mapDescription: 'Карта реализованных проектов бюро ландшафтной архитектуры Дениса Дарагана.',
    archive: { press: 'Пресса', news: 'Новости', monographs: 'Монографии', archive: 'Архив' },
    archiveDescription: (title) => `${title} бюро ландшафтной архитектуры Дениса Дарагана. Раздел готовится.`,
    orgDescription: 'Бюро ландшафтной архитектуры: парки, частные резиденции и сады.',
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    tagline: 'Denis Daragan landscape architecture buro. Parks, private residences and gardens.',
    works: 'Works',
    portfolio: 'Portfolio',
    info: 'Info',
    map: 'Map',
    home: 'Home',
    contacts: 'Contacts',
    allWorks: 'All works',
    phone: 'Phone',
    email: 'Email',
    landscape: 'Landscape — selected',
    soon: 'This section is in progress.',
    image: 'image',
    kinds: { parks: 'park', residences: 'private residence', city: 'urban project', fallback: 'project' },
    yearWord: '',
    by: 'by Denis Daragan landscape architecture buro',
    homeTitle: `${SITE_NAME} — landscape architecture, parks and private residences`,
    homeDescription: 'Denis Daragan landscape architecture buro: parks, private residences and gardens across Russia and Europe. Office in Saint Petersburg.',
    worksTitle: `Works — ${SITE_NAME}`,
    worksDescription: (names) => `Projects by the buro: ${names}.`,
    infoTitle: `Contacts and offices — ${SITE_NAME}`,
    infoDescription: `Contacts of Denis Daragan landscape architecture buro: ${spbOffice.address.en}. Phone ${infoContacts.phoneNumber}.`,
    mapTitle: `Project map — ${SITE_NAME}`,
    mapDescription: 'Map of completed projects by Denis Daragan landscape architecture buro.',
    archive: { press: 'Press', news: 'News', monographs: 'Monographs', archive: 'Archive' },
    archiveDescription: (title) => `${title} of Denis Daragan landscape architecture buro. This section is in progress.`,
    orgDescription: 'Landscape architecture buro: parks, private residences and gardens.',
  },
};

// Описание проекта собирается из его же полей. Это метаданные, а не сочинение:
// название, что это, где и в каком году.
const projectDescription = (project, language) => {
  const words = copy[language];
  const kind = words.kinds[project.category] ?? words.kinds.fallback;
  const parts = [
    `${project.title[language]} — ${kind} ${words.by}`,
    project.location[language],
    words.yearWord ? `${project.year} ${words.yearWord}` : project.year,
  ];

  if (project.collaboration?.[language]) {
    parts.push(project.collaboration[language]);
  }

  return `${parts.join('. ')}.`;
};

const archiveRoutes = ['press', 'news', 'monographs', 'archive'];

const buildPages = (language) => {
  const words = copy[language];
  const dial = infoContacts.phoneNumber.replace(/[^+\d]/g, '');

  const projectList = publishedProjects.map((project) => `
        <li>
          <a href="${escapeHtml(href(`/portfolio/${project.slug}`, language))}">${escapeHtml(project.title[language])}</a>
          — ${escapeHtml(project.location[language])}, ${escapeHtml(project.year)}
        </li>`).join('');

  const offices = infoContacts.offices.map((office) => `
        <li>${escapeHtml(office.label[language])}: ${escapeHtml(office.address[language])}</li>`).join('');

  return [
    {
      route: '/',
      language,
      title: words.homeTitle,
      description: words.homeDescription,
      organization: true,
      body: `
      <h1>${escapeHtml(SITE_NAME)}</h1>
      <p>${escapeHtml(words.tagline)}</p>
      <p>${escapeHtml(spbOffice.address[language])}</p>
      <p><a href="tel:${escapeHtml(dial)}">${escapeHtml(infoContacts.phoneNumber)}</a> · <a href="mailto:${EMAIL}">${EMAIL}</a></p>
      <h2>${escapeHtml(words.works)}</h2>
      <ul>${projectList}
      </ul>
      <p><a href="${href('/portfolio', language)}">${escapeHtml(words.portfolio)}</a> · <a href="${href('/info', language)}">${escapeHtml(words.info)}</a> · <a href="${href('/map', language)}">${escapeHtml(words.map)}</a> · <a href="/landscape/">${escapeHtml(words.landscape)}</a></p>`,
    },
    {
      route: '/portfolio',
      language,
      title: words.worksTitle,
      description: words.worksDescription(publishedProjects.map((project) => project.title[language]).join(', ')),
      body: `
      <h1>${escapeHtml(words.works)}</h1>
      <ul>${projectList}
      </ul>
      <p><a href="${href('/', language)}">${escapeHtml(words.home)}</a> · <a href="${href('/info', language)}">${escapeHtml(words.contacts)}</a></p>`,
    },
    {
      route: '/info',
      language,
      title: words.infoTitle,
      description: words.infoDescription,
      organization: true,
      body: `
      <h1>${escapeHtml(words.info)}</h1>
      <ul>${offices}
      </ul>
      <p>${escapeHtml(words.phone)}: <a href="tel:${escapeHtml(dial)}">${escapeHtml(infoContacts.phoneNumber)}</a></p>
      <p>${escapeHtml(words.email)}: <a href="mailto:${EMAIL}">${EMAIL}</a></p>
      <p><a href="${href('/', language)}">${escapeHtml(words.home)}</a> · <a href="${href('/portfolio', language)}">${escapeHtml(words.works)}</a></p>`,
    },
    {
      route: '/map',
      language,
      title: words.mapTitle,
      description: words.mapDescription,
      body: `
      <h1>${escapeHtml(words.map)}</h1>
      <ul>${projectList}
      </ul>
      <p><a href="${href('/', language)}">${escapeHtml(words.home)}</a></p>`,
    },
    ...publishedProjects.map((project) => ({
      route: `/portfolio/${project.slug}`,
      language,
      title: `${project.title[language]} — ${project.location[language]} — ${SITE_NAME}`,
      description: projectDescription(project, language),
      image: project.images?.[0] ? `${ORIGIN}${project.images[0]}` : SHARE_IMAGE,
      ogType: 'article',
      body: `
      <h1>${escapeHtml(project.title[language])}</h1>
      <p>${escapeHtml(project.location[language])} · ${escapeHtml(project.year)} · ${escapeHtml(project.fileCode)}</p>
      ${project.collaboration?.[language] ? `<p>${escapeHtml(project.collaboration[language])}</p>` : ''}
      ${(project.images ?? []).map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(project.title[language])} — ${escapeHtml(words.image)} ${index + 1}" width="1600" height="1067" loading="lazy" />`).join('\n      ')}
      <p><a href="${href('/portfolio', language)}">${escapeHtml(words.allWorks)}</a> · <a href="${href('/info', language)}">${escapeHtml(words.contacts)}</a></p>`,
    })),
    // Страницы-заглушки архива существуют в навигации, но пусты. Файл на них нужен,
    // иначе Pages отдаёт 404 по ссылке из меню; в индекс они не идут, пока пусты.
    ...archiveRoutes.map((key) => ({
      route: `/${key}`,
      language,
      title: `${words.archive[key]} — ${SITE_NAME}`,
      description: words.archiveDescription(words.archive[key]),
      noindex: true,
      body: `
      <h1>${escapeHtml(words.archive[key])}</h1>
      <p>${escapeHtml(words.soon)}</p>
      <p><a href="${href('/', language)}">${escapeHtml(words.home)}</a></p>`,
    })),
  ];
};

export const pages = SITE_LANGUAGES.flatMap(buildPages);

const organizationJsonLd = (language) => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${ORIGIN}/#organization`,
  name: 'Ландшафтный архитектор Дараган Денис',
  alternateName: SITE_NAME,
  description: copy[language].orgDescription,
  url: ORIGIN,
  image: SHARE_IMAGE,
  telephone: infoContacts.phoneNumber,
  email: EMAIL,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Большой проспект Петроградской стороны, 76-78',
    addressLocality: 'Санкт-Петербург',
    postalCode: '197136',
    addressCountry: 'RU',
  },
  geo: { '@type': 'GeoCoordinates', latitude: spbLat, longitude: spbLng },
  areaServed: 'RU',
  knowsAbout: ['ландшафтная архитектура', 'ландшафтный дизайн', 'проектирование парков', 'благоустройство территории'],
});

const headBlock = (page) => {
  const words = copy[page.language];
  const url = absolute(page.route, page.language);
  const image = page.image ?? SHARE_IMAGE;

  // hreflang связывает русскую и английскую версии одной страницы. Без него
  // поисковик считает их конкурирующими дубликатами и показывает не ту.
  const alternates = [
    ...SITE_LANGUAGES.map((code) => `<link rel="alternate" hreflang="${code}" href="${escapeHtml(absolute(page.route, code))}" />`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(absolute(page.route, 'ru'))}" />`,
  ];

  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    ...alternates,
    page.noindex ? '<meta name="robots" content="noindex,follow" />' : '',
    `<meta property="og:type" content="${page.ogType ?? 'website'}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${words.ogLocale}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    page.organization ? `<script type="application/ld+json">${organizationJsonLd(page.language)}</script>` : '',
  ].filter(Boolean);

  return `<!-- seo:start -->\n    ${tags.join('\n    ')}\n    <!-- seo:end -->`;
};

// Статический слепок живёт внутри #root: React заменит его при монтировании,
// а робот и мессенджер получают текст сразу из ответа сервера. Фон и цвет заданы
// инлайном, чтобы между слепком и приложением не было белой вспышки.
const FALLBACK_STYLE = 'background:#000;color:#f0f0f0;font:16px/1.6 system-ui,sans-serif;padding:2rem;min-height:100vh';

export const renderPage = (template, page) => {
  const withHead = template.replace(
    /<!-- seo:start[\s\S]*?seo:end -->/,
    () => headBlock(page),
  );

  // Атрибут lang должен совпадать с языком страницы уже в ответе сервера:
  // приложение поправит его при монтировании, но робот читает то, что пришло.
  const withLang = withHead.replace(/<html lang="[a-zA-Z-]+"/, `<html lang="${copy[page.language].htmlLang}"`);

  return withLang.replace(
    '<div id="root"></div>',
    `<div id="root"><div data-seo-fallback style="${FALLBACK_STYLE}">${page.body}\n    </div></div>`,
  );
};

export const sitemap = () => {
  const urls = [
    ...pages.filter((page) => !page.noindex).map((page) => absolute(page.route, page.language)),
    `${ORIGIN}/landscape/`,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
};

async function main() {
  const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');

  if (!template.includes('<!-- seo:start')) {
    throw new Error('В dist/index.html нет блока <!-- seo:start -->. Проверь index.html в корне.');
  }

  if (!template.includes('<div id="root"></div>')) {
    throw new Error('В dist/index.html нет пустого <div id="root"></div> — некуда класть статический слепок.');
  }

  for (const page of pages) {
    const localized = localizePath(page.route, page.language);
    const target = localized === '/'
      ? path.join(distDir, 'index.html')
      : path.join(distDir, localized.replace(/^\//, ''), 'index.html');

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, renderPage(template, page), 'utf8');
  }

  await fs.writeFile(path.join(distDir, 'sitemap.xml'), sitemap(), 'utf8');

  console.log(`SEO: ${pages.length} страниц на ${SITE_LANGUAGES.length} языках + sitemap.xml (${pages.filter((page) => !page.noindex).length + 1} адресов).`);
}

// Импорт из проверки не должен ничего писать в dist.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
