// One ordered list for the whole laboratory. The navigation, the page headers,
// the registry and the docs all read it: a new collection is one line here plus
// its component in assetRegistry.js. Groups mirror the editor's sections.
export const ASSET_GROUPS = Object.freeze([
  { id: 'creatures', ru: 'Живые существа', en: 'Creatures' },
  { id: 'objects', ru: 'Объекты', en: 'Objects' },
  { id: 'greenery', ru: 'Озеленение', en: 'Greenery' },
  { id: 'landscape', ru: 'Ландшафт', en: 'Landscape' },
  { id: 'atmosphere', ru: 'Атмосфера', en: 'Atmosphere' },
  { id: 'materials', ru: 'Материалы', en: 'Materials' },
]);

export const ASSET_CATALOG = Object.freeze([
  { index: '01', id: 'river-fish', group: 'creatures', ru: 'Рыбы', en: 'Fish', title: { ru: 'Речные рыбы', en: 'River fish' } },
  { index: '02', id: 'seagulls', group: 'creatures', ru: 'Чайки', en: 'Seagulls', title: { ru: 'Чайки', en: 'Seagulls' } },
  { index: '03', id: 'black-stone-sculpture', group: 'objects', ru: 'Камень', en: 'Stone', title: { ru: 'Скульптура · чёрный камень', en: 'Black stone sculpture' } },
  { index: '04', id: 'tanker', group: 'objects', ru: 'Танкер', en: 'Tanker', title: { ru: 'Речной танкер', en: 'River tanker' } },
  { index: '05', id: 'boat', group: 'objects', ru: 'Лодка', en: 'Boat', title: { ru: 'Лодка', en: 'Rowing boat' } },
  { index: '06', id: 'surfboard', group: 'objects', ru: 'Доска', en: 'Surfboard', title: { ru: 'Доска для серфинга', en: 'Surfboard' } },
  { index: '07', id: 'house', group: 'objects', ru: 'Дом', en: 'House', title: { ru: 'Дом у океана', en: 'House by the ocean' } },
  { index: '08', id: 'oleaster', group: 'greenery', ru: 'Куст', en: 'Shrub', title: { ru: 'Лох узколистный · куст', en: 'Oleaster shrub' } },
  { index: '09', id: 'tree', group: 'greenery', ru: 'Дерево', en: 'Tree', title: { ru: 'Лох узколистный · дерево', en: 'Oleaster tree' } },
  { index: '10', id: 'lilies', group: 'greenery', ru: 'Кувшинки', en: 'Lilies', title: { ru: 'Кувшинки', en: 'Water lilies' } },
  { index: '11', id: 'algae', group: 'greenery', ru: 'Водоросли', en: 'Algae', title: { ru: 'Водоросли', en: 'Algae' } },
  { index: '12', id: 'grass', group: 'greenery', ru: 'Травы', en: 'Grasses', title: { ru: 'Травы Азовского берега', en: 'Azov coast grasses' } },
  { index: '13', id: 'topiary', group: 'greenery', ru: 'Изгородь', en: 'Topiary', title: { ru: 'Стриженые формы', en: 'Topiary' } },
  { index: '14', id: 'groundcover', group: 'greenery', ru: 'Почвопокров', en: 'Groundcover', title: { ru: 'Почвопокровные растения', en: 'Groundcover plants' } },
  { index: '15', id: 'rocks', group: 'landscape', ru: 'Камни', en: 'Rocks', title: { ru: 'Камни · валуны, осыпь, галька', en: 'Rocks · boulders, debris, pebbles' } },
  { index: '16', id: 'driftwood', group: 'landscape', ru: 'Коряги', en: 'Driftwood', title: { ru: 'Коряги и камни', en: 'Driftwood & stones' } },
  { index: '17', id: 'water', group: 'landscape', ru: 'Море', en: 'Sea', title: { ru: 'Море · волны, прибой и пена', en: 'Sea · waves, surf and foam' } },
  { index: '18', id: 'clouds', group: 'atmosphere', ru: 'Облака', en: 'Clouds', title: { ru: 'Живописные облака', en: 'Painterly clouds' } },
  { index: '19', id: 'materials', group: 'materials', ru: 'Библиотека', en: 'Library', title: { ru: 'Библиотека материалов', en: 'Material library' } },
  { index: '20', id: 'fire', group: 'objects', ru: 'Огонь', en: 'Fire', title: { ru: 'Огонь по следу', en: 'Fire along a trail' } },
]);

export const DEFAULT_ASSET_COLLECTION = 'river-fish';

export const assetIndex = (id) => ASSET_CATALOG.find((entry) => entry.id === id)?.index ?? '—';
