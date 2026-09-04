export const KNOTS_TO_METERS_PER_SECOND = 1852 / 3600;

export function sampleTankerMotion(time, { speedKnots = 8, heading = 0, seaState = 0.3, travel = true, phase = 0 } = {}) {
  const knots = Math.max(0, Number.isFinite(speedKnots) ? speedKnots : 0);
  const speed = knots * KNOTS_TO_METERS_PER_SECOND;
  const angle = heading * Math.PI / 180;
  const t = time + phase;
  // A heavy displacement hull answers long swells slowly. Rocking is unrelated
  // to frame rate; the navigation path is a straight course in physical metres.
  return {
    x: travel ? Math.cos(angle) * time * speed : 0,
    y: seaState * (Math.sin(t * 0.47) * 0.32 + Math.sin(t * 0.73 + 0.7) * 0.1),
    z: travel ? -Math.sin(angle) * time * speed : 0,
    yaw: angle,
    roll: seaState * Math.sin(t * 0.39 + 0.6) * 0.026,
    pitch: seaState * Math.sin(t * 0.53) * 0.012,
    speed,
    rpm: 55 + Math.pow(knots / 14, 0.7) * 90,
    wake: Math.min(1, speed / 6),
  };
}

export function getTankerAcoustics({ distance, speedKnots = 8, radialVelocity = 0, masterGain = 0.72, spatialGain = 0.92, ambienceGain = 0.78, trackGain = 0.65, enabled = true, spatialEnabled = true }) {
  const metres = Math.max(0, distance);
  return {
    gain: enabled ? masterGain * ambienceGain * spatialGain * trackGain : 0,
    distanceGain: spatialEnabled ? 45 / Math.max(45, metres) : 1,
    // High frequencies disappear first across the water; avoid a close diesel
    // sounding equally detailed when the source moves to the horizon.
    cutoff: spatialEnabled ? 160 + 6200 * Math.exp(-metres / 280) : 6360,
    doppler: Math.min(1.08, Math.max(0.92, 343 / (343 + radialVelocity))),
    fundamental: (55 + Math.pow(Math.max(0, speedKnots) / 14, 0.7) * 90) / 60 * 6,
  };
}
