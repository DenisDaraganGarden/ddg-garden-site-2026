export const SEAGULL_REFLECTION_LOD = Object.freeze({
  maximumHighParticipants: 3,
  maximumMediumParticipants: 2,
  maximumLabParticipants: 3,
  maximumPhysicalHeightMeters: 16,
  minimumScreenPixels: 4,
  updateIntervalSeconds: 0.18,
  retainedBias: 0.12,
});

const ROUTE_WEIGHT = Object.freeze({
  waterline: 1.12,
  flock: 0.72,
  long: 0.5,
  high: 0,
});

const LANDING_WEIGHT = Object.freeze({
  perched: 1.28,
  settle: 1.22,
  takeoff: 1.15,
  flare: 1.08,
  approach: 1,
  rejoin: 0.78,
});

const DOWNED_WEIGHT = Object.freeze({
  resting: 1.24,
  sliding: 1.18,
  water: 1.08,
  falling: 0.9,
  'hit-stun': 1,
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0, edge1, value) {
  const progress = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function finiteVector(vector) {
  return vector
    && Number.isFinite(vector.x)
    && Number.isFinite(vector.y)
    && Number.isFinite(vector.z);
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function emptyResult() {
  return {
    participantIds: new Set(),
    dynamic: false,
    decisions: [],
  };
}

function participantLimit(quality, explicitMaximum) {
  if (Number.isFinite(explicitMaximum)) {
    return Math.max(0, Math.floor(explicitMaximum));
  }
  if (quality === 'medium') return SEAGULL_REFLECTION_LOD.maximumMediumParticipants;
  return SEAGULL_REFLECTION_LOD.maximumHighParticipants;
}

function stateWeight(agent) {
  if (agent.shotState && DOWNED_WEIGHT[agent.shotState] !== undefined) {
    return DOWNED_WEIGHT[agent.shotState];
  }
  if (LANDING_WEIGHT[agent.landingState] !== undefined) {
    return LANDING_WEIGHT[agent.landingState];
  }
  return ROUTE_WEIGHT[agent.route] ?? 0.62;
}

export function measureSeagullReflection(agent, {
  camera,
  viewport,
  waterY = 0,
} = {}) {
  if (
    !finiteVector(agent?.position)
    || !finiteVector(camera?.position)
    || !finiteVector(camera?.forward)
    || !finiteVector(camera?.right)
    || !finiteVector(camera?.up)
    || !Number.isFinite(viewport?.height)
    || viewport.height <= 0
  ) return null;

  const mirroredPosition = {
    x: agent.position.x,
    y: (waterY * 2) - agent.position.y,
    z: agent.position.z,
  };
  const offset = {
    x: mirroredPosition.x - camera.position.x,
    y: mirroredPosition.y - camera.position.y,
    z: mirroredPosition.z - camera.position.z,
  };
  const depth = dot(offset, camera.forward);
  const near = Number.isFinite(camera.near) ? camera.near : 0.02;
  const far = Number.isFinite(camera.far) ? camera.far : 100;
  if (!Number.isFinite(depth) || depth <= near || depth >= far) return null;

  const zoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, 1e-4);
  const fovDegrees = Number.isFinite(camera.fovDegrees) ? camera.fovDegrees : 50;
  const tangent = Math.tan((fovDegrees * Math.PI) / 360) / zoom;
  const aspect = Math.max(Number.isFinite(camera.aspect) ? camera.aspect : 1, 1e-4);
  if (!Number.isFinite(tangent) || tangent <= 0) return null;

  const ndcX = dot(offset, camera.right) / (depth * tangent * aspect);
  const ndcY = dot(offset, camera.up) / (depth * tangent);
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;

  const radiusWorld = Math.max(
    Number.isFinite(agent.reflectionRadiusWorld)
      ? agent.reflectionRadiusWorld
      : (Number.isFinite(agent.modelScale) ? agent.modelScale : 1) * 0.27,
    0.01,
  );
  const screenPixels = radiusWorld * viewport.height / (depth * tangent);
  if (!Number.isFinite(screenPixels)) return null;

  return {
    depth,
    ndcX,
    ndcY,
    screenPixels,
  };
}

export function resolveSeagullReflectionParticipants(agents, {
  enabled = true,
  quality = 'high',
  isLowPower = false,
  isMobile = false,
  maxParticipants,
  maximumPhysicalHeight = SEAGULL_REFLECTION_LOD.maximumPhysicalHeightMeters,
  camera,
  viewport,
  waterY = 0,
  previousParticipantIds = new Set(),
} = {}) {
  const maximum = participantLimit(quality, maxParticipants);
  if (!enabled || isLowPower || isMobile || maximum <= 0) return emptyResult();

  const previousIds = previousParticipantIds instanceof Set
    ? previousParticipantIds
    : new Set(previousParticipantIds);
  const candidates = [];

  for (const agent of agents ?? []) {
    const id = agent?.index ?? agent?.id;
    if (id === undefined || id === null || agent.shotState === 'removed') continue;
    if (agent.route === 'high') continue;

    const physicalHeight = Number.isFinite(agent.physicalHeight)
      ? Math.max(0, agent.physicalHeight)
      : Math.max(0, agent.position?.y - waterY);
    if (physicalHeight > maximumPhysicalHeight) continue;

    const projection = measureSeagullReflection(agent, { camera, viewport, waterY });
    if (!projection) continue;
    if (
      Math.abs(projection.ndcX) > 1.15
      || Math.abs(projection.ndcY) > 1.15
      || projection.screenPixels < SEAGULL_REFLECTION_LOD.minimumScreenPixels
    ) continue;

    const heightFactor = 1 - smoothstep(4, maximumPhysicalHeight, physicalHeight);
    const pixelFactor = smoothstep(
      SEAGULL_REFLECTION_LOD.minimumScreenPixels,
      22,
      projection.screenPixels,
    );
    const centreFactor = 1 - 0.35 * clamp(
      Math.max(Math.abs(projection.ndcX), Math.abs(projection.ndcY)),
      0,
      1,
    );
    const score = stateWeight(agent)
      * (0.22 + heightFactor * 0.78)
      * (0.18 + pixelFactor * 0.82)
      * centreFactor
      + (previousIds.has(id) ? SEAGULL_REFLECTION_LOD.retainedBias : 0);

    candidates.push({
      id,
      score,
      physicalHeight,
      screenPixels: projection.screenPixels,
    });
  }

  candidates.sort((left, right) => {
    const scoreDelta = right.score - left.score;
    if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
    return String(left.id).localeCompare(String(right.id), 'en', { numeric: true });
  });

  const selected = candidates.slice(0, maximum);
  return {
    participantIds: new Set(selected.map(({ id }) => id)),
    dynamic: selected.length > 0,
    decisions: candidates.map((candidate) => ({
      ...candidate,
      reflectInRealtime: selected.some(({ id }) => id === candidate.id),
    })),
  };
}
