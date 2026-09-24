// The surfboard: one object, its shape, its weight, and the checkpoint it
// waits at in the editor and comes back to in play. All of it is global to the
// scene, not per camera: a spawn point that moved when the camera changed would
// be a trap (sceneCameras.js keeps these out of the snapshots).
export const DEFAULT_SURFBOARD_SETTINGS = Object.freeze({
  surfboardEnabled: false,
  // The checkpoint. While «auto» is on the board waits just seaward of the
  // break line in the middle of the crest; placing it by hand turns auto off.
  surfboardCheckpointAuto: true,
  surfboardCheckpointX: 0, surfboardCheckpointZ: 0, surfboardCheckpointYaw: 0,
  // A 5'10" × 19¾" × 2⅜" shortboard, metres.
  surfboardLength: 1.78, surfboardWidth: 0.5, surfboardThickness: 0.062,
  surfboardNoseRocker: 0.115, surfboardTailRocker: 0.045,
  surfboardDeckColor: '#f2efe6', surfboardRailColor: '#2a2e2e', surfboardStripeColor: '#0b0b0b',
  surfboardStringerColor: '#c9a46a', surfboardFinColor: '#2b2d2e', surfboardStripes: 2,
  // Weight and feel.
  surfboardMass: 3.2, surfboardRiderMass: 75,
  // How the rider shows in play: the man (riderBody.js), the physics bones as
  // wooden sticks (RiderModel), or the man see-through with the sticks inside.
  surfboardRiderLook: 'human',
  surfboardPaddle: 1, surfboardCarve: 1, surfboardBalance: 1,
  // First-person field of view in play.
  surfboardCameraFov: 80,
  // What it leaves on the water in play: the rings of small waves (its V, the
  // hands, the splashes) and the foam off its tail, 1 as tuned, 0 for none.
  surfboardWakeWaves: 1, surfboardWakeFoam: 1,
});

export const SURFBOARD_RANGES = Object.freeze({
  surfboardCheckpointX: [-5000, 5000, 0.1], surfboardCheckpointZ: [-5000, 5000, 0.1], surfboardCheckpointYaw: [-180, 180, 1],
  surfboardLength: [1.5, 3.2, 0.01], surfboardWidth: [0.4, 0.62, 0.005], surfboardThickness: [0.045, 0.09, 0.001],
  surfboardNoseRocker: [0.04, 0.2, 0.005], surfboardTailRocker: [0.015, 0.1, 0.005],
  surfboardStripes: [0, 3, 1],
  surfboardMass: [1.5, 8, 0.1], surfboardRiderMass: [0, 120, 1],
  surfboardPaddle: [0, 3, 0.05], surfboardCarve: [0.2, 3, 0.05], surfboardBalance: [0, 2, 0.05],
  surfboardCameraFov: [50, 110, 1],
  surfboardWakeWaves: [0, 2, 0.05], surfboardWakeFoam: [0, 2, 0.05],
});

export const SURFBOARD_CHOICES = Object.freeze({ surfboardRiderLook: Object.freeze(['human', 'skeleton', 'both']) });

const COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeSurfboardSettings(source = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_SURFBOARD_SETTINGS).map(([key, fallback]) => {
    const value = source[key];
    if (typeof fallback === 'boolean') return [key, typeof value === 'boolean' ? value : fallback];
    if (key in SURFBOARD_CHOICES) return [key, SURFBOARD_CHOICES[key].includes(value) ? value : fallback];
    if (typeof fallback === 'string') return [key, typeof value === 'string' && COLOR.test(value) ? value : fallback];
    const number = Number(value), [min, max] = SURFBOARD_RANGES[key];
    const clamped = value != null && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    return [key, key === 'surfboardStripes' ? Math.round(clamped) : clamped];
  }));
}
