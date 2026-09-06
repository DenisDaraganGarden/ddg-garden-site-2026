// One ordered list for the whole laboratory. The navigation, the page headers,
// the registry and the docs all read it: a new collection is one line here plus
// its component in assetRegistry.js. Groups mirror the editor's sections.
export const ASSET_GROUPS = Object.freeze([
  { id: 'creatures', ru: 'Живые существа', en: 'Creatures' },
  { id: 'objects', ru: 'Объекты', en: 'Objects' },
  { id: 'greenery', ru: 'Озеленение', en: 'Greenery' },
  { id: 'landscape', ru: 'Ландшафт', en: 'Landscape' },
]);

export const ASSET_CATALOG = Object.freeze([
  { index: '01', id: 'river-fish', group: 'creatures', ru: 'Рыбы', en: 'Fish', title: { ru: 'Речные рыбы', en: 'River fish' } },
  { index: '02', id: 'seagulls', group: 'creatures', ru: 'Чайки', en: 'Seagulls', title: { ru: 'Чайки', en: 'Seagulls' } },
  { index: '03', id: 'black-stone-sculpture', group: 'objects', ru: 'Камень', en: 'Stone', title: { ru: 'Скульптура · чёрный камень', en: 'Black stone sculpture' } },
  { index: '04', id: 'tanker', group: 'objects', ru: 'Танкер', en: 'Tanker', title: { ru: 'Речной танкер', en: 'River tanker' } },
  { index: '05', id: 'boat', group: 'objects', ru: 'Лодка', en: 'Boat', title: { ru: 'Лодка', en: 'Rowing boat' } },
  { index: '06', id: 'oleaster', group: 'greenery', ru: 'Куст', en: 'Shrub', title: { ru: 'Лох узколистный · куст', en: 'Oleaster shrub' } },
  { index: '07', id: 'tree', group: 'greenery', ru: 'Дерево', en: 'Tree', title: { ru: 'Лох узколистный · дерево', en: 'Oleaster tree' } },
  { index: '08', id: 'lilies', group: 'greenery', ru: 'Кувшинки', en: 'Lilies', title: { ru: 'Кувшинки', en: 'Water lilies' } },
  { index: '09', id: 'algae', group: 'greenery', ru: 'Водоросли', en: 'Algae', title: { ru: 'Водоросли', en: 'Algae' } },
  { index: '10', id: 'rocks', group: 'landscape', ru: 'Камни', en: 'Rocks', title: { ru: 'Камни · валуны, осыпь, галька', en: 'Rocks · boulders, debris, pebbles' } },
]);

export const DEFAULT_ASSET_COLLECTION = 'river-fish';

export const assetIndex = (id) => ASSET_CATALOG.find((entry) => entry.id === id)?.index ?? '—';
