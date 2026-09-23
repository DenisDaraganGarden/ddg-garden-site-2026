// Подсказки «?» к параметрам: доска для сёрфинга, звук, интерфейс, курсор,
// камера, качество, разрешение, отладка, редактор, видимость. Ключ — ключ
// параметра в справочнике (docs/engine-parameters.json), значение —
// [по-русски, in English].
export default {
  // Камера
  cameraFov: [
    'Угол обзора камеры для выбранного формата (Desktop или Mobile). Меньше — ближе и площе, как длиннофокусный объектив; больше — шире, с сильной перспективой.',
    'The camera’s field of view for the selected format (Desktop or Mobile). Lower — closer and flatter, like a long lens; higher — wider, with stronger perspective.',
  ],
  frameInset: [
    'Высота каждой чёрной полосы в % от кадра 16:9, для выбранного формата. Больше — картинка ниже и шире по пропорции: 18% дают 2,78:1, как Ultra Panavision.',
    'Each black bar’s height as a % of a 16:9 frame, for the selected format. More makes the picture lower and wider in proportion: 18% gives 2.78:1, like Ultra Panavision.',
  ],
  slideshowEnabled: [
    'Сайт сам по кругу показывает включённые камеры из «Сцен», каждую — свои «Сек.», со сменой через чёрное. Нужны хотя бы две включённые камеры.',
    'The site cycles through the enabled cameras in “Scenes”, each for its own “Sec.”, changing through black. Needs at least two enabled cameras.',
  ],
  slideshowFade: [
    'Сколько секунд кадр уходит в чёрное при автосмене камер; новый проявляется столько же. 0 — резкая склейка, как и у посетителей с «уменьшить движение».',
    'Seconds for the picture to fade to black at an automatic camera change; the new one fades in as long. 0 is a hard cut, as for visitors with “reduce motion”.',
  ],

  // Доска для серфинга
  surfboardEnabled: [
    'Доска для серфинга на воде — в редакторе и на сайте. Без воды её нет. Для игры («Играть», P) не обязательна: на время игры доска появится сама.',
    'A surfboard on the water, in the editor and on the site. No water, no board. Not needed to ride: in play (“Play”, P) the board appears by itself.',
  ],
  surfboardLength: [
    'Длина от хвоста до носа. Физика катания берёт ту же форму: длиннее — больше объёма, доска плавучее и держит райдера выше.',
    'Tail-to-nose length. The ride’s physics uses this very shape: longer means more volume, a more buoyant board that holds the rider higher.',
  ],
  surfboardWidth: [
    'Ширина в самом широком месте. Шире — больше объёма и устойчивее на воде: доску труднее завалить на бок.',
    'Width at the widest point. Wider means more volume and more stability on the water: the board is harder to tip onto its side.',
  ],
  surfboardThickness: [
    'Толщина в самом толстом месте; к носу и хвосту доска тоньше. Толще — больше объёма: доска выше сидит в воде, особенно с райдером.',
    'Thickness at the thickest point; the board thins toward nose and tail. Thicker means more volume: it floats higher, especially with a rider.',
  ],
  surfboardNoseRocker: [
    'На сколько нос поднят над самой низкой точкой дна. Больше — нос круче загнут вверх и реже зарывается в воду; меньше — доска площе.',
    'How far the nose lifts above the lowest point of the bottom. More — a steeper upward curve that digs into the water less; less — a flatter board.',
  ],
  surfboardTailRocker: [
    'На сколько хвост поднят над самой низкой точкой дна. Больше — хвост сильнее загнут вверх; по этой форме доска и выглядит, и ложится на воду.',
    'How far the tail lifts above the lowest point of the bottom. More — a stronger upward curve; the board both looks and sits on the water by this shape.',
  ],
  surfboardStripes: [
    'Сколько поперечных полос на деке, от 0 до 3: каждая шириной 6 см, от канта до канта, в задней половине доски.',
    'How many stripes cross the deck, 0 to 3: each 6 cm wide, rail to rail, in the tail half of the board.',
  ],
  surfboardDeckColor: [
    'Основной цвет доски — деки и дна — под глянцевым лаком, с лёгкой неровностью смолы.',
    'The board’s main colour — deck and bottom — under a glossy coat, with faint variations in the resin.',
  ],
  surfboardRailColor: [
    'Цвет карбоновой обмотки по кантам (краям) доски и на кончиках носа и хвоста; в нём виден мелкий рисунок плетения.',
    'Colour of the carbon wrap along the rails (edges) and over the nose and tail tips; a fine twill weave shows in it.',
  ],
  surfboardStripeColor: [
    'Цвет поперечных полос на деке. При «Полосы» 0 его не видно.',
    'Colour of the stripes across the deck. Not seen when “Stripes” is 0.',
  ],
  surfboardStringerColor: [
    'Цвет стрингера — тонкой деревянной рейки вдоль середины доски; он виден и на деке, и на дне.',
    'Colour of the stringer, the thin wooden strip down the middle of the board; it shows on both deck and bottom.',
  ],
  surfboardFinColor: [
    'Цвет трёх плавников под хвостом и их гнёзд на дне.',
    'Colour of the three fins under the tail and their plugs in the bottom.',
  ],
  surfboardMass: [
    'Вес самой доски. Тяжелее — сидит в воде глубже и инертнее на волне. В игре к нему добавляется «Вес райдера».',
    'The board’s own weight. Heavier sits deeper and responds more slowly on a wave. In play the “Rider weight” is added to it.',
  ],
  surfboardRiderMass: [
    'Вес райдера для физики доски в игре: тяжелее — доска садится глубже и позже выходит на глиссирование. 0 — не чувствует ни веса, ни наклонов. Фигура та же.',
    'The rider’s weight as the board feels it in play: heavier sinks it deeper and it planes later. 0 — the board feels neither weight nor lean. The figure stays the same.',
  ],
  surfboardPaddle: [
    'Сила гребков руками и накачки доски на волне в игре: больше — быстрее разгон. 0 — гребки не двигают доску, везёт только волна.',
    'Strength of paddling and pumping in play: more means faster acceleration. 0 — strokes don’t move the board, only the wave carries it.',
  ],
  surfboardCarve: [
    'Насколько глубоко райдер кладёт доску на кант в повороте: больше — круче крен и резче дуга, но не сверх того, что позволяет скорость. Только стоя.',
    'How far the rider lays the board on its rail in a turn: more — a steeper lean and a tighter arc, never beyond what the speed allows. Standing only.',
  ],
  surfboardBalance: [
    'Как уверенно райдер держит доску ровно на воде: больше — меньше раскачка, доска реже заваливается; 0 — не балансирует и не кренит доску в поворотах.',
    'How firmly the rider keeps the board level on the water: more — less wobble, it tips over less often; 0 — no balancing at all and no leaning into turns.',
  ],
  surfboardCameraFov: [
    'Угол обзора в игре с камерой «глаза»: больше — шире картина и сильнее чувство скорости, меньше — как через длинный объектив.',
    'Field of view in play with the “first person” camera: wider shows more and feels faster; narrower looks like a long lens.',
  ],
  surfboardWakeWaves: [
    'Волны от доски в игре: рябь за хвостом, складывается в «усы», всплески при приземлении и падении, круги от гребков. 1 — как настроено, 0 — нет, больше — сильнее.',
    'The board’s waves in play: ripples off the tail that join into a V, splashes on landing and falling, rings from strokes. 1 as tuned, 0 none, more is stronger.',
  ],
  surfboardWakeFoam: [
    'Пена от доски в игре: полоса с хвоста — гуще на скорости и в резких поворотах, пятна при приземлении, падении и гребках. 1 — как настроено, 0 — без пены.',
    'The board’s foam in play: a trail off the tail, thicker at speed and in hard turns, patches on landing, falling and strokes. 1 as tuned, 0 none.',
  ],
  surfboardCheckpointAuto: [
    'Доска сама ждёт у прибоя: в 5 м мористее линии, где рушатся волны, носом к берегу; игра стартует напротив вида редактора. Без прибоя — на воде перед камерой.',
    'The board waits at the surf by itself: 5 m seaward of where waves break, nose to the shore; play starts level with the editor’s view. No surf — ahead of the camera.',
  ],
  surfboardCheckpointX: [
    'Где доска ждёт в редакторе и откуда начинается игра (R — вернуться сюда): X сцены. Правка выключает «У волны, сам»; в игре T ставит точку туда, где доска.',
    'Where the board waits in the editor and play starts (R returns here): scene X. Editing turns off “At the wave, automatic”; in play T puts it where the board is.',
  ],
  surfboardCheckpointZ: [
    'Где доска ждёт в редакторе и откуда начинается игра (R — вернуться сюда): Z сцены. Правка выключает «У волны, сам»; в игре T ставит точку туда, где доска.',
    'Where the board waits in the editor and play starts (R returns here): scene Z. Editing turns off “At the wave, automatic”; in play T puts it where the board is.',
  ],
  surfboardCheckpointYaw: [
    'Куда смотрит нос доски на чекпоинте — поворот вокруг вертикали в градусах. Правка выключает «У волны, сам».',
    'Where the board’s nose points at the checkpoint — a turn about the vertical, in degrees. Editing turns off “At the wave, automatic”.',
  ],

  // Звук · микшер
  'audio.enabled': [
    'Главный выключатель звука сайта. Выключено — тишина везде, даже клики кнопок и даже если посетитель включил звук.',
    'The site’s master sound switch. Off — silence everywhere, button clicks included, even if the visitor turned sound on.',
  ],
  'audio.mode': [
    'Что звучит фоном на главной: ничего, только музыка, только живая среда (море, берег, ветер, чайки, гром, лодка, танкер) или всё вместе. Клики кнопок — отдельно.',
    'What plays behind the home page: nothing, music only, the living soundscape only (sea, shore, wind, gulls, thunder, boat, tanker) or both. Clicks are separate.',
  ],
  'audio.masterGain': [
    'Общая громкость всего звука сайта: музыки, живой среды и кликов кнопок.',
    'Overall volume of all the site’s sound: music, soundscape and button clicks.',
  ],
  'audio.musicGain': [
    'Громкость музыки сайта. Слышна только в режимах главной «Только музыка» и «Музыка + среда».',
    'Volume of the site’s music. Heard only in the “Music Only” and “Music + Soundscape” home modes.',
  ],
  'audio.ambienceGain': [
    'Громкость всей живой среды разом: фон моря, 3D-источники и погода. Музыку и клики не трогает.',
    'Volume of the whole soundscape at once: the sea bed, the 3D sources and the weather. Music and clicks are untouched.',
  ],
  'audio.spatialGain': [
    'Громкость звуков, стоящих в пространстве: волна у берега, волна о лодку, ветер в листве, чайки, танкер. Часть «Живой среды».',
    'Volume of the sounds placed in space: shore waves, water on the hull, wind in leaves, gulls, tanker. Part of “Field Recordings”.',
  ],
  'audio.weatherGain': [
    'Громкость погоды — далёкого грома. Часть «Живой среды».',
    'Volume of the weather — the distant thunder. Part of “Field Recordings”.',
  ],
  'audio.uiGain': [
    'Громкость щелчков при нажатии кнопок и ссылок. Не зависит от режима главной и слышна на всех страницах.',
    'Volume of the clicks on buttons and links. Independent of the home mode and heard on every page.',
  ],
  'audio.homeFadeSeconds': [
    'За сколько секунд фон главной — музыка и среда — плавно нарастает, когда посетитель приходит или возвращается на главную.',
    'Seconds for the home background — music and soundscape — to swell in when the visitor arrives at or comes back to the home page.',
  ],
  'audio.routeFadeSeconds': [
    'За сколько секунд фон главной затихает, когда посетитель уходит в раздел сайта. Клики кнопок остаются.',
    'Seconds for the home background to fade away when the visitor leaves for a section of the site. Button clicks stay.',
  ],
  'audio.spatialEnabled': [
    'Звуки среды слышны со своего места относительно камеры — слева или справа, ближе или дальше; лучше в наушниках. Выкл. — ровно по центру, без ослабления с расстоянием.',
    'Soundscape sources are heard from where they are relative to the camera — left or right, near or far; best on headphones. Off — dead centre, no fading with distance.',
  ],
  'audio.duckOnCameraCut': [
    'При автосмене кадра на сайте 3D-источники стихают, пока кадр уходит в чёрное, и возвращаются с новым — звук не прыгает с места на место.',
    'At an automatic camera change on the site the 3D sources dip while the picture goes to black and return with the new shot, so sounds don’t jump place.',
  ],
  'audio.cameraCutDuck': [
    'До какой громкости стихают 3D-источники во время смены кадра: 100% — не стихают, 25% — до четверти. Работает с «Смягчать автосмену кадра».',
    'How far the 3D sources dip during a camera change: 100% — not at all, 25% — to a quarter. Works with “Soften Automatic Cuts”.',
  ],

  // Звук · дорожки
  'audio.tracks.tanker.enabled': [
    'Звук танкера: гул дизеля и шум буруна от самого судна — громче на ходу и вблизи; гудок слышен по ▶. Если танкер выключен, дорожки нет.',
    'The tanker’s sound: diesel hum and bow wash from the ship itself, louder under way and close by; the horn plays on ▶. No tanker, no track.',
  ],
  'audio.tracks.tanker.gain': [
    'Громкость танкера, до 150%. Входит в «3D-источники».',
    'Tanker volume, up to 150%. Part of the “3D Sources”.',
  ],
  'audio.tracks.water.enabled': [
    'Ровный фон спокойного моря — одинаковый со всех сторон, от камеры не зависит.',
    'A steady bed of calm sea, the same from every side, whatever the camera does.',
  ],
  'audio.tracks.water.gain': [
    'Громкость фона моря, до 150%. Входит в «Живую среду», но не в «3D-источники».',
    'Sea bed volume, up to 150%. Part of “Field Recordings”, not of the “3D Sources”.',
  ],
  'audio.tracks.shore.enabled': [
    'Шум волны у берега из точки «Берег» во вкладке «3D-сцена»: чем ближе камера, тем громче, и слышно, с какой стороны берег.',
    'Waves on the shore, heard from the “Shore” point in the “3D Scene” tab: louder as the camera comes closer, and you hear which side it is on.',
  ],
  'audio.tracks.shore.gain': [
    'Громкость волны у берега, до 150%. Входит в «3D-источники».',
    'Shore wave volume, up to 150%. Part of the “3D Sources”.',
  ],
  'audio.tracks.boat.enabled': [
    'Плеск волн о борт лодки; звук идёт от самой лодки и качается вместе с ней. Если лодка выключена, дорожки нет.',
    'Water lapping on the boat’s hull; the sound comes from the boat itself and rides with it. No boat, no track.',
  ],
  'audio.tracks.boat.gain': [
    'Громкость плеска у лодки, до 150%. Входит в «3D-источники».',
    'Hull lapping volume, up to 150%. Part of the “3D Sources”.',
  ],
  'audio.tracks.wind.enabled': [
    'Ветер в листве из точки «Деревья / листва» во вкладке «3D-сцена».',
    'Wind in the leaves, heard from the “Trees / Leaves” point in the “3D Scene” tab.',
  ],
  'audio.tracks.wind.gain': [
    'Громкость ветра в листве, до 150%. Входит в «3D-источники».',
    'Wind-in-leaves volume, up to 150%. Part of the “3D Sources”.',
  ],
  'audio.tracks.thunder.enabled': [
    'Далёкие раскаты грома: сами по себе раз в 1–2,5 минуты и после каждой молнии в облаках. Звучат глухо, около точки «Гроза».',
    'Distant thunder: on its own every 1–2.5 minutes, and after each lightning strike in the clouds. Muffled, near the “Storm” point.',
  ],
  'audio.tracks.thunder.gain': [
    'Громкость грома, до 150%. Входит в «Погоду».',
    'Thunder volume, up to 150%. Part of the “Weather”.',
  ],
  'audio.tracks.ui.enabled': [
    'Тихий щелчок, когда посетитель нажимает кнопку или ссылку на сайте. Выключено — кнопки беззвучны.',
    'A soft click when the visitor presses a button or link on the site. Off — silent buttons.',
  ],
  'audio.tracks.ui.gain': [
    'Громкость щелчка кнопок, до 150%. Общий уровень кликов — «UI» в «Микшере».',
    'Button click volume, up to 150%. The clicks’ overall level is “UI” in the “Mixer”.',
  ],

  // Звук · 3D-сцена. Слушает камера; места и расстояния действуют,
  // пока включён «HRTF / пространственный звук».
  'audio.emitters.shore.x': [
    'Где стоит источник шума берега по оси X сцены. Слушает камера: с той стороны, где точка, и слышен берег. Работает с пространственным звуком.',
    'Where the shore sound sits along the scene’s X axis. The camera listens: the shore is heard from the side the point is on. Needs spatial audio.',
  ],
  'audio.emitters.shore.y': [
    'Высота источника шума берега; 0 — уровень моря.',
    'Height of the shore sound source; 0 is sea level.',
  ],
  'audio.emitters.shore.z': [
    'Где стоит источник шума берега по оси Z сцены. Слушает камера: с той стороны, где точка, и слышен берег. Работает с пространственным звуком.',
    'Where the shore sound sits along the scene’s Z axis. The camera listens: the shore is heard from the side the point is on. Needs spatial audio.',
  ],
  'audio.emitters.shore.refDistance': [
    'Ближе этого расстояния шум берега звучит в полную силу, дальше начинает стихать. Больше — источник «крупнее» и громко слышен издалека.',
    'Closer than this, the shore plays at full strength; farther, it starts to fade. More makes the source “bigger”, loud from farther away.',
  ],
  'audio.emitters.shore.maxDistance': [
    'Дальше этой дистанции шум берега перестаёт стихать и держится на уровне, что был у границы, — совсем он не пропадает.',
    'Beyond this distance the shore stops fading and holds the level it had at the edge — it never goes fully silent.',
  ],
  'audio.emitters.shore.rolloff': [
    'Как быстро шум берега стихает за «Ближней дистанцией»: 0 — не стихает вовсе, 1 — на двойной дистанции вдвое тише, больше — быстрее.',
    'How fast the shore fades beyond the “Reference Distance”: 0 — not at all, 1 — half as loud at twice that distance, more — faster.',
  ],
  'audio.emitters.wind.x': [
    'Где стоит источник ветра в листве по оси X сцены. Слушает камера: с той стороны, где точка, и слышен ветер. Работает с пространственным звуком.',
    'Where the wind-in-leaves sound sits along the scene’s X axis. The camera listens: the wind is heard from the side the point is on. Needs spatial audio.',
  ],
  'audio.emitters.wind.y': [
    'Высота источника ветра в листве; 0 — уровень моря.',
    'Height of the wind-in-leaves source; 0 is sea level.',
  ],
  'audio.emitters.wind.z': [
    'Где стоит источник ветра в листве по оси Z сцены. Слушает камера: с той стороны, где точка, и слышен ветер. Работает с пространственным звуком.',
    'Where the wind-in-leaves sound sits along the scene’s Z axis. The camera listens: the wind is heard from the side the point is on. Needs spatial audio.',
  ],
  'audio.emitters.wind.refDistance': [
    'Ближе этого расстояния ветер в листве звучит в полную силу, дальше начинает стихать. Больше — источник «крупнее» и громко слышен издалека.',
    'Closer than this, the wind plays at full strength; farther, it starts to fade. More makes the source “bigger”, loud from farther away.',
  ],
  'audio.emitters.wind.maxDistance': [
    'Дальше этой дистанции ветер в листве перестаёт стихать и держится на уровне, что был у границы, — совсем он не пропадает.',
    'Beyond this distance the wind stops fading and holds the level it had at the edge — it never goes fully silent.',
  ],
  'audio.emitters.wind.rolloff': [
    'Как быстро ветер в листве стихает за «Ближней дистанцией»: 0 — не стихает вовсе, 1 — на двойной дистанции вдвое тише, больше — быстрее.',
    'How fast the wind fades beyond the “Reference Distance”: 0 — not at all, 1 — half as loud at twice that distance, more — faster.',
  ],
  'audio.emitters.thunder.x': [
    'Где гремит гроза по оси X сцены; каждый раскат — в нескольких метрах от точки. Слушает камера: гром приходит с этой стороны. Работает с пространственным звуком.',
    'Where the storm rumbles along the scene’s X axis; each clap lands a few metres from the point. The camera listens and hears it from that side. Needs spatial audio.',
  ],
  'audio.emitters.thunder.y': [
    'Высота грозы; 0 — уровень моря. Каждый раскат — чуть выше или ниже точки.',
    'Height of the storm; 0 is sea level. Each clap lands a little above or below the point.',
  ],
  'audio.emitters.thunder.z': [
    'Где гремит гроза по оси Z сцены; каждый раскат — в нескольких метрах от точки. Слушает камера: гром приходит с этой стороны. Работает с пространственным звуком.',
    'Where the storm rumbles along the scene’s Z axis; each clap lands a few metres from the point. The camera listens and hears it from that side. Needs spatial audio.',
  ],
  'audio.emitters.thunder.refDistance': [
    'Ближе этого расстояния гром звучит в полную силу, дальше начинает стихать. Больше — гроза «крупнее» и громко слышна издалека.',
    'Closer than this, the thunder plays at full strength; farther, it starts to fade. More makes the storm “bigger”, loud from farther away.',
  ],
  'audio.emitters.thunder.maxDistance': [
    'Дальше этой дистанции гром перестаёт стихать и держится на уровне, что был у границы, — совсем он не пропадает.',
    'Beyond this distance the thunder stops fading and holds the level it had at the edge — it never goes fully silent.',
  ],
  'audio.emitters.thunder.rolloff': [
    'Как быстро гром стихает за «Ближней дистанцией»: 0 — не стихает вовсе, 1 — на двойной дистанции вдвое тише, больше — быстрее.',
    'How fast the thunder fades beyond the “Reference Distance”: 0 — not at all, 1 — half as loud at twice that distance, more — faster.',
  ],

  // Видимость
  reflectionsEnabled: [
    'Зеркальное отражение предметов в воде: лодки, скульптуры, берега, деревьев, чаек. Выкл. — в воде только небо, видеокарте легче. Сила — «Отражение лодки в воде».',
    'Mirror reflections of things in the water: boat, sculpture, shore, trees, gulls. Off — only the sky, lighter on the graphics card. Strength: “Boat Reflection on Water”.',
  ],

  // Движок · разрешение
  frameRateLimit: [
    'Потолок кадров в секунду. «Без ограничения» — сколько успеют экран и видеокарта; ниже — чуть менее плавно, зато тише вентилятор и дольше держит батарея.',
    'A ceiling on frames per second. “Unlimited” — as many as the screen and graphics card manage; lower is slightly less smooth but quieter and easier on the battery.',
  ],
  adaptiveQuality: [
    'Если кадров меньше 30 в секунду, движок сам реже и мельче обновляет отражения в воде, потом чуть снижает разрешение постобработки; есть запас — возвращает.',
    'Below 30 frames per second the engine updates water reflections less often and smaller, then lowers post-processing resolution a little; with headroom, it restores them.',
  ],
  renderScale: [
    'Чёткость на компьютере — множитель к автоматической: больше — резче, но тяжелее для видеокарты; меньше — мягче и быстрее. Выше разрешения экрана не поднимется.',
    'Sharpness on computers, a multiplier on the automatic one: higher is crisper but heavier on the graphics card; lower is softer and faster. Never above the screen’s own.',
  ],
  renderScaleMobile: [
    'Чёткость на телефонах и планшетах — пикселей на точку экрана: 2 — чётко, как ретина; 1 — мягче, но намного легче. Выше, чем умеет экран, не поднимется.',
    'Sharpness on phones and tablets, in pixels per screen point: 2 is retina-crisp; 1 is softer but far lighter. Never above what the screen can show.',
  ],

  // Движок · качество
  postAntiAliasing: [
    'Как сглаживаются лесенки на краях. «Авто» и MSAA — чистые края, если видеокарта умеет, иначе FXAA, чуть мягче; «Выкл.» — резко, с лесенкой. Нужна постобработка.',
    'How jagged edges are smoothed. “Auto” and MSAA give clean edges where the card can, else FXAA, a little softer; “Off” is sharp and stepped. Needs post-processing.',
  ],
  upscaleMode: [
    '«FSR 1» рисует сцену в уменьшенном кадре и растягивает с подчёркиванием резкости: быстрее на слабой видеокарте, чуть мягче. Нужна постобработка.',
    '“FSR 1” draws the scene smaller and scales it up with sharpening: faster on a weak graphics card, slightly softer. Needs post-processing.',
  ],
  contactAoEnabled: [
    'Мягкая тень там, где предметы касаются или близко сходятся: камни в песке, основания стволов, складки рельефа. Вода и небо не темнеют. Нужна постобработка.',
    'Soft shading where things touch or come close: stones in sand, the foot of trunks, folds of the ground. Water and sky never darken. Needs post-processing.',
  ],
  contactAoIntensity: [
    'Насколько темнеют места касания: 0 — незаметно, 1 — самые густые тени в щелях и углах.',
    'How dark the contact shading gets: 0 — invisible, 1 — the deepest shade in crevices and corners.',
  ],
  contactAoRadius: [
    'Как далеко от места касания расходится тень: мало — тонкая тёмная кромка в щелях, много — широкие мягкие ореолы вокруг предметов.',
    'How far the shading spreads from a contact: small — a thin dark edge in crevices; large — wide soft halos around things.',
  ],

  // Движок · отладка
  debugWireframe: [
    'Показывает сетку треугольников вместо поверхностей — видно, где геометрия плотная. Тени и отражения на это время замирают. Только в редакторе.',
    'Shows the triangle mesh instead of surfaces, so you can see where geometry is dense. Shadows and reflections freeze meanwhile. Editor only.',
  ],
  showPointerDebug: [
    'Показывает, куда курсор или палец попадает в воду: точка с оранжевой мачтой, круг ряби, круг, где курсор качает лодку, мачты над лодкой и скульптурой.',
    'Shows where the pointer or finger meets the water: a dot with an orange mast, the ripple ring, the ring where it rocks the boat, masts over boat and sculpture.',
  ],
  showPerformanceHud: [
    'Табличка в углу кадра: кадры в секунду, самые долгие кадры, память, число текстур и треугольников. Только на локальном сервере — на сайте её нет.',
    'A small panel in the corner: frames per second, the slowest frames, memory, texture and triangle counts. Local server only — never on the site.',
  ],
  debugView: [
    'Служебная картинка. «Beauty» — обычный кадр; остальные гасят постобработку, отражения и тени: «Caustics» — узор бликов на дне, «Seabed Depth» — глубина дна цветом.',
    'A diagnostic picture. “Beauty” is the normal frame; the others drop post, reflections and shadows: “Caustics” shows the seabed’s light pattern, “Seabed Depth” its depth.',
  ],

  // Интерфейс сайта
  uiBrandVisible: [
    'Название DENIS DARAGAN в шапке главной. Выключено — прячется весь его блок: вместе с названием уходят подпись БЮРО и меню. Другие страницы не затрагивает.',
    'The DENIS DARAGAN name in the home page header. Off hides its whole block: the BURO caption and the menu go with it. Other pages keep theirs.',
  ],
  uiSubtitleVisible: [
    'Подпись БЮРО рядом с названием в шапке главной. На других страницах остаётся.',
    'The BURO caption beside the name in the home page header. Other pages keep it.',
  ],
  uiMenuVisible: [
    'Ссылки на разделы сайта в шапке главной. Выключено — на главной меню нет; на внутренних страницах оно остаётся.',
    'Links to the site’s sections in the home page header. Off — no menu on the home page; inner pages keep it.',
  ],
  uiLanguageVisible: [
    'Кнопки RU / EN в шапке главной. Выключено — на главной язык не переключить; на других страницах кнопки остаются.',
    'The RU / EN buttons in the home page header. Off — the language can’t be switched on the home page; other pages keep the buttons.',
  ],
  uiSoundVisible: [
    'Кнопка звука в шапке главной. Без неё посетитель не включит звук сцены на главной — если не включал его раньше.',
    'The sound button in the home page header. Without it a visitor can’t turn the scene’s sound on at the home page, unless they did so before.',
  ],
  uiFrameVisible: [
    'Чёрные полосы сверху и снизу, как в кино. Выключено — сцена заполняет весь экран, а композиция камеры не обрезается. Толщина полос — «Рамка» камеры.',
    'Black bars above and below, as in cinema. Off — the scene fills the screen and the camera’s composition isn’t cropped. Bar thickness is the camera’s “Frame”.',
  ],

  // Курсор
  cursorEnabled: [
    'Точка вместо стрелки и фонарь над сценой — только для мыши и трекпада. Выключено — обычная стрелка. В редакторе нужен ещё ⚙ «Курсор сцены в редакторе».',
    'A dot instead of the arrow, plus a flashlight over the scene (mouse and trackpad only). Off — the usual arrow. The editor also needs ⚙ “Scene cursor in the editor”.',
  ],
  cursorPointSize: [
    'Диаметр точки курсора в пикселях экрана; над сценой она чуть крупнее, над кнопками и ссылками — в полтора раза.',
    'Diameter of the cursor dot in screen pixels; it is slightly larger over the scene and half as large again over buttons and links.',
  ],
  cursorLightEnabled: [
    'Горит ли фонарь курсора, когда посетитель приходит. Дальше он сам включает и гасит его правой кнопкой мыши над сценой.',
    'Whether the cursor’s flashlight is on when a visitor arrives. After that they switch it on and off with the right mouse button over the scene.',
  ],
  cursorLightBeamAngle: [
    'Ширина луча фонаря: больше — шире пятно света на сцене и ореол вокруг курсора. Посетитель может менять её колесом мыши, от 12 до 70°.',
    'Width of the flashlight beam: more — a wider pool of light in the scene and a larger halo round the cursor. Visitors can change it with the scroll wheel, 12 to 70°.',
  ],
  cursorLightIntensity: [
    'Яркость фонаря в сцене: 0 — не светит, 100% — по умолчанию, 200% — вдвое ярче. Слабый ореол вокруг самой точки от неё не зависит.',
    'Brightness of the flashlight in the scene: 0 — dark, 100% — the default, 200% — twice as bright. The faint halo round the dot itself doesn’t change.',
  ],
  cursorLightSoftness: [
    'Мягкость края светового пятна: 0 — чёткий круг с резкой границей, 100% — свет плавно гаснет от середины к краю.',
    'Softness of the light pool’s edge: 0 — a crisp circle with a hard rim, 100% — the light fades smoothly from the middle outwards.',
  ],

  // Редактор
  editorHeadingColor: [
    'Цвет заголовков разделов в панели параметров редактора. Только для удобства: живёт в этом браузере, на сайт не попадает.',
    'Colour of the section headings in the editor’s parameter panel. Just for comfort: it lives in this browser and never reaches the site.',
  ],
  editorCursor: [
    'Показывать курсор сайта — точку и фонарь — и в редакторе. По умолчанию выключено, чтобы работать обычной стрелкой. Живёт в этом браузере.',
    'Show the site’s cursor — the dot and the flashlight — in the editor too. Off by default, so you work with the usual arrow. Lives in this browser.',
  ],
};
