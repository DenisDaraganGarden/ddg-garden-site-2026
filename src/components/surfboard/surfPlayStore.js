// Play mode's live state, shared by the editor shell (keys, HUD) and the scene
// (board physics, play camera). Nothing here goes through settings: every
// setSettings snapshots the whole scene into the active camera and saves the
// project, so per-frame state lives in this one mutable object instead.
//
// Writers: the key handler writes `input`, `camera`, `look` and the request
// counters; the board writes `board`; HomeEdit writes `playing`. The scene
// reads it every frame; React reads only the throttled snapshot.

export const SURF_CAMERAS = Object.freeze(['chase', 'first', 'side', 'orbit']);

export const surfPlay = {
  playing: false,
  camera: 'chase',
  input: { forward: 0, back: 0, left: 0, right: 0, pop: false, pump: false },
  // Mouse look around the board, radians, and the orbit distance multiplier.
  look: { yaw: 0, pitch: 0, zoom: 1 },
  // Counters, not flags: the board answers when a counter changes, so a key
  // pressed twice between two frames is still two requests.
  respawnRequest: 0,
  checkpointRequest: 0,
  // The board's origin in the world (m), yaw in radians (three.js rotation.y),
  // its velocity (m/s) and its full rotation, for the play camera.
  board: {
    ready: false, x: 0, y: 0, z: 0, yaw: 0,
    speed: 0, planing: 0, onFace: false, airborne: false, wipeout: false,
    vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
    // The rider's posture from the physics (0 lying, 1 standing) and how much
    // of the board is on a breaker (0..1), for the eye and the HUD.
    riding: 0, onBreaker: 0,
  },
  // Where the board actually waits in the editor: the auto lineup spot or
  // the hand-placed checkpoint, x/z in metres, yaw in radians. The board
  // writes it every edit frame; leaving auto pins it (leaveAuto).
  home: null,
};

const listeners = new Set();
let snapshot = makeSnapshot();

function makeSnapshot() {
  const { board } = surfPlay;
  return {
    playing: surfPlay.playing,
    camera: surfPlay.camera,
    speed: board.speed,
    planing: board.planing,
    onFace: board.onFace,
    airborne: board.airborne,
    wipeout: board.wipeout,
    ready: board.ready,
  };
}

export const subscribeSurfPlay = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSurfPlaySnapshot = () => snapshot;

// Called by whoever changed something React shows: the key handler on a
// discrete change, the board at a few hertz.
export function publishSurfPlay() {
  snapshot = makeSnapshot();
  listeners.forEach((listener) => listener());
}

export function clearSurfInput() {
  const { input, look } = surfPlay;
  input.forward = 0; input.back = 0; input.left = 0; input.right = 0;
  input.pop = false; input.pump = false;
  look.yaw = 0; look.pitch = 0; look.zoom = 1;
}

export function setSurfPlaying(playing) {
  surfPlay.playing = playing;
  clearSurfInput();
  publishSurfPlay();
}

export function setSurfCamera(camera) {
  if (!SURF_CAMERAS.includes(camera)) return;
  surfPlay.camera = camera;
  surfPlay.look.yaw = 0; surfPlay.look.pitch = 0; surfPlay.look.zoom = 1;
  publishSurfPlay();
}

export const cycleSurfCamera = () => setSurfCamera(SURF_CAMERAS[(SURF_CAMERAS.indexOf(surfPlay.camera) + 1) % SURF_CAMERAS.length]);

// Every edit that turns the automatic checkpoint off first pins the spot the
// board is standing at, in the same settings write. Without it the fields that
// were not touched kept their stored 0/0/0 and the board jumped to the origin,
// hundreds of metres away, or turned broadside to the waves.
export function leaveAuto(previous, patch) {
  const { home } = surfPlay;
  const pinned = previous?.surfboardCheckpointAuto && home ? {
    surfboardCheckpointX: Math.round(home.x * 100) / 100,
    surfboardCheckpointZ: Math.round(home.z * 100) / 100,
    surfboardCheckpointYaw: Math.round(((home.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180),
  } : {};
  return { ...pinned, ...patch, surfboardCheckpointAuto: false };
}
