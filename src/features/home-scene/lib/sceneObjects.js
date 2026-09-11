// One list of the things the scene can switch on and off. The editor's
// visibility sheet is drawn from it, and every editor node that owns an entry
// gets the same switch above its own controls. A new object is one line here
// plus its key in the settings defaults; the sheet and the tab follow.
//
// Это же — реестр связей движка. Движок процедурный, и у каждого объекта есть
// хвосты: имена в сцене (`roots` — по ним клик и наводка камеры), звуковая
// дорожка (`sound`), технические ракурсы (по тем же `roots`). Выключенный
// объект пропадает отовсюду, кроме этого списка: его дорожки нет в микшере и
// она молчит, его ракурса нет в «Видах». Второго списка «что к чему относится»
// не заводится — всё здесь.
//
// `newProject: false` — в новом проекте движка объект выключен. Лодка и
// скульптура — вещи сайта; танкер, водоросли, кувшинки и береговые находки
// пока не умеют размножаться вдоль воды процедурно; живность выключена, пока
// её поведение привязано к сайту (чайки — к лодке).
//
// `requires` — без чего объекта не бывает: чайкам, рыбам, кувшинкам и
// водорослям нужна вода. Выключил воду — их нет, хотя их собственный
// выключатель не тронут: делаем пустыню, и чайки уходят сами.
export const SCENE_OBJECT_GROUPS = Object.freeze(['landscape', 'greenery', 'objects', 'creatures', 'render']);

export const SCENE_OBJECTS = Object.freeze([
  { id: 'terrain', key: 'terrainEnabled', node: 'landscape/terrain', group: 'landscape', roots: ['azov-terrain'] },
  { id: 'rocks', key: 'terrainRocksEnabled', node: 'landscape/rocks', group: 'landscape', roots: ['coast-rocks', 'coast-debris'] },
  { id: 'pebbles', key: 'terrainPebblesEnabled', node: 'landscape/pebbles', group: 'landscape', roots: ['coast-pebbles', 'coast-shell-fragments'] },
  { id: 'shore', key: 'shoreEnabled', node: 'landscape/shore', group: 'landscape', roots: ['coastal-shore-finds', 'shore'], newProject: false },
  { id: 'water', key: 'waterVisible', node: 'landscape/water', group: 'landscape', roots: ['gerstner-water', 'shore-water', 'foam-volume'] },
  { id: 'farWater', key: 'farWaterVisible', node: 'landscape/water', group: 'landscape' },
  { id: 'seabed', key: 'seabedVisible', node: 'landscape/seabed', group: 'landscape', roots: ['seabed'] },
  { id: 'sky', key: 'skyVisible', node: 'atmosphere/hdri', group: 'landscape', roots: ['sky-dome'] },
  { id: 'lilies', key: 'liliesVisible', node: 'greenery/lilies', group: 'greenery', roots: ['surface-vegetation'], requires: ['water'], newProject: false },
  { id: 'algae', key: 'algaeVisible', node: 'greenery/algae', group: 'greenery', roots: ['underwater-algae'], requires: ['water'], newProject: false },
  { id: 'shrubs', key: 'shrubsEnabled', node: 'greenery/shrubs', group: 'greenery', roots: ['coastal-oleaster'] },
  { id: 'trees', key: 'treesEnabled', node: 'greenery/trees', group: 'greenery', roots: ['coastal-trees'] },
  { id: 'grass', key: 'grassEnabled', node: 'greenery/grass', group: 'greenery', roots: ['coastal-grass'] },
  { id: 'tanker', key: 'tankerVisible', node: 'objects/tanker', group: 'objects', roots: ['tanker-anchor', 'tanker-wake'], sound: 'tanker', newProject: false },
  { id: 'boat', key: 'boatVisible', node: 'objects/boat', group: 'objects', roots: ['boat', 'boat-anchor'], sound: 'boat', newProject: false },
  { id: 'sculpture', key: 'sculptureVisible', node: 'objects/sculpture', group: 'objects', roots: ['sculpture', 'sculpture-anchor'], newProject: false },
  { id: 'seagulls', key: 'seagullsEnabled', node: 'creatures/seagulls', group: 'creatures', roots: ['seagull-flock'], sound: 'birds', requires: ['water'], newProject: false },
  { id: 'fish', key: 'fishEnabled', node: 'creatures/fish', group: 'creatures', roots: ['river-fish-school'], requires: ['water'], newProject: false },
  { id: 'reflections', key: 'reflectionsEnabled', node: null, group: 'render' },
]);

const byId = (id) => SCENE_OBJECTS.find((object) => object.id === id);

// Объект есть в сцене, если включён он сам и всё, без чего его не бывает.
export const isSceneObjectOn = (settings, object) => settings?.[object.key] !== false
  && (object.requires ?? []).every((id) => isSceneObjectOn(settings, byId(id)));

export const sceneObjectOn = (settings, id) => isSceneObjectOn(settings, byId(id));

// Почему объекта нет, хотя его выключатель включён: имя того, без чего он не
// бывает. Для подсказки у выключателя в списке.
export const sceneObjectBlockedBy = (settings, object) => (object.requires ?? [])
  .map(byId)
  .filter((required) => required && !isSceneObjectOn(settings, required));

// Заводские значения нового проекта: всё, что помечено newProject: false, выключено.
export const newProjectObjectSettings = () => Object.fromEntries(
  SCENE_OBJECTS.filter((object) => object.newProject === false).map((object) => [object.key, false]),
);

// Объект по имени в сцене — тем же правилом, что и клик: точное имя раньше префикса.
export const sceneObjectForName = (name) => (name ? matchRoot(name) : null) ?? null;

// Дорожки выключенных объектов: их нет в микшере, и в движок они уходят
// выключенными — сама настройка дорожки при этом не трогается, включил
// объект обратно — дорожка вернулась какой была.
export const silencedSoundTracks = (settings) => new Set(
  SCENE_OBJECTS.filter((object) => object.sound && !isSceneObjectOn(settings, object)).map((object) => object.sound),
);

export const audioSettingsForScene = (settings) => {
  const audio = settings?.audio;
  const silenced = silencedSoundTracks(settings);
  if (!audio?.tracks || silenced.size === 0) return audio;
  return {
    ...audio,
    tracks: Object.fromEntries(Object.entries(audio.tracks).map(([id, track]) => [
      id,
      silenced.has(id) ? { ...track, enabled: false } : track,
    ])),
  };
};

// Технический ракурс на выключенный объект — пустой кадр. Ракурсы без объекта
// (берег, коса, степь) остаются всегда.
export const technicalFrameAvailable = (frame, settings) => {
  if (!frame?.object) return true;
  const object = sceneObjectForName(frame.object);
  return !object || isSceneObjectOn(settings, object);
};

export const sceneObjectsForNode = (path) => SCENE_OBJECTS.filter((object) => object.node === path);

// roots — имена, под которыми объект лежит в сцене. Их не пришлось выдумывать:
// по этим же именам работает наводка камеры (scene.getObjectByName), так что
// второго списка не заводится. Клик в сцене поднимается вверх по родителям,
// пока имя не совпадёт, и выбирает тот же узел дерева, что и клик в списке.
//
// Точное имя проверяется раньше префикса, иначе «shore-water» досталось бы
// берегу, хотя это вода.
const matchRoot = (name) => SCENE_OBJECTS.find((object) => object.roots?.includes(name))
  ?? SCENE_OBJECTS.find((object) => object.roots?.some((root) => name.startsWith(`${root}-`)));

// Вместе с узлом дерева возвращается имя, под которым объект лежит в сцене:
// по нему работает наводка камеры (frameObject), и второй раз искать не нужно.
export const sceneHitForObject3D = (object) => {
  for (let node = object; node; node = node.parent) {
    const match = node.name ? matchRoot(node.name) : null;
    if (match?.node) return { node: match.node, root: node.name };
  }

  return null;
};

export const sceneNodeForObject3D = (object) => sceneHitForObject3D(object)?.node ?? null;
