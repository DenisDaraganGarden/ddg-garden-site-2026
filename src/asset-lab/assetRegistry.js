import FishLab from '../fish-lab/FishLab';
import SeagullLab from '../seagull-lab/SeagullLab';
import BlackStoneLab from '../black-stone-lab/BlackStoneLab';
import TankerLab from '../tanker-lab/TankerLab';

export const DEFAULT_ASSET_COLLECTION = 'river-fish';

export const ASSET_COLLECTIONS = Object.freeze({
  tanker: {
    id: 'tanker',
    label: 'Речной танкер',
    component: TankerLab,
  },
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
  'black-stone-sculpture': {
    id: 'black-stone-sculpture',
    label: 'Скульптура · чёрный камень',
    component: BlackStoneLab,
  },
});

export function getAssetCollection(id) {
  return ASSET_COLLECTIONS[id] ?? ASSET_COLLECTIONS[DEFAULT_ASSET_COLLECTION];
}
