// Подсказки «?» к параметрам, которые видны не всегда: ползунки куста и камня
// — только у выбранного объекта, качество и резкость FSR — только при
// включённом FSR, чайки в звуке — только при включённых чайках. Справочник
// (docs/engine-parameters.json) собран без них. Значение — [по-русски, in English].
export default {
    'placedObjects[].dryness': ['Сухость куста: больше — листва бледнее и желтее, как к концу лета; 0 — свежая зелень.', 'How dry the shrub is: more makes the foliage paler and yellower, as at summer’s end; 0 is fresh green.'],
    'placedObjects[].size': ['Размер камня в метрах, до вытянутости и приплюснутости; «Масштаб» умножает его ещё раз.', 'The rock’s size in metres before stretch and squash; «Scale» multiplies it again.'],
    'placedObjects[].squash': ['Высота камня относительно размера: меньше — ниже и площе, как плита; больше — выше и круглее.', 'The rock’s height against its size: less is lower and flatter, like a slab; more is taller and rounder.'],
    'placedObjects[].stretch': ['Длина камня вдоль одной стороны относительно размера: больше — длинный, как валун-«лодка».', 'The rock’s length along one side against its size: more makes a long, boat-like boulder.'],
    'placedObjects[].variant': ['Какой из шести камней: у каждого своя форма граней и сколов.', 'Which of six rocks: each has its own facets and breaks.'],
    'placedObjects[].tilt': ['Наклон камня набок, в градусах: заваливает его, как лёг на склоне.', 'Tilts the rock over, in degrees, as if it had settled on a slope.'],
    upscaleQuality: ['Какой кадр FSR растягивает до экрана: «Ультра» — 77% стороны, чётче; «Качество» — 67%; «Баланс» — 59%, быстрее и мягче.', 'How big a frame FSR stretches to the screen: «Ultra» 77% of a side, crisper; «Quality» 67%; «Balanced» 59%, faster and softer.'],
    upscaleSharpness: ['Насколько FSR подчёркивает края после растяжения: 0 — не подчёркивает, больше — чётче, но у контрастных контуров может появиться звон.', 'How much FSR sharpens edges after stretching: 0 not at all, more is crisper, though ringing may show at contrasty edges.'],
    'audio.tracks.birds.enabled': ['Крики чаек из точки «Чайки» во вкладке «3D-сцена»: слышно, с какой стороны кружит стая. Только при включённых чайках.', 'Gull cries from the «Gulls» point on the «3D scene» tab: you hear which side the flock is on. Only while the gulls are on.'],
    'audio.tracks.birds.gain': ['Громкость чаек, до 150%. Входит в «3D-источники».', 'Loudness of the gulls, up to 150%. Part of «3D sources».'],
    'audio.emitters.birds.x': ['Где стоит источник криков чаек по оси X сцены. Слушает камера: с той стороны, где точка, и слышны чайки. Работает с пространственным звуком.', 'Where the gulls’ sound source stands on the scene’s X axis. The camera listens: the gulls sound from that side. Works with spatial sound.'],
    'audio.emitters.birds.y': ['Высота источника криков чаек; 0 — уровень моря.', 'Height of the gulls’ sound source; 0 is sea level.'],
    'audio.emitters.birds.z': ['Где стоит источник криков чаек по оси Z сцены. Слушает камера: с той стороны, где точка, и слышны чайки. Работает с пространственным звуком.', 'Where the gulls’ sound source stands on the scene’s Z axis. The camera listens: the gulls sound from that side. Works with spatial sound.'],
    'audio.emitters.birds.refDistance': ['Ближе этого расстояния чайки звучат в полную силу, дальше начинают стихать. Больше — стаю громко слышно издалека.', 'Closer than this the gulls sound at full strength, further away they fade. More makes the flock loud from afar.'],
    'audio.emitters.birds.maxDistance': ['Дальше этой дистанции чайки перестают стихать и держатся на уровне, что был у границы, — совсем они не пропадают.', 'Beyond this distance the gulls stop fading and hold the level they had at the edge — they never go silent.'],
    'audio.emitters.birds.rolloff': ['Как быстро крики чаек стихают за «Ближней дистанцией»: 0 — не стихают вовсе, 1 — на двойной дистанции вдвое тише, больше — быстрее.', 'How fast the gulls fade beyond «Near distance»: 0 not at all, 1 half as loud at twice the distance, more is faster.'],
};
