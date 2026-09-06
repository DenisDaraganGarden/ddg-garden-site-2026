// The species, rigs, maps and physics are the product's; the lab adds only its
// fin tint for the look-dev fins material and the two mode counts.
import {
  FISH_CATALOG as PRODUCT_CATALOG,
  FISH_DEFAULT_COUNTS,
  FISH_TEXTURES,
} from '../features/home-scene/creatures/fish/fishCatalog.js';

const FIN_COLORS = { pike: '#625331', perch: '#b64a18', roach: '#a93d22' };

export const FISH_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(PRODUCT_CATALOG).map(([species, fish]) => [
    species,
    Object.freeze({ ...fish, finColor: FIN_COLORS[species] }),
  ]),
));

export const SCHOOL_COUNTS = FISH_DEFAULT_COUNTS;
export const SPECIMEN_COUNTS = Object.freeze({ pike: 1, perch: 1, roach: 1 });

export { FISH_TEXTURES };
