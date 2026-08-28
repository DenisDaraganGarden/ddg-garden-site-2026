// The camera is authored against exactly two stable frames. Runtime projection expands
// when a viewport is narrower than its reference frame, so the saved composition is
// always contained instead of being cropped.
export const LAYOUT_KEYS = ['desktop', 'portrait'];
export const LAYOUT_FRAME_ASPECTS = Object.freeze({
  desktop: 16 / 9,
  portrait: 9 / 16,
});
export const DEFAULT_LAYOUT_FRAME_INSETS = Object.freeze({
  // 18% top + bottom leaves a 2.78:1 image inside 16:9 — the long
  // Ultra Panavision composition used as the desktop authoring reference.
  desktop: 0.18,
  portrait: 0.12,
});
export const MIN_LAYOUT_FRAME_INSET = 0;
export const MAX_LAYOUT_FRAME_INSET = 0.32;
export const LAYOUT_VISIBLE_HEIGHT_RATIOS = Object.freeze({
  desktop: 1 - (DEFAULT_LAYOUT_FRAME_INSETS.desktop * 2),
  portrait: 1 - (DEFAULT_LAYOUT_FRAME_INSETS.portrait * 2),
});
export const LAYOUT_REFERENCE_ASPECTS = Object.freeze({
  desktop: LAYOUT_FRAME_ASPECTS.desktop / LAYOUT_VISIBLE_HEIGHT_RATIOS.desktop,
  portrait: LAYOUT_FRAME_ASPECTS.portrait / LAYOUT_VISIBLE_HEIGHT_RATIOS.portrait,
});
export const LAYOUT_PORTRAIT_MAX_ASPECT = 1;

export function resolveLayoutKey(viewportWidth, viewportHeight) {
  const viewportAspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;

  if (viewportAspect < LAYOUT_PORTRAIT_MAX_ASPECT) {
    return 'portrait';
  }
  return 'desktop';
}

export function clampLayoutFrameInset(value, layoutKey = 'desktop') {
  const fallback = DEFAULT_LAYOUT_FRAME_INSETS[layoutKey]
    ?? DEFAULT_LAYOUT_FRAME_INSETS.desktop;
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(MAX_LAYOUT_FRAME_INSET, Math.max(MIN_LAYOUT_FRAME_INSET, numericValue));
}

export function resolveLayoutFrameInset(layouts, key) {
  return clampLayoutFrameInset(layouts?.[key]?.frameInset, key);
}

export function getLayoutVisibleAspect(layoutKey, frameInset) {
  const outerAspect = LAYOUT_FRAME_ASPECTS[layoutKey] ?? LAYOUT_FRAME_ASPECTS.desktop;
  const inset = clampLayoutFrameInset(frameInset, layoutKey);
  const visibleHeightRatio = Math.max(0.2, 1 - (inset * 2));

  return outerAspect / visibleHeightRatio;
}

export function fitCameraFovToLayout(
  cameraFov,
  viewportWidth,
  viewportHeight,
  layoutKey,
  frameInset,
) {
  const baseFov = Number(cameraFov);
  const viewportAspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;
  const referenceAspect = getLayoutVisibleAspect(layoutKey, frameInset);

  if (!Number.isFinite(baseFov) || viewportAspect <= 0) {
    return cameraFov;
  }

  const widthContainScale = Math.max(1, referenceAspect / viewportAspect);
  const baseHalfFov = (baseFov * Math.PI) / 360;
  const fittedFov = (Math.atan(Math.tan(baseHalfFov) * widthContainScale) * 360) / Math.PI;

  return Math.min(fittedFov, 120);
}

// Uncustomised buckets inherit the desktop composition so the scene is never empty.
export function resolveLayout(layouts, key) {
  if (!layouts) {
    return null;
  }

  const chosen = layouts[key];
  if (chosen && chosen.customized) {
    return {
      ...chosen,
      frameInset: resolveLayoutFrameInset(layouts, key),
    };
  }

  const inherited = layouts.desktop ?? chosen ?? null;
  if (!inherited) {
    return null;
  }

  return {
    ...inherited,
    frameInset: resolveLayoutFrameInset(layouts, key),
  };
}
