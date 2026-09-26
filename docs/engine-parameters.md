# Параметры движка

Сцена этого движка — числа, а не модели: берег, вода, растения и небо считаются
из перечисленных здесь параметров, а файлы в `public/` дают им материал. Поэтому
новый проект — это новый набор этих чисел на тех же ассетах.

Файл собран из живого редактора (`npm run build:reference`): подписи, пределы и
единицы взяты из его каталога контролов, поэтому параметр не может появиться в
редакторе и не появиться здесь. Руками не править.

Снято: 2026-09-26 · параметров: 740 · разделов: 48

Как этим пользоваться агенту: читать и писать `~/Ouroboros/projects/<id>.json`, поле
`settings` — плоский объект с этими ключами. `topiaryObjects` — массив форм;
`topiaryObjects[].…` обозначает поле одной формы. Пределы ниже — это пределы
редактора; движок нормализует значение при загрузке, выходить за них не нужно.

## annotations/levels

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `annotationColor` | Цвет | цвет | #rrggbb | #b0473f |
| `annotationFade` | Гаснут дальше | число | 10 … 2000, шаг 5,  m | 150 |
| `annotationFill` | Заливка под числом | выключатель | да / нет | true |
| `annotationLine` | Толщина линий | число | 0.4 … 3, шаг 0.05,  × | 1 |
| `annotationMarks` | Отметка | список |  |  |
| `annotationOutline` | Обводка числа | выключатель | да / нет | true |
| `annotationsEnabled` | Отметки уровня | выключатель | да / нет | true |
| `annotationSize` | Размер | число | 0.5 … 2.5, шаг 0.05,  × | 1 |
| `annotationStep` | Округление | список | 0.001 · 0.005 · 0.01 · 0.05 · 0.1 | 0.001 |
| `annotationUnits` | Единицы | список | m · cm · mm | m |

## atmosphere/clouds

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `cloudCover` | Облачность | число | 0 … 1, шаг 0.01, % | 0 |
| `cloudDensity` | Плотность | число | 0 … 1, шаг 0.01, % | 0.62 |
| `cloudHorizon` | Высота слоя | число | 0 … 1, шаг 0.01, % | 0.38 |
| `cloudPreset` | Характер облаков | список | clear-cumulus · warm-veil · red-horizon · storm-deck | clear-cumulus |
| `cloudScale` | Масштаб облаков | число | 0.5 … 4, шаг 0.05, x | 1 |
| `cloudSunOcclusion` | Перекрытие солнца | число | 0 … 1, шаг 0.01, % | 0.72 |
| `painterlyCloudAltitude` | Высота слоя | число | 300 … 5000, шаг 25, m | 1400 |
| `painterlyCloudCoverage` | Покрытие | число | 0 … 1, шаг 0.01, % | 0.65 |
| `painterlyCloudDensity` | Плотность | число | 0.2 … 2.5, шаг 0.05 | 1.1 |
| `painterlyCloudHaze` | Дымка | число | 0 … 1, шаг 0.01, % | 0.3 |
| `painterlyCloudHeight` | Вертикальный объём | число | 0.2 … 2, шаг 0.05 | 1 |
| `painterlyCloudLightning` | Молнии | число | 0 … 1, шаг 0.01, % | 0.5 |
| `painterlyCloudQuality` | Качество | список | auto · low · balanced · high · ultra | auto |
| `painterlyCloudRain` | Дождь | число | 0 … 1, шаг 0.01, % | 0.6 |
| `painterlyCloudRainCells` | Дождевые тучи | число | 0 … 1, шаг 0.01, % | 0.5 |
| `painterlyCloudRainDarkness` | Темнота туч | число | 0 … 1, шаг 0.01, % | 0.6 |
| `painterlyCloudRainDrops` | Капли у камеры | число | 0 … 1, шаг 0.01, % | 0.6 |
| `painterlyCloudRainDropSize` | Размер капель | число | 0.5 … 2, шаг 0.05, x | 1 |
| `painterlyCloudRays` | Лучи под облаками | число | 0 … 1, шаг 0.01, % | 0.35 |
| `painterlyCloudScale` | Масштаб | число | 0.35 … 2.5, шаг 0.05, x | 1 |
| `painterlyCloudSeed` | Вариант | число | 1 … 99, шаг 1 | 7 |
| `painterlyCloudsEnabled` | Живописные облака | выключатель | да / нет | true |
| `painterlyCloudShadowSoftness` | Мягкость тени | число | 0 … 1, шаг 0.01, % | 0.35 |
| `painterlyCloudShadowStrength` | Сила тени | число | 0 … 1, шаг 0.01, % | 0.82 |
| `painterlyCloudStorm` | Сила грозы | число | 0 … 1, шаг 0.01, % | 0.7 |
| `painterlyCloudStormEnabled` | Гроза | выключатель | да / нет | false |
| `painterlyCloudWindDirection` | Направление ветра | число | 0 … 360, шаг 1, ° | 35 |
| `painterlyCloudWindSpeed` | Скорость ветра | число | 0 … 40, шаг 0.5, m/s | 12 |

## atmosphere/fog

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `fogColor` | Цвет тумана | цвет | #rrggbb | #46545d |
| `fogDensity` | Плотность тумана | число | 0 … 1, шаг 0.01, % | 0.08 |
| `fogFar` | Полная дистанция | число | 0.1 … 4000, шаг 1, m | 36 |
| `fogMode` | Режим тумана | список | off · cheap · volumetric | cheap |
| `fogNear` | Начало по дистанции | число | 0 … 2000, шаг 1, m | 2.5 |
| `fogNoiseScale` | Масштаб облаков | число | 0.1 … 12, шаг 0.1 | 2.1 |
| `fogScattering` | Рассеивание солнечного света | число | 0 … 2, шаг 0.01 | 0.25 |
| `fogSkyTint` | Цвет тумана от неба | число | 0 … 1, шаг 0.01 | 0 |
| `fogSpeed` | Скорость движения | число | 0 … 2, шаг 0.01 | 0.05 |

## atmosphere/hdri

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `envMode` | Источник окружения | список | sky · sky+hdri · hdri | sky |
| `envReflectionIntensity` | Сила отражений HDRI | число | 0 … 220, шаг 1, % | 84 |
| `hdrExposure` | Экспозиция HDRI | число | 0 … 220, шаг 1, % | 64 |
| `hdriAtNight` | HDRI ночью | число | 0 … 1, шаг 0.01, x | 1 |
| `hdriIntensity` | Сила HDRI | число | 0 … 2, шаг 0.01, x | 1 |
| `hdrPreset` | HDRI пресет | список | night · studio · warehouse · city · sunset · dawn | night |
| `hdrRotation` | Поворот HDRI | число | 0 … 360, шаг 1, ° | 210 |
| `showHdriBackground` | Показывать HDRI фоном | выключатель | да / нет | false |
| `skyVisible` | Небо | выключатель | да / нет | true |

## atmosphere/light

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `ambientColor` | Заполняющий свет: цвет | цвет | #rrggbb | #202635 |
| `ambientIntensity` | Заполняющий свет: сила | число | 0 … 2, шаг 0.01 | 0.11 |
| `distantSurfaceColor` | Цвет поверхности | цвет | #rrggbb | #70716d |
| `envTint` | Тон отражений | цвет | #rrggbb | #6b7484 |
| `hemisphereGroundColor` | Полусфера: цвет земли | цвет | #rrggbb | #020305 |
| `hemisphereIntensity` | Полусфера: сила | число | 0 … 2, шаг 0.01 | 0.26 |
| `hemisphereSkyColor` | Полусфера: цвет неба | цвет | #rrggbb | #314762 |
| `lightDiscEnabled` | Показывать диск светила | выключатель | да / нет | true |
| `moonBrightness` | Яркость луны | число | 0 … 4, шаг 0.05 | 1 |
| `moonPhase` | Фаза луны | число | 0 … 1, шаг 0.01 | 0.5 |
| `shadowBias` | Смещение теней | число | -0.005 … 0.005, шаг 0.0001 | -0.0002 |
| `shadowCascades` | Зоны теней | список | auto · 1 · 2 | auto |
| `shadowContactOffset` | Смещение контакта | число | -0.06 … 0.06, шаг 0.001, mm | {…} |
| `shadowIntensity` | Сила теней | число | 0 … 1, шаг 0.05, % | 1 |
| `shadowRadius` | Мягкость теней | число | 0 … 8, шаг 0.25 | 3 |
| `shadowsEnabled` | Тени включены | выключатель | да / нет | true |
| `skyTurbidity` | Мутность воздуха | число | 1 … 10, шаг 0.1 | 2.6 |
| `starsIntensity` | Звёзды | число | 0 … 3, шаг 0.05 | 1 |
| `sunAngularSize` | Размер диска | число | 0.2 … 6, шаг 0.05, x | 1 |
| `sunBearing` | Направление на солнце | число | 0 … 360, шаг 1, ° | 42 |
| `sunIntensity` | Яркость солнца | число | 0 … 8, шаг 0.05 | 1.6 |
| `sunNoonElevation` | Высота в полдень | число | 0 … 85, шаг 1, ° | 18 |
| `sunTint` | Оттенок солнца | цвет | #rrggbb | #fff5ea |
| `timeOfDay` | Время суток | число | 0 … 24, шаг 0.05 | 12 |
| `waterShadowStrength` | Тень в толще воды | число | 0 … 1, шаг 0.01, % | 1 |

## atmosphere/rays

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `sunRaysDecay` | Затухание лучей | число | 0.72 … 0.995, шаг 0.005 | 0.93 |
| `sunRaysDensity` | Длина / плотность лучей | число | 0 … 1.5, шаг 0.01 | 0.72 |
| `sunRaysEnabled` | Лучи включены | выключатель | да / нет | true |
| `sunRaysIntensity` | Сила лучей | число | 0 … 2, шаг 0.01 | 0.14 |

## atmosphere/wind

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `plantingSway` | Качание сада | число | 0 … 2, шаг 0.05,  × | 1 |
| `terrainStorm` | Шторм | число | 0 … 1, шаг 0.01 | 0 |
| `terrainWindBearing` | Направление ветра | число | 0 … 360, шаг 1, ° | 290 |
| `terrainWindSpeed` | Скорость ветра | число | 0 … 18, шаг 0.1,  m/s | 4 |

## audio/audioMixer

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `audio.ambienceGain` | Живая среда | число | 0 … 1, шаг 0.01 |  |
| `audio.cameraCutDuck` | Уровень 3D во время смены | число | 0.25 … 1, шаг 0.01 |  |
| `audio.duckOnCameraCut` | Смягчать автосмену кадра | выключатель | да / нет |  |
| `audio.enabled` | Звуковая система сцены | выключатель | да / нет |  |
| `audio.homeFadeSeconds` | Возврат на главную | число | 0 … 8, шаг 0.1,  s |  |
| `audio.masterGain` | Master | число | 0 … 1, шаг 0.01 |  |
| `audio.mode` | Режим главной | список | off · music · soundscape · hybrid |  |
| `audio.musicGain` | Музыка | число | 0 … 1, шаг 0.01 |  |
| `audio.routeFadeSeconds` | Уход в раздел | число | 0 … 8, шаг 0.1,  s |  |
| `audio.spatialEnabled` | HRTF / пространственный звук | выключатель | да / нет |  |
| `audio.spatialGain` | 3D-источники | число | 0 … 1, шаг 0.01 |  |
| `audio.uiGain` | UI | число | 0 … 1, шаг 0.01 |  |
| `audio.weatherGain` | Погода | число | 0 … 1, шаг 0.01 |  |

## audio/audioSpatial

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `audio.emitters.thunder.maxDistance` | Предел слышимости | число | 1 … 240, шаг 1,  m |  |
| `audio.emitters.thunder.refDistance` | Ближняя дистанция | число | 0.25 … 80, шаг 0.25,  m |  |
| `audio.emitters.thunder.rolloff` | Затухание с расстоянием | число | 0 … 4, шаг 0.05 |  |
| `audio.emitters.thunder.x` | X | число | -80 … 80, шаг 0.1,  m |  |
| `audio.emitters.thunder.y` | Y | число | -20 … 80, шаг 0.1,  m |  |
| `audio.emitters.thunder.z` | Z | число | -80 … 80, шаг 0.1,  m |  |
| `audio.emitters.wind.maxDistance` | Предел слышимости | число | 1 … 240, шаг 1,  m |  |
| `audio.emitters.wind.refDistance` | Ближняя дистанция | число | 0.25 … 80, шаг 0.25,  m |  |
| `audio.emitters.wind.rolloff` | Затухание с расстоянием | число | 0 … 4, шаг 0.05 |  |
| `audio.emitters.wind.x` | X | число | -80 … 80, шаг 0.1,  m |  |
| `audio.emitters.wind.y` | Y | число | -20 … 80, шаг 0.1,  m |  |
| `audio.emitters.wind.z` | Z | число | -80 … 80, шаг 0.1,  m |  |

## audio/audioTracks

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `audio.tracks.boat.enabled` | Волна о лодку: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.boat.gain` | Волна о лодку · Объём | число | 0 … 1.5, шаг 0.01 |  |
| `audio.tracks.tanker.enabled` | Танкер · дизель / гудок: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.tanker.gain` | Танкер · дизель / гудок · Объём | число | 0 … 1.5, шаг 0.01 |  |
| `audio.tracks.thunder.enabled` | Далёкий гром: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.thunder.gain` | Далёкий гром · Объём | число | 0 … 1.5, шаг 0.01 |  |
| `audio.tracks.ui.enabled` | Клики интерфейса: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.ui.gain` | Клики интерфейса · Объём | число | 0 … 1.5, шаг 0.01 |  |
| `audio.tracks.water.enabled` | Водная гладь: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.water.gain` | Водная гладь · Объём | число | 0 … 1.5, шаг 0.01 |  |
| `audio.tracks.wind.enabled` | Ветер и листва: включить дорожку | выключатель | да / нет |  |
| `audio.tracks.wind.gain` | Ветер и листва · Объём | число | 0 … 1.5, шаг 0.01 |  |

## cameras/camera

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `cameraFov` | FOV | число | 15 … 100, шаг 0.1, ° | 36 |
| `frameInset` | Рамка | число | 0 … 32, шаг 0.5, % |  |
| `slideshowEnabled` | Смена | выключатель | да / нет |  |
| `slideshowFade` | Затухание | число | 0 … 30, шаг 0.1, с |  |

## creatures/fish

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `fishActivity` | Активность | число | 0 … 1, шаг 0.01, % | 0.55 |
| `fishCount` | Количество рыб | число | 0 … 50, шаг 1 | 50 |
| `fishDepthBand` | Глубина плавания | число | 0 … 1, шаг 0.01, % | 0.72 |
| `fishEnabled` | Рыбы | выключатель | да / нет | true |
| `fishPointerInteraction` | Реакция на курсор | выключатель | да / нет | true |
| `fishSchooling` | Косяк | число | 0 … 1, шаг 0.01, % | 0.68 |

## creatures/seagulls

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `seagullAltitudeMax` | Высота полёта · верхняя | число | 1 … 80, шаг 0.1, m | 4.6 |
| `seagullAltitudeMin` | Высота полёта · нижняя | число | 0.2 … 30, шаг 0.1, m | 0.36 |
| `seagullCount` | Количество чаек | число | 1 … 9, шаг 1 | 9 |
| `seagullFlightActivity` | Активность полёта | число | 0 … 1, шаг 0.01, % | 0.72 |
| `seagullLandingDensity` | Плотность посадок | число | 0 … 1, шаг 0.01, % | 0.38 |
| `seagullPerchCount` | Мест на суше | число | 0 … 48, шаг 1 | 12 |
| `seagullPerchObjects` | Садятся на объекты | выключатель | да / нет | true |
| `seagullPerchRocks` | Садятся на валуны | выключатель | да / нет | true |
| `seagullPerchTerrain` | Садятся на сушу | выключатель | да / нет | true |
| `seagullPointerInteraction` | Реакция на курсор | выключатель | да / нет | true |
| `seagullsEnabled` | Чайки | выключатель | да / нет | true |
| `seagullShootingEnabled` | Стрельба по чайкам | выключатель | да / нет | true |
| `seagullTerritoryRadius` | Радиус территории | число | 3 … 120, шаг 0.5, m | 6 |
| `seagullTerritoryX` | Центр территории · X | число | -400 … 400, шаг 0.5, m | 0 |
| `seagullTerritoryZ` | Центр территории · Z | число | -400 … 400, шаг 0.5, m | 0 |

## cursor/cursor

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `cursorEnabled` | Показывать курсор | выключатель | да / нет | true |
| `cursorLightBeamAngle` | Угол пучка | число | 12 … 70, шаг 1, ° | 34 |
| `cursorLightEnabled` | Фонарь включён по умолчанию | выключатель | да / нет | true |
| `cursorLightIntensity` | Интенсивность света | число | 0 … 2, шаг 0.01, % | 1 |
| `cursorLightSoftness` | Мягкость края пятна | число | 0 … 1, шаг 0.01, % | 0.72 |
| `cursorPointSize` | Размер точки | число | 3 … 12, шаг 0.5,  px | 6 |

## editor/settings

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `editorCursor` | Курсор сцены в редакторе | выключатель | да / нет | false |
| `editorHeadingColor` | Цвет заголовков | цвет | #rrggbb | #8d8d8d |
| `editorPieFill` | Круг инструментов: заливка | выключатель | да / нет | true |
| `editorPieOutline` | Круг инструментов: обводка | выключатель | да / нет | true |

## engine/debug

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `debugView` | Режим отладки | список | beauty · height · normals · caustics · seabed-depth | beauty |
| `debugWireframe` | Каркас (wireframe) | выключатель | да / нет | false |
| `showPerformanceHud` | Показывать FPS и память | выключатель | да / нет | false |
| `showPointerDebug` | Отладка курсора и тача | выключатель | да / нет | false |

## engine/quality

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `contactAoEnabled` | Контактное AO | выключатель | да / нет | false |
| `contactAoIntensity` | Сила AO | число | 0 … 1, шаг 0.05 | 0.35 |
| `contactAoRadius` | Радиус AO | число | 0.05 … 3, шаг 0.05, m | 0.5 |
| `postAntiAliasing` | Сглаживание | список | auto · msaa · fxaa · off | auto |
| `upscaleMode` | Апскейл | список | off · fsr1 | off |

## engine/resolution

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `adaptiveQuality` | Автобюджет · цель 30 FPS | выключатель | да / нет | true |
| `frameRateLimit` | Предел частоты кадров | список | 0 · 30 · 40 · 60 · 120 | 0 |
| `renderScale` | Разрешение рендера — десктоп | число | 0.5 … 2, шаг 0.05, x | 1 |
| `renderScaleMobile` | Разрешение рендера — мобайл | число | 0.5 … 2, шаг 0.05, x | 2 |

## greenery/algae

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `algaeVisible` | Водоросли | выключатель | да / нет | true |
| `underwaterAlgaeAmount` | Количество подводной тины | число | 0 … 1, шаг 0.01, % | 0.72 |
| `underwaterAlgaeCenterX` | Центр тины по X | число | -20 … 20, шаг 0.1, m | 2.6 |
| `underwaterAlgaeCenterZ` | Центр тины по Z | число | -20 … 20, шаг 0.1, m | 1.6 |
| `underwaterAlgaeColor` | Цвет подводной тины | цвет | #rrggbb | #29462a |
| `underwaterAlgaeDensity` | Плотность зарослей | число | 1 … 4, шаг 0.1, x | 1 |
| `underwaterAlgaeFlowDirection` | Направление подводного течения | число | -180 … 180, шаг 1, ° | 24 |
| `underwaterAlgaeFlowStrength` | Наклон по течению | число | 0 … 4, шаг 0.01 | 1.1 |
| `underwaterAlgaeLength` | Длина нитей | число | 0 … 3, шаг 0.05, m | 1.65 |
| `underwaterAlgaePatchiness` | Мозаика зарослей | число | 0 … 1, шаг 0.01, % | 0.42 |
| `underwaterAlgaeRadius` | Радиус подводного пятна | число | 0 … 20, шаг 0.1, m | 11 |
| `underwaterAlgaeSaturation` | Насыщенность под водой | число | 0 … 2, шаг 0.01, % | 0.88 |
| `underwaterAlgaeSpeciesMix` | Разнообразие видов | число | 0 … 1, шаг 0.01, % | 0.68 |
| `underwaterAlgaeSway` | Течение / колыхание | число | 0 … 1.5, шаг 0.01, % | 0.75 |
| `underwaterAlgaeWidth` | Ширина нитей | число | 0.5 … 3, шаг 0.05, x | 1 |

## greenery/grass

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `grassCarpet` | Подложка | число | 0 … 3, шаг 0.05, × | 1 |
| `grassDensity` | Плотность | число | 0 … 2, шаг 0.05, × | 1 |
| `grassDryness` | Сухость относительно кустов | число | -0.5 … 0.5, шаг 0.05 | 0 |
| `grassEnabled` | Травы | выключатель | да / нет | true |
| `grassFestuca` | Типчак | число | 0 … 1, шаг 0.05 | 1 |
| `grassFieldBlend` | Дальность перехода | число | 20 … 300, шаг 5,  m | 60 |
| `grassFieldContrast` | Контраст пятен | число | 0 … 1, шаг 0.05 | 0.6 |
| `grassFieldCoverage` | Покрытие | число | 0 … 1, шаг 0.05 | 0.85 |
| `grassFieldDry` | Цвет сухой травы | цвет | #rrggbb | #ffffff |
| `grassFieldFresh` | Цвет свежей травы | цвет | #rrggbb | #ffffff |
| `grassFieldHeight` | Затемнение у корней | число | 0 … 1, шаг 0.05 | 0.5 |
| `grassFieldScale` | Масштаб полос | число | 3 … 30, шаг 0.5,  m | 9 |
| `grassFieldSheen` | Блеск по ветру | число | 0 … 1, шаг 0.05 | 0.35 |
| `grassFieldWaves` | Волны ветра | число | 0 … 1, шаг 0.05 | 0.6 |
| `grassFlex` | Гибкость | число | 0.3 … 4, шаг 0.1 | 2.2 |
| `grassHeight` | Высота | число | 0.5 … 1.6, шаг 0.05, × | 1 |
| `grassLeymus` | Колосняк | число | 0 … 1, шаг 0.05 | 1 |
| `grassPhragmites` | Тростник | число | 0 … 1, шаг 0.05 | 1 |
| `grassRenderDistance` | Дальность отрисовки | число | 40 … 300, шаг 5,  m | 150 |
| `grassSeed` | Вариант | число | 1 … 200, шаг 1 | 23 |
| `grassStipa` | Ковыль | число | 0 … 1, шаг 0.05 | 1 |
| `grassTone` | Тон | число | 0.5 … 2, шаг 0.05, × | 1.15 |

## greenery/lilies

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `liliesVisible` | Кувшинки | выключатель | да / нет | true |
| `plantAoStrength` | AO у оснований растений | число | 0 … 1.5, шаг 0.01 | 0.55 |
| `surfacePlantAmount` | Количество плавающих растений | число | 0 … 1, шаг 0.01, % | 0.72 |
| `surfacePlantCenterX` | Центр пятна по X | число | -20 … 20, шаг 0.1, m | -3.6 |
| `surfacePlantCenterZ` | Центр пятна по Z | число | -20 … 20, шаг 0.1, m | 1.6 |
| `surfacePlantClustering` | Собранность в островки | число | 0 … 1, шаг 0.01, % | 0.76 |
| `surfacePlantColor` | Цвет плавающих растений | цвет | #rrggbb | #667b32 |
| `surfacePlantFloatOffset` | Посадка над водой | число | -0.05 … 0.2, шаг 0.002, m | 0.022 |
| `surfacePlantRadius` | Радиус пятна | число | 0 … 20, шаг 0.1, m | 7.8 |
| `surfacePlantReflection` | Влажный блик / отражение | число | 0 … 1, шаг 0.01, % | 0.72 |
| `surfacePlantSaturation` | Насыщенность поверхности | число | 0 … 2, шаг 0.01, % | 0.96 |
| `surfacePlantSize` | Размер листьев | число | 0 … 0.6, шаг 0.01, m | 0.36 |
| `surfacePlantStiffness` | Жёсткость листа | число | 0 … 1, шаг 0.01, % | 0.3 |
| `surfacePlantTranslucency` | Просвет листьев | число | 0 … 1, шаг 0.01, % | 0.62 |

## greenery/planting

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `northAngle` | Север | число | -180 … 180, шаг 0.5, ° | 0 |
| `plantingBeds` | Цветник | список |  |  |
| `plantingBeds[].cover.climate` | Климат почвопокрова | список | temperate · cold · mild |  |
| `plantingBeds[].cover.density` | Плотность | число | 0.4 … 1.6, шаг 0.05 |  |
| `plantingBeds[].cover.edge` | Мягкий край, м | число | 0 … 0.5, шаг 0.01 |  |
| `plantingBeds[].cover.enabled` | Нижний почвопокров | выключатель | да / нет |  |
| `plantingBeds[].cover.height` | Высота листвы, м | число | 0.04 … 0.24, шаг 0.01 |  |
| `plantingBeds[].cover.leaf` | Доля копытника | число | 0 … 1, шаг 0.05 |  |
| `plantingBeds[].cover.leafSize` | Размер листа, м | число | 0.07 … 0.24, шаг 0.01 |  |
| `plantingBeds[].cover.moisture` | Влажность | число | 0 … 1, шаг 0.05 |  |
| `plantingBeds[].cover.patches` | Размер куртины, м | число | 0.3 … 4, шаг 0.1 |  |
| `plantingBeds[].cover.shade` | Тенистость | число | 0 … 1, шаг 0.05 |  |
| `plantingBeds[].cover.thyme` | Доля тимьяна | число | 0 … 1, шаг 0.05 |  |
| `plantingBeds[].density` | Густота | число | 0.4 … 2, шаг 0.05,  × |  |
| `plantingBeds[].drift` | Размер пятна | число | 0.3 … 6, шаг 0.1,  m |  |
| `plantingBeds[].palette` | Палитра | список |  · steppe · prairie · flowering · shade · evergreen |  |
| `plantingEnabled` | Посадки | выключатель | да / нет | true |
| `plantingMonth` | Месяц | число | 1 … 12, шаг 1 | 6 |
| `plantingPlan` | План в шапках | выключатель | да / нет | false |
| `plantingPlant` | Растение | список | quercus-robur-fastigiata · acer-tataricum · pinus-nigra · thuja-smaragd · malus-evereste · picea-alberta-globe · juniperus-sabina-mas · buxus-sempervirens-ball · berberis-golden-rocket · cornus-alba-elegantissima · spiraea-tor-gold · vitis-vinifera · fallopia-baldschuanica · hydrangea-petiolaris · parthenocissus-quinquefolia · parthenocissus-tricuspidata-veitchii · lonicera-caprifolium · campsis-radicans · clematis-jackmanii · hedera-helix · nassella-tenuissima · miscanthus-sinensis · festuca-glauca · pennisetum-hameln · deschampsia-cespitosa · gaillardia-grandiflora · iris-germanica · lavandula-angustifolia · liatris-spicata · alchemilla-mollis · leucanthemum-superbum · sedum-herbstfreude · perovskia-atriplicifolia · rudbeckia-goldsturm · vinca-minor |  |
| `plantingVines` | Лиана | список |  |  |

## greenery/shrubs

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `shrubsAlong` | Смещение вдоль берега | число | -1200 … 1200, шаг 2,  m | 0 |
| `shrubsCount` | Количество | число | 0 … 2048, шаг 1 | 512 |
| `shrubsCrownScale` | Размер пятна в кроне | число | 0.2 … 2, шаг 0.1,  m | 0.8 |
| `shrubsCrownVariation` | Пятна в кроне | число | 0 … 1, шаг 0.01 | 0.48 |
| `shrubsDensity` | Облиственность | число | 0.1 … 1, шаг 0.01 | 0.8 |
| `shrubsDryness` | Сухость | число | 0 … 1, шаг 0.01 | 0.42 |
| `shrubsEnabled` | Кустарники | выключатель | да / нет | true |
| `shrubsFieldSeed` | Рисунок территории | число | 1 … 200, шаг 1 | 23 |
| `shrubsFlutter` | Трепет листьев | число | 0 … 1, шаг 0.01 | 0.55 |
| `shrubsGusts` | Порывы | число | 0 … 1, шаг 0.01 | 0.7 |
| `shrubsHeight` | Высота | число | 0.45 … 2.4, шаг 0.05,  m | 1.35 |
| `shrubsInland` | Отступ от обрыва | число | -20 … 100, шаг 0.5,  m | -5 |
| `shrubsLength` | Вдоль берега | число | 12 … 1024, шаг 4,  m | 120 |
| `shrubsLodging` | Примятость | число | 0 … 1, шаг 0.01 | 0.35 |
| `shrubsPatchContrast` | Контраст пятен | число | 0 … 1, шаг 0.01 | 0.8 |
| `shrubsPatchScale` | Размер пятен | число | 1 … 30, шаг 0.5,  m | 7 |
| `shrubsRenderDistance` | Дальность отрисовки | число | 40 … 300, шаг 5,  m | 180 |
| `shrubsRoughness` | Шероховатость | число | 0.35 … 1, шаг 0.01 | 0.73 |
| `shrubsSeed` | Вариант куста | число | 1 … 200, шаг 1 | 23 |
| `shrubsSpread` | Ширина кроны | число | 0.6 … 2.5, шаг 0.05,  m | 1.75 |
| `shrubsTranslucency` | Просвечивание | число | 0 … 1.4, шаг 0.05 | 0.65 |
| `shrubsWidth` | Ширина посадки | число | 4 … 120, шаг 1,  m | 24 |

## greenery/topiary

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `topiaryBrushHeight` | Высота мазка | число | 0.3 … 12, шаг 0.05,  m | 2.4 |
| `topiaryBrushWidth` | Толщина мазка | число | 0.3 … 8, шаг 0.05,  m | 1.2 |
| `topiaryEnabled` | Стриженые формы | выключатель | да / нет | true |
| `topiaryObjects` | Объект | список |  · hedge-60f83ac1-4ea9-4d28-890f-cf208dc79921 · hedge-32d63948-4ef4-487f-9fc4-cb2ef1ae71a1 · hedge-7141d415-f59a-49f3-b281-9007458ed9ec · hedge-3540c0cc-03b1-4c6c-b736-3614aa0e31f4 · hedge-36cd010a-da24-49ee-bbbe-492e01321f5b · hedge-171364de-fc33-475b-8a0a-3c18f5f7c347 · hedge-9d345241-de9a-4d05-8946-2aff55e0e134 · hedge-6c827cb3-6aad-4465-8bde-f0c4539a63b1 · hedge-ea6e9d74-b12d-42f4-a980-eb83a9756027 · hedge-2bc8b417-2f58-4e66-aaf6-876e417b1ee1 · hedge-8dc58efe-b493-4903-8570-eed2f98b45d3 · hedge-6d50e8c1-4efc-4d6e-95a7-3cd5a7935a7a · hedge-75dcd7c5-c786-4f68-bd3a-0ab79319e4c6 · hedge-6382f335-8e68-4a9a-9a9c-031dfa4a5d2b · hedge-89169578-c3b9-4289-9c3f-10f8a1fd4ff1 · hedge-bc681bb8-1fdf-4d34-be1e-a9e1446d9a08 · hedge-156342ae-e4a5-4125-a70f-0a3ca082d636 · hedge-34fffc0f-2e30-474d-85cb-1967436dafda · hedge-7fd53686-9e95-439a-9d36-b9e6735c3e27 · hedge-39324b8a-3b78-4c84-9126-35882581d0ec · hedge-921ab0d3-ae70-4c03-a3f0-a40c5a3cbdec · hedge-d93455a8-7fc0-4e35-96ae-d6c288182196 · hedge-a195e9fb-7ffc-4aef-8d54-001d3091a13f · hedge-8d2ded06-cfba-4f28-9b98-972aff6a9312 · hedge-5c5a3e3a-ef5b-4d31-8619-a3a32e6f1343 · hedge-bb98849e-a4ca-4199-b6bd-c55c0b2c485e · hedge-852206d9-436e-4dcb-b869-0b9bbecbd721 · hedge-87aa3378-f558-44eb-81a2-445ee76f10b2 · hedge-fcdbc7dc-e099-4262-bbb1-4bdde66e9732 · hedge-0e013aab-c97b-41a0-866b-b91070074ec2 |  |
| `topiaryObjects[].baseY` | Основание Y | число | -20 … 40, шаг 0.05,  m |  |
| `topiaryObjects[].density` | Плотность хвои | число | 0.1 … 1, шаг 0.01 |  |
| `topiaryObjects[].height` | Высота | число | 0.3 … 12, шаг 0.05,  m |  |
| `topiaryObjects[].leafSize` | Размер веточки | число | 0.14 … 0.55, шаг 0.01,  m |  |
| `topiaryObjects[].rotation` | Поворот | число | -180 … 180, шаг 1, ° |  |
| `topiaryObjects[].roughness` | Шероховатость | число | 0.35 … 1, шаг 0.01 |  |
| `topiaryObjects[].roundness` | Скругление | число | 0 … 1, шаг 0.01 |  |
| `topiaryObjects[].scale` | Масштаб | число | 0.25 … 4, шаг 0.05 |  |
| `topiaryObjects[].translucency` | Просвечивание | число | 0 … 1.4, шаг 0.05 |  |
| `topiaryObjects[].width` | Толщина | число | 0.3 … 8, шаг 0.05,  m |  |
| `topiaryObjects[].x` | Положение X | число | -1200 … 1200, шаг 0.1,  m |  |
| `topiaryObjects[].z` | Положение Z | число | -1200 … 1200, шаг 0.1,  m |  |
| `topiaryPlaneY` | Плоскость Y | число | -20 … 40, шаг 0.05,  m | 0 |

## greenery/trees

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `treesAlong` | Смещение вдоль берега | число | -1200 … 1200, шаг 2,  m | 40 |
| `treesBeach` | Тыл пляжа | число | 0 … 1, шаг 0.05 | 0.4 |
| `treesBluff` | Бровка | число | 0 … 1, шаг 0.05 | 0.6 |
| `treesCount` | Количество | число | 0 … 256, шаг 1 | 14 |
| `treesDeadwood` | Сухие ветви | число | 0 … 1, шаг 0.01 | 0.3 |
| `treesDensity` | Облиственность | число | 0.1 … 1, шаг 0.01 | 0.8 |
| `treesElm` | Вяз | число | 0 … 1, шаг 0.05 | 0.7 |
| `treesEnabled` | Деревья | выключатель | да / нет | true |
| `treesFlex` | Гибкость | число | 0 … 1, шаг 0.01 | 0.15 |
| `treesHeight` | Высота | число | 2.5 … 12, шаг 0.1,  m | 6 |
| `treesInland` | Отступ от бровки | число | -10 … 160, шаг 0.5,  m | 14 |
| `treesLeafSize` | Размер листа | число | 0.8 … 2.4, шаг 0.05 | 1.8 |
| `treesLean` | Наклон от ветра | число | 0 … 1, шаг 0.01 | 0.55 |
| `treesLength` | Вдоль берега | число | 12 … 1024, шаг 4,  m | 220 |
| `treesOleaster` | Лох | число | 0 … 1, шаг 0.05 | 1 |
| `treesPlum` | Алыча | число | 0 … 1, шаг 0.05 | 0.5 |
| `treesRavines` | Балки и оползни | число | 0 … 1, шаг 0.05 | 0.7 |
| `treesRenderDistance` | Дальность отрисовки | число | 60 … 1200, шаг 10,  m | 600 |
| `treesSeed` | Вариант дерева | число | 1 … 200, шаг 1 | 7 |
| `treesSnags` | Сухостой | число | 0 … 1, шаг 0.05 | 0.2 |
| `treesSpacing` | Расстояние между стволами | число | 3 … 20, шаг 0.5,  m | 7 |
| `treesSpread` | Ширина кроны | число | 1.5 … 12, шаг 0.1,  m | 5.5 |
| `treesTamarisk` | Гребенщик | число | 0 … 1, шаг 0.05 | 0.6 |
| `treesTranslucency` | Просвечивание листа | число | 0 … 1.4, шаг 0.05 | 1.1 |
| `treesTwist` | Кручение ствола | число | 0 … 1, шаг 0.01 | 0.4 |
| `treesWidth` | Ширина посадки | число | 6 … 160, шаг 1,  m | 36 |
| `treesWillow` | Ива | число | 0 … 1, шаг 0.05 | 0.5 |

## interface/ui

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `uiBrandVisible` | Название DENIS DARAGAN | выключатель | да / нет | true |
| `uiFrameVisible` | Киноплёночные полосы | выключатель | да / нет | true |
| `uiLanguageVisible` | Переключатель языка | выключатель | да / нет | true |
| `uiMenuVisible` | Меню | выключатель | да / нет | true |
| `uiSoundVisible` | Кнопка звука | выключатель | да / нет | true |
| `uiSubtitleVisible` | Подпись БЮРО | выключатель | да / нет | true |

## landscape/pebbles

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `terrainPebbles` | Плотность | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainPebblesEnabled` | Галька | выключатель | да / нет | true |
| `terrainPebbleSize` | Размер | число | 0.5 … 2, шаг 0.05, × | 1 |

## landscape/rocks

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `terrainDebris` | Осыпь · плотность | число | 0 … 1, шаг 0.01 | 0.55 |
| `terrainRocks` | Валуны · плотность | число | 0 … 1, шаг 0.01 | 0.55 |
| `terrainRocksEnabled` | Камни | выключатель | да / нет | true |
| `terrainRockSize` | Валуны · размер | число | 0.4 … 2.5, шаг 0.05, × | 1 |

## landscape/seabed

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `causticsIntensity` | Интенсивность каустики | число | 0 … 3, шаг 0.02 | 0.55 |
| `causticsScale` | Масштаб каустики | число | 0.5 … 6, шаг 0.05 | 1.2 |
| `causticsSharpness` | Резкость каустики | число | 0 … 1, шаг 0.02 | 0.45 |
| `seabedAoStrength` | AO и плотность дна | число | 0 … 1.5, шаг 0.01 | 0.62 |
| `seabedBrightness` | Яркость дна | число | 0 … 2, шаг 0.05 | 1 |
| `seabedReliefScale` | Масштаб рельефа дна | число | 0.5 … 6, шаг 0.05 | 1.8 |
| `seabedReliefStrength` | Сила рельефа дна | число | 0 … 2, шаг 0.02 | 0.42 |
| `seabedSaturation` | Насыщенность дна | число | 0 … 2, шаг 0.01 | 1 |
| `seabedTextureScale` | Масштаб текстуры дна | число | 0.1 … 10, шаг 0.05 | 1 |
| `seabedVariation` | Разнообразие дна | число | 0 … 1, шаг 0.01, % | 0.55 |
| `seabedVisible` | Дно | выключатель | да / нет | true |
| `terrainBars` | Бары и отмели | число | 0 … 1, шаг 0.01 | 0 |
| `terrainBedScale` | Масштаб пятен | число | 8 … 120, шаг 1,  m | 42 |
| `terrainMussels` | Мидиевые банки | число | 0 … 1, шаг 0.01 | 0.3 |
| `terrainRipples` | Рябь на песке | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainShelfExtent` | Дальность дна | число | 96 … 1600, шаг 32,  m | 96 |
| `terrainShelfSlope` | Уклон шельфа | число | 0 … 5, шаг 0.1, % | 1.2 |
| `terrainShoreKnee` | Колено дна | число | 4 … 400, шаг 1,  m | 12 |
| `terrainSilt` | Ил | число | 0 … 1, шаг 0.01 | 0.4 |
| `terrainWeed` | Луга водорослей | число | 0 … 1, шаг 0.01 | 0.55 |
| `waterTurbidity` | Мутность / рассеивание воды | число | 0 … 1, шаг 0.01 | 0.3 |

## landscape/shore

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `shoreAlong` | Смещение вдоль берега | число | -2000 … 2000, шаг 5,  m | 0 |
| `shoreBackBeach` | Тыл пляжа | число | 0 … 1, шаг 0.01 | 0.65 |
| `shoreBark` | Остатки коры | число | 0 … 1, шаг 0.01 | 0.28 |
| `shoreBleach` | Выбеленность | число | 0 … 1, шаг 0.01 | 0.78 |
| `shoreBurial` | Заглубление | число | 0 … 0.4, шаг 0.01 | 0.18 |
| `shoreCount` | Коряг | число | 0 … 160, шаг 1 | 36 |
| `shoreEnabled` | Береговые находки | выключатель | да / нет | true |
| `shoreGrain` | Волокна | число | 0 … 1, шаг 0.01 | 0.65 |
| `shoreLength` | Вдоль берега | число | 60 … 4000, шаг 10,  m | 600 |
| `shoreLogs` | Стволы и корневища | число | 0 … 1, шаг 0.01 | 0.4 |
| `shoreRenderDistance` | Дальность отрисовки | число | 40 … 600, шаг 10,  m | 280 |
| `shoreRings` | Каменные круги | число | 0 … 8, шаг 1 | 2 |
| `shoreSeed` | Вариант | число | 1 … 999, шаг 1 | 17 |
| `shoreSize` | Размер | число | 0.5 … 1.7, шаг 0.05, × | 1 |
| `shoreStakes` | Из песка | число | 0 … 1, шаг 0.01 | 0.15 |
| `shoreWetness` | Влажность | число | 0 … 1, шаг 0.01 | 0 |

## landscape/surroundings

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `northAngle` | Север | число | -180 … 180, шаг 0.5, ° | 0 |
| `surroundingsBuildingColor` | Дома | цвет | #rrggbb | #eceae5 |
| `surroundingsBuildings` | Здания | выключатель | да / нет | true |
| `surroundingsClear` | Круг участка | число | 0 … 150, шаг 1, m | 15 |
| `surroundingsEnabled` | Окружение | выключатель | да / нет | true |
| `surroundingsFences` | Заборы и изгороди | выключатель | да / нет | true |
| `surroundingsGreenColor` | Зелень | цвет | #rrggbb | #b4bda6 |
| `surroundingsGroundColor` | Земля | цвет | #rrggbb | #d8d5cc |
| `surroundingsOffsetX` | Сдвиг X | число | -300 … 300, шаг 0.1, m | 0 |
| `surroundingsOffsetZ` | Сдвиг Z | число | -300 … 300, шаг 0.1, m | 0 |
| `surroundingsRadius` | Радиус карты | число | 100 … 1500, шаг 10, m | 300 |
| `surroundingsRelief` | Рельеф | число | 0 … 2, шаг 0.05 | 1 |
| `surroundingsRoadColor` | Дороги | цвет | #rrggbb | #b3b0a8 |
| `surroundingsTrees` | Деревья и лес | выключатель | да / нет | true |
| `surroundingsWaterColor` | Вода | цвет | #rrggbb | #a7bac4 |

## landscape/terrain

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `terrainBeachWidth` | Ширина пляжа | число | 4 … 60, шаг 0.5,  m | 18 |
| `terrainBearing` | Направление суши от севера | число | 0 … 360, шаг 1, ° | 90 |
| `terrainBloom` | Цветение воды | число | 0 … 1, шаг 0.01 | 0 |
| `terrainBrightness` | Яркость | число | 0.5 … 1.6, шаг 0.05, × | 1 |
| `terrainCapeDepth` | Выступ мыса | число | 0 … 90, шаг 1,  m | 28 |
| `terrainCapePosition` | Положение мыса вдоль берега | число | -1200 … 1200, шаг 5,  m | -180 |
| `terrainCapeWidth` | Ширина мыса | число | 30 … 300, шаг 5,  m | 100 |
| `terrainCliffHeight` | Высота обрыва | число | 0 … 22, шаг 0.1,  m | 7 |
| `terrainCliffSlope` | Ширина склона | число | 2 … 24, шаг 0.5,  m | 3.5 |
| `terrainContrast` | Контраст | число | 0.5 … 1.6, шаг 0.05, × | 1 |
| `terrainCurve` | Изгибы берега | число | 0 … 45, шаг 0.5,  m | 12 |
| `terrainDry` | Жухлость покрова | число | 0 … 2, шаг 0.05, × | 1 |
| `terrainEnabled` | Суша | выключатель | да / нет | true |
| `terrainErosion` | Промоины и расщелины | число | 0 … 1, шаг 0.01 | 0.55 |
| `terrainFeatureScale` | Масштаб участков | число | 24 … 160, шаг 1,  m | 64 |
| `terrainFoam` | Пена прибоя | число | 0 … 1.5, шаг 0.01 | 0.75 |
| `terrainGreen` | Зелень покрова | число | 0 … 2, шаг 0.05, × | 1 |
| `terrainGroundCover` | Растительный покров грунта | число | 0 … 1, шаг 0.01 | 0.85 |
| `terrainLandslides` | Оползни и обвалы | число | 0 … 1, шаг 0.01 | 0.85 |
| `terrainLandWidth` | Глубина суши | число | 80 … 800, шаг 10,  m | 280 |
| `terrainLength` | Длина побережья | число | 128 … 4096, шаг 64,  m | 1600 |
| `terrainLooseSand` | Рыхлый песок | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainOasis` | Сила островков | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainOasisColor` | Цвет островков | цвет | #rrggbb | #7f9c58 |
| `terrainOffset` | Смещение берега | число | -200 … 200, шаг 0.5,  m | 12 |
| `terrainParallax` | Параллакс | число | 0 … 1, шаг 0.01 | 0.7 |
| `terrainPaths` | Частота спусков | число | 0 … 1, шаг 0.01 | 0.4 |
| `terrainPathWidth` | Ширина тропы | число | 0.6 … 4, шаг 0.1,  m | 1.3 |
| `terrainRelief` | Рельеф поверхности | число | 0 … 1.5, шаг 0.01 | 0.7 |
| `terrainRimColor` | Цвет дёрна бровки | цвет | #rrggbb | #86ad55 |
| `terrainRimWidth` | Ширина дёрна бровки | число | 0 … 30, шаг 0.5,  m | 8 |
| `terrainSaturation` | Насыщенность | число | 0 … 2, шаг 0.05, × | 1 |
| `terrainSeed` | Вариант рельефа | число | 1 … 9999, шаг 1 | 37 |
| `terrainShells` | Ракушечник | число | 0 … 1, шаг 0.01 | 0.75 |
| `terrainSoil` | Почвенный слой | число | 0 … 1, шаг 0.01 | 0.45 |
| `terrainSpitBend` | Загиб оконечности | число | -1.3 … 1.3, шаг 0.05 | 0.85 |
| `terrainSpitEnabled` | Коса | выключатель | да / нет | false |
| `terrainSpitHeight` | Высота гребня | число | 0.15 … 2.5, шаг 0.05,  m | 0.85 |
| `terrainSpitLength` | Длина косы | число | 40 … 800, шаг 5,  m | 320 |
| `terrainSpitPosition` | Положение вдоль берега | число | -1600 … 1600, шаг 5,  m | -320 |
| `terrainSpitShoal` | Подводная отмель | число | 8 … 160, шаг 2,  m | 28 |
| `terrainSpitWidth` | Ширина косы | число | 6 … 80, шаг 1,  m | 28 |
| `terrainStrata` | Пласты и потёки | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainTalus` | Осыпь и языки грунта | число | 0 … 1, шаг 0.01 | 0.6 |
| `terrainTextureScale` | Масштаб фактуры | число | 0.4 … 3, шаг 0.05 | 1 |
| `terrainWaveHeight` | Высота прибрежной волны | число | 0 … 0.3, шаг 0.01,  m | 0.12 |
| `terrainWavePeriod` | Период волны | число | 3 … 12, шаг 0.1,  s | 6 |
| `terrainWeathering` | Выветривание | число | 0 … 1, шаг 0.01 | 0.5 |
| `terrainWetBand` | Влажная кромка | число | 0.5 … 6, шаг 0.1,  m | 2.4 |
| `terrainWrack` | Выброшенная тина | число | 0 … 1, шаг 0.01 | 0.6 |

## landscape/water

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `ambientWaveIntensity` | Интенсивность фоновых волн | число | 0 … 1, шаг 0.01 | 0.12 |
| `ambientWaveSpeed` | Скорость фоновых волн | число | 0 … 10, шаг 0.05 | 0.85 |
| `farWaterVisible` | Дальняя вода | выключатель | да / нет | true |
| `normalBlur` | Сглаживание нормалей | число | 0.2 … 2.5, шаг 0.01 | 0.85 |
| `normalStrength` | Сила нормалей | число | 0 … 3.2, шаг 0.02 | 1.2 |
| `rippleDamping` | Затухание ряби | число | 0.93 … 0.992, шаг 0.001 | 0.965 |
| `rippleImpulse` | Сила импульса | число | 0 … 1.2, шаг 0.01 | 0.22 |
| `rippleRadius` | Радиус импульса | число | 0.05 … 2.4, шаг 0.05, m | 0.45 |
| `seaAmplitude` | Высота волны | число | 0 … 1.6, шаг 0.01, m | 0.57 |
| `seaBedColor` | Цвет дна | цвет | #rrggbb | #c4b08a |
| `seaBedTurbidity` | Мутность воды | число | 0 … 1, шаг 0.05 | 0.5 |
| `seaCrestGlow` | Просвет гребня | число | 0 … 2, шаг 0.05 | 0.6 |
| `seaCrossWaves` | Поперечные волны | число | 0 … 1, шаг 0.01 | 0.01 |
| `seaDeepColor` | Цвет глубины | цвет | #rrggbb | #143a40 |
| `seaFadeEnd` | Волны гаснут до | число | 40 … 3000, шаг 10, m | 2440 |
| `seaFadeStart` | Волны гаснут с | число | 20 … 1500, шаг 10, m | 260 |
| `seaFoamBrightness` | Яркость пены | число | 0.2 … 2, шаг 0.05 | 0.5 |
| `seaFoamDeposit` | Плотность пены | число | 0.2 … 1.5, шаг 0.05 | 0.65 |
| `seaFoamDrift` | Снос ветром | число | 0 … 2, шаг 0.05, m/s | 1.3 |
| `seaFoamDry` | Сохнет песок | число | 5 … 120, шаг 1, s | 43 |
| `seaFoamLaceScale` | Масштаб кружева | число | 0.03 … 0.6, шаг 0.01 | 0.13 |
| `seaFoamLife` | Живёт на воде | число | 1 … 20, шаг 0.5, s | 7 |
| `seaFoamMemory` | Память пены | выключатель | да / нет | true |
| `seaFoamSoftness` | Мягкость | число | 0.02 … 0.4, шаг 0.01 | 0.15 |
| `seaFoamSwirl` | Завихрения | число | 0 … 1.5, шаг 0.05 | 0.3 |
| `seaFoamThreshold` | Порог пены | число | 0 … 0.95, шаг 0.01 | 0.55 |
| `seaFoamVariety` | Фактура пены | число | 0 … 1, шаг 0.01 | 0.6 |
| `seaFoamWindow` | Окно памяти | число | 32 … 400, шаг 4, m | 228 |
| `seaGlint` | Блики солнца | число | 0 … 3, шаг 0.05 | 2.05 |
| `seaGusts` | Порывы | число | 0 … 1, шаг 0.01 | 0.44 |
| `seaMeshRings` | Кольца сетки | число | 32 … 192, шаг 8 | 152 |
| `seaMeshSegments` | Сегменты сетки | число | 48 … 256, шаг 8 | 104 |
| `seaRipple` | Рябь | число | 0 … 1, шаг 0.01 | 0.63 |
| `seaRippleScale` | Масштаб ряби | число | 0.01 … 0.3, шаг 0.005 | 0.09 |
| `seaSets` | Наборы | число | 0 … 1, шаг 0.01 | 0.37 |
| `seaSkyReflection` | Отражение неба | число | 0 … 3, шаг 0.05 | 0.3 |
| `seaSpeed` | Скорость | число | 0 … 2.5, шаг 0.05 | 0.55 |
| `seaSprayAmount` | Количество капель | число | 0 … 6, шаг 0.05 | 1 |
| `seaSprayCurtain` | Завеса с губы | число | 0 … 1, шаг 0.01 | 0.4 |
| `seaSprayDensity` | Плотность капель | число | 0.2 … 3, шаг 0.05 | 1.3 |
| `seaSprayLife` | Время полёта | число | 0.5 … 6, шаг 0.1, s | 2.2 |
| `seaSprayPuffDensity` | Плотность облачков | число | 0 … 6, шаг 0.05 | 1 |
| `seaSprayPuffGrow` | Разрастание облачков | число | 0 … 1, шаг 0.01 | 1 |
| `seaSprayPuffLife` | Жизнь облачков | число | 0.3 … 12, шаг 0.1, s | 2.2 |
| `seaSprayPuffLift` | Подъём облачков | число | 0 … 4, шаг 0.05, m/s | 0.85 |
| `seaSprayPuffSize` | Размер облачков | число | 0.3 … 12, шаг 0.1, x | 2.2 |
| `seaSprayPuffSplash` | Облачка всплеска | число | 0 … 10, шаг 0.05 | 1 |
| `seaSprayPuffTrail` | Облачка за волной | число | 0 … 10, шаг 0.05 | 1 |
| `seaSpraySize` | Размер капель | число | 0.3 … 3, шаг 0.05, x | 1 |
| `seaSpraySpread` | Разброс вдоль гребня | число | 0 … 8, шаг 0.1, m | 1.6 |
| `seaSprayStreak` | Вытянутость капель | число | 0 … 4, шаг 0.05 | 1 |
| `seaSteepness` | Крутизна | число | 0 … 0.8, шаг 0.01 | 0.7 |
| `seaSurfBoreLength` | Схлопывание | число | 3 … 40, шаг 1, m | 14 |
| `seaSurfBreakDistance` | Сдвиг обрушения | число | -20 … 40, шаг 0.5, m | 0 |
| `seaSurfBreakLength` | Длина обрушения | число | 4 … 40, шаг 1, m | 16 |
| `seaSurfEnabled` | Прибой включён | выключатель | да / нет | true |
| `seaSurfFoamVariety` | Разнообразие пены | число | 0 … 1, шаг 0.01 | 0 |
| `seaSurfFreeze` | Стоп-кадр | выключатель | да / нет | false |
| `seaSurfHeight` | Высота вала | число | 0.2 … 6, шаг 0.05, m | 0.45 |
| `seaSurfJet` | Выброс губы | число | 0.3 … 6, шаг 0.05, m/s | 1.9 |
| `seaSurfLean` | Наклон гребня | число | 0 … 1, шаг 0.01 | 0.29 |
| `seaSurfLift` | Подъём губы | число | 0 … 4, шаг 0.05, m/s | 0.25 |
| `seaSurfMeander` | Извилистость гребня | число | 0 … 1.5, шаг 0.01 | 1 |
| `seaSurfPeel` | Пил вдоль гребня | число | 0 … 0.6, шаг 0.01 | 0.06 |
| `seaSurfPeriod` | Период | число | 3 … 20, шаг 0.5, s | 9 |
| `seaSurfPhase` | Фаза обрушения | число | 0 … 1, шаг 0.01 | 0.5 |
| `seaSurfRefraction` | Рефракция | число | 0 … 1, шаг 0.01 | 0.7 |
| `seaSurfRoller` | Объём пены | число | 0 … 1.2, шаг 0.02 | 0.5 |
| `seaSurfRollerDensity` | Плотность вала | число | 0.2 … 2.5, шаг 0.05 | 1 |
| `seaSurfRunup` | Заплеск на песок | число | 0 … 12, шаг 1, m | 6 |
| `seaSurfSets` | Разброс высоты | число | 0 … 1, шаг 0.01 | 0.5 |
| `seaSurfSheet` | Толщина губы | число | 0.04 … 0.6, шаг 0.01 | 0.16 |
| `seaSurfSmooth` | Гладкость гребня | число | 0 … 1, шаг 0.01 | 0 |
| `seaSurfSpeed` | Скорость вала | число | 1 … 10, шаг 0.1, m/s | 4.5 |
| `seaSurfStreaks` | Прожилки пены | число | 0 … 1, шаг 0.01 | 0 |
| `seaSurfWidth` | Ширина вала | число | 3 … 40, шаг 0.5, m | 9 |
| `seaSwashFilm` | Плёнка заплеска | число | 0 … 0.08, шаг 0.005, m | 0.03 |
| `seaWaterColor` | Цвет воды | цвет | #rrggbb | #2c7a64 |
| `seaWavelength` | Длина волны | число | 3 … 40, шаг 0.5, m | 11.5 |
| `seaWindDirection` | Направление ветра | число | 0 … 360, шаг 1, ° | 94 |
| `seaWindPatches` | Пятна ветра | число | 0 … 1, шаг 0.05 | 0.65 |
| `simulationResolution` | Разрешение симуляции | список | 128 · 256 · 384 · 512 | 128 |
| `waterDepthMeters` | Глубина воды | число | 0.25 … 12, шаг 0.25, m | 5 |
| `waterExtent` | Область ряби | число | 12 … 200, шаг 0.5, m | 24 |
| `waterMeshDensity` | Плотность сетки воды | число | 96 … 384, шаг 8 | 288 |
| `waterScatteringColor` | Цвет рассеивания | цвет | #rrggbb | #6f8d91 |
| `waterScatteringStrength` | Рассеивание в мутной воде | число | 0 … 2, шаг 0.01 | 0.85 |
| `waterVisible` | Вода | выключатель | да / нет | true |
| `waveAmplitude` | Амплитуда ряби | число | 0 … 0.2, шаг 0.005, m | 0.055 |
| `waveChoppiness` | Излом поверхности | число | 0 … 1.25, шаг 0.01 | 0.18 |
| `waveLength` | Длина ряби | число | 0.4 … 3.2, шаг 0.05, m | 0.72 |
| `состояние-моря` | Состояние моря | список | custom · calm · breeze · rough · storm |  |

## lighting/luminaires

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `lightingEnabled` | Освещение сада | выключатель | да / нет | true |
| `lightingExposure` | Экспозиция света | число | -4 … 4, шаг 0.1,  EV | 0 |
| `lightingFixtures` | Светильник | список |  |  |
| `lightingMode` | Горят | список | auto · on · off | auto |
| `lightingShadows` | Тени от светильников | выключатель | да / нет | true |

## lighting/power

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `lightingConnections` | Показать подключения | выключатель | да / нет | false |

## lights/light1

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `light1Color` | Цвет источника | цвет | #rrggbb | #ffd9a0 |
| `light1ConeAngle` | Угол конуса | число | 4 … 180, шаг 1, ° | 38 |
| `light1Enabled` | Источник включён | выключатель | да / нет | false |
| `light1InReflections` | Участвует в отражениях | выключатель | да / нет | true |
| `light1Intensity` | Сила источника | число | 0 … 200, шаг 0.5 | 12 |
| `light1Softness` | Мягкость края | число | 0 … 1, шаг 0.01, % | 0.4 |
| `light1SourceVisible` | Показывать сам источник | выключатель | да / нет | true |
| `light1X` | Положение X | число | -40 … 40, шаг 0.05, m | 3 |
| `light1Y` | Положение Y | число | -10 … 40, шаг 0.05, m | 2.5 |
| `light1Z` | Положение Z | число | -40 … 40, шаг 0.05, m | -2 |

## lights/light1target

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `light1TargetX` | Цель X | число | -40 … 40, шаг 0.05, m | 0 |
| `light1TargetY` | Цель Y | число | -10 … 40, шаг 0.05, m | 0 |
| `light1TargetZ` | Цель Z | число | -40 … 40, шаг 0.05, m | 0 |

## lights/light2

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `light2Color` | Цвет источника | цвет | #rrggbb | #ffd9a0 |
| `light2ConeAngle` | Угол конуса | число | 4 … 180, шаг 1, ° | 38 |
| `light2Enabled` | Источник включён | выключатель | да / нет | false |
| `light2InReflections` | Участвует в отражениях | выключатель | да / нет | true |
| `light2Intensity` | Сила источника | число | 0 … 200, шаг 0.5 | 12 |
| `light2Softness` | Мягкость края | число | 0 … 1, шаг 0.01, % | 0.4 |
| `light2SourceVisible` | Показывать сам источник | выключатель | да / нет | true |
| `light2X` | Положение X | число | -40 … 40, шаг 0.05, m | 3 |
| `light2Y` | Положение Y | число | -10 … 40, шаг 0.05, m | 2.5 |
| `light2Z` | Положение Z | число | -40 … 40, шаг 0.05, m | -2 |

## lights/light2target

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `light2TargetX` | Цель X | число | -40 … 40, шаг 0.05, m | 0 |
| `light2TargetY` | Цель Y | число | -10 … 40, шаг 0.05, m | 0 |
| `light2TargetZ` | Цель Z | число | -40 … 40, шаг 0.05, m | 0 |

## objects/boat

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `boatClearcoat` | Лак (Clearcoat) | число | 0 … 1, шаг 0.01 | 0.8 |
| `boatClearcoatRoughness` | Шероховатость лака | число | 0 … 1, шаг 0.01 | 0.1 |
| `boatColor` | Цвет лодки | цвет | #rrggbb | #ffffff |
| `boatCutoutFitLength` | Вырез: раздув по длине | число | 0.1 … 1.6, шаг 0.01 | 0.92 |
| `boatCutoutFitWidth` | Вырез: раздув по ширине | число | 0.1 … 1.6, шаг 0.01 | 0.72 |
| `boatHeightOffset` | Высота лодки (погружение) | число | -0.6 … 0.6, шаг 0.01, m | 0 |
| `boatMetalness` | Металличность | число | 0 … 1, шаг 0.01 | 0.15 |
| `boatPositionX` | Позиция лодки по X | число | -20 … 20, шаг 0.01, m |  |
| `boatPositionZ` | Позиция лодки по Z | число | -20 … 20, шаг 0.01, m |  |
| `boatReflectionIntensity` | Отражение лодки в воде | число | 0 … 2, шаг 0.01 | 1.15 |
| `boatRoughness` | Шероховатость | число | 0 … 1, шаг 0.01 | 0.2 |
| `boatScale` | Масштаб лодки | число | 0.001 … 0.05, шаг 0.001 | 0.001 |
| `boatVisible` | Лодка | выключатель | да / нет | true |
| `boatYaw` | Поворот лодки | число | -180 … 180, шаг 1, ° | 18 |

## objects/house

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `houseAwningColor` | Ставни | цвет | #rrggbb | #083a29 |
| `houseCamp` | Вещи серферов | выключатель | да / нет | true |
| `houseCampChairsColor` | Шезлонги | цвет | #rrggbb | #a3291f |
| `houseCampCurtainColor` | Занавеска | цвет | #rrggbb | #f59f55 |
| `houseCampFade` | Выгорание на солнце | число | 0 … 1, шаг 0.01 | 0 |
| `houseCampFlagsColor` | Флажки | цвет | #rrggbb | #c62f28 |
| `houseCampHammockColor` | Гамак | цвет | #rrggbb | #e9dfc8 |
| `houseCampHue` | Оттенок вещей | число | -180 … 180, шаг 1, ° | 0 |
| `houseCampMachineColor` | Автомат | цвет | #rrggbb | #e8692e |
| `houseCampMachineSideColor` | Бок автомата | цвет | #rrggbb | #5fb7b0 |
| `houseCampSeed` | Раскладка | число | 1 … 99, шаг 1 | 79 |
| `houseCampWind` | Ветер | число | 0 … 2, шаг 0.01 | 1 |
| `houseDamage` | Сломанные доски | число | 0 … 1, шаг 0.01 | 0.29 |
| `houseDeckColor` | Настил | цвет | #rrggbb | #8b867a |
| `houseDoorColor` | Двери | цвет | #rrggbb | #7f7c7a |
| `houseEnabled` | Дом | выключатель | да / нет | false |
| `houseFloorHeight` | Высота свай | число | 0.6 … 2.4, шаг 0.02,  m | 1.44 |
| `houseGarlands` | Гирлянды | число | 0 … 1, шаг 0.01 | 0.9 |
| `houseGlassColor` | Стекло | цвет | #rrggbb | #494e53 |
| `houseHeading` | Курс | число | -180 … 180, шаг 1, ° | 0 |
| `houseLampColor` | Фонари | цвет | #rrggbb | #ffe2b0 |
| `houseLamps` | Лампы в доме | число | 0 … 1, шаг 0.01 | 0.8 |
| `houseLength` | Длина дома | число | 6.5 … 11, шаг 0.1,  m | 8.4 |
| `houseMetalColor` | Профлист | цвет | #rrggbb | #9b8e82 |
| `housePorchDepth` | Глубина веранды | число | 1.5 … 3, шаг 0.05,  m | 2.2 |
| `houseRoofColor` | Кровля | цвет | #rrggbb | #585654 |
| `houseRoofPitch` | Уклон крыши | число | 22 … 50, шаг 1, ° | 38 |
| `houseRopeColor` | Верёвка | цвет | #rrggbb | #cdb991 |
| `houseSag` | Проседание | число | 0 … 1, шаг 0.01 | 0.93 |
| `houseSeed` | Вариант досок | число | 1 … 99, шаг 1 | 79 |
| `houseShakesColor` | Дранка пристройки | цвет | #rrggbb | #b9b0a5 |
| `houseShed` | Сарай | выключатель | да / нет | true |
| `houseShedRoofColor` | Крыша сарая | цвет | #rrggbb | #88775f |
| `houseShedWallColor` | Сарай | цвет | #rrggbb | #7fbcb0 |
| `houseSidingColor` | Обшивка | цвет | #rrggbb | #c2ab91 |
| `houseTrimColor` | Белые доски | цвет | #rrggbb | #95948b |
| `houseUnitColor` | Кондиционер | цвет | #rrggbb | #dcdbd5 |
| `houseVoidColor` | Дыры | цвет | #rrggbb | #534e44 |
| `houseWeather` | Подтёки и выцветание | число | 0 … 1, шаг 0.01 | 0.35 |
| `houseWidth` | Ширина дома | число | 5 … 8, шаг 0.1,  m | 6 |
| `houseWoodColor` | Сваи и каркас | цвет | #rrggbb | #2c2a28 |
| `houseX` | Положение X | число | -5000 … 5000, шаг 0.1,  m | 0 |
| `houseZ` | Положение Z | число | -5000 … 5000, шаг 0.1,  m | 0 |

## objects/placed

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `placedEnabled` | Расстановка | выключатель | да / нет | true |
| `placedObjects` | Объект | список |  · placed-2833b5e5-2e09-43e3-96cf-fc1649767b60 · placed-153815a9-c96a-40d3-ba5b-ac0709fd7513 |  |
| `placedObjects[].deadwood` | Сухие ветви | число | 0 … 1, шаг 0.01 |  |
| `placedObjects[].density` | Плотность листвы | число | 0.1 … 1, шаг 0.01 |  |
| `placedObjects[].height` | Высота | число | 2.5 … 12, шаг 0.1,  m |  |
| `placedObjects[].leafSize` | Размер листа | число | 0.8 … 2.4, шаг 0.05 |  |
| `placedObjects[].lean` | Наклон от ветра | число | 0 … 1, шаг 0.01 |  |
| `placedObjects[].rotation` | Поворот | число | -180 … 180, шаг 1, ° |  |
| `placedObjects[].scale` | Масштаб | число | 0.25 … 4, шаг 0.05,  x |  |
| `placedObjects[].seed` | Вариант | число | 1 … 200, шаг 1 |  |
| `placedObjects[].species` | Вид | список | oleaster · tamarisk · plum · elm · willow · snag |  |
| `placedObjects[].spread` | Ширина кроны | число | 1.5 … 12, шаг 0.1,  m |  |
| `placedObjects[].translucency` | Просвечивание | число | 0 … 1.4, шаг 0.05 |  |
| `placedObjects[].twist` | Кручение ствола | число | 0 … 1, шаг 0.01 |  |
| `placedObjects[].x` | Положение X | число | -1200 … 1200, шаг 0.1,  m |  |
| `placedObjects[].y` | Основание Y | число | -20 … 60, шаг 0.05,  m |  |
| `placedObjects[].z` | Положение Z | число | -1200 … 1200, шаг 0.1,  m |  |

## objects/plane

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `planeColor` | Цвет плоскости | цвет | #rrggbb | #8a8f94 |
| `planeEnabled` | Плоскость | выключатель | да / нет | false |
| `planeHeight` | Высота плоскости | число | -50 … 50, шаг 0.1, m | 0 |
| `planeRoughness` | Шероховатость плоскости | число | 0 … 1, шаг 0.01 | 0.9 |
| `planeSize` | Размер плоскости | число | 10 … 5000, шаг 10, m | 400 |

## objects/sculpture

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `sculptureBottomOffset` | Отступ скульптуры от дна | число | -2 … 2, шаг 0.01, m | 0.08 |
| `sculptureColor` | Цвет скульптуры | цвет | #rrggbb | #b7bcc7 |
| `sculptureDryRoughness` | Сухая шершавость | число | 0 … 1, шаг 0.01 | 0.78 |
| `sculptureFracture` | Излом / сколы | число | 0 … 1, шаг 0.01 | 0.85 |
| `sculptureFractureScale` | Масштаб излома | число | 0.35 … 4.5, шаг 0.05 | 3.15 |
| `sculptureLayerEdgeChips` | Сколы граней | число | 0 … 1, шаг 0.01 | 0.78 |
| `sculptureLayering` | Слоистость | число | 0 … 1, шаг 0.01 | 0.99 |
| `sculptureLayerRelief` | Рельеф слоёв | число | 0 … 1, шаг 0.01 | 1 |
| `sculptureLayerScale` | Масштаб слоёв | число | 0.35 … 4.5, шаг 0.05 | 2.2 |
| `sculptureLayerSharpness` | Острота граней | число | 0 … 1, шаг 0.01 | 1 |
| `sculptureMicroRelief` | Микрорельеф | число | 0 … 1, шаг 0.01 | 0.78 |
| `sculpturePolish` | Потёртая полировка | число | 0 … 1, шаг 0.01 | 0.71 |
| `sculpturePositionX` | Позиция скульптуры по X | число | -20 … 20, шаг 0.01, m |  |
| `sculpturePositionZ` | Позиция скульптуры по Z | число | -20 … 20, шаг 0.01, m |  |
| `sculptureRotationX` | Наклон скульптуры (X) | число | -180 … 180, шаг 1, ° | 0 |
| `sculptureRotationY` | Поворот скульптуры (Y) | число | -180 … 180, шаг 1, ° | 0 |
| `sculptureRotationZ` | Крен скульптуры (Z) | число | -180 … 180, шаг 1, ° | 0 |
| `sculptureScale` | Масштаб скульптуры | число | 0.005 … 0.2, шаг 0.001 | 0.045 |
| `sculptureVeins` | Жилы | число | 0 … 1, шаг 0.01 | 0.19 |
| `sculptureVeinScale` | Масштаб жил | число | 0.35 … 4.5, шаг 0.05 | 3.9 |
| `sculptureVisible` | Скульптура | выключатель | да / нет | true |
| `sculptureWearScale` | Масштаб потёртости | число | 0.35 … 4.5, шаг 0.05 | 2.3 |
| `sculptureWetness` | Влажность | число | 0 … 1, шаг 0.01 | 0.98 |

## objects/surfboard

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `surfboardBalance` | Баланс | число | 0 … 2, шаг 0.05 | 1 |
| `surfboardCameraFov` | Угол обзора от первого лица | число | 50 … 110, шаг 1, ° | 80 |
| `surfboardCarve` | Поворот | число | 0.2 … 3, шаг 0.05 | 1 |
| `surfboardCheckpointAuto` | У волны, сам | выключатель | да / нет | true |
| `surfboardCheckpointX` | Положение X | число | -5000 … 5000, шаг 0.1,  m | 0 |
| `surfboardCheckpointYaw` | Курс | число | -180 … 180, шаг 1, ° | 0 |
| `surfboardCheckpointZ` | Положение Z | число | -5000 … 5000, шаг 0.1,  m | 0 |
| `surfboardDeckColor` | Дека | цвет | #rrggbb | #f2efe6 |
| `surfboardEnabled` | Доска | выключатель | да / нет | false |
| `surfboardFinColor` | Плавники | цвет | #rrggbb | #2b2d2e |
| `surfboardLength` | Длина | число | 1.5 … 3.2, шаг 0.01,  m | 1.78 |
| `surfboardMass` | Вес доски | число | 1.5 … 8, шаг 0.1,  kg | 3.2 |
| `surfboardNoseRocker` | Прогиб носа | число | 0.04 … 0.2, шаг 0.005,  m | 0.115 |
| `surfboardPaddle` | Гребок | число | 0 … 3, шаг 0.05 | 1 |
| `surfboardRailColor` | Канты | цвет | #rrggbb | #2a2e2e |
| `surfboardRiderLook` | Райдер | список | human · skeleton · both | human |
| `surfboardRiderMass` | Вес райдера | число | 0 … 120, шаг 1,  kg | 75 |
| `surfboardStringerColor` | Стрингер | цвет | #rrggbb | #c9a46a |
| `surfboardStripeColor` | Цвет полос | цвет | #rrggbb | #0b0b0b |
| `surfboardStripes` | Полосы | число | 0 … 3, шаг 1 | 2 |
| `surfboardTailRocker` | Прогиб хвоста | число | 0.015 … 0.1, шаг 0.005,  m | 0.045 |
| `surfboardThickness` | Толщина | число | 0.045 … 0.09, шаг 0.001,  m | 0.062 |
| `surfboardWakeFoam` | Пена от доски | число | 0 … 2, шаг 0.05 | 1 |
| `surfboardWakeWaves` | Волны от доски | число | 0 … 2, шаг 0.05 | 1 |
| `surfboardWidth` | Ширина | число | 0.4 … 0.62, шаг 0.005,  m | 0.5 |

## objects/tanker

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `tankerBeaconPeriod` | Период маяка | число | 1 … 12, шаг 0.5,  s | 4 |
| `tankerBearing` | Курс от севера | число | 0 … 360, шаг 1, ° | 150 |
| `tankerLights` | Огни | выключатель | да / нет | true |
| `tankerLightsIntensity` | Яркость огней | число | 0 … 3, шаг 0.05 | 1 |
| `tankerRoughness` | Шероховатость | число | 0.1 … 1, шаг 0.01 | 0.65 |
| `tankerRouteLength` | Длина маршрута | число | 500 … 16000, шаг 100,  m | 8000 |
| `tankerSeaState` | Качка | число | 0 … 1, шаг 0.01 | 0.35 |
| `tankerSpeed` | Скорость | число | 0 … 14, шаг 0.1,  kn | 7 |
| `tankerTravel` | Движение по маршруту | выключатель | да / нет | true |
| `tankerVisible` | Танкер | выключатель | да / нет | true |
| `tankerWake` | Кильватерный след | выключатель | да / нет | true |
| `tankerWear` | Износ окраски | число | 0 … 1, шаг 0.01 | 0.45 |
| `tankerWetness` | Влажность корпуса | число | 0 … 1, шаг 0.01 | 0.6 |
| `tankerX` | Восток / запад · X | число | -8000 … 8000, шаг 10,  m | -1450 |
| `tankerZ` | Юг / север · Z | число | -8000 … 8000, шаг 10,  m | -820 |

## render/post

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `bloomEnabled` | Bloom включён | выключатель | да / нет | true |
| `bloomRadius` | Радиус свечения | число | 0 … 1, шаг 0.01, % | 0.58 |
| `bloomStrength` | Сила свечения | число | 0 … 2.5, шаг 0.01 | 0.18 |
| `bloomThreshold` | Порог светлых участков | число | 0 … 2, шаг 0.01 | 0.72 |
| `colorContrast` | Контраст | число | 0 … 2, шаг 0.01, % | 1.03 |
| `colorExposure` | Экспозиция | число | -3 … 3, шаг 0.05, EV | 0 |
| `colorGamma` | Гамма | число | 0.35 … 2.5, шаг 0.01 | 1 |
| `colorHue` | Сдвиг оттенка | число | -180 … 180, шаг 1, ° | 0 |
| `colorSaturation` | Насыщенность | число | 0 … 2, шаг 0.01, % | 1.02 |
| `editorPostProcessing` | Показывать её в редакторе | выключатель | да / нет | false |
| `filmDustAmount` | Пыль | число | 0 … 1, шаг 0.005 | 0.04 |
| `filmEnabled` | Включить | выключатель | да / нет | false |
| `filmFlickerAmount` | Мерцание | число | 0 … 0.2, шаг 0.001,  EV | 0.018 |
| `filmFlickerRate` | Частота | число | 0.5 … 24, шаг 0.25,  Hz | 7 |
| `filmGateWeaveAmount` | Дрожание | число | 0 … 2, шаг 0.01, px | 0.18 |
| `filmGateWeaveRate` | Частота | число | 0.25 … 12, шаг 0.25,  Hz | 5 |
| `filmGrainAmount` | Сила | число | 0 … 1, шаг 0.01 | 0.28 |
| `filmGrainSize` | Размер зерна | число | 0.45 … 3, шаг 0.05, px | 1.05 |
| `filmScratchAmount` | Царапины | число | 0 … 1, шаг 0.005 | 0.025 |
| `filmStock` | Тип | список | neutral · 35mm · 16mm · 8mm · bw · sepia · faded | 16mm |
| `postProcessingEnabled` | Постобработка включена | выключатель | да / нет | true |

## render/visibility

| Ключ | Что это | Вид | Пределы | Заводское |
|---|---|---|---|---|
| `algaeVisible` | Водоросли | выключатель | да / нет | true |
| `annotationsEnabled` | Отметки уровня | выключатель | да / нет | true |
| `boatVisible` | Лодка | выключатель | да / нет | true |
| `farWaterVisible` | Дальняя вода | выключатель | да / нет | true |
| `fishEnabled` | Рыбы | выключатель | да / нет | true |
| `grassEnabled` | Травы | выключатель | да / нет | true |
| `houseEnabled` | Дом | выключатель | да / нет | false |
| `liliesVisible` | Кувшинки | выключатель | да / нет | true |
| `placedEnabled` | Расстановка | выключатель | да / нет | true |
| `planeEnabled` | Плоскость | выключатель | да / нет | false |
| `plantingEnabled` | Посадки | выключатель | да / нет | true |
| `reflectionsEnabled` | Отражения | выключатель | да / нет | true |
| `sculptureVisible` | Скульптура | выключатель | да / нет | true |
| `seabedVisible` | Дно | выключатель | да / нет | true |
| `seagullsEnabled` | Чайки | выключатель | да / нет | true |
| `shoreEnabled` | Береговые находки | выключатель | да / нет | true |
| `shrubsEnabled` | Кустарники | выключатель | да / нет | true |
| `skyVisible` | Небо | выключатель | да / нет | true |
| `surfboardEnabled` | Доска | выключатель | да / нет | false |
| `tankerVisible` | Танкер | выключатель | да / нет | true |
| `terrainEnabled` | Суша | выключатель | да / нет | true |
| `terrainPebblesEnabled` | Галька | выключатель | да / нет | true |
| `terrainRocksEnabled` | Камни | выключатель | да / нет | true |
| `topiaryEnabled` | Стриженые формы | выключатель | да / нет | true |
| `treesEnabled` | Деревья | выключатель | да / нет | true |
| `waterVisible` | Вода | выключатель | да / нет | true |
