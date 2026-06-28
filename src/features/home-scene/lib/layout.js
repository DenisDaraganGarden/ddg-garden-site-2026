// Responsive composition buckets. Each screen-aspect class stores its own camera pose
// (position + target + fov) and object placement so the framing never drifts between
// devices. Keep these thresholds in sync with the editor copy in the Camera tab.

export const LAYOUT_KEYS = ['portrait', 'desktop', 'wide'];

// Portrait is decided by window ORIENTATION (tall viewport). Wide vs Desktop is decided by
// the physical MONITOR aspect, not the browser viewport — a maximised browser on a 16:9
// screen has a viewport of ~2.0 (tabs/bookmarks/taskbar eat height), which would wrongly
// read as ultrawide. The screen aspect (1.78 for 16:9, 2.33 for 21:9) is chrome-independent.
export const LAYOUT_PORTRAIT_MAX_ASPECT = 0.9;
export const LAYOUT_WIDE_MIN_MONITOR_ASPECT = 2.1;

export function resolveLayoutKey(viewportWidth, viewportHeight, screenWidth, screenHeight) {
  const viewportAspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;

  if (viewportAspect < LAYOUT_PORTRAIT_MAX_ASPECT) {
    return 'portrait';
  }

  const sw = screenWidth || viewportWidth;
  const sh = screenHeight || viewportHeight;
  const monitorAspect = (sw > 0 && sh > 0)
    ? Math.max(sw, sh) / Math.min(sw, sh)
    : viewportAspect;

  if (monitorAspect >= LAYOUT_WIDE_MIN_MONITOR_ASPECT) {
    return 'wide';
  }
  return 'desktop';
}

// Uncustomised buckets inherit the desktop composition so the scene is never empty.
export function resolveLayout(layouts, key) {
  if (!layouts) {
    return null;
  }

  const chosen = layouts[key];
  if (chosen && chosen.customized) {
    return chosen;
  }

  return layouts.desktop ?? chosen ?? null;
}
