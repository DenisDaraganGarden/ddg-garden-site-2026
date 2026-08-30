const finite = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function resolveBoatCockpitSeal(
  footprint,
  { fitWidth = 0.72, fitLength = 0.92 } = {},
) {
  const widthScale = clamp(finite(fitWidth, 0.72) / 0.72, 0.35, 1.65);
  const lengthScale = clamp(finite(fitLength, 0.92) / 0.92, 0.35, 1.65);
  const size = footprint?.size ?? { x: 0.84, y: 0.4, z: 1.9 };
  const center = footprint?.center ?? { x: 0, y: 0, z: 0 };

  return {
    centerX: finite(center.x, 0),
    centerZ: finite(center.z, 0),
    localY: finite(center.y, 0) - Math.max(finite(size.y, 0.4), 0.05) * 0.15,
    width: Math.max(finite(size.x, 0.84) * 0.44 * widthScale, 0.08),
    length: Math.max(finite(size.z, 1.9) * 0.46 * lengthScale, 0.18),
  };
}
