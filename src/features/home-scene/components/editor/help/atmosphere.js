// Подсказки «?» к параметрам: облака, свет, туман, небо, лучи, источники
// света, постобработка. Ключ — ключ параметра в справочнике
// (docs/engine-parameters.json), значение — [по-русски, in English].
export default {
  // Облака неба (действуют при выключенных «Живописных облаках»)
  cloudPreset: [
    'Рисунок облаков неба: кучевые у горизонта, высокая тонкая вуаль, низкий пояс с яркой каймой у солнца или сплошной тёмный слой. Виден, если «Облачность» больше нуля.',
    'Sky cloud pattern: cumulus on the horizon, a thin high veil, a low bank with bright rims near the sun, or a solid dark deck. Shows once “Cloud cover” is above zero.',
  ],
  cloudCover: [
    'Сколько неба закрыто облаками: 0 — ясно. Облако на солнце гасит его и смягчает тени. Действует, только когда «Живописные облака» выключены.',
    'How much of the sky is clouded: 0 is clear. A cloud over the sun dims it and softens shadows. Works only while “Painterly clouds” is off.',
  ],
  cloudHorizon: [
    'Как высоко от горизонта поднимаются облака: меньше — узкая полоса у горизонта, больше — забираются выше, к зениту.',
    'How far above the horizon the clouds climb: lower keeps a narrow band at the horizon, higher lets them reach up toward the zenith.',
  ],
  cloudDensity: [
    'Насколько облака сплошные: больше — меньше просветов, тела облаков толще и темнее снизу.',
    'How solid the clouds are: higher means fewer gaps and thicker bodies with darker undersides.',
  ],
  cloudScale: [
    'Размер облачного рисунка. Обратите внимание: больше — облака мельче и чаще, меньше — крупнее и реже.',
    'Size of the cloud pattern. Note it runs backwards: higher gives smaller, more frequent clouds; lower gives bigger, sparser ones.',
  ],
  cloudSunOcclusion: [
    'Насколько облака закрывают солнце: больше — облака стягиваются к диску и сильнее его гасят, свет тускнеет, тени мягче.',
    'How much the clouds block the sun: higher draws clouds toward the disc and dims it more, so the light weakens and shadows soften.',
  ],

  // Живописные облака
  painterlyCloudsEnabled: [
    'Объёмные облака: плывут по ветру, отбрасывают тени на землю и воду, умеют грозу. Пока включены, простые облака неба отключены и скрыты.',
    'Volumetric clouds that drift with the wind, cast shadows on land and water and can storm. While on, the simple sky clouds are disabled and hidden.',
  ],
  painterlyCloudSeed: [
    'Номер случайного узора: другой номер — другие облака при тех же настройках. Пока узор пересчитывается, облака на миг пропадают.',
    'Random pattern number: another number gives different clouds with the same settings. They vanish for a moment while the pattern is rebuilt.',
  ],
  painterlyCloudCoverage: [
    'Какая доля неба занята облаками. При малом покрытии — плоские клочья, с ростом появляются высокие башни.',
    'Share of the sky covered by cloud. Low coverage gives flat scraps; as it grows, tall towers appear.',
  ],
  painterlyCloudDensity: [
    'Плотность облаков: меньше — лёгкие, полупрозрачные; больше — непрозрачные, с тёмным низом и более густой тенью на земле.',
    'Cloud density: lower is light and see-through; higher is opaque, with dark undersides and deeper shadows on the ground.',
  ],
  painterlyCloudAltitude: [
    'Высота нижней кромки облаков над водой, м. Ниже — облака крупнее и нависают над сценой, выше — мельче и дальше.',
    'Height of the cloud base above the water, in metres. Lower clouds loom large over the scene; higher ones look smaller and farther away.',
  ],
  painterlyCloudHeight: [
    'Толщина облачного слоя: 1 — около 2,4 км. Меньше — плоские пласты, больше — высокие кучевые башни.',
    'Thickness of the cloud layer: 1 is about 2.4 km. Lower gives flat sheets, higher gives tall cumulus towers.',
  ],
  painterlyCloudScale: [
    'Размер облачных массивов: больше — крупные облака и широкие просветы, меньше — мелкие и частые.',
    'Size of the cloud masses: higher gives big clouds with wide gaps, lower gives small, frequent ones.',
  ],
  painterlyCloudWindSpeed: [
    'Как быстро плывут облака, м/с; верх облаков идёт чуть быстрее низа. При 0 они стоят и лишь медленно меняют форму.',
    'How fast the clouds drift, m/s; their tops move a little faster than their bases. At 0 they stand still and only slowly change shape.',
  ],
  painterlyCloudWindDirection: [
    'Откуда дует ветер, по компасу сцены: 0° — с севера, 90° — с востока. Облака, их тени и дождь плывут по ветру.',
    'Where the wind blows from, on the scene compass: 0° from the north, 90° from the east. Clouds, their shadows and the rain drift downwind.',
  ],
  painterlyCloudShadowStrength: [
    'Насколько темнеют земля, вода и предметы в тени облаков. При 0 теней нет; «Лучи под облаками» и дождь от неё не зависят.',
    'How much land, water and objects darken in cloud shadow. At 0 there are no shadows; the rays beneath clouds and the rain do not depend on it.',
  ],
  painterlyCloudShadowSoftness: [
    'Размытость краёв облачных теней: 0 — чёткие пятна, больше — мягкие переходы.',
    'Blur of the cloud shadow edges: 0 gives crisp patches, higher gives soft transitions.',
  ],
  painterlyCloudHaze: [
    'Воздушная дымка: дальние облака растворяются в мгле у горизонта. В ней же становятся видны «Лучи под облаками».',
    'Aerial haze: distant clouds dissolve into the murk at the horizon. It is also the air that makes the rays beneath clouds visible.',
  ],
  painterlyCloudRays: [
    'Столбы солнечного света в просветах облаков. Видны днём в дымке; нужны постобработка и «Лучи включены», яркость — от «Силы лучей».',
    'Shafts of sunlight through gaps in the clouds. Seen by day in haze; they need post-processing and sun rays on, and take their brightness from “Ray strength”.',
  ],
  painterlyCloudQuality: [
    'Детальность облаков против скорости. «Авто»: «Баланс» на компьютере, «Лёгкое» на телефоне. В «Лёгком» нет дождя; «Высокое» и «Экстра» — только на компьютере.',
    'Cloud detail versus speed. “Auto” picks Balanced on a computer and Low on a phone. Low has no rain; High and Ultra run only on a computer.',
  ],
  painterlyCloudStormEnabled: [
    'Гроза в живописных облаках: тучи густеют и темнеют, небо сереет, идут дождь и молнии. Выключена — всё грозовое обнуляется.',
    'A storm in the painterly clouds: clouds thicken and darken, the sky greys, rain and lightning arrive. Off sets every storm effect to zero.',
  ],
  painterlyCloudStorm: [
    'Сила грозы: небо сереет, солнце тускнеет, тени мягче, тучи толще. От неё же зависит, сколько будет дождя.',
    'Storm strength: the sky greys, the sun dims, shadows soften, clouds thicken. It also scales how much rain falls.',
  ],
  painterlyCloudRain: [
    'Полосы дождя под тучами и капли на объективе. Умножается на «Силу грозы»; в качестве «Лёгкое» (у телефона в «Авто») дождя нет.',
    'Rain curtains under the clouds and drops on the lens. Multiplied by “Storm strength”; Low quality (a phone on Auto) draws no rain.',
  ],
  painterlyCloudLightning: [
    'Частота молний — до 9 разрядов в минуту. Вспышка освещает тучи и сцену, гром приходит с задержкой по расстоянию.',
    'Lightning frequency, up to about 9 strikes a minute. A flash lights the clouds and the scene; thunder follows, delayed by distance.',
  ],
  painterlyCloudRainCells: [
    'Какая часть облаков дождевая: больше — дождевых туч больше и они шире. Работает при включённой грозе.',
    'How much of the cloud field rains: higher gives more and wider rain clouds. Works while the storm is on.',
  ],
  painterlyCloudRainDrops: [
    'Сколько капель стекает по объективу перед камерой. Видны, пока идёт дождь; рисует постобработка.',
    'How many drops streak down the lens in front of the camera. Seen only while it rains; drawn by post-processing.',
  ],
  painterlyCloudRainDropSize: [
    'Размер капель на объективе: больше — длиннее и толще полосы, но их меньше.',
    'Size of the drops on the lens: higher gives longer, thicker streaks, but fewer of them.',
  ],
  painterlyCloudRainDarkness: [
    'Насколько темнеет низ дождевых туч: 0 — как у обычных облаков, больше — тяжёлое тёмное брюхо.',
    'How dark the bases of the rain clouds get: 0 is like ordinary clouds, higher gives a heavy dark belly.',
  ],

  // Свет: солнце, воздух, луна, заполняющий свет, тени
  timeOfDay: [
    'Час на пути солнца: в 12 оно выше всего, в 6 и 18 — на горизонте. Ночью ключевым светом становится луна и видны звёзды.',
    'The hour along the sun’s path: highest at 12, on the horizon at 6 and 18. At night the moon becomes the key light and the stars come out.',
  ],
  sunBearing: [
    'Сторона, где солнце стоит в полдень, по компасу сцены (0° — север, 90° — восток). Восход и закат — в 90° от неё; луна и звёзды поворачиваются вместе.',
    'Where the sun stands at noon, on the scene compass (0° north, 90° east). Sunrise and sunset lie 90° to either side; the moon and stars turn with it.',
  ],
  sunNoonElevation: [
    'Как высоко солнце поднимается к полудню, градусы над горизонтом. Низко — длинные тени и тёплый свет весь день; высоко — короткие тени.',
    'How high the sun climbs by noon, in degrees above the horizon. Low means long shadows and warm light all day; high means short shadows.',
  ],
  sunIntensity: [
    'Сила прямого солнечного света. С ней светлеют освещённые солнцем облака и небо, а ночью — лунный свет.',
    'Strength of direct sunlight. The sky and sunlit clouds brighten with it, and so does moonlight at night.',
  ],
  sunTint: [
    'Подкраска солнечного света. У горизонта солнце краснеет само, от толщи воздуха; этот тон ложится поверх и окрашивает также небо, облака и лунный свет.',
    'Tint of the sunlight. A low sun reddens by itself through the air; this tint goes on top and also colours the sky, clouds and moonlight.',
  ],
  sunAngularSize: [
    'Видимый размер солнечного диска: 1 — как у настоящего солнца. Меняет только диск и источник лучей; сила света и тени прежние.',
    'Apparent size of the sun disc: 1 matches the real sun. Only the disc and the source of the rays change; light strength and shadows stay the same.',
  ],
  skyTurbidity: [
    'Дымка в воздухе: низкое солнце тусклее и краснее, горизонт белеет, ореол у солнца шире — и с «Живописными облаками» тоже. Тени остаются резкими.',
    'Haze in the air: a low sun gets dimmer and redder, the horizon whitens and the glow around the sun widens — with painterly clouds too. Shadows stay sharp.',
  ],
  distantSurfaceColor: [
    'Цвет дальней земли и воды ниже горизонта: виден, где кончается сцена, и отражённым светом подсвечивает предметы снизу. Действует и с «Живописными облаками».',
    'Colour of the distant ground and water below the horizon: seen where the scene ends, and it lights objects from below as bounce light. Works with painterly clouds too.',
  ],
  moonPhase: [
    'Фаза луны: 0 и 1 — новолуние, 0,5 — полнолуние. Задаёт и освещённую часть диска, и где луна в небе: полная стоит напротив солнца.',
    'Moon phase: 0 and 1 are new moon, 0.5 is full. It sets both the lit part of the disc and where the moon is: a full moon stands opposite the sun.',
  ],
  moonBrightness: [
    'Сила лунного света ночью и яркость диска луны, в том числе подсветка облаков. При новолунии луна не светит.',
    'Strength of moonlight at night and brightness of the moon disc, including moonlit clouds. A new moon gives no light.',
  ],
  starsIntensity: [
    'Яркость звёзд. Видны только ночью, когда солнце под горизонтом, и поворачиваются вместе со временем суток.',
    'Brightness of the stars. Visible only at night, with the sun below the horizon; they turn with the time of day.',
  ],
  lightDiscEnabled: [
    'Показывает диски солнца и луны в небе. Выключено — светил не видно, но их свет, тени и блики на воде остаются.',
    'Shows the sun and moon discs in the sky. Off hides the bodies, but their light, shadows and glints on the water remain.',
  ],
  ambientIntensity: [
    'Ровный свет со всех сторон, без направления и теней: поднимает все тени и толщу воды одинаково. Много — картинка становится плоской.',
    'Even light from every direction, with no shadows: lifts all shadows and the water body alike. Too much flattens the picture.',
  ],
  ambientColor: [
    'Цвет ровного заполняющего света; заметнее всего окрашивает тени.',
    'Colour of the even fill light; it shows most in the shadows.',
  ],
  hemisphereIntensity: [
    'Свет «небо сверху, земля снизу»: что смотрит вверх, получает цвет неба, что вниз — цвет земли. Мягко лепит форму в тенях.',
    'Sky-above, ground-below light: surfaces facing up get the sky colour, those facing down the ground colour. Gently models form in the shadows.',
  ],
  hemisphereSkyColor: [
    'Цвет, которым полусфера подсвечивает всё, что обращено вверх.',
    'Colour the hemisphere light gives to everything facing up.',
  ],
  hemisphereGroundColor: [
    'Цвет, которым полусфера подсвечивает всё, что обращено вниз, — как свет, отражённый от земли.',
    'Colour the hemisphere light gives to everything facing down, like light bounced off the ground.',
  ],
  envTint: [
    'Оттенок света неба на предметах и неба, отражённого в море, — и рисованного, и HDRI-панорамы; видимое небо и фон не меняются. Исходный серо-голубой #6b7484 нейтрален: теплее — теплее, светлее — ярче.',
    'Tint of the sky light on objects and of the sky the sea reflects, painted or HDRI panorama alike; the visible sky and backdrop keep their colour. The default grey-blue #6b7484 is neutral: warmer warms, lighter brightens.',
  ],
  shadowsEnabled: [
    'Тени от солнца, ночью — от луны. Тени живописных облаков от этой галочки не зависят.',
    'Shadows from the sun, or from the moon at night. Painterly cloud shadows do not depend on this switch.',
  ],
  shadowIntensity: [
    'Насколько темны тени: 0 — не видны, 100% — полная тень. Облако на солнце само делает тени светлее.',
    'How dark shadows are: 0 hides them, 100% is full shadow. A cloud over the sun lightens them by itself.',
  ],
  shadowRadius: [
    'Размытость края тени: 0 — резкий, больше — мягкий. Облачность сама добавляет мягкости.',
    'Blur of the shadow edge: 0 is sharp, higher is soft. Cloud cover adds softness by itself.',
  ],
  shadowContactOffset: [
    'Сдвиг начала тени от поверхности, мм. В минус — уходит полосатая «рябь» на освещённом, но тень может отойти от основания предмета; в плюс — наоборот.',
    'Shifts where the shadow starts from the surface, in mm. Negative clears striped shadow ripples but may lift the shadow off an object’s base; positive does the reverse.',
  ],
  shadowCascades: [
    '«Одна зона» — тени только вокруг главного в кадре. «Ближняя + дальняя» — ещё и тени вдали (дистанции ниже), тяжелее. «Авто» — две на компьютере, телефон всегда одна.',
    'One zone: shadows only around the main subject. Near + far: shadows in the distance too (distances below), heavier. Auto uses two on a computer; a phone always one.',
  ],
  waterShadowStrength: [
    'Насколько тени предметов и облаков ложатся на море: на блики, свечение в толще, пену. 0 — вода теней не видит. В пасмурную погоду слабеет сама.',
    'How much object and cloud shadows fall on the sea: its glints, inner glow and foam. At 0 the water ignores shadows. Weakens by itself under overcast.',
  ],
  shadowBias: [
    'Прежняя форма «Смещения контакта». Действует, только пока то не трогали; уже ±0,0004 даёт предельные ±6 мм, дальше без изменений.',
    'The old form of “Contact offset”. Works only until that one is touched; about ±0.0004 already gives the ±6 mm limit, beyond that nothing changes.',
  ],

  // Туман
  fogMode: [
    'Туман на предметах, воде и земле (не на небе). «Дешёвый» — один слой клубов, «Объёмный» — несколько слоёв с глубиной, гуще и тяжелее. Рисует постобработка.',
    'Fog over objects, water and land (not the sky). Cheap is one layer of wisps; Volumetric is several layers with depth, denser and heavier. Drawn by post-processing.',
  ],
  fogColor: [
    'Цвет дымки, в которой тонут дальние предметы. К нему подмешиваются горизонт («Цвет тумана от неба») и солнце («Рассеивание солнечного света»).',
    'Colour of the veil distant things sink into. The horizon (“Fog colour from sky”) and the sun (“Sunlight scattering”) are mixed into it.',
  ],
  fogDensity: [
    'Густота тумана на полной дистанции: больше — даль тонет сильнее; даже на максимуме немного просвечивает.',
    'Fog thickness at full distance: higher buries the distance deeper; even at maximum a little still shows through.',
  ],
  fogNear: [
    'С какого расстояния от камеры начинается туман, м. Ближе воздух чистый.',
    'Distance from the camera where fog begins, in metres. Closer than that the air is clear.',
  ],
  fogFar: [
    'Расстояние, на котором туман набирает полную густоту, м. От «Начала по дистанции» до него он плавно нарастает.',
    'Distance where fog reaches full thickness, in metres. It builds up smoothly from “Distance start” to here.',
  ],
  fogNoiseScale: [
    'Размер клубов тумана: больше — клочья мельче и чаще, меньше — крупные пятна. Рисунок привязан к кадру, а не к месту.',
    'Size of the fog wisps: higher gives smaller, more frequent patches, lower gives large blotches. The pattern is tied to the frame, not the place.',
  ],
  fogSpeed: [
    'Как быстро клубы тумана плывут по кадру. 0 — неподвижны.',
    'How fast the fog wisps drift across the frame. 0 holds them still.',
  ],
  fogScattering: [
    'Как туман подсвечивается солнцем: светлеет вокруг диска и вдоль лучей. Растёт с «Силой лучей»; при нулевой силе пропадает.',
    'How the fog is lit by the sun: it brightens around the disc and along the rays. Grows with “Ray strength” and vanishes when that is zero.',
  ],
  fogSkyTint: [
    'Смешивает «Цвет тумана» с горизонтом неба, которое видно в кадре (с HDRI-фоном — с горизонтом палитры пресета): 0 — свой цвет, 1 — цвет горизонта, чтобы даль сливалась с небом.',
    'Blends “Fog colour” with the horizon of the sky actually in view (with an HDRI backdrop, the preset palette’s horizon): 0 keeps its own colour, 1 takes the horizon’s, so the distance meets the sky.',
  ],

  // Небо и HDRI
  skyVisible: [
    'Показывает небо и облака фоном. Выключено — фон почти чёрный, но свет неба и его отражение в воде остаются.',
    'Shows the sky and clouds as the background. Off leaves a near-black backdrop, but the sky’s light and its reflection in the water remain.',
  ],
  envMode: [
    '«Небо» — рисованное небо и фон, и свет. «Небо + HDRI» — фон рисованный, а предметы освещает и отражается в них фотопанорама. «Только HDRI» — панорама и фон, и свет, и её же отражает море; в других режимах море отражает рисованное небо.',
    '“Sky”: the rendered sky is backdrop and light. “Sky + HDRI”: the rendered sky stays behind, the photo panorama lights objects and shows in them. “HDRI only”: the panorama is backdrop, light and the sea’s reflection; otherwise the sea shows the rendered sky.',
  ],
  hdriIntensity: [
    'Яркость HDRI-панорамы: сколько света она даёт предметам и насколько ярка фоном, а в «Только HDRI» — и в отражении моря. Только в режимах с HDRI; гроза её приглушает.',
    'Brightness of the HDRI panorama: how much light it gives objects and how bright it is as a background, and in “HDRI only” in the sea’s reflection too. HDRI modes only; a storm dims it.',
  ],
  hdrPreset: [
    'Какая фотопанорама используется в режимах с HDRI. Её палитра ещё окрашивает дождь, даёт туману цвет горизонта, когда панорама стоит фоном, и слегка тонирует толщу воды.',
    'Which photo panorama the HDRI modes use. Its palette also colours the rain, gives the fog its horizon while the panorama is the backdrop, and slightly tints the water body.',
  ],
  hdrRotation: [
    'Поворот HDRI-панорамы вокруг вертикали: с какой стороны падает её свет и что отражается в предметах. Панорама-фон и её отражение в море («Только HDRI») поворачиваются вместе с ним.',
    'Turns the HDRI panorama around the vertical: which side its light comes from and what objects reflect. The panorama backdrop and its reflection in the sea (“HDRI only”) turn with it.',
  ],
  hdrExposure: [
    'Яркость всего неба — видимого, облаков, отражённого и его рассеянного света на предметах; действует и в режиме «Небо». Прямое солнце не меняется.',
    'Brightness of the whole sky — visible, clouds, reflected, and its diffuse light on objects; works in “Sky” mode too. Direct sunlight is unchanged.',
  ],
  envReflectionIntensity: [
    'Сколько отражений и рассеянного света окружения берут предметы, берег и растения — в любом режиме, не только с HDRI. 0 — остаются прямой и заполняющий свет.',
    'How much environment reflection and diffuse light objects, shore and plants take — in any mode, not only HDRI. At 0 only direct and fill light remain.',
  ],
  showHdriBackground: [
    'В режиме «Небо + HDRI» ставит панораму фоном вместо неба; живописные облака скрыты, а море по-прежнему отражает рисованное небо. В «Только HDRI» панорама фоном всегда, и море отражает её.',
    'In “Sky + HDRI” puts the panorama behind the scene instead of the sky; painterly clouds are hidden and the sea still reflects the rendered sky. In “HDRI only” it is always the backdrop, and the sea reflects it.',
  ],

  // Лучи
  sunRaysEnabled: [
    'Лучи от солнечного диска, когда он в кадре, и столбы света в просветах живописных облаков. Рисует постобработка.',
    'Rays from the sun disc while it is in frame, and shafts of light through gaps in painterly clouds. Drawn by post-processing.',
  ],
  sunRaysIntensity: [
    'Яркость лучей. От неё же зависит, насколько туман светится солнцем.',
    'Brightness of the rays. It also sets how much the fog glows with sunlight.',
  ],
  sunRaysDecay: [
    'Как быстро лучи гаснут по пути от солнца: меньше — начинают гаснуть у самого диска и кажутся короче, больше — держат силу почти до конца. Докуда они тянутся, задаёт «Длина / плотность лучей».',
    'How quickly the rays fade on their way from the sun: lower starts the fade at the disc so they look shorter, higher keeps them strong almost to their end. How far they reach is “Ray Length / Density”.',
  ],
  sunRaysDensity: [
    'Как далеко по кадру тянутся лучи: 0 — только сияние у самого диска, максимум — почти через весь кадр.',
    'How far across the frame the rays reach: 0 is just a glow at the disc, maximum spans nearly the whole frame.',
  ],

  // Источник света 1
  light1Enabled: [
    'Дополнительный источник света без теней: освещает берег, предметы и растения. Морская гладь его не принимает, но в ней отражается освещённое.',
    'An extra light that casts no shadows: it lights the shore, objects and plants. The sea surface does not take it, though it reflects what is lit.',
  ],
  light1Color: [
    'Цвет света источника и его видимого шара.',
    'Colour of the light and of its visible bulb.',
  ],
  light1Intensity: [
    'Сила света. Он слабеет с квадратом расстояния: вдвое дальше — вчетверо темнее, так что далёкий источник нужно делать сильнее.',
    'Light strength. It falls off with the square of distance: twice as far is four times darker, so a distant light needs more strength.',
  ],
  light1ConeAngle: [
    'Ширина светового конуса, градусы. На 180° конус становится лампой, светящей во все стороны, и цель уже не нужна.',
    'Width of the light cone, in degrees. At 180° it becomes a bulb shining in every direction, and the target no longer matters.',
  ],
  light1Softness: [
    'Мягкость края светового пятна: 0 — резкий круг, 100% — свет плавно гаснет от центра к краю. Для лампы на 180° не действует.',
    'Softness of the light pool’s edge: 0 is a hard circle, 100% fades smoothly from the centre out. Has no effect on a 180° bulb.',
  ],
  light1X: [
    'Положение источника по оси X, м: плюс — к востоку. То же, что перетаскивать его в сцене.',
    'Position of the light along X, in metres: plus is east. Same as dragging it in the scene.',
  ],
  light1Y: [
    'Высота источника, м: 0 — уровень воды, минус — под водой.',
    'Height of the light, in metres: 0 is the waterline, negative is underwater.',
  ],
  light1Z: [
    'Положение источника по оси Z, м: плюс — к югу. То же, что перетаскивать его в сцене.',
    'Position of the light along Z, in metres: plus is south. Same as dragging it in the scene.',
  ],
  light1SourceVisible: [
    'Показывает сам источник — маленький светящийся шар. Свет работает и без него.',
    'Shows the light itself as a small glowing ball. The light works without it too.',
  ],
  light1InReflections: [
    'Виден ли источник в отражении на воде. Выключено — из отражения пропадают и шар, и его свет.',
    'Whether the light shows in the water reflection. Off removes both the ball and its light from the reflection.',
  ],
  light1TargetX: [
    'Точка, куда смотрит конус, по оси X, м (плюс — восток). Её можно тащить в сцене. Для лампы на 180° не нужна.',
    'Point the cone aims at, along X, in metres (plus is east). You can drag it in the scene. Not needed for a 180° bulb.',
  ],
  light1TargetY: [
    'Высота точки, куда смотрит конус, м: 0 — уровень воды. Для лампы на 180° не нужна.',
    'Height of the point the cone aims at, in metres: 0 is the waterline. Not needed for a 180° bulb.',
  ],
  light1TargetZ: [
    'Точка, куда смотрит конус, по оси Z, м (плюс — юг). Её можно тащить в сцене. Для лампы на 180° не нужна.',
    'Point the cone aims at, along Z, in metres (plus is south). You can drag it in the scene. Not needed for a 180° bulb.',
  ],

  // Источник света 2
  light2Enabled: [
    'Дополнительный источник света без теней: освещает берег, предметы и растения. Морская гладь его не принимает, но в ней отражается освещённое.',
    'An extra light that casts no shadows: it lights the shore, objects and plants. The sea surface does not take it, though it reflects what is lit.',
  ],
  light2Color: [
    'Цвет света источника и его видимого шара.',
    'Colour of the light and of its visible bulb.',
  ],
  light2Intensity: [
    'Сила света. Он слабеет с квадратом расстояния: вдвое дальше — вчетверо темнее, так что далёкий источник нужно делать сильнее.',
    'Light strength. It falls off with the square of distance: twice as far is four times darker, so a distant light needs more strength.',
  ],
  light2ConeAngle: [
    'Ширина светового конуса, градусы. На 180° конус становится лампой, светящей во все стороны, и цель уже не нужна.',
    'Width of the light cone, in degrees. At 180° it becomes a bulb shining in every direction, and the target no longer matters.',
  ],
  light2Softness: [
    'Мягкость края светового пятна: 0 — резкий круг, 100% — свет плавно гаснет от центра к краю. Для лампы на 180° не действует.',
    'Softness of the light pool’s edge: 0 is a hard circle, 100% fades smoothly from the centre out. Has no effect on a 180° bulb.',
  ],
  light2X: [
    'Положение источника по оси X, м: плюс — к востоку. То же, что перетаскивать его в сцене.',
    'Position of the light along X, in metres: plus is east. Same as dragging it in the scene.',
  ],
  light2Y: [
    'Высота источника, м: 0 — уровень воды, минус — под водой.',
    'Height of the light, in metres: 0 is the waterline, negative is underwater.',
  ],
  light2Z: [
    'Положение источника по оси Z, м: плюс — к югу. То же, что перетаскивать его в сцене.',
    'Position of the light along Z, in metres: plus is south. Same as dragging it in the scene.',
  ],
  light2SourceVisible: [
    'Показывает сам источник — маленький светящийся шар. Свет работает и без него.',
    'Shows the light itself as a small glowing ball. The light works without it too.',
  ],
  light2InReflections: [
    'Виден ли источник в отражении на воде. Выключено — из отражения пропадают и шар, и его свет.',
    'Whether the light shows in the water reflection. Off removes both the ball and its light from the reflection.',
  ],
  light2TargetX: [
    'Точка, куда смотрит конус, по оси X, м (плюс — восток). Её можно тащить в сцене. Для лампы на 180° не нужна.',
    'Point the cone aims at, along X, in metres (plus is east). You can drag it in the scene. Not needed for a 180° bulb.',
  ],
  light2TargetY: [
    'Высота точки, куда смотрит конус, м: 0 — уровень воды. Для лампы на 180° не нужна.',
    'Height of the point the cone aims at, in metres: 0 is the waterline. Not needed for a 180° bulb.',
  ],
  light2TargetZ: [
    'Точка, куда смотрит конус, по оси Z, м (плюс — юг). Её можно тащить в сцене. Для лампы на 180° не нужна.',
    'Point the cone aims at, along Z, in metres (plus is south). You can drag it in the scene. Not needed for a 180° bulb.',
  ],

  // Постобработка
  postProcessingEnabled: [
    'Финальная обработка кадра: туман, лучи, bloom, цвет, плёнка, капли дождя. Выключена — ничего этого нет ни на сайте, ни в редакторе.',
    'The final pass over the frame: fog, rays, bloom, colour, film, rain drops. Off removes all of these on the site and in the editor.',
  ],
  editorPostProcessing: [
    'Показывать постобработку в окне редактора. Выключено — там сырой кадр без тумана, лучей, свечения, цвета и плёнки, в том числе в просмотре кадра сайта. На сайт галочка не влияет.',
    'Show post-processing in the editor view. Off, the editor shows the raw frame without fog, rays, glow, grading or film, the site-frame preview included. This switch does not affect the site.',
  ],
  filmEnabled: [
    'Имитация киноплёнки: цвет плёнки, зерно, пыль, царапины, мерцание и дрожание кадра.',
    'Film emulation: stock colour, grain, dust, scratches, flicker and frame weave.',
  ],
  filmStock: [
    'Характер плёнки — цвет и ритм зерна: 35 мм почти нейтральна, 16 и 8 мм всё теплее и блёклее, с приподнятым чёрным; есть ч/б, сепия и выцветшая.',
    'Film character — colour and grain rhythm: 35 mm is nearly neutral, 16 and 8 mm get warmer and paler with lifted blacks; also B&W, sepia and faded.',
  ],
  filmGrainAmount: [
    'Сила плёночного зерна. Сильнее всего в средних тонах; в глубоких тенях и ярких светах слабее.',
    'Strength of the film grain. Strongest in the midtones, weaker in deep shadows and bright highlights.',
  ],
  filmGrainSize: [
    'Размер зерна в пикселях экрана: больше — крупное, грубое зерно.',
    'Grain size in screen pixels: higher gives coarse, large grain.',
  ],
  filmDustAmount: [
    'Пылинки на кадре — тёмные и светлые точки; меняются раз в пару секунд.',
    'Dust on the frame — dark and light specks that change every couple of seconds.',
  ],
  filmScratchAmount: [
    'Тонкие вертикальные царапины-волоски на плёнке; меняются раз в пару секунд.',
    'Thin vertical hairline scratches on the film; they change every couple of seconds.',
  ],
  filmFlickerAmount: [
    'Мигание яркости от кадра к кадру, как у старого проектора, в ступенях экспозиции: 0,1 EV ≈ 7%.',
    'Brightness flicker from frame to frame, like an old projector, in exposure stops: 0.1 EV ≈ 7%.',
  ],
  filmFlickerRate: [
    'Сколько раз в секунду меняется яркость при мерцании, Гц.',
    'How many times a second the flicker changes brightness, Hz.',
  ],
  filmGateWeaveAmount: [
    'Покачивание всего кадра на несколько пикселей, будто плёнка гуляет в кадровом окне проектора.',
    'The whole frame sways by a few pixels, as if the film wandered in the projector gate.',
  ],
  filmGateWeaveRate: [
    'Сколько раз в секунду кадр смещается при дрожании, Гц.',
    'How many times a second the frame shifts while weaving, Hz.',
  ],
  bloomEnabled: [
    'Свечение вокруг ярких мест — солнца, бликов на воде, источников света, — как ореол в объективе.',
    'A glow around bright spots — the sun, glints on the water, lights — like halation in a lens.',
  ],
  bloomStrength: [
    'Яркость ореола вокруг светлых мест.',
    'Brightness of the glow around bright areas.',
  ],
  bloomThreshold: [
    'С какой яркости места начинают светиться: ниже — светится больше кадра, выше — только самые яркие блики.',
    'Brightness at which things start to glow: lower makes more of the frame glow, higher keeps it to the brightest glints.',
  ],
  bloomRadius: [
    'Ширина ореола: больше — свечение расходится шире и мягче. Действует по всей шкале; к 100% ореол примерно вдвое шире, чем на 58%.',
    'Width of the glow: higher spreads it wider and softer. Works across the whole scale; at 100% the glow is about twice as wide as at 58%.',
  ],
  colorExposure: [
    'Экспозиция кадра в ступенях: +1 — вдвое светлее, −1 — вдвое темнее. Как на камере: свет в сцене не меняется.',
    'Frame exposure in stops: +1 is twice as bright, −1 half. As on a camera: the lighting in the scene does not change.',
  ],
  colorContrast: [
    '100% — без изменений. Больше — контрастнее; опорная точка в светлых полутонах, поэтому в тёмной сцене кадр при этом темнеет.',
    '100% is unchanged. Higher adds contrast; it pivots on the light midtones, so in a dark scene the frame also gets darker.',
  ],
  colorSaturation: [
    'Насыщенность: 100% — без изменений, 0 — чёрно-белый кадр, больше 100% — сочнее.',
    'Saturation: 100% is unchanged, 0 is black and white, above 100% is richer.',
  ],
  colorGamma: [
    'Яркость средних тонов: больше 1 — светлее, меньше 1 — темнее. Чёрное остаётся чёрным.',
    'Brightness of the midtones: above 1 is lighter, below 1 darker. Black stays black.',
  ],
  colorHue: [
    'Поворачивает все цвета по цветовому кругу на заданный угол; ±180° — к противоположным оттенкам. 0 — без изменений.',
    'Rotates every colour around the colour wheel by this angle; ±180° swaps to opposite hues. 0 is unchanged.',
  ],
};
