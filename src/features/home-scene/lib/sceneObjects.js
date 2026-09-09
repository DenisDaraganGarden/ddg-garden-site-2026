// One list of the things the scene can switch on and off. The editor's
// visibility sheet is drawn from it, and every editor node that owns an entry
// gets the same switch above its own controls. A new object is one line here
// plus its key in the settings defaults; the sheet and the tab follow.
export const SCENE_OBJECT_GROUPS = Object.freeze(['landscape', 'greenery', 'objects', 'creatures', 'render']);

export const SCENE_OBJECTS = Object.freeze([
  { id: 'terrain', key: 'terrainEnabled', node: 'landscape/terrain', group: 'landscape', roots: ['azov-terrain'] },
  { id: 'rocks', key: 'terrainRocksEnabled', node: 'landscape/rocks', group: 'landscape', roots: ['coast-rocks', 'coast-debris'] },
  { id: 'pebbles', key: 'terrainPebblesEnabled', node: 'landscape/pebbles', group: 'landscape', roots: ['coast-pebbles', 'coast-shell-fragments'] },
  { id: 'shore', key: 'shoreEnabled', node: 'landscape/shore', group: 'landscape', roots: ['coastal-shore-finds', 'shore'] },
  { id: 'water', key: 'waterVisible', node: 'landscape/water', group: 'landscape', roots: ['gerstner-water', 'shore-water', 'foam-volume'] },
  { id: 'farWater', key: 'farWaterVisible', node: 'landscape/water', group: 'landscape' },
  { id: 'seabed', key: 'seabedVisible', node: 'landscape/seabed', group: 'landscape', roots: ['seabed'] },
  { id: 'sky', key: 'skyVisible', node: 'atmosphere/hdri', group: 'landscape', roots: ['sky-dome'] },
  { id: 'lilies', key: 'liliesVisible', node: 'greenery/lilies', group: 'greenery', roots: ['surface-vegetation'] },
  { id: 'algae', key: 'algaeVisible', node: 'greenery/algae', group: 'greenery', roots: ['underwater-algae'] },
  { id: 'shrubs', key: 'shrubsEnabled', node: 'greenery/shrubs', group: 'greenery', roots: ['coastal-oleaster'] },
  { id: 'trees', key: 'treesEnabled', node: 'greenery/trees', group: 'greenery', roots: ['coastal-trees'] },
  { id: 'grass', key: 'grassEnabled', node: 'greenery/grass', group: 'greenery', roots: ['coastal-grass'] },
  { id: 'tanker', key: 'tankerVisible', node: 'objects/tanker', group: 'objects', roots: ['tanker-anchor', 'tanker-wake'] },
  { id: 'boat', key: 'boatVisible', node: 'objects/boat', group: 'objects', roots: ['boat', 'boat-anchor'] },
  { id: 'sculpture', key: 'sculptureVisible', node: 'objects/sculpture', group: 'objects', roots: ['sculpture', 'sculpture-anchor'] },
  { id: 'seagulls', key: 'seagullsEnabled', node: 'creatures/seagulls', group: 'creatures', roots: ['seagull-flock'] },
  { id: 'fish', key: 'fishEnabled', node: 'creatures/fish', group: 'creatures', roots: ['river-fish-school'] },
  { id: 'reflections', key: 'reflectionsEnabled', node: null, group: 'render' },
]);

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

export const sceneNodeForObject3D = (object) => {
  for (let node = object; node; node = node.parent) {
    const match = node.name ? matchRoot(node.name) : null;
    if (match?.node) return match.node;
  }

  return null;
};
