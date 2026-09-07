// Shadow-map bias is stored by old scenes in light-depth units.  That made the
// apparent gap grow with the orthographic frustum: the same -0.0036 became
// almost one metre when the terrain map widened.  Keep old publications intact,
// but convert their value once into a small physical contact offset before each
// fitted map turns it back into depth units.

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// The historical hero map was roughly sixteen metres deep.  It is the reference
// used to migrate an authored normalized bias without rewriting its source.
export const LEGACY_SHADOW_BIAS_REFERENCE_DEPTH = 16;
// Old normalized bias was an implementation accident, not a 58 mm artistic
// gap. Keep legacy scenes close to the receiver; an explicit physical control
// still has the wider range useful for difficult thin geometry.
export const MAX_LEGACY_SHADOW_CONTACT_OFFSET_METERS = 0.006;
export const MAX_SHADOW_CONTACT_OFFSET_METERS = 0.06;

export function resolveShadowContactOffsetMeters({ legacyBias = 0, contactOffsetMeters } = {}) {
  if (Number.isFinite(contactOffsetMeters)) {
    return clamp(contactOffsetMeters, -MAX_SHADOW_CONTACT_OFFSET_METERS, MAX_SHADOW_CONTACT_OFFSET_METERS);
  }

  return clamp(
    legacyBias * LEGACY_SHADOW_BIAS_REFERENCE_DEPTH,
    -MAX_LEGACY_SHADOW_CONTACT_OFFSET_METERS,
    MAX_LEGACY_SHADOW_CONTACT_OFFSET_METERS,
  );
}

export function resolveDirectionalShadowContact({
  legacyBias = 0,
  contactOffsetMeters,
  near = 0.5,
  far = 20,
  radius = 4,
  mapSize = 1024,
} = {}) {
  const depthRange = Math.max(0.01, far - near);
  const worldTexelSize = (Math.max(0.01, radius) * 2) / Math.max(1, mapSize);
  const offsetMeters = resolveShadowContactOffsetMeters({ legacyBias, contactOffsetMeters });

  return {
    offsetMeters,
    depthRange,
    worldTexelSize,
    // `shadow.bias` is added after projection.  Divide a physical offset by the
    // active orthographic depth span so its meaning survives a wider map.
    bias: offsetMeters / depthRange,
    // Displaced water has no normal-bias path.  Retain the same physical rule,
    // with a slightly smaller receiver offset to avoid detaching the hull edge.
    waterBias: (offsetMeters * 0.55) / depthRange,
    // Quantisation is proportional to world texel size, bounded for close and
    // distant maps. This replaces the previous fixed 7 mm at every scale.
    normalBias: clamp(worldTexelSize * 0.35, 0.0015, 0.012),
  };
}
