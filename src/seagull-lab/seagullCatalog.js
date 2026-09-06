// The asset itself lives with the product runtime; the lab only adds how many
// birds each of its modes shows.
import { SEAGULL_ASSET } from '../features/home-scene/creatures/seagullAsset.js';

export { SEAGULL_ASSET };

export const MODE_COUNTS = Object.freeze({
  flight: SEAGULL_ASSET.flight.defaultCount,
  landing: SEAGULL_ASSET.flight.defaultCount,
  glide: 3,
  specimen: 1,
  stress: SEAGULL_ASSET.flight.stressCount,
});
