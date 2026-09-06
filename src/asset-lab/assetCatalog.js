// One ordered list for the whole laboratory. The navigation numbers, the
// registry and the docs all read it: a new collection is one line here plus its
// component in assetRegistry.js.
export const ASSET_CATALOG = Object.freeze([
  { index: '01', id: 'river-fish', ru: 'Речные рыбы', en: 'River fish' },
  { index: '02', id: 'seagulls', ru: 'Чайки', en: 'Seagulls' },
  { index: '03', id: 'black-stone-sculpture', ru: 'Скульптура · чёрный камень', en: 'Black stone sculpture' },
  { index: '04', id: 'tanker', ru: 'Речной танкер', en: 'River tanker' },
  { index: '05', id: 'oleaster', ru: 'Лох узколистный · куст', en: 'Oleaster shrub' },
  { index: '06', id: 'tree', ru: 'Лох узколистный · дерево', en: 'Oleaster tree' },
  { index: '07', id: 'boat', ru: 'Лодка', en: 'Rowing boat' },
]);

export const DEFAULT_ASSET_COLLECTION = 'river-fish';
