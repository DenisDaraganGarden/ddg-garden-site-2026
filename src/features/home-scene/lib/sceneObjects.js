// One list of the things the scene can switch on and off. The editor's
// visibility sheet is drawn from it, and every editor node that owns an entry
// gets the same switch above its own controls. A new object is one line here
// plus its key in the settings defaults; the sheet and the tab follow.
export const SCENE_OBJECT_GROUPS = Object.freeze(['landscape', 'greenery', 'objects', 'creatures', 'render']);

export const SCENE_OBJECTS = Object.freeze([
  { id: 'terrain', key: 'terrainEnabled', node: 'landscape/terrain', group: 'landscape' },
  { id: 'rocks', key: 'terrainRocksEnabled', node: 'landscape/rocks', group: 'landscape' },
  { id: 'pebbles', key: 'terrainPebblesEnabled', node: 'landscape/pebbles', group: 'landscape' },
  { id: 'water', key: 'waterVisible', node: 'landscape/water', group: 'landscape' },
  { id: 'farWater', key: 'farWaterVisible', node: 'landscape/water', group: 'landscape' },
  { id: 'seabed', key: 'seabedVisible', node: 'landscape/seabed', group: 'landscape' },
  { id: 'sky', key: 'skyVisible', node: 'atmosphere/hdri', group: 'landscape' },
  { id: 'lilies', key: 'liliesVisible', node: 'greenery/lilies', group: 'greenery' },
  { id: 'algae', key: 'algaeVisible', node: 'greenery/algae', group: 'greenery' },
  { id: 'shrubs', key: 'shrubsEnabled', node: 'greenery/shrubs', group: 'greenery' },
  { id: 'trees', key: 'treesEnabled', node: 'greenery/trees', group: 'greenery' },
  { id: 'tanker', key: 'tankerVisible', node: 'objects/tanker', group: 'objects' },
  { id: 'boat', key: 'boatVisible', node: 'objects/boat', group: 'objects' },
  { id: 'sculpture', key: 'sculptureVisible', node: 'objects/sculpture', group: 'objects' },
  { id: 'seagulls', key: 'seagullsEnabled', node: 'creatures/seagulls', group: 'creatures' },
  { id: 'fish', key: 'fishEnabled', node: 'creatures/fish', group: 'creatures' },
  { id: 'reflections', key: 'reflectionsEnabled', node: null, group: 'render' },
]);

export const sceneObjectsForNode = (path) => SCENE_OBJECTS.filter((object) => object.node === path);
