export const FAR_WATER_RADIUS = 40000;
// The overlap is deliberately wide enough to dissipate a cursor ripple before
// it reaches the finite simulation edge. A sub-metre fade made that edge read
// as a square outline in close shore views.
export const FAR_WATER_BLEND_WIDTH = 1.5;

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
  // fixed, simulated pond out in world space; the overlap is the pond's flat
  // rim, where its waves are already gone. The optical hand-over between the
  // two looks is authored separately (farWaterBlendWidth) and is wider.
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
    // Settings constrain the rendered pond to at least 12 m, so this remains
    // comfortably below one UV half while staying metrically identical to the
    // far-water overlap at every supported extent.
    surfaceEdgeBlendUv: FAR_WATER_BLEND_WIDTH / extent,
  };
}

// Mirrors the vertex shader's finite-pond mask. Keeping it here makes the
// numerical seam contract testable without asking a GPU to render a frame.
export function pondSurfaceEdgeFade(uv, edgeBlendUv) {
  const smoothstep = (from, to, value) => {
    const t = Math.max(0, Math.min(1, (value - from) / Math.max(to - from, 1e-9)));
    return t * t * (3 - 2 * t);
  };
  const width = Math.max(Number(edgeBlendUv) || 0, 1e-9);
  return smoothstep(0, width, uv.x)
    * smoothstep(0, width, uv.y)
    * (1 - smoothstep(1 - width, 1, uv.x))
    * (1 - smoothstep(1 - width, 1, uv.y));
}
