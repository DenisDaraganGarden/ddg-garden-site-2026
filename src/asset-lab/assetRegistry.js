import FishLab from '../fish-lab/FishLab';
import SeagullLab from '../seagull-lab/SeagullLab';

export const DEFAULT_ASSET_COLLECTION = 'river-fish';

export const ASSET_COLLECTIONS = Object.freeze({
  'river-fish': {
    id: 'river-fish',
    label: 'Речные рыбы',
    component: FishLab,
  },
  seagulls: {
    id: 'seagulls',
    label: 'Чайки',
    component: SeagullLab,
  },
});

export function getAssetCollection(id) {
  return ASSET_COLLECTIONS[id] ?? ASSET_COLLECTIONS[DEFAULT_ASSET_COLLECTION];
}
