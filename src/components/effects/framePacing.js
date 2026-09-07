// A frame-rate limit must stop the whole R3F frame, not merely skip the final
// draw. This small scheduler is platform-neutral so its timing behaviour can be
// checked without a browser or WebGL context.
export const FRAME_RATE_LIMITS = Object.freeze([0, 30, 40, 60, 120]);

export function normalizeFrameRateLimit(value, fallback = 0) {
  const numeric = Number(value);
  return FRAME_RATE_LIMITS.includes(numeric) ? numeric : fallback;
}

export function createFramePacer({
  limit,
  requestFrame,
  cancelFrame,
  onFrame,
}) {
  const frameInterval = 1000 / normalizeFrameRateLimit(limit);
  let requestId = null;
  let lastFrameAt = null;
  let nextFrameAt = null;
  let active = false;

  const schedule = () => {
    if (active) requestId = requestFrame(tick);
  };

  const tick = (now) => {
    requestId = null;
    if (!active) return;

    // A freshly visible/capped canvas needs one draw, but it must not advance
    // its simulation by the time it spent hidden or reconfiguring.
    if (lastFrameAt === null) {
      lastFrameAt = now;
      nextFrameAt = now + frameInterval;
      onFrame({ now, deltaSeconds: 0 });
    } else if (now + 0.25 >= nextFrameAt) {
      // Retain the deadline's phase: 40 FPS on a 60 Hz display needs alternating
      // one/two refresh intervals. Resetting the deadline to now would lock it
      // to 30 FPS. Skip missed deadlines without drawing catch-up frames.
      const deltaSeconds = Math.max(0, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      nextFrameAt += Math.max(1, Math.floor((now - nextFrameAt) / frameInterval) + 1) * frameInterval;
      onFrame({ now, deltaSeconds });
    }

    schedule();
  };

  return {
    start() {
      if (active) return;
      active = true;
      lastFrameAt = null;
      nextFrameAt = null;
      schedule();
    },
    stop() {
      active = false;
      lastFrameAt = null;
      nextFrameAt = null;
      if (requestId !== null) cancelFrame(requestId);
      requestId = null;
    },
  };
}
