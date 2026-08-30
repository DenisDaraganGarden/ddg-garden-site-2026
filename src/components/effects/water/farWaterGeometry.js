export const FAR_WATER_RADIUS = 40000;
export const FAR_WATER_BLEND_WIDTH = 0.4;

const finite = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export function buildFarWaterFieldData(
  waterExtent,
  outerRadius = FAR_WATER_RADIUS,
) {
  const extent = Math.max(finite(waterExtent, 24), 1);
  const halfExtent = extent * 0.5;
  const innerHalfExtent = Math.max(halfExtent - FAR_WATER_BLEND_WIDTH, 0.25);
  const radius = Math.max(finite(outerRadius, FAR_WATER_RADIUS), innerHalfExtent + 100);
  // One camera-centred quad is cheaper than a world-sized shell and cannot be
  // outrun by the unrestricted editor camera. The fragment shader cuts the
  // fixed, simulated pond out in world space; its overlap matches the core
  // water's optical and displacement blend width.
  const positions = [
    -radius, 0, -radius,
    radius, 0, -radius,
    radius, 0, radius,
    -radius, 0, radius,
  ];
  // Counter-clockwise from above: the authored water normal points upward and
  // gl_FrontFacing only flips it for cameras below the surface.
  const indices = [0, 2, 1, 0, 3, 2];

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
    pondHalfExtent: halfExtent,
    innerHalfExtent,
    outerRadius: radius,
    surfaceBlendWidth: FAR_WATER_BLEND_WIDTH,
    surfaceEdgeBlendUv: Math.min(FAR_WATER_BLEND_WIDTH / extent, 0.08),
  };
}
