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

