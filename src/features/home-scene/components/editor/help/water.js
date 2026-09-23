// Подсказки «?» к параметрам: вода, прибой и берег у воды, дно. Ключ — ключ
// параметра в справочнике (docs/engine-parameters.json), значение —
// [по-русски, in English].
export default {
  // Вода: видимость и сетка
  waterVisible: ['Всё море: открытая вода, вода у берега, прибой и брызги. Выкл. — исчезают и те, кому нужна вода: кувшинки, водоросли, рыбы, чайки, доска.', 'The whole sea: open water, water at the shore, surf and spray. Off also removes what needs water: lilies, algae, fish, gulls and the surfboard.'],
  farWaterVisible: ['Открытое море до горизонта. Выкл. — вода остаётся только у берега, над дном ландшафта (до «Дальности дна»), и в «Области ряби».', 'The open sea out to the horizon. Off leaves water only along the shore, over the landscape’s seabed (up to “Seabed extent”), and in the “Ripple area”.'],
  seaMeshRings: ['Кольца сетки моря от камеры до горизонта. Больше — объёмные волны видны дальше, меньше — даль плоская. Поднимать вместе с «Сегментами сетки».', 'Rings of the sea mesh from the camera to the horizon. More keeps waves solid farther out, fewer flattens the distance. Raise together with “Mesh segments”.'],
  seaMeshSegments: ['Деления сетки моря по кругу вокруг камеры. Больше — волны вдали объёмнее, но тяжелее для видеокарты. Поднимать вместе с «Кольцами сетки».', 'Divisions of the sea mesh around the camera. More keeps distant waves solid but costs performance. Raise together with “Mesh rings”.'],
  waterExtent: ['Квадрат вокруг центра сцены, где вода живая: рябь от курсора, всплески, каустика на дне; там держатся лодка, рыбы, кувшинки. Больше — шире, но рябь грубее.', 'The square around the scene centre where the water is live: cursor ripples, splashes, caustics; the boat, fish and lilies stay in it. Bigger is wider but coarser.'],
  waterMeshDensity: ['Настройка прежней воды. Нынешнее море её не читает — его сетку задают «Кольца сетки» и «Сегменты сетки».', 'A setting of the former water. The current sea ignores it; its mesh is set by “Mesh rings” and “Mesh segments”.'],
  simulationResolution: ['Детальность живой ряби в «Области ряби»: больше — мельче и чётче круги от курсора и всплесков, но тяжелее. На сайте — ступенью выше, если тянет устройство.', 'Detail of the live ripple in the “Ripple area”: higher gives finer, crisper rings from the cursor and splashes but costs more. The site goes a step higher if it can.'],

  // Волны
  'состояние-моря': ['Готовые волны, прибой и пена: штиль, бриз, волнение, шторм. Цвет, свет, ветер и сетку не трогает. Ручная правка их ползунков показывает «Свои».', 'Ready-made waves, surf and foam: calm, breeze, swell, storm. Colour, light, wind direction and mesh stay. Editing any of those sliders shows “Custom”.'],
  seaWavelength: ['Расстояние между гребнями зыби. Больше — длинные пологие валы, которые и бегут быстрее; меньше — короткая частая волна.', 'Distance between swell crests. Longer gives broad gentle rollers that also travel faster; shorter gives a quick, close-set sea.'],
  seaAmplitude: ['Насколько гребни поднимаются над спокойной водой. Больше — выше зыбь в открытом море; остроту гребней задаёт «Крутизна».', 'How high the crests rise above still water. More gives a bigger open-sea swell; how sharp the crests are is “Steepness”.'],
  seaSteepness: ['Острота гребней: 0 — плавные холмы, больше — острые гребни и плоские ложбины. Чем круче, тем больше барашков.', 'Crest sharpness: 0 is rounded hills, more gives pointed crests with flat troughs. The steeper the sea, the more whitecaps.'],
  seaSpeed: ['Темп бега волн: 1 — как в природе для такой длины волны, меньше — замедленно, 0 — волны стоят. Прибой бежит со своей «Скоростью вала».', 'How fast the waves run: 1 is natural for this wavelength, less is slow motion, 0 stops them. The surf keeps its own “Breaker speed”.'],
  seaWindDirection: ['Куда дует ветер, от севера: туда бегут волны, плывут пена, рябь и брызги. 0° — на север, 90° — на восток.', 'Where the wind blows, from north: waves run that way and foam, ripple and spray drift with it. 0° is north, 90° is east.'],
  seaSets: ['Волны идут группами: примерно каждая шестая — крупная. Больше — сильнее разница между большими и малыми, 0 — все одинаковые.', 'Waves come in groups, roughly every sixth one big. More makes big and small waves differ more; 0 makes them all alike.'],
  seaGusts: ['Неровный ветер: пятнами волна то выше, то ниже, гребни изгибаются, а не идут по линейке. Прибой вдоль берега тоже становится неровным.', 'Uneven wind: in patches the waves grow and shrink, and crests bend instead of running ruler-straight. The surf along the shore gets uneven too.'],
  seaCrossWaves: ['Толчея: две системы волн под углом к основной. 0 — ровные параллельные гребни, больше — пересекающаяся неспокойная вода.', 'Cross sea: two wave trains at an angle to the main one. 0 gives tidy parallel crests, more gives a choppy criss-cross sea.'],
  seaFadeStart: ['С какого расстояния от камеры волны начинают сглаживаться. Меньше — даль спокойнее, больше — объёмные волны видны дальше.', 'Distance from the camera where the waves start to flatten. Less calms the distance; more keeps full waves farther out.'],
  seaFadeEnd: ['Дальше этого расстояния от камеры волн нет совсем — только рябь и барашки. Всегда хотя бы на 20 м дальше, чем «Волны гаснут с».', 'Beyond this distance from the camera the waves are gone; only ripple and whitecaps remain. Always at least 20 m past “Waves fade from”.'],

  // Прибой
  seaSurfEnabled: ['Волны, обрушивающиеся у берега, с их пеной, брызгами и накатом на песок. Выкл. — зыбь доходит до пляжа без прибоя. Нужен включённый ландшафт.', 'Waves breaking at the shore, with their foam, spray and run-up on the sand. Off lets the swell reach the beach unbroken. Needs the landscape on.'],
  seaSurfFreeze: ['Останавливает один вал на линии обрушения, чтобы его рассмотреть: остальные прячутся, пена замирает. Стадию выбирает «Фаза обрушения».', 'Holds one breaker still on the break line for a close look; the others hide and the foam stops. “Break phase” picks the stage.'],
  seaSurfPhase: ['Только в «Стоп-кадре»: стадия вала. 0 — волна встаёт, около 0,5 — отрывается и падает губа, дальше — пенный вал, 1 — он осел.', 'Only with “Freeze”: the breaker’s stage. 0 is the wave rearing, about 0.5 the lip leaving and falling, then the foam roller, 1 spent.'],
  seaSurfHeight: ['Высота прибойной волны. Выше — вал крупнее и обрушивается дальше от берега, где глубже.', 'Height of the breaking wave. Taller breakers are bigger and break farther from the shore, in deeper water.'],
  seaSurfWidth: ['Ширина вала поперёк берега, от спины до подошвы. Больше — длинный пологий вал и широкий пенный след, меньше — короткая крутая волна.', 'Width of the breaker across the shore, back to toe. Wider gives a long gentle roller and a broad foam trail; narrower a short steep wave.'],
  seaSurfBreakDistance: ['Сдвигает линию обрушения: плюс — ближе к берегу, минус — дальше в море. 0 — где велит глубина дна.', 'Moves the break line: positive toward the shore, negative out to sea. 0 breaks where the depth says.'],
  seaSurfBreakLength: ['Путь, на котором фронт волны встаёт перед обрушением: меньше — вал вздыбливается резче. Действует, только пока меньше трети «Ширины вала».', 'Distance over which the face rears up before breaking: shorter rears more abruptly. Works only while below a third of “Breaker width”.'],
  seaSurfLean: ['Насколько гребень заваливается вперёд перед обрушением: 0 — стоит прямо, больше — нависает над подошвой.', 'How far the crest leans forward before it breaks: 0 stands upright, more overhangs its own foot.'],
  seaSurfJet: ['С какой скоростью губа выбрасывается вперёд. Больше — летит дальше и открывает широкую трубу, меньше — гребень осыпается почти на месте.', 'How fast the lip is thrown forward. More flies farther and opens a wide tube; less lets the crest crumble almost in place.'],
  seaSurfLift: ['С какой скоростью губа взлетает вверх при отрыве. Больше — выше дуга и дольше полёт, 0 — губа сразу падает.', 'How fast the lip rises as it leaves the crest. More gives a higher arc and a longer flight; 0 drops it at once.'],
  seaSurfSheet: ['Толщина летящей губы относительно высоты вала: тоньше — лёгкая просвечивающая плёнка, толще — массивная тяжёлая губа.', 'Thickness of the flying lip relative to the breaker’s height: thinner is a light translucent sheet, thicker a heavy massive lip.'],
  seaSurfRoller: ['Объём пены, что стоит над водой на губе и в катящемся вале. Больше — пышная белая шапка, 0 — пена только плоская, на поверхности.', 'Volume of foam standing off the water on the lip and in the rolling whitewater. More is a fluffy white cap; 0 leaves only flat foam.'],
  seaSurfRollerDensity: ['Плотность этой объёмной пены: меньше — воздушная и просвечивает, больше — плотная и белая.', 'Density of that foam volume: less is airy and see-through, more is solid white.'],
  seaSurfPeel: ['Обрушение бежит вдоль гребня: 0 — весь гребень рушится разом, больше — губа ломается постепенно, от одного края к другому.', 'The break runs along the crest: 0 breaks the whole crest at once, more peels it gradually from one end to the other.'],
  seaSurfRefraction: ['Насколько гребень прибоя повторяет изгибы дна: 1 — огибает косу и отмели, 0 — идёт прямой линией и над глубиной ломается позже.', 'How closely the surf crest follows the seabed: 1 bends around the spit and shoals, 0 runs straight and breaks later over deeper water.'],
  seaSurfBoreLength: ['Путь после падения губы, за который вал оседает в низкий пенный поток. Больше — дольше держит высоту и пену, меньше — быстро сходит на нет.', 'Distance after the lip lands over which the breaker settles into a low foamy bore. Longer keeps height and foam longer; shorter dies fast.'],
  seaSurfRunup: ['Как далеко вода после наката забегает на пляж от уреза. Больше — длинные языки заплеска и широкая мокрая полоса.', 'How far up the beach the water runs after a wave. More gives long swash tongues and a wide wet band.'],
  seaSurfSpeed: ['Скорость, с которой вал бежит к берегу. Меньше — медленный тяжёлый накат, больше — быстрый. Не связана со «Скоростью» волн в море.', 'How fast the breaker runs toward the shore. Slower is a heavy, lazy roll; faster is brisk. Separate from the open sea’s “Speed”.'],
  seaSurfPeriod: ['Средний промежуток между волнами прибоя. Больше — реже, с паузами. Промежутки нарочно неровные, а валы приходят с гребнями зыби.', 'Average gap between surf waves. More is rarer, with lulls. Gaps are deliberately uneven, and breakers arrive with swell crests.'],
  seaSurfSets: ['Насколько разные по высоте волны прибоя: 0 — все одинаковые, 1 — от половины до полутора «Высоты вала».', 'How much surf waves differ in height: 0 makes them equal, 1 ranges from half to one and a half of “Breaker height”.'],

  // Гребень
  seaSurfSmooth: ['Насколько губа вала не замечает мелких волн под собой: 0 — повторяет их и может выглядеть зубчатой, 1 — одно гладкое тело воды.', 'How much the lip ignores the small waves under it: 0 follows them and can look jagged, 1 makes one smooth body of water.'],
  seaSurfMeander: ['Насколько линия гребня виляет вдоль берега: 0 — прямая, 1 — обычная, больше — сильнее изгибы. Мокрый край на песке виляет так же.', 'How much the crest line wanders along the shore: 0 is straight, 1 normal, more bends harder. The wet edge on the sand follows it.'],
  seaSurfFoamVariety: ['Пена на самом вале: 0 — ровная по всему гребню, больше — пятнами, то гуще, то реже, без повторяющегося рисунка.', 'Foam on the breaker itself: 0 is even along the crest; more breaks it into denser and thinner patches with no repeating pattern.'],
  seaSurfStreaks: ['Пена на лице волны вытягивается в полосы, стекающие вниз по склону. 0 — без полос, больше — полосы заметнее.', 'Foam on the wave face is dragged into streaks running down it. 0 has none; more makes them stronger.'],

  // Брызги
  seaSprayAmount: ['Сколько капель летит из прибоя. 0 — капель нет; облачка водяной пыли настраиваются отдельно.', 'How many drops the surf throws. 0 has none; the puffs of mist are set separately.'],
  seaSpraySize: ['Во сколько раз капли крупнее или мельче обычных. Больше — тяжёлые брызги, меньше — мелкая пыль.', 'How many times bigger or smaller the drops are. More gives heavy splashes, less a fine dust.'],
  seaSprayStreak: ['Насколько капли вытягиваются в полёте: 0 — круглые бусины, больше — длинные росчерки и струйки.', 'How much drops stretch along their flight: 0 is round beads, more gives long strokes and strands.'],
  seaSprayCurtain: ['Какая доля капель срывается с летящей губы белой завесой; остальные летят из всплеска и пенного вала.', 'Share of drops torn off the flying lip as a white curtain; the rest come from the splash and the whitewater.'],
  seaSprayLife: ['Сколько секунд капля может лететь, пока не исчезнет. Больше — брызги летят дальше и дольше висят в воздухе.', 'How many seconds a drop can fly before it vanishes. More sends spray farther and keeps it in the air longer.'],
  seaSprayDensity: ['Непрозрачность капель: меньше — прозрачные, как стекло, больше — плотные белые.', 'Opacity of the drops: less is glassy and clear, more is solid white.'],
  seaSpraySpread: ['На сколько брызги рассыпаются вдоль гребня от места отрыва. Больше — шире и рыхлее облако, 0 — ровной полосой.', 'How far spray scatters along the crest from where it left. More makes a wider, looser cloud; 0 a neat line.'],

  // Облачка брызг
  seaSprayPuffSplash: ['Сколько облачков водяной пыли встаёт там, где падает губа. 0 — нет.', 'How many puffs of mist rise where the lip lands. 0 has none.'],
  seaSprayPuffTrail: ['Сколько облачков водяной пыли остаётся за катящимся пенным валом. 0 — нет.', 'How many puffs of mist the rolling whitewater leaves behind. 0 has none.'],
  seaSprayPuffSize: ['Во сколько раз облачка крупнее или мельче обычных. Больше — укрывают гребень облаком, меньше — лёгкий дымок.', 'How many times bigger or smaller the puffs are. More wraps the crest in cloud, less is a light smoke.'],
  seaSprayPuffDensity: ['Плотность облачков: около 1 — лёгкая вуаль, больше — плотные белые клубы, 0 — не видны.', 'Puff density: about 1 is a light veil, more makes dense white clouds, 0 hides them.'],
  seaSprayPuffLife: ['Сколько секунд живёт облачко, прежде чем растаять. Больше — дымка дольше висит над прибоем.', 'How many seconds a puff lasts before it melts away. More keeps the haze over the surf longer.'],
  seaSprayPuffLift: ['Как быстро облачка поднимаются вверх; дальше их сносит ветер.', 'How fast the puffs rise; then the wind carries them off.'],
  seaSprayPuffGrow: ['0 — облачко сразу рождается полным; 1 — появляется точкой и разрастается, расплываясь.', '0 gives a puff its full size at birth; 1 starts it as a speck that swells as it spreads.'],

  // Рябь от курсора
  waveAmplitude: ['Высота ряби от курсора, всплесков и лодки. Больше — круги выше, и лодку с кувшинками качает на них сильнее.', 'Height of the ripple from the cursor, splashes and the boat. More makes taller rings that rock the boat and lilies harder.'],
  waveLength: ['Характер живой ряби: больше — круги расходятся медленнее и выглядят мягче, меньше — быстрая, мелкая и резкая рябь.', 'Character of the live ripple: more spreads the rings slower and makes them softer; less gives a quick, fine, crisp ripple.'],
  rippleRadius: ['Размер пятна, которое курсор или упавшая чайка раскачивает на воде. Больше — шире круги. Не больше 1/8 «Области ряби».', 'Size of the spot the cursor or a falling gull stirs on the water. More makes wider rings. At most 1/8 of the “Ripple area”.'],
  rippleImpulse: ['Сила толчка, которым курсор, чайки и лодка будят рябь. 0 — вода их не замечает.', 'How hard the cursor, gulls and the boat push the water. 0 leaves it undisturbed.'],
  rippleDamping: ['Как долго живут круги ряби: ближе к 0,99 — дольше и расходятся дальше, меньше — гаснут почти сразу.', 'How long ripple rings last: closer to 0.99 they live longer and spread farther; lower dies out almost at once.'],
  normalStrength: ['Насколько рябь заметна в бликах и отражениях: больше — контрастнее, 0 — почти не видна, хотя вода по-прежнему поднимается.', 'How strongly ripples show in glints and reflections: more is contrastier, 0 hides them though the water still rises.'],
  normalBlur: ['Мягкость ряби в свете: больше — плавные гладкие блики, меньше — резкие, зернистые края.', 'Softness of the ripple in the light: more gives smooth, gentle highlights; less gives crisp, grainy edges.'],

  // Фоновые волны
  ambientWaveIntensity: ['Мелкая рябь, что сама шевелит воду в «Области ряби» без курсора. Больше — вода беспокойнее, 0 — рябь только от касаний.', 'Small ripple that stirs the water in the “Ripple area” by itself. More is restless; 0 leaves ripples only from touches.'],
  ambientWaveSpeed: ['Как быстро меняется и плывёт эта фоновая рябь. 0 — её узор замирает.', 'How fast that background ripple changes and drifts. 0 freezes its pattern.'],
  waveChoppiness: ['Сейчас действует только на кувшинки: насколько волна сдвигает их листья вбок. На саму воду не влияет.', 'Currently affects only the lilies: how far a wave shoves their pads sideways. It does not change the water itself.'],

  // Пена и рябь
  seaFoamMemory: ['Вкл. — пена живёт после гребня и обрушения: плывёт, тянет шлейфы, мочит песок. Выкл. — пена только на самих гребнях, без следа.', 'On: foam outlives the crest and the break, drifting, trailing and wetting the sand. Off: foam only on the crests themselves, no trail.'],
  seaFoamLife: ['Сколько секунд пена держится на воде, прежде чем растаять. Больше — длинные шлейфы за гребнями и валами. Нужна «Память пены».', 'Seconds foam lasts on the water before melting. More gives long trails behind crests and breakers. Needs “Foam memory”.'],
  seaFoamDeposit: ['Сколько пены оставляет каждый барашек и обрушившийся вал. Больше — следы плотнее и белее. Нужна «Память пены».', 'How much foam each whitecap and breaker leaves. More makes the trails denser and whiter. Needs “Foam memory”.'],
  seaFoamWindow: ['Участок перед камерой, где пена помнит себя: плывёт, тянет шлейфы, мочит песок. Дальше — простые барашки. Больше — дальше, но рисунок грубее.', 'The patch ahead of the camera where foam keeps its memory: drifts, trails, wets the sand. Beyond it, plain whitecaps. Bigger reaches farther, coarser.'],
  seaFoamDrift: ['Как быстро ветер сносит пену по воде (и брызги прибоя) в сторону «Направления ветра».', 'How fast the wind carries foam across the water (and the surf’s spray) toward “Wind direction”.'],
  seaFoamSwirl: ['Насколько пену закручивает в завитки и разводы, пока она плывёт. 0 — плывёт ровно. Нужна «Память пены».', 'How much drifting foam curls into swirls and eddies. 0 drifts straight. Needs “Foam memory”.'],
  seaFoamDry: ['За сколько секунд сохнет песок, намоченный накатом. Больше — тёмная мокрая полоса на пляже держится дольше. Нужна «Память пены».', 'Seconds for sand wetted by the run-up to dry. More keeps the dark wet band on the beach longer. Needs “Foam memory”.'],
  seaSwashFilm: ['Толщина тонкой воды, что после наката взбегает на песок. 0 — на песке её не видно, больше — заметный блестящий язык. Нужна «Память пены».', 'Thickness of the thin water that runs up the sand after a wave. 0 hides it, more shows a glossy tongue. Needs “Foam memory”.'],
  seaFoamThreshold: ['С какой крутизны гребня появляются барашки. Больше — пена и на пологих гребнях, её много; меньше — только на самых острых, 0 — почти нет.', 'How steep a crest must be to whitecap. Higher puts foam even on gentle crests, lots of it; lower only on the sharpest, 0 almost none.'],
  seaFoamSoftness: ['Насколько плавно барашки переходят в чистую воду: больше — размытые края и больше редкой пены, меньше — резкая граница.', 'How gently whitecaps fade into clear water: more gives soft edges and more thin foam, less a sharp boundary.'],
  seaFoamLaceScale: ['Размер кружевного узора пены: больше — мелкое частое кружево, меньше — крупные острова и разрывы.', 'Size of the foam’s lace pattern: higher gives fine, close lace; lower gives big islands and gaps.'],
  seaFoamVariety: ['Разнообразие пены на воде: больше — внутри крупных пятен мелкое кружево, участки то гуще, то реже. 0 — один ровный узор.', 'Variety of foam on the water: more adds fine lace inside big patches and denser and thinner stretches; 0 is one even pattern.'],
  seaFoamBrightness: ['Белизна всей пены — на воде, в прибое и в брызгах. Меньше — сероватая.', 'Whiteness of all foam — on the water, in the surf and in the spray. Lower is greyish.'],
  seaRipple: ['Мелкая ветровая рябь поверх волн. Больше — вода матовее, блики рассыпаются искрами; 0 — гладкое зеркало.', 'Fine wind ripple over the waves. More makes the water matte and scatters glints into sparkles; 0 is a smooth mirror.'],
  seaWindPatches: ['Пятна штиля и ветра: больше — чётче чередуются гладкие участки и рябь, барашки тоже собираются пятнами. 0 — везде одинаково.', 'Patches of calm and wind: more alternates glassy stretches and ripple more clearly, and whitecaps gather in patches too. 0 is even.'],
  seaRippleScale: ['Размер ряби: больше — мельче и чаще, меньше — крупнее и шире. Силу задаёт «Рябь».', 'Scale of the ripple: higher is finer and denser, lower is larger and broader. Its strength is “Ripple”.'],

  // Вид
  seaWaterColor: ['Цвет толщи воды при взгляде сверху и цвет, которым светятся гребни на просвет. Им же подкрашено всё, что видно сквозь воду.', 'Colour of the water body seen from above, and of crests glowing against the light. It also tints everything seen through the water.'],
  seaDeepColor: ['Цвет толщи воды под острым углом — вдаль и на склонах волн. Сверху вода ближе к «Цвету воды».', 'Colour of the water body at a low angle — into the distance and on wave slopes. From above it is closer to “Water colour”.'],
  seaBedColor: ['Цвет песка, просвечивающего сквозь мелкую воду у берега. Как глубоко он виден — «Мутность воды».', 'Colour of the sand showing through shallow water near the shore. How deep it shows is “Water turbidity”.'],
  seaBedTurbidity: ['Мутность моря: больше — песок и всё подводное исчезают уже на мелководье, меньше — вода прозрачнее, дно видно глубже.', 'Murkiness of the sea: more hides the sand and anything underwater already in the shallows; less is clearer and shows the bed deeper.'],
  seaCrestGlow: ['Как светятся на просвет гребни, губа прибоя и пена, когда солнце за волной. 0 — не светятся.', 'How crests, the surf’s lip and foam glow when the sun is behind the wave. 0 turns the glow off.'],
  seaGlint: ['Яркость солнечной дорожки и искр на воде и пене. 0 — солнце в воде не отражается.', 'Brightness of the sun’s path and sparkles on water and foam. 0 removes the sun’s reflection.'],
  seaSkyReflection: ['Сколько неба отражает вода. Больше — море светлее и отдаёт небом, меньше — темнее, видна собственная толща.', 'How much sky the water reflects. More makes the sea lighter and sky-coloured; less darker, showing its own body.'],

  // Толща и рассеяние
  waterDepthMeters: ['Глубина моря: до неё опускается дно от уреза (как быстро — «Колено дна»). Глубже — берег круче уходит под воду, прибой ломается ближе к берегу.', 'Sea depth the bed drops to from the waterline (how fast: “Bed knee”). Deeper makes the shore drop off steeper and the surf break closer in.'],
  waterScatteringStrength: ['Насколько взвесь застилает то, что под водой: больше — дно и предметы быстрее тонут в цветной дымке. Сильнее при большой «Мутности воды».', 'How much suspended matter veils what is underwater: more sinks the bed and objects into a coloured haze sooner. Stronger in murky water.'],
  waterScatteringColor: ['Цвет мути в воде: к нему уходят с глубиной водоросли и дно, им же слегка подкрашена толща моря.', 'Colour of the haze in the water: algae and the bed fade toward it with depth, and it slightly tints the sea body.'],

  // Береговые находки
  shoreEnabled: ['Плавник на пляже: ветки, стволы, корневища, колья и пни из песка, каменные круги. Выкл. — пляж чистый.', 'Driftwood on the beach: branches, logs, roots, stakes and stumps in the sand, stone rings. Off leaves the beach clean.'],
  shoreCount: ['Сколько деревянных находок разложено по пляжу (каменные круги отдельно). Если места мало, ляжет меньше.', 'How many wooden finds lie on the beach (stone rings separate). If space runs short, fewer are placed.'],
  shoreLength: ['Длина участка пляжа, по которому они разбросаны. Больше — реже на каждый метр берега.', 'Length of the beach stretch they are spread along. Longer thins them out per metre of shore.'],
  shoreAlong: ['Сдвигает этот участок вдоль берега; 0 — напротив центра сцены.', 'Moves that stretch along the shore; 0 is opposite the scene centre.'],
  shoreSeed: ['Другой случайный расклад: при тех же настройках находки лягут иначе.', 'A different random layout: same settings, the finds fall differently.'],
  shoreSize: ['Во сколько раз крупнее или мельче все находки.', 'How many times bigger or smaller all the finds are.'],
  shoreBackBeach: ['Доля веток, что лежат в глубине пляжа, у подножия обрыва, а не ближе к воде. Стволы, пни и круги всегда там.', 'Share of branches lying at the back of the beach by the foot of the bluff rather than near the water. Logs, stumps and rings always do.'],
  shoreLogs: ['Доля крупных стволов и корневищ среди находок; остальное — ветки.', 'Share of big logs and root masses among the finds; the rest are branches.'],
  shoreStakes: ['Доля кольев и пней, торчащих из песка.', 'Share of stakes and stumps sticking up out of the sand.'],
  shoreRings: ['Сколько на пляже кругов из камней, выложенных людьми.', 'How many hand-laid rings of stones sit on the beach.'],
  shoreBurial: ['Насколько находки утоплены в песок: 0 — лежат сверху, больше — глубже занесены.', 'How deep the finds sink into the sand: 0 lies on top, more buries them deeper.'],
  shoreBleach: ['Насколько дерево выгорело: 0 — тёплое коричневое, 1 — серебристо-серое.', 'How sun-bleached the wood is: 0 is warm brown, 1 silvery grey.'],
  shoreGrain: ['Насколько проступают волокна и трещины дерева. 0 — гладкое.', 'How strongly the wood’s fibres and cracks show. 0 is smooth.'],
  shoreBark: ['Сколько коры осталось: 0 — голое дерево, больше — пятна коры на стволах и ветках.', 'How much bark is left: 0 is bare wood, more leaves patches of bark on logs and branches.'],
  shoreWetness: ['Мокрые дерево и камни: темнее и с блеском. 0 — сухие.', 'Wet wood and stones: darker and glossy. 0 is dry.'],
  shoreRenderDistance: ['Дальше этого расстояния от камеры находки не рисуются. На телефонах и слабых устройствах — не дальше 160 м.', 'Beyond this distance from the camera the finds are not drawn. On phones and weak devices, 160 m at most.'],

  // Дно: шельф
  seabedVisible: ['Ровное дно в квадрате «Области ряби» — там, где нет ландшафта. Дно у берега — часть ландшафта, этот выключатель его не прячет.', 'The flat bed under the “Ripple area”, where there is no landscape. The seabed by the shore belongs to the landscape; this switch leaves it.'],
  terrainShelfExtent: ['Как далеко в море тянется дно ландшафта с его рельефом, водорослями и илом. Дальше — просто глубокая вода.', 'How far out to sea the landscape’s seabed reaches, with its relief, weed and silt. Beyond it is just deep water.'],
  terrainShoreKnee: ['На каком расстоянии от уреза дно уходит на глубину: меньше — крутой свал у самой воды, больше — длинное мелководье, и волны ломаются дальше.', 'Distance from the waterline over which the bed drops to depth: less is a steep drop-off, more a long shallow flat where waves break farther out.'],
  terrainBars: ['Подводные песчаные гряды и мели вдоль берега, в 5–90 м от уреза. Над ними волны обрушиваются раньше, и линия прибоя изгибается.', 'Underwater sand bars and shoals along the shore, 5–90 m out. Waves break earlier over them and the surf line bends.'],
  terrainShelfSlope: ['Как быстро дно продолжает глубеть дальше от берега, метров на 100 м. 0 — за «Коленом дна» ровно; больше — песок раньше тонет в глубине.', 'How fast the bed keeps deepening farther out, metres per 100 m. 0 stays level past “Bed knee”; more sinks the sand into the deep sooner.'],
  terrainWeed: ['Тёмно-зелёные луга водорослей на дне средней глубины (не в полосе прибоя). Больше — луга шире и гуще.', 'Dark green weed meadows on the mid-depth bed (not in the surf zone). More makes them wider and denser.'],
  terrainSilt: ['Серо-зелёный ил в спокойной, более глубокой воде. Больше — ила больше.', 'Grey-green silt in the calmer, deeper water. More spreads more of it.'],
  terrainMussels: ['Тёмные островки мидиевых банок на средней глубине. Больше — их больше и они крупнее.', 'Dark islands of mussel beds at mid depth. More makes them more numerous and bigger.'],
  terrainBedScale: ['Размер пятен водорослей, ила и мидий на дне. Пятна вытянуты вдоль берега.', 'Size of the weed, silt and mussel patches on the bed. The patches are stretched along the shore.'],
  terrainRipples: ['Песчаные рябки — волнистые бороздки на мелком дне и на мокром песке заплеска. Видны только вблизи камеры.', 'Sand ripple marks — wavy ridges on the shallow bed and on the wet sand of the swash. Visible only close to the camera.'],

  // Дно: поверхность (ровное дно без ландшафта)
  seabedReliefStrength: ['Высота бугров и ямок ровного дна. Только там, где нет ландшафта (квадрат «Области ряби»).', 'Height of bumps and hollows on the flat bed. Only where there is no landscape (the “Ripple area” square).'],
  seabedBrightness: ['Яркость текстуры ровного дна. Только там, где нет ландшафта.', 'Brightness of the flat bed’s texture. Only where there is no landscape.'],
  seabedVariation: ['Подмешивает к текстуре ровного дна крупные пятна, чтобы она не повторялась. Только там, где нет ландшафта.', 'Mixes large patches into the flat bed’s texture so it does not repeat. Only where there is no landscape.'],
  seabedAoStrength: ['Затенение во впадинах и тёмных местах ровного дна: больше — рельеф читается глубже. Только там, где нет ландшафта.', 'Shading in the hollows and dark spots of the flat bed: more makes the relief read deeper. Only where there is no landscape.'],
  seabedReliefScale: ['Частота бугров ровного дна: больше — мельче и чаще, меньше — крупные плавные холмы. Только там, где нет ландшафта.', 'Frequency of bumps on the flat bed: higher is smaller and closer, lower large gentle mounds. Only where there is no landscape.'],
  seabedTextureScale: ['Сколько раз текстура повторяется на ровном дне: больше — мельче камешки и песчинки. Только там, где нет ландшафта.', 'How many times the texture repeats on the flat bed: more makes pebbles and grains smaller. Only where there is no landscape.'],
  seabedSaturation: ['Насыщенность цвета ровного дна: 0 — серое, больше — ярче цвета. Только там, где нет ландшафта.', 'Colour saturation of the flat bed: 0 is grey, more is more vivid. Only where there is no landscape.'],
  waterTurbidity: ['Муть у дна: больше — каустика быстрее гаснет с глубиной, водоросли тонут в дымке. Прозрачность самого моря — «Мутность воды» в «Воде».', 'Murk near the bed: more fades caustics faster with depth and veils the algae. The sea’s own clarity is “Water turbidity” under Water.'],

  // Каустика
  causticsIntensity: ['Яркость световой сетки, которую волны рисуют на дне. Видна в пределах «Области ряби»; 0 — выключена.', 'Brightness of the net of light the waves draw on the bed. Shows within the “Ripple area”; 0 turns it off.'],
  causticsSharpness: ['Резкость каустики: больше — тонкие яркие прожилки, меньше — мягкие размытые пятна света.', 'Caustic sharpness: more gives thin bright veins, less soft blurry patches of light.'],
  causticsScale: ['Как сильно волны собирают свет по пути к дну: больше — сетка контрастнее и сложнее, меньше — бледная и спокойная.', 'How strongly the waves focus light on its way to the bed: more makes the net contrastier and more intricate, less pale and calm.'],
};
