# Проекты движка

Один файл — один проект: числа сцены и камеры. Ассеты (модели, текстуры, небо,
звук) общие для всех проектов, лежат в `public/` и сюда не копируются — движок
процедурный, форму он считает из этих чисел.

```
{ "id": "…", "name": "…", "engine": "1.4.0", "created": "…", "updated": "…",
  "settings": { …тот же набор ключей, что у сцены сайта… } }
```

Создаются и правятся из главного меню движка — `/engine` на локальном сервере.
Редактор открывает проект по адресу `/home/edit?project=<id>` и пишет сюда же.

Сайт в этой папке не живёт. Его сцена — `src/features/home-scene/data/publishedHomeSceneSettings.js`,
она публикуется кнопкой «В проект» из редактора без `?project=`. Проект движка
на сайт не уезжает: внутри проекта обе кнопки публикации выключены.

Заводские значения («заводской берег») собираются из модулей настроек:
`src/terrain/settings.js`, `src/plants/settings.js`,
`src/components/effects/water/seaSettings.js`, `src/shore/settings.js`,
`src/tanker/settings.js`, `src/features/home-scene/lib/painterlyCloudSettings.js`,
`src/components/effects/renderQualitySettings.js`. Это же список того, что
движок умеет: правка там меняет и заводской проект, и список публикуемых ключей.
