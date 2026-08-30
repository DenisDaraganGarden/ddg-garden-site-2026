export const SEAGULL_SHADOW_LOD = Object.freeze({
  maximumDesktopCasters: 2,
  maximumLabCasters: 3,
  maximumAirborneHeightMeters: 2.6,
  receiverRadiusMeters: 4.5,
  updateIntervalSeconds: 0.18,
});

const LANDING_PRIORITY = Object.freeze({
  perched: 0,
  settle: 0.08,
  takeoff: 0.16,
  flare: 0.26,
  approach: 0.38,
});

const DOWNED_PRIORITY = Object.freeze({
  resting: 0.04,
  sliding: 0.12,
  water: 0.18,
  falling: 0.34,
  'hit-stun': 0.38,
});

function finitePosition(position) {
  return position
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z);
}

function distanceToReceiver(position, receiverPoints) {
  if (receiverPoints.length === 0) return 0;
  let distanceSquared = Infinity;
  for (const point of receiverPoints) {
    if (!finitePosition(point)) continue;
    const dx = position.x - point.x;
    const dy = position.y - point.y;
    const dz = position.z - point.z;
    distanceSquared = Math.min(distanceSquared, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(distanceSquared);
}

function statePriority(agent) {
  if (agent.shotState && DOWNED_PRIORITY[agent.shotState] !== undefined) {
    return DOWNED_PRIORITY[agent.shotState];
  }
  if (LANDING_PRIORITY[agent.landingState] !== undefined) {
    return LANDING_PRIORITY[agent.landingState];
  }
  if (agent.route === 'waterline') return 0.72;
  return 1;
}

export function resolveSeagullShadowCasters(agents, {
  enabled = true,
  isLowPower = false,
  isMobile = false,
  waterY = 0,
  maxCasters = SEAGULL_SHADOW_LOD.maximumDesktopCasters,
  maximumAirborneHeight = SEAGULL_SHADOW_LOD.maximumAirborneHeightMeters,
  receiverPoints = [],
  receiverRadius = SEAGULL_SHADOW_LOD.receiverRadiusMeters,
  previousCasterIds = new Set(),
} = {}) {
  if (!enabled || isLowPower || isMobile || maxCasters <= 0) return new Set();

  const stablePreviousIds = previousCasterIds instanceof Set
    ? previousCasterIds
    : new Set(previousCasterIds);
  const candidates = [];

  for (const agent of agents ?? []) {
    if (!finitePosition(agent?.position) || agent.shotState === 'removed') continue;
    const id = agent.index ?? agent.id;
    if (id === undefined || id === null) continue;

    const height = Math.max(0, agent.position.y - waterY);
    const landingPriority = LANDING_PRIORITY[agent.landingState];
    const downedPriority = DOWNED_PRIORITY[agent.shotState];
    const isSurfaceState = landingPriority !== undefined || downedPriority !== undefined;
    if (!isSurfaceState && height > maximumAirborneHeight) continue;

    const receiverDistance = distanceToReceiver(agent.position, receiverPoints);
    if (
      receiverPoints.length > 0
      && !isSurfaceState
      && (!Number.isFinite(receiverDistance) || receiverDistance > receiverRadius)
    ) continue;

    const retainedBias = stablePreviousIds.has(id) ? -0.32 : 0;
    candidates.push({
      id,
      score: statePriority(agent)
        + height * 0.18
        + receiverDistance * 0.045
        + retainedBias,
    });
  }

  candidates.sort((left, right) => {
    const scoreDelta = left.score - right.score;
    if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
    return String(left.id).localeCompare(String(right.id), 'en', { numeric: true });
  });

  return new Set(candidates.slice(0, Math.floor(maxCasters)).map(({ id }) => id));
}
