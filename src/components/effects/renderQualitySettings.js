export const DEFAULT_RENDER_QUALITY_SETTINGS = Object.freeze({
  frameRateLimit: 0,
  adaptiveQuality: true,
  postAntiAliasing: 'auto',
  upscaleMode: 'off',
  upscaleQuality: 'quality',
  upscaleSharpness: 0.25,
  contactAoEnabled: false,
  contactAoIntensity: 0.35,
  contactAoRadius: 0.5,
  shadowCascades: 'auto',
  shadowNearDistance: 25,
  shadowDistance: 160,
  // Null keeps the runtime migration of a saved, authored shadowBias.
  shadowContactOffset: null,
});

const finite = (value, fallback, min, max) => Math.min(max, Math.max(min,
  Number.isFinite(value) ? value : fallback));

export function normalizeRenderQualitySettings(input = {}) {
  const d = DEFAULT_RENDER_QUALITY_SETTINGS;
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const shadowDistance = finite(source.shadowDistance, d.shadowDistance, 20, 500);
  return {
    frameRateLimit: [0, 30, 40, 60, 120].includes(Number(source.frameRateLimit))
      ? Number(source.frameRateLimit) : d.frameRateLimit,
    adaptiveQuality: typeof source.adaptiveQuality === 'boolean' ? source.adaptiveQuality : d.adaptiveQuality,
    postAntiAliasing: ['auto', 'msaa', 'fxaa', 'off'].includes(source.postAntiAliasing)
      ? source.postAntiAliasing : d.postAntiAliasing,
    upscaleMode: source.upscaleMode === 'fsr1' ? 'fsr1' : 'off',
    upscaleQuality: ['ultra', 'quality', 'balanced'].includes(source.upscaleQuality) ? source.upscaleQuality : d.upscaleQuality,
    upscaleSharpness: finite(source.upscaleSharpness, d.upscaleSharpness, 0, 1),
    contactAoEnabled: typeof source.contactAoEnabled === 'boolean' ? source.contactAoEnabled : d.contactAoEnabled,
    contactAoIntensity: finite(source.contactAoIntensity, d.contactAoIntensity, 0, 1),
    contactAoRadius: finite(source.contactAoRadius, d.contactAoRadius, 0.05, 3),
    shadowCascades: ['auto', '1', '2'].includes(String(source.shadowCascades))
      ? String(source.shadowCascades) : d.shadowCascades,
    shadowDistance,
    shadowNearDistance: finite(source.shadowNearDistance, d.shadowNearDistance, 5, shadowDistance * 0.8),
    shadowContactOffset: Number.isFinite(source.shadowContactOffset)
      ? finite(source.shadowContactOffset, 0, -0.06, 0.06) : null,
  };
}
