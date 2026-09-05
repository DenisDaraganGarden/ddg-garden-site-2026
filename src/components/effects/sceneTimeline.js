// R3F stops and restarts its THREE.Clock when frameloop changes. The scene's
// shaders use clock.elapsedTime as their common clock, so retain an active-time
// clock here: hidden time never advances and a resumed renderer cannot rewind
// waves, wakes or procedural motion back to zero.
export function createSceneTimeline(initialElapsed = 0, initialActive = true) {
  let elapsed = Number.isFinite(initialElapsed) ? Math.max(0, initialElapsed) : 0;
  let active = Boolean(initialActive);
  let discardNextDelta = false;

  return {
    setActive(nextActive) {
      const next = Boolean(nextActive);
      if (next === active) return elapsed;
      active = next;
      // Depending on platform and R3F version, the first delta after restarting
      // can be zero or the whole hidden interval. Neither belongs to active time.
      if (active) discardNextDelta = true;
      return elapsed;
    },
    advance(delta) {
      if (!active) return elapsed;
      if (discardNextDelta) {
        discardNextDelta = false;
        return elapsed;
      }
      if (Number.isFinite(delta) && delta > 0) elapsed += delta;
      return elapsed;
    },
    get elapsed() {
      return elapsed;
    },
  };
}
