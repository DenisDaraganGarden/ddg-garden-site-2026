import FishLab from '../fish-lab/FishLab';

export const DEFAULT_ASSET_COLLECTION = 'river-fish';

export const ASSET_COLLECTIONS = Object.freeze({
  'river-fish': {
    id: 'river-fish',
    label: 'Речные рыбы',
    component: FishLab,
  },
});

export function getAssetCollection(id) {
  return ASSET_COLLECTIONS[id] ?? ASSET_COLLECTIONS[DEFAULT_ASSET_COLLECTION];
}
