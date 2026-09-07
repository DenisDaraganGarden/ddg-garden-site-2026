# Живописное небо — лаборатория и интеграция, 7 сентября 2026

## Общее небо

`src/components/effects/sky/painterly/` — общий процедурный слой для лаборатории
и `WaterScene`. Бесшовный 3D fBm/Worley шум и 2D карта погоды питают короткий
raymarch конечного по высоте слоя в уменьшенном HDR-буфере. Внешние изображения и
сеть не нужны. Свет идёт от того же авторского солнца, что вода и объекты;
Beer-накопление и powder/forward приближение создают художественную толщу и край.
Это не полное многократное рассеяние, SSS или GI.

Старые `cloud*` настройки остаются legacy-слоем. `WaterScene` отдельно
разрешает `painterlyCloud*` в компактный контракт рендера.

## Тень, вода и окружение

Один объём плотности строит карту пропускания для погодного мира. Вода,
растительные и обычные PBR-приёмники используют её только для прямого солнца,
сохраняя окружающий свет. Ветер накапливает фазу в метрах; карта центрируется при
крупном перемещении камеры.

Вода читает линейный direction-space sky atlas этого слоя. Он даёт отражению
согласованную форму облаков с приближением параллакса, а не точное отражение
объёмной среды. В режиме `sky` atlas периодически фильтруется в PMREM и служит
image-based fill; HDRI-режимы сохраняют авторский HDRI.

Лучевые просветы добавляются общим depth-aware post-pass. Нужны включённый
`sunRaysEnabled`, ненулевые туман и `painterlyCloudRays`; opaque depth не даёт
им рисоваться поверх передних непрозрачных объектов.

## Настройки и камеры

В normalizer, publish payload, обычные и рабочие камеры входят 14 ключей:

- `painterlyCloudsEnabled`, `painterlyCloudSeed`, `painterlyCloudCoverage`,
  `painterlyCloudDensity`, `painterlyCloudAltitude`, `painterlyCloudHeight`,
  `painterlyCloudScale`;
- `painterlyCloudWindSpeed`, `painterlyCloudWindDirection`,
  `painterlyCloudShadowStrength`, `painterlyCloudShadowSoftness`,
  `painterlyCloudHaze`, `painterlyCloudRays`, `painterlyCloudQuality`.

По умолчанию слой включён: seed 7, coverage 0.65, density 1.1, altitude 1400 м,
height/scale 1, ветер 12 м/с на 35°, сила тени 0.82, softness 0.35, haze 0.3,
rays 0.35 и качество `auto`. `auto` выбирает balanced на обычном устройстве и
low на mobile/low-power, не записывая эффективное качество в авторскую сцену.
Доступны явные `low`, `balanced`, `high`.

Clear, Sunset, Storm и Broken меняют только coverage, density и height: солнце,
HDRI, камера, ветер и другие параметры кадра не меняются. Опубликованный файл
не правится вручную; новые ключи проходят существующий publish pipeline.

## Режимы и пределы

| Режим | Буфер от CSS viewport | Шаги камеры / к солнцу | 3D шум | Тень / частота |
|---|---:|---:|---:|---:|
| Low | 0.40 по каждой оси | 24 / 2 | 64³ RGBA8 | 256² / 6 Гц |
| Balanced | 0.55 по каждой оси | 40 / 3 | 64³ RGBA8 | 384² / 10 Гц |
| High | 0.75 по каждой оси | 64 / 4 | 96³ RGBA8 | 512² / 12 Гц |

Это параметры реализации, а не обещание частоты кадров. Смена seed или размера
шума отменяет незавершённую генерацию; ресурсы объёма, карт, материалов и PMREM
освобождаются при пересоздании/размонтаже.

## Наблюдения лаборатории

Цифры ниже относятся только к лаборатории на Mac 7 сентября 2026, а не к полной
сцене или мобильным устройствам. Выпечка шума наблюдалась примерно 0.25–0.7 с.
В дневном лабораторном кадре с внутренним буфером 793 × 416 облачный проход был
около 0.5–0.8 мс GPU; high в том же ракурсе — около 2 мс, storm/high — до
примерно 6 мс. Метрика не включает общий post, воду, композитинг, PMREM и другие
материалы; без `EXT_disjoint_timer_query_webgl2` выводится прочерк.

Balanced в этом лабораторном viewport хранил около 5.5 MiB собственных текстур
и целей. Размер живой сцены зависит от viewport, профиля и форматов target.

## Ограничения

При интеграции проверены реальные кадры главного редактора и песочницы,
отражения, post с туманом, low/high и пауза общего движка. Десять пиксельных
WebGL-проверок подтвердили ослабление прямого света в Standard/CSM, сохранение
ambient/PointLight, instancing, проекцию по высоте и отключение эффекта.
Семь авторских камер и локальная «Рабочая 3» после добавления полей сохранили
все остальные нормализованные настройки. Штатная публикация, как и раньше,
берёт общий фон из первой обычной камеры. Scoped ESLint и production build
прошли; отдельный полный замер производительности сцены не выполнялся.

- Это художественный конечный объём, не метеосимуляция и не физическая атмосфера.
- Водное отражение — atlas с приближённым параллаксом, не трассировка лучей.
- Для конкретного iPhone не заявлены точность, память или плавность: нужен
  отдельный реальный запуск.
- High уменьшает дискретизацию контрастных просветов, но не заменяет temporal
  reconstruction.

## Первичные источники

- [Guerrilla: The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn)
  и [материалы SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/):
  ограниченный бюджет объёма, шум и световые приближения. Реализация не
  воспроизводит их temporal reconstruction и не наследует их измерения.
- [NVIDIA GPU Gems 3, Volumetric Light Scattering as a Post-Process](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process).
- [NVIDIA GPU Gems 2, Accurate Atmospheric Scattering](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering).
