// Rendering LOD deliberately has no authority over the flight agents.  The
// same simulation, landing surfaces, collision tests and audio remain active;
// this module only decides which visual representation is worth drawing.
export const SEAGULL_RENDER_LOD = Object.freeze({
  spriteEnterPixels: 11,
  spriteExitPixels: 15,
  minimumSpriteDistanceMeters: 32,
  updateIntervalSeconds: 0.12,
  retainedBiasPixels: 1.5,
  visualRadiusMeters: 0.54,
});

function finiteVector(vector) {
  return vector
    && Number.isFinite(vector.x)
    && Number.isFinite(vector.y)
    && Number.isFinite(vector.z);
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function safeModes(previousModes) {
  return previousModes instanceof Map ? previousModes : new Map();
}

export function measureSeagullRenderSize(agent, { camera, viewport } = {}) {
  if (
    !finiteVector(agent?.position)
    || !finiteVector(camera?.position)
    || !finiteVector(camera?.forward)
    || !Number.isFinite(viewport?.height)
    || viewport.height <= 0
  ) return null;

  const offset = {
    x: agent.position.x - camera.position.x,
    y: agent.position.y - camera.position.y,
    z: agent.position.z - camera.position.z,
  };
  const depth = dot(offset, camera.forward);
  const near = Number.isFinite(camera.near) ? camera.near : 0.02;
  const far = Number.isFinite(camera.far) ? camera.far : Infinity;
  if (!Number.isFinite(depth) || depth <= near || depth >= far) return null;

  const zoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, 1e-4);
  const fovDegrees = Number.isFinite(camera.fovDegrees) ? camera.fovDegrees : 50;
  const tangent = Math.tan((fovDegrees * Math.PI) / 360) / zoom;
  if (!Number.isFinite(tangent) || tangent <= 0) return null;

  const scale = Number.isFinite(agent.modelScale) ? agent.modelScale : 1;
  const radius = Math.max(SEAGULL_RENDER_LOD.visualRadiusMeters * scale, 0.01);
  const pixels = radius * viewport.height / (depth * tangent);
  const distance = Math.hypot(offset.x, offset.y, offset.z);
  return Number.isFinite(pixels) && Number.isFinite(distance)
    ? { pixels, distance, depth }
    : null;
}

function mustKeepFull(agent) {
  // Perched, landing and downed birds need their actual skinned feet/body for
  // the authored contact and impact states. The sprite is flight-only.
  return agent?.shotState
    || agent?.landingState === 'perched'
    || agent?.landingState === 'settle'
    || agent?.landingState === 'takeoff'
    || agent?.landingState === 'flare'
    || agent?.landingState === 'approach';
}

export function resolveSeagullRenderLods(agents, options = {}) {
  const previous = safeModes(options.previousModes);
  const modes = new Map();
  const decisions = [];

  for (const agent of agents ?? []) {
    const id = agent?.index ?? agent?.id;
    if (id === undefined || id === null || agent?.shotState === 'removed') continue;
    const measurement = measureSeagullRenderSize(agent, options);
    const wasSprite = previous.get(id) === 'sprite';
    const keepFull = mustKeepFull(agent);
    const threshold = wasSprite
      ? SEAGULL_RENDER_LOD.spriteExitPixels + SEAGULL_RENDER_LOD.retainedBiasPixels
      : SEAGULL_RENDER_LOD.spriteEnterPixels;
    const useSprite = !keepFull
      && measurement
      && measurement.distance >= SEAGULL_RENDER_LOD.minimumSpriteDistanceMeters
      && measurement.pixels < threshold;
    const mode = useSprite ? 'sprite' : 'full';
    modes.set(id, mode);
    decisions.push({
      id,
      mode,
      pixels: measurement?.pixels ?? null,
      distance: measurement?.distance ?? null,
      retained: wasSprite && useSprite,
    });
  }

  return {
    modes,
    fullIds: new Set([...modes].filter(([, mode]) => mode === 'full').map(([id]) => id)),
    spriteIds: new Set([...modes].filter(([, mode]) => mode === 'sprite').map(([id]) => id)),
    decisions,
  };
}
