const finite = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const BOAT_WAKE_INTERVAL = 0.18;

export const BOAT_DYNAMICS_CONFIG = Object.freeze({
  maxDelta: 0.05,
  maxStep: 1 / 120,
  targetResponse: Object.freeze({ heave: 6.2, pitch: 5.0, roll: 5.0 }),
  frequency: Object.freeze({ heave: 5.4, pitch: 4.35, roll: 4.15 }),
  dampingRatio: Object.freeze({ heave: 0.82, pitch: 0.68, roll: 0.66 }),
  externalEnergyDecay: 1.85,
  maximumVelocity: Object.freeze({ heave: 0.34, pitch: 0.62, roll: 0.72 }),
});

export function createBoatDynamicsState() {
  return {
    initialized: false,
    heave: 0,
    pitch: 0,
    roll: 0,
    heaveVelocity: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    filteredHeave: 0,
    filteredPitch: 0,
    filteredRoll: 0,
    externalEnergy: 0,
  };
}

export function resetBoatDynamicsState(state, pose = {}) {
  const heave = finite(pose.heave);
  const pitch = finite(pose.pitch);
  const roll = finite(pose.roll);
  state.initialized = true;
  state.heave = heave;
  state.pitch = pitch;
  state.roll = roll;
  state.heaveVelocity = 0;
  state.pitchVelocity = 0;
  state.rollVelocity = 0;
  state.filteredHeave = heave;
  state.filteredPitch = pitch;
  state.filteredRoll = roll;
  state.externalEnergy = 0;
  return state;
}

const dampTarget = (current, target, response, delta) => (
  current + (target - current) * (1 - Math.exp(-response * delta))
);

const integrateAxis = (state, key, velocityKey, target, frequency, dampingRatio, delta) => {
  const position = state[key];
  const velocity = state[velocityKey];
  const acceleration = (frequency * frequency * (target - position))
    - (2 * dampingRatio * frequency * velocity);
  state[velocityKey] = velocity + acceleration * delta;
  state[key] = position + state[velocityKey] * delta;
};

const clampAxis = (state, key, velocityKey, min, max) => {
  const clamped = clamp(state[key], min, max);
  if (clamped !== state[key]) {
    const movingOutward = (clamped === min && state[velocityKey] < 0)
      || (clamped === max && state[velocityKey] > 0);
    state[key] = clamped;
    if (movingOutward) state[velocityKey] = 0;
  }
};

export function applyBoatDynamicsImpulse(state, impulse = {}, config = BOAT_DYNAMICS_CONFIG) {
  state.heaveVelocity = clamp(
    state.heaveVelocity + finite(impulse.heaveVelocity),
    -config.maximumVelocity.heave,
    config.maximumVelocity.heave,
  );
  state.pitchVelocity = clamp(
    state.pitchVelocity + finite(impulse.pitchVelocity),
    -config.maximumVelocity.pitch,
    config.maximumVelocity.pitch,
  );
  state.rollVelocity = clamp(
    state.rollVelocity + finite(impulse.rollVelocity),
    -config.maximumVelocity.roll,
    config.maximumVelocity.roll,
  );
  state.externalEnergy = Math.max(
    state.externalEnergy,
    clamp(finite(impulse.energy), 0, 1),
  );
  return state;
}

export function resolveBoatImpact({
  boatX = 0,
  boatZ = 0,
  pointX = 0,
  pointZ = 0,
  strength = 0,
  radius = 1,
  source = 'cursor',
  boatYaw = 0,
} = {}) {
  const worldDeltaX = finite(boatX) - finite(pointX);
  const worldDeltaZ = finite(boatZ) - finite(pointZ);
  const distance = Math.hypot(worldDeltaX, worldDeltaZ);
  const safeRadius = Math.max(finite(radius, 1), 0.01);
  const linear = clamp(1 - distance / safeRadius, 0, 1);
  const proximity = linear * linear * (3 - 2 * linear);
  const sourceScale = source === 'gull-impact' ? 0.82 : 1;
  const energy = clamp(finite(strength) * proximity * sourceScale, 0, 1);
  const inverseDistance = distance > 1e-5 ? 1 / distance : 0;
  const directionWorldX = distance > 1e-5 ? worldDeltaX * inverseDistance : 0;
  const directionWorldZ = distance > 1e-5 ? worldDeltaZ * inverseDistance : 1;
  const yaw = finite(boatYaw);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const directionX = cosine * directionWorldX - sine * directionWorldZ;
  const directionZ = sine * directionWorldX + cosine * directionWorldZ;

  return {
    distance,
    proximity,
    energy,
    heaveVelocity: energy * 0.105,
    pitchVelocity: directionZ * energy * 0.34,
    rollVelocity: -directionX * energy * 0.42,
  };
}

export function resolveBoatWakeStrength(state) {
  if (!state || state.externalEnergy < 0.035) return 0;
  const motionEnergy = Math.abs(state.heaveVelocity) * 0.9
    + Math.hypot(state.pitchVelocity, state.rollVelocity) * 0.24;
  return clamp(state.externalEnergy * 0.11 + motionEnergy * 0.24, 0.035, 0.16);
}

export function stepBoatDynamics(
  state,
  target,
  delta,
  limits,
  config = BOAT_DYNAMICS_CONFIG,
) {
  const safeDelta = clamp(finite(delta), 0, config.maxDelta);
  if (!state.initialized) resetBoatDynamicsState(state, target);
  if (safeDelta <= 0) return state;

  state.filteredHeave = dampTarget(
    state.filteredHeave,
    finite(target.heave, state.filteredHeave),
    config.targetResponse.heave,
    safeDelta,
  );
  state.filteredPitch = dampTarget(
    state.filteredPitch,
    finite(target.pitch, state.filteredPitch),
    config.targetResponse.pitch,
    safeDelta,
  );
  state.filteredRoll = dampTarget(
    state.filteredRoll,
    finite(target.roll, state.filteredRoll),
    config.targetResponse.roll,
    safeDelta,
  );

  const steps = Math.max(1, Math.ceil(safeDelta / config.maxStep));
  const step = safeDelta / steps;
  for (let index = 0; index < steps; index += 1) {
    integrateAxis(
      state,
      'heave',
      'heaveVelocity',
      state.filteredHeave,
      config.frequency.heave,
      config.dampingRatio.heave,
      step,
    );
    integrateAxis(
      state,
      'pitch',
      'pitchVelocity',
      state.filteredPitch,
      config.frequency.pitch,
      config.dampingRatio.pitch,
      step,
    );
    integrateAxis(
      state,
      'roll',
      'rollVelocity',
      state.filteredRoll,
      config.frequency.roll,
      config.dampingRatio.roll,
      step,
    );
    state.externalEnergy *= Math.exp(-config.externalEnergyDecay * step);
  }

  state.heaveVelocity = clamp(
    state.heaveVelocity,
    -config.maximumVelocity.heave,
    config.maximumVelocity.heave,
  );
  state.pitchVelocity = clamp(
    state.pitchVelocity,
    -config.maximumVelocity.pitch,
    config.maximumVelocity.pitch,
  );
  state.rollVelocity = clamp(
    state.rollVelocity,
    -config.maximumVelocity.roll,
    config.maximumVelocity.roll,
  );
  clampAxis(state, 'heave', 'heaveVelocity', limits.heave[0], limits.heave[1]);
  clampAxis(state, 'pitch', 'pitchVelocity', limits.pitch[0], limits.pitch[1]);
  clampAxis(state, 'roll', 'rollVelocity', limits.roll[0], limits.roll[1]);
  return state;
}
