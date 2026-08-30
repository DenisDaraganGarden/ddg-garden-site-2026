import * as THREE from 'three';
import { FISH_CATALOG } from './fishCatalog.js';

// Cursor interaction is deliberately screen-led. A ray is built once for the
// cursor, then every visible fish is measured against that line; there is no
// raycast against fish geometry, water or scene props.
export const FISH_POINTER_LAW = Object.freeze({
  minimumVisibleBodyPixels: 4,
  cursorRadiusPixels: [20, 78],
  hoverDwellSeconds: 0.075,
  waveCooldownSeconds: 0.72,
  waveSpeedMetersPerSecond: 2.7,
  waveRangeMeters: 2.65,
  waveMemorySeconds: 1.55,
  directResponseMetersPerSecond: 1.2,
  propagatedResponseMetersPerSecond: 0.9,
});

const X_AXIS = new THREE.Vector3(1, 0, 0);
const scratchCameraSpace = new THREE.Vector3();
const scratchProjected = new THREE.Vector3();
const scratchClosestRayPoint = new THREE.Vector3();
const scratchToFish = new THREE.Vector3();
const scratchFallback = new THREE.Vector3();
const pointerRaycaster = new THREE.Raycaster();

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth01 = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function worldUnitsPerPixel(camera, viewportHeight, depth) {
  if (!camera || viewportHeight <= 0 || depth <= 0) return Infinity;
  if (camera.isPerspectiveCamera) {
    const fov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
    return (2 * depth * Math.tan(fov * 0.5)) / viewportHeight;
  }
  if (camera.isOrthographicCamera) {
    return Math.abs(camera.top - camera.bottom) / (Math.max(camera.zoom, 1e-6) * viewportHeight);
  }
  return Infinity;
}

function createSample() {
  return {
    influence: 0,
    visibleBodyPixels: 0,
    screenDistancePixels: Infinity,
    interactionRadiusPixels: 0,
    depth: Infinity,
    away: new THREE.Vector3(1, -0.16, 0).normalize(),
  };
}

function resetSample(sample) {
  sample.influence = 0;
  sample.visibleBodyPixels = 0;
  sample.screenDistancePixels = Infinity;
  sample.interactionRadiusPixels = 0;
  sample.depth = Infinity;
  return sample;
}

function ensureAgentFields(agent) {
  agent.cursorSample ??= createSample();
  agent.cursorAvoidance ??= new THREE.Vector3(1, -0.16, 0).normalize();
  agent.cursorInfluence ??= 0;
  agent.cursorWaveInfluence ??= 0;
  agent.cursorStartleCount ??= 0;
  // Public hand-off contract for fishBehavior. Keeping these generic fields
  // means the simulation can own force integration and panic propagation
  // without the pointer layer reaching into its solver.
  agent.pointerThreat ??= 0;
  agent.pointerAway ??= new THREE.Vector3(1, -0.16, 0).normalize();
  agent.pointerDirect ??= 0;
  agent.pointerDistancePx ??= Infinity;
}

export function createFishCursorInteractionState() {
  return {
    activeId: null,
    hoverSeconds: 0,
    cooldown: 0,
    waveOrigin: new THREE.Vector3(),
    waveDirection: new THREE.Vector3(1, -0.18, 0).normalize(),
    waveStartedAt: -Infinity,
    waveCount: 0,
    directTargets: 0,
    propagatedTargets: 0,
    focusId: null,
    focusInfluence: 0,
  };
}

// Returns the strongest screen-space fish but stores the soft field on every
// agent. The screen radius grows with projected body size and therefore tracks
// both camera FOV and depth naturally.
export function sampleFishCursorField(agents, camera, viewport, pointerNdc, pointerActive) {
  let focus = null;
  let strongest = 0;
  if (!camera || !pointerNdc?.isVector2 || viewport.width <= 0 || viewport.height <= 0) {
    return { focus, strongest };
  }

  if (pointerActive) pointerRaycaster.setFromCamera(pointerNdc, camera);
  const ray = pointerRaycaster.ray;
  for (const agent of agents) {
    ensureAgentFields(agent);
    const sample = resetSample(agent.cursorSample);
    scratchCameraSpace.copy(agent.position).applyMatrix4(camera.matrixWorldInverse);
    const depth = -scratchCameraSpace.z;
    if (depth <= Math.max(camera.near, 0.001) || depth >= camera.far) continue;
    const unitsPerPixel = worldUnitsPerPixel(camera, viewport.height, depth);
    if (!Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0) continue;

    const length = FISH_CATALOG[agent.species]?.length ?? 0.2;
    sample.depth = depth;
    sample.visibleBodyPixels = (length * (agent.scale ?? 1)) / unitsPerPixel;
    if (sample.visibleBodyPixels < FISH_POINTER_LAW.minimumVisibleBodyPixels) continue;

    scratchProjected.copy(agent.position).project(camera);
    if (
      scratchProjected.z < -1 || scratchProjected.z > 1
      || Math.abs(scratchProjected.x) > 1.08 || Math.abs(scratchProjected.y) > 1.08
    ) continue;

    const deltaX = (scratchProjected.x - pointerNdc.x) * viewport.width * 0.5;
    const deltaY = (scratchProjected.y - pointerNdc.y) * viewport.height * 0.5;
    sample.screenDistancePixels = Math.hypot(deltaX, deltaY);
    const [minimumRadius, maximumRadius] = FISH_POINTER_LAW.cursorRadiusPixels;
    sample.interactionRadiusPixels = THREE.MathUtils.clamp(
      12 + sample.visibleBodyPixels * 0.7,
      minimumRadius,
      maximumRadius,
    );
    if (!pointerActive) continue;

    sample.influence = smooth01(1 - sample.screenDistancePixels / sample.interactionRadiusPixels);
    if (sample.influence <= 0) continue;

    const rayDistance = Math.max(0, scratchToFish.copy(agent.position).sub(ray.origin).dot(ray.direction));
    ray.at(rayDistance, scratchClosestRayPoint);
    sample.away.subVectors(agent.position, scratchClosestRayPoint);
    // A cursor directly over the projected centre has no lateral vector. Keep
    // the escape readable by choosing the opposite heading, then a stable axis.
    if (sample.away.lengthSq() < 1e-7) {
      scratchFallback.copy(agent.velocity).multiplyScalar(-1);
      if (scratchFallback.lengthSq() < 1e-7) scratchFallback.copy(X_AXIS);
      sample.away.copy(scratchFallback);
    }
    sample.away.y = Math.min(sample.away.y * 0.42, -0.12);
    sample.away.normalize();
    if (sample.influence > strongest) {
      strongest = sample.influence;
      focus = agent;
    }
  }
  return { focus, strongest };
}

function startWave(state, focus, camera, elapsed) {
  state.waveOrigin.copy(focus.position);
  state.waveDirection.copy(focus.cursorSample.away);
  if (state.waveDirection.lengthSq() < 1e-7) {
    state.waveDirection.subVectors(focus.position, camera.position);
    state.waveDirection.y = -Math.abs(state.waveDirection.y) * 0.22;
  }
  if (state.waveDirection.lengthSq() < 1e-7) state.waveDirection.set(1, -0.18, 0);
  state.waveDirection.normalize();
  state.waveStartedAt = elapsed;
  state.waveCount += 1;
  state.cooldown = FISH_POINTER_LAW.waveCooldownSeconds;
  focus.cursorStartleCount += 1;
}

// Writes a soft, delayed threat field after fishBehavior's regular solve. The
// behavior module consumes pointerThreat/pointerAway on its next tick, so this
// layer does not compete with its force integration.
export function advanceFishCursorResponse(agents, state, elapsed, delta, camera) {
  const safeDelta = Math.min(Math.max(delta, 0), 0.05);
  const { focus, strongest } = sampleFishCursorField(
    agents,
    camera,
    state.viewport,
    state.pointerNdc,
    state.pointerActive,
  );
  state.focusId = focus?.id ?? null;
  state.focusInfluence = strongest;
  state.cooldown = Math.max(0, state.cooldown - safeDelta);

  if (!state.pointerActive || !focus || strongest < 0.025) {
    state.activeId = null;
    state.hoverSeconds = 0;
  } else if (state.activeId === focus.id) {
    state.hoverSeconds += safeDelta * strongest;
  } else {
    state.activeId = focus.id;
    state.hoverSeconds = safeDelta * strongest;
  }

  if (
    focus
    && state.hoverSeconds >= FISH_POINTER_LAW.hoverDwellSeconds
    && state.cooldown <= 0
  ) {
    startWave(state, focus, camera, elapsed);
    state.hoverSeconds = 0;
  }

  const waveAge = elapsed - state.waveStartedAt;
  state.directTargets = 0;
  state.propagatedTargets = 0;
  for (const agent of agents) {
    ensureAgentFields(agent);
    const direct = agent.cursorSample.influence;
    agent.cursorInfluence = THREE.MathUtils.damp(
      agent.cursorInfluence,
      direct,
      direct > agent.cursorInfluence ? 14 : 5,
      safeDelta,
    );
    agent.pointerDirect = agent.cursorInfluence;
    agent.pointerDistancePx = agent.cursorSample.screenDistancePixels;
    if (agent.cursorInfluence > 0.008) {
      agent.cursorAvoidance.lerp(agent.cursorSample.away, 1 - Math.exp(-safeDelta * 13)).normalize();
      agent.pointerAway.lerp(agent.cursorAvoidance, 1 - Math.exp(-safeDelta * 13)).normalize();
      state.directTargets += 1;
    }

    let waveInfluence = 0;
    if (waveAge >= 0 && waveAge <= FISH_POINTER_LAW.waveMemorySeconds) {
      const distance = agent.position.distanceTo(state.waveOrigin);
      const arrival = distance / FISH_POINTER_LAW.waveSpeedMetersPerSecond;
      const sinceArrival = waveAge - arrival;
      if (distance <= FISH_POINTER_LAW.waveRangeMeters && sinceArrival >= 0) {
        const rise = smooth01(sinceArrival / 0.105);
        const decay = Math.exp(-sinceArrival * 1.85);
        const reach = smooth01(1 - distance / FISH_POINTER_LAW.waveRangeMeters);
        waveInfluence = rise * decay * reach;
        scratchToFish.subVectors(agent.position, state.waveOrigin);
        if (scratchToFish.lengthSq() < 1e-7) scratchToFish.copy(state.waveDirection);
        else scratchToFish.normalize();
        scratchToFish.lerp(state.waveDirection, 0.34).normalize();
        scratchToFish.y = Math.min(scratchToFish.y * 0.38, -0.1);
        scratchToFish.normalize();
        if (waveInfluence > agent.cursorInfluence * 0.35) {
          agent.pointerAway.lerp(scratchToFish, 1 - Math.exp(-safeDelta * 10)).normalize();
        }
        if (waveInfluence > 0.012) state.propagatedTargets += 1;
      }
    }
    agent.cursorWaveInfluence = THREE.MathUtils.damp(agent.cursorWaveInfluence, waveInfluence, 12, safeDelta);
    const targetThreat = Math.max(agent.cursorInfluence, agent.cursorWaveInfluence);
    agent.pointerThreat = THREE.MathUtils.damp(
      agent.pointerThreat,
      targetThreat,
      targetThreat > agent.pointerThreat ? 16 : 4,
      safeDelta,
    );
  }

  return {
    focusId: state.focusId,
    focusInfluence: state.focusInfluence,
    directTargets: state.directTargets,
    propagatedTargets: state.propagatedTargets,
    waveCount: state.waveCount,
    waveAge: Number.isFinite(waveAge) ? Math.max(0, waveAge) : null,
  };
}
