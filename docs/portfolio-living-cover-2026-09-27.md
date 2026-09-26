# Живая обложка Secret Garden

27.09.2026. Денис принял характер движения и разрешил публикацию.
Состояние выпуска фиксируется в HANDOFF.md и Deploy GitHub Pages.

## Изображение и движение

Обложка `/landscape/#top` использует авторский JPEG целиком, карту глубины,
маску отдельного ствола и скрытую под ним подложку. Небольшой параллакс
реагирует на мышь или касание; без ввода остаётся медленное движение камеры.
Листва и папоротники получают слабое пространственно неоднородное движение,
ствол — отдельный план с малым отклонением верхних ветвей. Световой импульс
раз в 17 секунд проходит от глубины к ближним планам с мягкими задержками.

Это 2.5D из одного изображения. Полная геометрия дерева, физический скелет
и настоящий перенос источников света в исходной 3D-сцене не восстанавливались.
Скрытые участки за стволом предположены генератором. Амплитуда камеры мала,
чтобы эти участки оставались узкими. Прочие цветные участки берутся из
авторского изображения; сгенерированная подложка применяется только по маске.

## Файлы

- `public/landscape/living-cover.js` — самостоятельный WebGL 1 проход,
  загрузка слоёв, указатель, жизненный цикл и пауза.
- `public/landscape/living-cover.css` — холст под типографикой и кнопка
  «Движение» рядом с музыкой.
- `public/landscape/assets/hero-garden.jpg` — неизменённая копия оригинала
  `Denis-Daragan-Portfolio_page4_img1.jpeg`, 2481 × 1754.
- `public/landscape/assets/hero-control.webp` — lossless RGB карта,
  1491 × 1055: R — глубина, G — расширенная область подложки,
  B — маска исходного ствола.
- `public/landscape/assets/hero-under-tree.webp` — скрытая подложка,
  1491 × 1055, WebP quality 91.
- `public/landscape/index.html` — две ссылки на JS/CSS; редактор сохраняет
  этот рукописный участок. Его генератор работ и данные проектов не менялись.

Карты применяются только к `p04-i01-1600.webp`. Если редактор выберет другую
обложку, она останется статичной. Имена новых слоёв не попадают под очистку
удалённых кадров `*-900.webp` / `*-1600.webp` в редакторе.

## Доступность и нагрузка

До готовности слоёв виден обычный `<img>`. При недоступном WebGL или слое
остаётся исходное изображение. Потеря контекста возвращает картинку;
после восстановления контекста текстуры создаются заново.

Рисование ограничено 60 кадрами/с на компьютере и 30 на устройстве с
coarse pointer. Размер холста ограничен 2,2 / 1,1 млн пикселей соответственно,
масштаб — не выше 1,75. Вне экрана, при открытом диалоге, скрытии страницы
и на паузе requestAnimationFrame отменяется. Свайпы и масштабирование
телефона не перехватываются. При reduced motion начальный кадр статичен,
дополнительные слои не загружаются до явного включения движения.

## Проверка

Собственный headless Chromium с Metal, без хранилища браузера Дениса:

- 1440 × 1000: движение, наведение в обе стороны, просмотр композиции;
- 390 × 844 при DPR 3: просмотр, касание, нативный вертикальный свайп
  к авторскому разделу; поворот в 844 × 390;
- пауза и возврат, остановка под меню и вне экрана, возвращение по Home;
- reduced motion без запросов дополнительных слоёв и явное включение;
- отсутствие ошибок страницы, `gl.getError() === 0`;
- принудительная потеря/восстановление WebGL-контекста;
- ответ 404 вместо карты: возврат к загруженному исходному изображению;
- после ограничения частоты — 58 рисований за секунду на этом Mac.

Скриншоты и короткая запись движения оставлены как локальные материалы
просмотра вне репозитория. Денис принял эффект. Перед публикацией
выполняются lint, build и check:fast. Просмотр на физическом телефоне
ещё не проводился; мобильная проверка — в браузерной эмуляции.

## Подготовка карт: встроенный image_gen

Все три вызова использовали исходный `Denis-Daragan-Portfolio_page4_img1.jpeg`
как referenced image и непрозрачный фон. Генератор не заменяет цветной
оригинал. Sharp использовался после генерации только для упаковки каналов,
трёхпиксельного расширения области подложки и преобразования формата.

### Depth

```text
Create a precise single-channel GRAYSCALE DEPTH MAP of this exact supplied garden photograph, for image-based 2.5D parallax. This is a technical depth pass, not a new scene. Preserve exactly the original image aspect ratio, framing, camera and every object's screen position and silhouette. White = closest to the camera, black = farthest. Nearest bottom ferns and extreme left/right hedge edges are light gray to white; the winding tree trunk on the left is a consistent medium-light gray and stands clearly in front of the hedge behind it; the middle hedge walls are middle gray; the winding ground path smoothly becomes dark toward the vanishing point at 56% width 53% height; far trees and canopy opening are dark. Represent distance, NOT brightness: even dark foreground hedge edges are light in the depth map, even sunlit far canopy is dark. No photographic texture, no shadows or shading from lighting. Smooth continuous depth gradients on surfaces, precise hard occlusion boundaries at the crooked tree, finely resolved branches, foliage and fern silhouette edges, no outlines. No labels, text, borders, new objects or composition changes. Output only the aligned depth map in grayscale at highest useful resolution.
```

### Hidden background

```text
Use case: precise-object-edit. Create a hidden background clean plate for this exact garden image, for subtle 2.5D parallax compositing. Remove ONLY the single prominent crooked pale tree trunk at the left, rooted near 38% image width / 65% image height and curving up through 29% width / 45% height to 26% width / 20% height, and its immediately connected fine woody branches. Inpaint only the narrow area occupied by the wood, revealing the existing dark mossy hedge and foliage naturally behind it. KEEP ALL LEAVES AND CANOPY, the surrounding hedges, the path, ferns, flowers and all other trees and every other pixel as unchanged as possible. Preserve original camera, exact framing and aspect ratio, original color grading, shadow, texture and lighting. This is a conservative clean plate, not a redesign. No new subjects, no text, no smoothing. Full image, highest useful resolution.
```

### Tree mask

```text
Create a technically accurate black and white SEGMENTATION MASK for the single prominent crooked pale TREE TRUNK and its attached woody branches on the left of this exact supplied garden image. Output a pure BLACK full-frame background with ONLY that crooked trunk and its attached woody branches in pure WHITE. No leaves, no canopy, no hedge, no grass, no ground, no other objects white. The trunk's base is at approximately 38% image width, 65% height, runs up-left to 29% width 45% height then twists to 33% width 36% height and up through 27% width 21% height. Keep all the exact woody silhouette twists and fine branches precisely aligned with the source. Black inside every gap between branches. Smooth antialiased silhouette edges but solid uniform white inside, no texture or gray shading. Same full canvas, same exact aspect ratio and camera crop as source. Do not center or reposition subject. No labels or borders. This map will be used to extract the ORIGINAL tree's pixels without regenerating its colors or texture.
```
