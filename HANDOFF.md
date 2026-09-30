# Карта кода — сайт denisdaragan.com

> Прочитай этот файл первым. Общение с пользователем — по-русски.
> Денис — художник, не программист: технические решения принимай сам, спрашивай только про художественное.
> Выкладка — только кнопка «На сайт» в редакторе OUROBOROS (коммит `chore(home): publish authored scene`
> в `main`) или ручной запуск Deploy GitHub Pages в Actions; слияние кода в `main` сайт не меняет.

## Состояние (обновлять в конце каждой сессии — AGENTS.md §3)

> Только то, что верно сейчас. Летопись — `docs/archive/handoff-log-2026.md` и
> «Состояние» этого файла на коммите `f557ba5` (последний общий с редактором).

На 2026-09-30:

- **Редактор отделён от сайта.** По просьбе Дениса движок (редактор,
  приложение, лаборатория, рендер, инструменты проектов) живёт в
  `../Ouroboros-Editor`, репозиторий `DenisDaraganGarden/ouroboros-editor`
  (закрытый). Здесь остались оболочка, страницы, портфолио, SEO и выкладка;
  главная сцена и её рендер — копия оттуда (AGENTS.md §5,
  `.ouroboros-sync.json`). Из этого репозитория убраны 507 файлов редактора,
  его серверные плагины, Electron, лаборатория и документы движка; план и
  измерения — `docs/split-engine-site-2026-09-30.md` в репозитории движка.
  Проверено на чистой установке: lint, build с SEO, `check:fast`, страницы
  собранного сайта (`/`, `/en/`, `/info`, `/portfolio`, `/map`, `/landscape/`),
  старый `/home/edit` отдаёт страницу «не найдено».
- **Публичный сайт** собран 27.09 с `25469d2` (Deploy GitHub Pages
  `36287053325`): живые изображения портфолио с наклоном телефона. Всё, что
  влито в `main` после этого, выйдет со следующим «На сайт» или ручным
  запуском выкладки.
- **Портфолио `/landscape/`** — новая структура глав 27.09
  (`docs/portfolio-chapters-2026-09-27.md`), автопортрет
  (`docs/portfolio-author-story-2026-09-26.md`). В `public/landscape/assets`
  лежат семь неиспользуемых веб-копий (`story-labyrinth`, `nike`, `pebbles`,
  `serpent`, `skin`, `steppe`, `stone-ram`), не в git; исходники — в папке
  аналогов Дениса. Москва I–IV — временные названия, видео и музыка не выбраны.

## Что это

Сайт бюро: главная страница — 3D-сцена из OUROBOROS, страницы «Инфо»,
«Портфолио», проект портфолио, «Карта», архивные заглушки; статическое
портфолио `/landscape/` с PDF по паролю. Стек: React + Vite; сцена —
Three.js / react-three-fiber (копия движка). Хостинг — GitHub Pages
(`public/CNAME`), SPA-адреса через `public/404.html`.

## Где что

- Оболочка — `src/App.jsx`: маршруты RU в корне и EN под `/en`, загрузочный
  экран главной, навигация (`src/components/ui/Navigation.jsx`), музыка сайта
  (`SiteMusicController.jsx`), курсор с фонарём. Язык — из адреса
  (`src/i18n/languageRoutes.js`, словарь `translations.js`).
- Главная — `src/pages/Home.jsx` (копия движка) читает опубликованную сцену
  `src/features/home-scene/data/publishedHomeSceneSettings.js`.
- Портфолио в React — `src/pages/Portfolio.jsx`, `ProjectDetail.jsx`, реестр
  `src/data/projectRegistry.js`, манифест `src/features/portfolio-content`,
  превью и его редактор `/portfolio/edit` (`src/features/portfolio-preview`,
  сервер `vite.portfolio-edit.config.js`, порт 41217).
- Статическое портфолио — `public/landscape/` (главы, живые изображения,
  зашифрованный `portfolio.enc`); редактор — `scripts/landscape/editor.mjs`
  (порт 41218), данные — `src/data/landscapePortfolio.json`.
- SEO — `scripts/seo/build-seo.mjs` после `vite build`: 26 страниц на двух
  языках и `sitemap.xml`; проверка — `check:seo`.
- Сервер разработки — `vite.config.js`: React, сторож служебных адресов
  `scripts/localGuard.mjs`, одна служебная точка — публикация превью
  портфолио.
- Проверки: `check:fast` (`check:bundle`, `check:seo`, `check:local-guard`),
  `smoke` — страницы, звук, отказ WebGL, стабильность и мобильная версия
  главной; GitHub — `checks.yml`, выкладка — `deploy-pages.yml`.
