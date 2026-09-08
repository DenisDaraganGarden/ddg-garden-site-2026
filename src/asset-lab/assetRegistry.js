import { ASSET_CATALOG, DEFAULT_ASSET_COLLECTION } from './assetCatalog';
import FishLab from '../fish-lab/FishLab';
import SeagullLab from '../seagull-lab/SeagullLab';
import BlackStoneLab from '../black-stone-lab/BlackStoneLab';
import TankerLab from '../tanker-lab/TankerLab';
import BoatLab from '../boat-lab/BoatLab';
import { GrassLab, OleasterLab, TreeLab } from '../plant-lab/PlantLab';
import { AlgaeLab, LiliesLab } from '../water-plant-lab/WaterPlantLab';
import RockLab from '../rock-lab/RockLab';
import DriftwoodLab from '../driftwood-lab/DriftwoodLab';
import WaterLab from '../water-lab/WaterLab';
import CloudLab from '../cloud-lab/CloudLab';

const COMPONENTS = {
  'river-fish': FishLab,
  seagulls: SeagullLab,
  'black-stone-sculpture': BlackStoneLab,
  tanker: TankerLab,
  boat: BoatLab,
  oleaster: OleasterLab,
  tree: TreeLab,
  lilies: LiliesLab,
  algae: AlgaeLab,
  grass: GrassLab,
  rocks: RockLab,
  driftwood: DriftwoodLab,
  water: WaterLab,
  clouds: CloudLab,
};

export { DEFAULT_ASSET_COLLECTION };

export const ASSET_COLLECTIONS = Object.freeze(Object.fromEntries(
  ASSET_CATALOG.map((entry) => [
    entry.id,
    Object.freeze({ ...entry, label: entry.title.ru, component: COMPONENTS[entry.id] }),
  ]),
));

export function getAssetCollection(id) {
  return ASSET_COLLECTIONS[id] ?? ASSET_COLLECTIONS[DEFAULT_ASSET_COLLECTION];
}
