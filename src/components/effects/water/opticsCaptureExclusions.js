// The sea is shaded from the planar captures themselves, so no surface may be
// present while either capture is rendered. Breakers are instanced as numbered
// meshes; keep that naming contract here instead of relying on exact names.
const exactSeaSurfaceNames = new Set([
  'water-surface',
  'far-water-surface',
  'gerstner-water',
  'shore-water',
]);

const numberedSeaSurfacePrefixes = [
  'breaking-wave-',
  'breaking-foam-',
  'breaking-spray-',
];

export const isSeaOpticsSurfaceName = (name) => (
  exactSeaSurfaceNames.has(name)
  || numberedSeaSurfacePrefixes.some((prefix) => name.startsWith(prefix))
);

// The one exception, in the mirror only: the sea reflects the breaker standing
// on it — its water sheet and its foam, never the spray. The loft cuts itself
// at the mirror plane and stops sampling the reflection while it is drawn into it.
export const isMirroredSeaSurfaceName = (name) => name.startsWith('breaking-wave-') || name.startsWith('breaking-foam-');

