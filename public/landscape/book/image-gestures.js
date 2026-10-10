// The document keeps its scale. Only a full-size photograph consumes a pinch.
export function blockPagePinch(target = document) {
  let multiple = false;
  const options = { capture: true, passive: false };
  target.addEventListener('touchstart', event => {
    if (event.touches.length > 1) multiple = true;
    if (multiple) event.preventDefault();
  }, options);
  target.addEventListener('touchmove', event => {
    if (multiple || event.touches.length > 1) event.preventDefault();
  }, options);
  const release = event => { if (!event.touches.length) multiple = false; };
  target.addEventListener('touchend', release, options);
  target.addEventListener('touchcancel', release, options);
  for (const type of ['gesturestart', 'gesturechange']) {
    target.addEventListener(type, event => event.preventDefault(), options);
  }
}

export function connectImageZoom(element, { enabled, change, start = () => {}, bounds, tap }) {
  const points = new Map();
  let state = { scale: 1, x: 0, y: 0 }, baseline = null, consumed = false, suppressUntil = 0, contact = null;
  const midpoint = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
  const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  const local = event => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  };
  const seed = () => {
    const values = [...points.values()];
    baseline = values.length > 1 ? { ...state, point: midpoint(values), distance: Math.max(1, distance(values)) }
      : values.length ? { ...state, point: values[0] } : null;
  };
  const apply = next => {
    if (next.scale <= 1) { state = { scale: 1, x: 0, y: 0 }; change({ ...state }); return; }
    const rect = element.getBoundingClientRect();
    const limit = bounds?.(next.scale, rect) || { x: rect.width * (next.scale - 1) / 2, y: rect.height * (next.scale - 1) / 2 };
    state = { scale: next.scale, x: Math.max(-limit.x, Math.min(limit.x, next.x)), y: Math.max(-limit.y, Math.min(limit.y, next.y)) };
    change({ ...state });
  };
  const take = event => {
    event.preventDefault(); event.stopImmediatePropagation();
    suppressUntil = performance.now() + 450;
  };
  element.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !enabled()) return;
    points.set(event.pointerId, local(event));
    if (points.size === 1) contact = { ...local(event), moved: 0, pinched: false };
    else if (contact) contact.pinched = true;
    if (points.size > 1 || state.scale > 1.01) {
      if (!consumed) start();
      consumed = true;
      for (const id of points.keys()) element.setPointerCapture(id);
      take(event);
    }
    seed();
  }, true);
  element.addEventListener('pointermove', event => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, local(event));
    if (contact) contact.moved = Math.max(contact.moved, Math.hypot(local(event).x - contact.x, local(event).y - contact.y));
    if (!consumed || !baseline || !enabled()) return;
    const values = [...points.values()];
    if (values.length > 1) {
      const point = midpoint(values), scale = Math.max(1, Math.min(4, baseline.scale * distance(values) / baseline.distance));
      const ratio = scale / baseline.scale;
      apply({ scale, x: point.x - (baseline.point.x - baseline.x) * ratio, y: point.y - (baseline.point.y - baseline.y) * ratio });
    } else {
      apply({ scale: state.scale, x: baseline.x + values[0].x - baseline.point.x, y: baseline.y + values[0].y - baseline.point.y });
    }
    take(event);
  }, true);
  const release = event => {
    if (!points.has(event.pointerId)) return;
    points.delete(event.pointerId);
    const wasConsumed = consumed;
    const tapped = Boolean(tap) && !points.size && event.type === 'pointerup' && contact && !contact.pinched && contact.moved <= 6;
    if (consumed || tapped) take(event);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (!points.size) { consumed = false; contact = null; }
    seed();
    if (tapped) { if (!wasConsumed) start(); tap(); }
  };
  for (const type of ['pointerup', 'pointercancel']) element.addEventListener(type, release, true);
  // Closing a modal can retarget the touch's final click to the image below.
  element.ownerDocument.addEventListener('pointerdown', () => {
    if (!points.size) suppressUntil = 0;
  }, true);
  element.ownerDocument.addEventListener('click', event => {
    if (performance.now() < suppressUntil) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressUntil = 0;
    }
  }, true);
  return {
    getState: () => ({ ...state }),
    reset() {
      const ids = [...points.keys()]; points.clear(); baseline = null; consumed = false; contact = null;
      for (const id of ids) if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      apply({ scale: 1, x: 0, y: 0 });
    }
  };
}
