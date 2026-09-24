// Play mode's live state, shared by the editor shell (keys, HUD) and the scene
// (board physics, play camera). Nothing here goes through settings: every
// setSettings snapshots the whole scene into the active camera and saves the
// project, so per-frame state lives in this one mutable object instead.
//
// Writers: the controls (keyboard, mouse, gamepad) write `intent`, `input`,
// `camera`, `look`, `mouse`, `gamepad`, `rumble` and the request counters; the
// board writes `board` and `rider`; HomeEdit writes `playing`. The scene reads
// it every frame; React reads only the throttled snapshot.

export const SURF_CAMERAS = Object.freeze(['chase', 'first', 'side', 'orbit']);

export const surfPlay = {
  playing: false,
  camera: 'chase',
  input: { forward: 0, back: 0, left: 0, right: 0, pop: false, pump: false },
  // What the rider means, from whichever device the hand is on, analog. The
  // rider's body and the board read this, never the keys themselves.
  intent: {
    lean: 0,        // -1 left .. 1 right: carve standing, paddle-steer lying
    trim: 0,        // -1 weight back, brake .. 1 weight forward, paddle
    crouch: 0,      // 0..1 how deep he compresses; pumping is its rhythm
    grab: 0,        // 0..1 a hand on the rail: a tighter turn, a stall in the tube
    lookBack: 0,    // 0..1 the head, and the camera, turn to the wave behind
    strokeLeft: 0,  // counters: one stroke of that arm while lying down
    strokeRight: 0,
    popUp: 0,       // counter: lying, stand up; standing, jump; on his feet, jump
    duck: 0,        // counter: duck dive, later (B on the gamepad)
    board: 0,       // counter: on the board, jump off it (the keys point where);
                    // beside it, climb on, pick it up; carrying it, put it down
    leash: 0,       // counter: the leash off his ankle, or back on near the board
    device: 'keyboard',
  },
  // The mouse as a stick: captured (pointer lock) it steers; x/y is where the
  // virtual stick stands, -1..1, for the HUD, in screen directions (y down, so
  // pushing the mouse away is negative y and weight forward).
  mouse: { locked: false, x: 0, y: 0 },
  // A standard gamepad is connected and read (the first one), for the HUD.
  gamepad: false,
  // A gamepad that can vibrate sets this; the board calls it on impacts.
  // rumble(strong 0..1, weak 0..1, milliseconds)
  rumble: null,
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
  // The rider's body: 'prone' (lying, paddling), 'popup' (getting up),
  // 'stand' (riding), 'fallen' (tumbling in the water), 'swim' (swimming),
  // 'recover' (climbing onto the board), 'walk' (on his feet), 'jump'.
  // chest, pelvis, head: world positions for the camera, written each frame.
  // board, leash: what F and L would do now (riderController out.hud), for
  // the HUD's hints; swimBack, running, carrying: how he goes.
  rider: {
    state: 'prone', onBoard: true, chest: null, pelvis: null, head: null,
    board: 'jump', leash: 'off', swimBack: false, running: false, carrying: false, jumpFrom: null,
  },
  // The full list of keys is open (H).
  keysOpen: false,
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
    device: surfPlay.intent.device,
    mouseLocked: surfPlay.mouse.locked,
    gamepad: surfPlay.gamepad,
    rider: surfPlay.rider.state,
    board: surfPlay.rider.board,
    leash: surfPlay.rider.leash,
    swimBack: surfPlay.rider.swimBack,
    running: surfPlay.rider.running,
    carrying: surfPlay.rider.carrying,
    jumpFrom: surfPlay.rider.jumpFrom,
    keysOpen: surfPlay.keysOpen,
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

// The counters are left alone: the board answers a change, so winding one back
// would read as a press. Whether the mouse is captured is the browser's to say;
// the controls let go of it themselves when play ends.
export function clearSurfInput() {
  const { input, intent, mouse, look } = surfPlay;
  input.forward = 0; input.back = 0; input.left = 0; input.right = 0;
  input.pop = false; input.pump = false;
  intent.lean = 0; intent.trim = 0; intent.crouch = 0; intent.grab = 0; intent.lookBack = 0;
  mouse.x = 0; mouse.y = 0;
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
