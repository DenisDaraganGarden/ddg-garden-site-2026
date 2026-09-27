# A French manor: живая фотография, 27.09.2026

Подключено локально к существующему кадру #french-manor, включая полноэкранный просмотр. Старый параллакс обложки не изменён. Рендерер адаптирован из сохранённого living-image-parallax; исходная фотография не перегенерировалась, её WebP остался побайтно прежним.

Две текстуры: исходный цвет 1157×1288 и оценочная глубина. Новая карта создана встроенным image_gen по приложенному пользователем кадру: 1189×1323, выровнена до размера источника, grayscale, blur 2.2 px, lossless WebP. Контуры проверены визуально. Источник генерации: exec-b868991c-8e98-40fd-9565-4fa5ccdf120b.png, сеанс 01a0df09-3682-73d2-b925-c1d60199c931. Дополнительной генерации фона/масок нет: это ограниченный параллакс 2.5D, скрытая геометрия не восстанавливается.

Смещение .020/.013 с ограничением указателя −1…1, 3.5% запас по краям, автономное движение, растения переднего плана с амплитудой .0014 UV и закреплённым нижним краем; дом и изгородь исключены из ветра. Свет проходит по солнечным участкам цветов в 17-секундном цикле без перекрашивания. Портрет вписан в экран. Ленивая загрузка карты; общая пауза галереи и просмотра, reduced motion без загрузки карты до нажатия, сон вне экрана/под диалогами, восстановление WebGL и статичный fallback. Лимит 60/30 fps, 2.2/1.1 MP.

Проверено в отдельном headless Chromium с Metal: 1440×1000, 390×844 и поворот 844×390; края указателя, полный цикл света, раскрытие/закрытие, общая пауза и нулевой прирост отрисовок при паузе, остановка галереи под полноэкранным просмотром, reduced motion (0 запросов карты до действия, 1 после), ошибка загрузки карты и потеря/возврат контекста. Ошибок страницы нет. Физический iPhone не проверялся. Node syntax, согласованность редактора и diff --check проходят. Публикации нет.

## Промпт встроенного image_gen

Use case: precise-object-edit. Generate ONE technical grayscale inverse-depth map from the attached portrait garden photograph, for subtle WebGL image parallax. This is a data pass, not an artistic reinterpretation. Preserve the exact 1157:1288 framing, pixel registration, shapes and object silhouettes. White = closest to camera, black = farthest. The in-focus flowers, white globe flower heads, pink phlox and individual leaves at the very bottom foreground must be near-white (220–250). The layers of flowering plants behind them occupy progressively deeper smoothly varying mid-light gray values (145–210), following their real contours rather than simple horizontal bands. The neatly clipped hedge across middle-right is mid gray (105–125), its top and front treated as a solid coherent form. The large rounded shrub behind it is darker midgray (70–95). The cottage roofs/walls at upper left/center are further back (45–65), each planar surface internally smooth, with sharply registered roof ridges. The trees behind the house at top are dark gray (20–35), pale sky very darkest (5–12). Smooth coherent near-depth gradients, clean aligned boundaries, minimal microtexture. Ignore lighting, shadows, color and camera blur when estimating depth; bright sunlight is NOT near-depth. No photoreal color, no text, no labels, no border, no collage, no additional objects, no perspective/crop/layout changes. Output only the aligned grayscale technical depth image.

## Контрольные суммы

public/landscape/assets/p06-i01-1600.webp: 209458 bytes, sha256 9390a1060e7727d84bd00c4af3049640536aa1c6caad072f65e38112e5a6ce52

public/landscape/assets/manor-depth.webp: 249086 bytes, sha256 fcd5a74520f462ada95acfbe7d75e76035c89ae8ade270369472c1b0375b493a
