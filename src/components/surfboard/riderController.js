import {
  JOINTS, SEGMENT, SEGMENT_NAMES, createRiderRagdoll, segmentVolume,
} from './riderSkeleton.js';
import {
  blendControls, captureControls, copyControls, createControls, createPose, jointTargets, popUpControls, proneControls, solvePose,
  standControls, stepControls, swimControls,
} from './riderPose.js';
import {
  bodyPoint, driveKinematic, placeBody, qConj, qFromAxisAngle, qMul, qRotate, qRotateInverse, qSlerp, setKinematic, stepRagdoll,
} from './ragdoll.js';
import {
  RUN_SPEED, carryGrip, carryPose, createWalker, crouchControls, jumpControls, jumpLegs, landWalker, resetWalker, stepWalker,
  walkControls,
} from './riderWalk.js';
import { resetBoard } from './boardPhysics.js';

// The rider: his body on the board and off it, and what it tells the board.
//
// He is a physics body (ragdoll.js) that the pose (riderPose.js) carries and
// pulls. What carries him changes with what he is doing:
//
//   prone    lying, paddling: pelvis and trunk ride the board, arms stroke on
//            muscles, legs trail loose behind the tail.
//   popup    getting up: trunk and feet on the pop-up's path, arms and head
//            following.
//   stand    riding: pelvis and feet go where the stance says — the feet never
//            slide, the knees take every landing — and everything above the
//            hips is muscle, so it sways, lags and reacts.
//   fallen   wiped out: nothing carries him. The muscles keep a little tone,
//            the water floats him by the density of each part and drags him
//            with its flow, the leash ties his back ankle to the tail.
//   swim     head-up crawl, the arms' pull and the kick driving him, his body
//            kept level by the swimmer's own feel for it: after a fall he swims
//            to the nearest rail and climbs on by himself; in the water by his
//            own will (a jump, a walk in) he swims where he is steered, treads
//            water when he is not, and climbs on when asked beside the board.
//   recover  at the rail he climbs on: pulled up onto the deck, then lying.
//   walk     on his own feet (riderWalk.js), in the world's frame, all of him
//            on the gait's pose: in the water it would push his trunk about
//            and his arms would lag it. He steps off a board he lies on once
//            the water under it is shallow (and off one run aground under
//            him), stands up out of a swim or a fall where he can, swims where
//            it gets deep; beside the board he climbs on, or picks it up and
//            carries it under his arm (and walking it into the water, gets on).
//   jump     off the ground or off the board, all of him on the pose: a
//            crouch, the flight, and down on his feet or into the water.
//
// Going from one posture to another on his feet or in the air is a blend of
// the controls the poses are built from (riderPose stepControls), his bodies
// read back into controls where the blend starts: the parts stay joined.
//
// He falls when the ride takes him beyond what the pose can hold: the board
// capsizes or stops dead under him, or the water shoves his chest off his
// hips. A shove that big is what whitewater does; the pose cannot fake it.
//
// Called once a frame after the board has moved; what it writes into `out`
// (the board's input, whether the rider is on it, the leash's pull) is for the
// board's next step.

const G = 9.81;
const RHO = 1025;
const SUBSTEPS = 10;
const POPUP_TIME = 0.6;
const LIEDOWN_TIME = 0.8;
// Bodies stepping from muscle to pose do it over this long, not in a frame.
const BLEND_TIME = 0.25;
// A stroke of one arm (s): half of it pulling in the water.
const STROKE_TIME = 1.05;
const STROKE_PULL = 0.55;
// Standing on a board that has stopped: he lies back down after this long.
const SLOW_SPEED = 1.1;
const SLOW_TIME = 0.9;
// Falls: his chest this far off where the pose holds it (riding a wave it
// strays ~0.1 m, a wall of foam shoves it ~0.33 m, and his spine's own range
// stops it short of ~0.35 m); the board this far over; a stop this hard (m/s
// lost per second).
const KNOCKED_OFF = 0.2;
const CAPSIZED = 0.3;
const SLAMMED = 30;
// After a fall: the tumble lasts this long before he swims (sooner if asked).
const FALL_SETTLE = 1.2;
// A man under water swims for the air: this much lift at the chest and head
// once the first tumble is over and while the head is under.
const SWIM_UP = 220;
const SWIM_AFTER = 0.5;
// Swimming: a crawl stroke's cycle (s); the thrust of an arm pulling through
// the water and of the kick (N). They are set by the speed they give, about
// 0.9 m/s, not by a real swimmer's ~50 N: the water drags each part of him as
// if it were alone in the flow, the trunk in its own wake included; how
// firmly he holds his body flat and turned where he swims (N·m/rad) and how
// fast he turns (rad/s); how close the rail must be to climb on (m).
const SWIM_CYCLE = 1.3;
const SWIM_PULL = 230;
const SWIM_KICK = 55;
const SWIM_HOLD = 380;
const SWIM_TURN = 1.6;
const CLIMB_REACH = 0.75;
const SWIM_GIVE_UP = 15;
// Climbing on: pulled onto the deck over this long, done when this close.
const RECOVER_PULL = 0.9;
const RECOVER_NEAR = 0.2;
const RECOVER_GIVE_UP = 3;
// On his own feet: he steps off a board lying on water this shallow (m), off
// one he rides on water shallower still (it has run aground); he swims where
// the water is this deep at his hips and stands up out of it this shallow;
// he climbs back on a board this close (m) that floats this deep.
const STEP_OFF_DEPTH = 0.7;
const AGROUND_DEPTH = 0.35;
const SWIM_DEPTH = 1.25;
const STAND_DEPTH = 1.0;
const MOUNT_REACH = 1.2;
// Deeper than he steps off at, or he would step off again at once.
const MOUNT_DEPTH = 0.8;
// From a posture to his feet (s): stepping off a board, standing up out of the
// water, coming down from a jump.
const STEP_OFF_TIME = 0.9;
const STAND_UP_TIME = 1.0;
const LANDING_TIME = 0.22;
// Jumps: the crouch before (s) off the ground, standing on the board, lying on
// it (he springs up first); how fast he leaves (m/s), up and, off a board,
// away from it; how hard the board is kicked back (m/s); how far his knees give
// landing (m); the water deep enough to jump into rather than land in (m).
const JUMP_LOAD = { ground: 0.12, stand: 0.2, prone: 0.45 };
const JUMP_UP = { ground: 2.9, board: 3.1 };
const JUMP_AWAY = 1.8;
const JUMP_KICK = 2.0;
const LANDING_GIVE = 0.13;
const WATER_LANDING = 0.9;
// The board under his arm: this close (m) to take it; lifted and put down over
// this long (s); carried into water this deep, he puts it on it and gets on.
const CARRY_REACH = 0.9;
const LIFT_TIME = 0.55;
const LOWER_TIME = 0.45;
const CARRY_LAUNCH = 0.9;
// A board put down floats this deep (m).
const PUT_DRAFT = 0.05;
// The leash: back on only with its plug this close (m).
const LEASH_REACH = 1.0;
// Stepped off, he keeps a hand on the board this long (s) while it is this
// close (m): relieved of his weight it bobs up and would glide off.
const STEADY_TIME = 1.2;
const STEADY_REACH = 1.3;
// The leash: 6 ft of urethane that stretches.
export const LEASH_LENGTH = 1.85;
const LEASH_STIFFNESS = 380;
const LEASH_DAMPING = 32;
// The legs as a spring under the trunk: an impact sinks the hips, a drop lets
// them rise; ~2 Hz, a little under critical.
const LEG_FREQUENCY = 2 * Math.PI * 2.1;
const LEG_DAMPING = 0.75;
const SINK_RANGE = [-0.07, 0.22];

// Which bodies the pose carries in each state.
const CARRIED = {
  // Lying, all of him: the pose Denis sets (poseTuning.js, the lab's
  // manipulators) is the pose he lies in, strokes and kick included — loose,
  // a stout man's thighs sagged through the deck and his arms twisted under
  // their own weight. The board still rocks him, the pose being on it.
  prone: SEGMENT_NAMES,
  popup: ['pelvis', 'abdomen', 'chest', 'footL', 'footR'],
  liedown: ['pelvis', 'abdomen', 'chest', 'footL', 'footR'],
  stand: ['pelvis', 'footL', 'footR'],
  walk: SEGMENT_NAMES,
  jump: SEGMENT_NAMES,
  fallen: [],
  swim: [],
  recover: [],
};
// Muscle strength by state, as a share of each joint's own stiffness. It
// goes slack at once (a fall takes the body's hold away in an instant) but
// comes back over TONE_RISE: a man gathers himself, he does not snap to.
const TONE = { prone: 1, popup: 1, liedown: 1, stand: 1, walk: 1, jump: 1, fallen: 0.06, swim: 0.8, recover: 0.35 };
const TONE_RISE = 0.5;
const IN_WATER = new Set(['fallen', 'swim', 'recover']);
const OFF_BOARD = new Set([...IN_WATER, 'walk', 'jump']);
// On the board, unless he is off it — crouching on it to jump off, he is on it.
const onBoardOf = (rider) => !OFF_BOARD.has(rider.state) || (rider.state === 'jump' && rider.leap.from !== 'ground' && !rider.leap.air);
// On his feet and in the air the pose is the world's, not the board's.
const WORLD = Object.freeze({ p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0] });
const frameFor = (rider, board) => ((rider.state === 'walk' || (rider.state === 'jump' && !onBoardOf(rider))) ? WORLD : board);
// States that build all of him and blend between postures themselves.
const POSED = new Set(['walk', 'jump']);
const LEG_JOINTS = new Set(['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// board: { length, deckY(x, z), halfWidth(z) } in the board's frame.
// options.leash false: no leash (the checks swim him from further off).
export function createRider(board, options = {}) {
  const world = createRiderRagdoll();
  const baseStiffness = world.joints.map((joint) => joint.stiffness);
  // The loose pose of a limp body: knees and elbows a little bent.
  const relaxed = JOINTS.map((spec) => {
    if (spec.name.startsWith('knee')) return qFromAxisAngle(spec.axis, 0.35);
    if (spec.name.startsWith('elbow')) return qFromAxisAngle(spec.axis, -0.5);
    return [0, 0, 0, 1];
  });
  const rider = {
    board,
    world,
    baseStiffness,
    relaxed,
    pose: createPose(),
    controls: createControls(),
    targets: JOINTS.map(() => [0, 0, 0, 1]),
    tone: 1, toneFrom: 1,
    state: 'prone',
    stateTime: 0,
    // Where each body stood on the board when its state began, for the blend.
    entry: { position: SEGMENT_NAMES.map(() => [0, 0, 0]), rotation: SEGMENT_NAMES.map(() => [0, 0, 0, 1]) },
    strokeL: -1, strokeR: -1, nextArm: 'L', queueL: 0, queueR: 0,
    swimPhase: 0, kickPhase: 0, swimYaw: 0, swimEffort: 1,
    walker: createWalker(),
    // Where a blend of postures starts (his bodies read back), what it heads
    // for, and over how long.
    from: createControls(), aim: createControls(), blendFor: 0,
    // A jump: from where, crouching or in the air, the pelvis's flight.
    leap: {
      from: 'ground', air: false, t: 0, load: 0, p: [0, 0, 0], v: [0, 0, 0], dir: [0, 1], yaw: 0, startYaw: 0, facing: 0,
      floor: -Infinity, tuck: 0, reach: 0, hug: 0,
    },
    // The board under his arm: 'none', 'lift', 'held', 'lower'; which side;
    // where it is, where it came from and goes to; what he does once it is down.
    carry: { phase: 'none', t: 0, side: -1, p: [0, 0, 0], q: [0, 0, 0, 1], p0: [0, 0, 0], q0: [0, 0, 0, 1], p1: [0, 0, 0], q1: [0, 0, 0, 1], yaw1: 0, then: 'walk' },
    // Swimming where he is steered, not back to the board.
    swimFree: false,
    // How long more he steadies the board he stepped off.
    steadyFor: 0,
    climb: [0, 0, 0],
    counters: { popUp: 0, strokeLeft: 0, strokeRight: 0, board: 0, leash: 0 },
    crouch: 0, crouchRate: 0, lastCrouch: 0,
    sink: 0, sinkV: 0, sway: 0, swayV: 0,
    boardV: null,
    slowFor: 0,
    samples: SEGMENT_NAMES.map(() => ({ height: -Infinity, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity })),
    volume: SEGMENT_NAMES.map((_, i) => segmentVolume(i)),
    leashLocal: [0, board.deckY(0, -board.length / 2 + 0.06) + 0.01, -board.length / 2 + 0.06],
    leashed: options.leash !== false,
    leashDefault: options.leash !== false,
    leashAnchor: [0, 0, 0], leashVelocity: [0, 0, 0],
    out: {
      onBoard: true,
      stand: 0,
      input: { forward: 0, back: 0, left: 0, right: 0, pop: false, pump: 0, stand: 0 },
      leash: null,
      leashForce: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
      // For the scene (boardFollows): the board turned over for him, kicked
      // away by his jump (a change of velocity), put down where he left it.
      events: { fell: false, stood: false, landed: 0, hit: 0, flipBoard: false, kick: null, putDown: null },
      // The board's pose while it is in his hands, for the scene to hold it at.
      carry: null,
      leashed: options.leash !== false,
      chest: [0, 0, 0], pelvis: [0, 0, 0],
      // How far his chest is off where the pose holds it (m), standing.
      chestOff: 0,
    },
  };
  // His bodies as a pose, to read controls off (captureControls), in the
  // world or in another frame.
  rider.bodyPose = { position: world.bodies.map((body) => body.x), rotation: world.bodies.map((body) => body.q) };
  rider.localPose = createPose();
  enter(rider, 'prone');
  return rider;
}

// --- frames --------------------------------------------------------------------

const bqi = [0, 0, 0, 1];
const tv = [0, 0, 0], tv2 = [0, 0, 0], tq = [0, 0, 0, 1], tq2 = [0, 0, 0, 1];
const toWorld = (board, local, out) => { qRotate(board.q, local, out); out[0] += board.p[0]; out[1] += board.p[1]; out[2] += board.p[2]; return out; };
const toLocal = (board, world, out) => { out[0] = world[0] - board.p[0]; out[1] = world[1] - board.p[1]; out[2] = world[2] - board.p[2]; return qRotateInverse(board.q, out, out); };

function setState(rider, state) {
  rider.state = state;
  rider.stateTime = 0;
}

// Change what carries him. A body the pose now carries starts from where it is.
function enter(rider, state, board = null) {
  setState(rider, state);
  const carried = new Set(CARRIED[state]);
  rider.world.bodies.forEach((body, i) => {
    const wasKinematic = body.kinematic;
    setKinematic(body, carried.has(body.name));
    if (body.kinematic && !wasKinematic) {
      // Keep the velocity it had: a kinematic body's is read off its motion.
      body.v[0] = 0; body.v[1] = 0; body.v[2] = 0;
    }
    if (board) {
      const frame = frameFor(rider, board);
      toLocal(frame, body.x, rider.entry.position[i]);
      qConj(frame.q, bqi);
      qMul(bqi, body.q, rider.entry.rotation[i]);
    }
  });
  rider.toneFrom = rider.tone;
  setTone(rider);
  rider.world.pins.length = 0;
}

function setTone(rider) {
  const target = TONE[rider.state];
  rider.tone = target <= rider.toneFrom ? target
    : rider.toneFrom + (target - rider.toneFrom) * smoothstep(0, TONE_RISE, rider.stateTime);
  const legs = rider.state === 'prone' ? 0.25 : 1;
  rider.world.joints.forEach((joint, i) => {
    joint.stiffness = rider.baseStiffness[i] * rider.tone * (LEG_JOINTS.has(JOINTS[i].name) ? legs : 1);
  });
}

// The controls' counters only ever grow; a rider starting now takes their
// present values as seen, or a press from before would read as one now.
export function syncRider(rider, intent) {
  rider.counters.popUp = intent?.popUp ?? 0;
  rider.counters.strokeLeft = intent?.strokeLeft ?? 0;
  rider.counters.strokeRight = intent?.strokeRight ?? 0;
  rider.counters.board = intent?.board ?? 0;
  rider.counters.leash = intent?.leash ?? 0;
}

// Put him on the board at once, lying: a respawn.
export function resetRider(rider, board) {
  setState(rider, 'prone');
  rider.tone = 1;
  proneControls(rider.board, { strokeL: -1, strokeR: -1 }, rider.controls);
  solvePose(rider.controls, rider.pose);
  rider.world.bodies.forEach((body, i) => {
    toWorld(board, rider.pose.position[i], tv);
    qMul(board.q, rider.pose.rotation[i], tq);
    placeBody(body, tv, tq);
    body.v[0] = board.v[0]; body.v[1] = board.v[1]; body.v[2] = board.v[2];
  });
  enter(rider, 'prone', board);
  rider.sink = 0; rider.sinkV = 0; rider.sway = 0; rider.swayV = 0;
  rider.strokeL = -1; rider.strokeR = -1; rider.queueL = 0; rider.queueR = 0;
  rider.slowFor = 0;
  rider.boardV = null;
  rider.carry.phase = 'none';
  rider.out.carry = null;
  rider.swimFree = false;
  rider.leashed = rider.leashDefault;
}

// --- one frame -------------------------------------------------------------------

// frame: { dt, board: { p, q, v, w, speed, wipeout }, intent, water(x, z, out),
// ground(x, z) | null }. The board is where it stands after this frame's step.
export function stepRider(rider, frame) {
  const { dt, board, intent } = frame;
  const out = rider.out;
  const events = out.events;
  events.fell = false; events.stood = false; events.landed = 0; events.hit = 0; events.flipBoard = false;
  events.kick = null; events.putDown = null;
  if (!(dt > 0)) return out;
  rider.stateTime += dt;
  const world = rider.world;

  // What the board does to him: its acceleration, felt in its own frame.
  if (!rider.boardV) rider.boardV = [board.v[0], board.v[1], board.v[2]];
  tv[0] = (board.v[0] - rider.boardV[0]) / dt;
  tv[1] = (board.v[1] - rider.boardV[1]) / dt + G;
  tv[2] = (board.v[2] - rider.boardV[2]) / dt;
  const slam = Math.hypot(board.v[0] - rider.boardV[0], board.v[2] - rider.boardV[2]) / dt;
  rider.boardV[0] = board.v[0]; rider.boardV[1] = board.v[1]; rider.boardV[2] = board.v[2];
  qRotateInverse(board.q, tv, tv2); // specific force in the board frame
  const up = 1 - 2 * (board.q[0] * board.q[0] + board.q[2] * board.q[2]);

  // Intent, with its counters turned into this frame's presses.
  const popUp = intent.popUp !== rider.counters.popUp;
  rider.counters.popUp = intent.popUp;
  const strokeLeft = intent.strokeLeft !== rider.counters.strokeLeft;
  const strokeRight = intent.strokeRight !== rider.counters.strokeRight;
  rider.counters.strokeLeft = intent.strokeLeft; rider.counters.strokeRight = intent.strokeRight;
  const boardPress = (intent.board ?? 0) !== rider.counters.board;
  rider.counters.board = intent.board ?? 0;
  const leashPress = (intent.leash ?? 0) !== rider.counters.leash;
  rider.counters.leash = intent.leash ?? 0;
  const lean = clamp(intent.lean || 0, -1, 1);
  const trim = clamp(intent.trim || 0, -1, 1);
  // The crouch eases in like a body, and how fast he rises out of it is his pump.
  const crouchTarget = clamp(intent.crouch || 0, 0, 1);
  const previousCrouch = rider.crouch;
  rider.crouch += (crouchTarget - rider.crouch) * Math.min(1, dt * 9);
  rider.crouchRate = (rider.crouch - previousCrouch) / dt;
  // The leash: off at his ankle whenever he likes; back on only where he can
  // reach its plug (on the board he always can).
  if (leashPress) {
    if (rider.leashed) rider.leashed = false;
    else if (onBoardOf(rider) || plugDistance(rider, board) < LEASH_REACH) rider.leashed = true;
  }
  out.leashed = rider.leashed;

  // --- the state machine ---------------------------------------------------------
  const state = rider.state;
  const input = out.input;
  input.forward = 0; input.back = 0; input.left = 0; input.right = 0; input.pop = false; input.pump = 0;

  if (state === 'prone') {
    // Strokes: asked for one arm at a time, or both in turn while he holds
    // forward; a stroke already under way finishes first.
    if (strokeLeft) rider.queueL += 1;
    if (strokeRight) rider.queueR += 1;
    const paddling = trim > 0.2;
    advanceStroke(rider, 'L', dt, paddling);
    advanceStroke(rider, 'R', dt, paddling);
    // Each arm in the water pushes; one arm alone also turns the board away
    // from its side.
    const pullL = rider.strokeL >= 0 && rider.strokeL < STROKE_PULL ? Math.sin(Math.PI * rider.strokeL / STROKE_PULL) : 0;
    const pullR = rider.strokeR >= 0 && rider.strokeR < STROKE_PULL ? Math.sin(Math.PI * rider.strokeR / STROKE_PULL) : 0;
    input.forward = clamp(0.8 * (pullL + pullR), 0, 1);
    const steer = lean + 0.6 * (pullL - pullR) * (paddling ? 0 : 1);
    input.right = Math.max(steer, 0); input.left = Math.max(-steer, 0);
    input.back = Math.max(-trim, 0) * 0.5;
    if (boardPress) startJump(rider, board, 'prone', lean, trim);
    else if (popUp) { enter(rider, 'popup', board); events.stood = true; }
    else if (depthAt(frame, board.p[0], board.p[2]) < STEP_OFF_DEPTH) enterWalk(rider, board, frame, true, events);
  } else if (state === 'popup') {
    if (rider.stateTime >= POPUP_TIME) enter(rider, 'stand', board);
  } else if (state === 'liedown') {
    if (rider.stateTime >= LIEDOWN_TIME) { enter(rider, 'prone', board); rider.strokeL = -1; rider.strokeR = -1; }
  } else if (state === 'stand') {
    input.forward = Math.max(trim, 0); input.back = Math.max(-trim, 0);
    input.right = Math.max(lean, 0); input.left = Math.max(-lean, 0);
    // Rising out of a crouch drives the board: that is what pumping is.
    input.pump = clamp(-rider.crouchRate * 1.6, 0, 1);
    input.pop = popUp;
    // A board that has stopped cannot hold a standing man: he lies back down;
    // one run aground he steps off.
    rider.slowFor = frame.board.speed < SLOW_SPEED ? rider.slowFor + dt : 0;
    if (boardPress) startJump(rider, board, 'stand', lean, trim);
    else if (depthAt(frame, board.p[0], board.p[2]) < AGROUND_DEPTH) enterWalk(rider, board, frame, true, events);
    else if (rider.slowFor > SLOW_TIME) enter(rider, 'liedown', board);
  } else if (state === 'walk') {
    // Forward and back, turning (A/D), running with the crouch held; a jump
    // (the pop-up's key); the board (F): on it, under his arm, put down.
    const walker = rider.walker;
    stepWalker(walker, { dt, forward: trim, turn: -lean, run: crouchTarget, ground: groundOf(frame), depth: (x, z) => depthAt(frame, x, z) });
    if (rider.carry.phase !== 'none') stepCarry(rider, board, dt, events);
    // A hand on the board he stepped off, while it is near.
    rider.steadyFor = Math.max(0, rider.steadyFor - dt);
    if (rider.steadyFor > 0 && !events.kick && rider.carry.phase === 'none'
      && Math.hypot(board.p[0] - walker.x, board.p[2] - walker.z) < STEADY_REACH) {
      const k = Math.min(1, 10 * dt);
      kick[0] = -board.v[0] * k; kick[1] = 0; kick[2] = -board.v[2] * k;
      events.kick = kick;
    }
    const carrying = rider.carry.phase !== 'none';
    const depth = depthAt(frame, walker.x, walker.z);
    if (rider.state !== 'walk') { /* put the board on the water and got on it */ }
    else if (depth > SWIM_DEPTH && !carrying) {
      enter(rider, 'swim', board);
      rider.swimYaw = walker.yaw;
      rider.swimFree = true;
    } else if (popUp) startJump(rider, board, 'ground', 0, 0);
    else if (boardPress) boardAction(rider, board, frame, up, events);
    else if (rider.carry.phase === 'held' && depth > CARRY_LAUNCH) lowerBoard(rider, frame, 'mount');
  } else if (state === 'jump') {
    stepJump(rider, board, frame, dt, events, trim, crouchTarget);
  } else if (state === 'fallen') {
    // The tumble, then he swims for his board, or stands up where he can;
    // asked, he starts sooner.
    const pelvis = world.bodies[SEGMENT.pelvis];
    if (rider.stateTime > FALL_SETTLE && depthAt(frame, pelvis.x[0], pelvis.x[2]) < STAND_DEPTH) enterWalk(rider, board, frame, false);
    else if (rider.stateTime > FALL_SETTLE || (rider.stateTime > SWIM_AFTER && (popUp || strokeLeft || strokeRight || trim > 0.2))) {
      enter(rider, 'swim', board);
      rider.swimYaw = headingOf(world.bodies[SEGMENT.chest]);
      rider.swimFree = false;
    }
  } else if (state === 'swim') {
    // After a fall he swims back to the board by himself — until he is
    // steered (A, D). Steered, or in the water by his own will, W swims (Shift
    // harder), A and D turn him, and let go he treads water. Swimming back,
    // holding back he treads water and holding forward he swims harder.
    if (!rider.swimFree && Math.abs(lean) > 0.3) rider.swimFree = true;
    if (rider.swimFree) {
      rider.swimEffort = trim > 0.2 ? (crouchTarget > 0.5 ? 1.3 : 1) : 0;
      rider.swimYaw -= lean * SWIM_TURN * dt;
    } else rider.swimEffort = trim < -0.3 ? 0 : trim > 0.2 ? 1.3 : 1;
    const beat = Math.max(rider.swimEffort, 0.4);
    rider.swimPhase += dt / SWIM_CYCLE * beat;
    rider.kickPhase += dt * 2.4 * beat;
    climbPoint(rider, board, rider.climb);
    const chest = world.bodies[SEGMENT.chest], pelvis = world.bodies[SEGMENT.pelvis];
    const toRail = Math.hypot(chest.x[0] - rider.climb[0], chest.x[2] - rider.climb[2]);
    // He climbs on beside the board when asked (F), or back at it by himself.
    if ((boardPress && toRail < MOUNT_REACH) || (!rider.swimFree && (toRail < CLIMB_REACH || rider.stateTime > SWIM_GIVE_UP))) climbOn(rider, board, up, events);
    else if (depthAt(frame, pelvis.x[0], pelvis.x[2]) < STAND_DEPTH) enterWalk(rider, board, frame, false);
  }
  // Stand value for the board: how much of him is up on his feet.
  out.stand = rider.state === 'stand' ? 1
    : rider.state === 'popup' ? smoothstep(0.3, 0.9, rider.stateTime / POPUP_TIME)
      : rider.state === 'liedown' ? 1 - smoothstep(0.1, 0.7, rider.stateTime / LIEDOWN_TIME) : 0;
  input.stand = out.stand;

  // --- the pose, in the board's frame (on his feet and in the air, the world's) ---
  const onBoard = onBoardOf(rider);
  if (rider.state === 'stand' || rider.state === 'popup' || rider.state === 'liedown') {
    // The legs as a spring: sinking under an impact, rising as the board drops away.
    const felt = tv2[1] - G;
    const accel = felt - LEG_FREQUENCY * LEG_FREQUENCY * rider.sink - 2 * LEG_DAMPING * LEG_FREQUENCY * rider.sinkV;
    rider.sinkV += accel * dt;
    rider.sink = clamp(rider.sink + rider.sinkV * dt, SINK_RANGE[0], SINK_RANGE[1]);
    if (felt > 12) events.landed = Math.max(events.landed, clamp((felt - 12) / 25, 0, 1));
    // Thrown toward his toes or heels by the board sliding under him.
    const swayTarget = clamp(-tv2[0] * 0.012, -0.1, 0.1);
    rider.sway += (swayTarget - rider.sway) * Math.min(1, dt * 6);
  }
  // Up from a pop-up he is still low: the crouch it ends in lets go over half
  // a second, or the pose would jump up under a trunk that has to follow it.
  const risen = rider.state === 'stand' ? 0.55 * (1 - smoothstep(0, 0.6, rider.stateTime)) : 0;
  const params = {
    crouch: Math.max(rider.crouch, risen), lean, trim, grab: clamp(intent.grab || 0, 0, 1), lookBack: clamp(intent.lookBack || 0, 0, 1),
    sink: rider.sink, sway: rider.sway,
  };
  if (rider.state === 'stand') standControls(rider.board, params, rider.controls);
  else if (rider.state === 'popup') popUpControls(rider.board, rider.stateTime / POPUP_TIME, params, rider.controls);
  else if (rider.state === 'liedown') popUpControls(rider.board, 1 - rider.stateTime / LIEDOWN_TIME, params, rider.controls);
  else if (rider.state === 'swim') {
    swimControls({ strokeL: rider.swimPhase, strokeR: rider.swimPhase + 0.5, kick: rider.kickPhase, lift: 1 }, rider.controls);
  } else if (rider.state === 'walk') walkPose(rider);
  else if (rider.state === 'jump') jumpPose(rider, params);
  else proneControls(rider.board, { strokeL: rider.strokeL, strokeR: rider.strokeR, arch: 0.6 + 0.4 * Math.max(trim, 0) }, rider.controls);
  solvePose(rider.controls, rider.pose);

  // Muscles: toward the pose's joint rotations on the board or swimming,
  // toward a loose body tumbling in the water.
  if (rider.tone !== TONE[rider.state]) setTone(rider);
  if (rider.state !== 'fallen') jointTargets(rider.pose, JOINTS, rider.targets);
  world.joints.forEach((joint, i) => {
    const target = rider.state === 'fallen' ? rider.relaxed[i] : rider.targets[i];
    joint.target[0] = target[0]; joint.target[1] = target[1]; joint.target[2] = target[2]; joint.target[3] = target[3];
  });

  // The carried bodies: to their pose on the board, blended in from where
  // they were when this state began — or, where the pose blends postures
  // itself, right onto it.
  const blend = POSED.has(rider.state) ? 1 : smoothstep(0, BLEND_TIME, rider.stateTime);
  const poseFrame = frameFor(rider, board);
  world.bodies.forEach((body, i) => {
    if (!body.kinematic) return;
    const lp = rider.pose.position[i], lq = rider.pose.rotation[i];
    const ep = rider.entry.position[i], eq = rider.entry.rotation[i];
    tv[0] = ep[0] + (lp[0] - ep[0]) * blend; tv[1] = ep[1] + (lp[1] - ep[1]) * blend; tv[2] = ep[2] + (lp[2] - ep[2]) * blend;
    qSlerp(eq, lq, blend, tq);
    toWorld(poseFrame, tv, tv2);
    qMul(poseFrame.q, tq, tq2);
    driveKinematic(body, tv2, tq2);
  });

  // Recover: pulled to the board, pelvis and chest, harder by the second.
  if (rider.state === 'recover') {
    const pull = smoothstep(0, RECOVER_PULL, rider.stateTime);
    for (const name of ['pelvis', 'chest']) {
      const i = SEGMENT[name];
      const pin = pinOf(world, world.bodies[i]);
      toWorld(board, rider.pose.position[i], pin.target);
      qMul(board.q, rider.pose.rotation[i], pin.targetQ);
      pin.targetV[0] = board.v[0]; pin.targetV[1] = board.v[1]; pin.targetV[2] = board.v[2];
      pin.stiffness = 200 + 7800 * pull * pull;
      pin.angularStiffness = 40 + 900 * pull * pull;
      pin.damping = 2 + 6 * pull;
    }
  }

  // Swimming: his trunk held flat and turned where he swims — toward the rail
  // he swims back for, turning no faster than a swimmer turns, or where he is
  // steered; the water holds him up.
  if (rider.state === 'swim') {
    const pelvis = world.bodies[SEGMENT.pelvis];
    if (!rider.swimFree) {
      const want = Math.atan2(rider.climb[0] - pelvis.x[0], rider.climb[2] - pelvis.x[2]);
      const turn = Math.atan2(Math.sin(want - rider.swimYaw), Math.cos(want - rider.swimYaw));
      rider.swimYaw += clamp(turn, -SWIM_TURN * dt, SWIM_TURN * dt);
    }
    qFromAxisAngle(UP, rider.swimYaw, swimFrame);
    for (const name of ['pelvis', 'chest']) {
      const i = SEGMENT[name];
      const pin = pinOf(world, world.bodies[i]);
      qMul(swimFrame, rider.pose.rotation[i], pin.targetQ);
      pin.stiffness = 0;
      pin.angularStiffness = SWIM_HOLD * smoothstep(0, 0.6, rider.stateTime);
      pin.damping = 0;
    }
  }

  // --- the water, the leash, the ground ----------------------------------------------
  for (let i = 0; i < world.bodies.length; i += 1) {
    const body = world.bodies[i];
    const sample = rider.samples[i];
    if (body.kinematic) { sample.height = -Infinity; continue; }
    sample.height = -Infinity; sample.vx = 0; sample.vy = 0; sample.vz = 0; sample.whitewater = 0; sample.ground = -Infinity;
    frame.water(body.x[0], body.x[2], sample);
  }
  toWorld(board, rider.leashLocal, rider.leashAnchor);
  // The plug's velocity: the board's, plus its spin at the plug.
  qRotate(board.q, rider.leashLocal, tv);
  rider.leashVelocity[0] = board.v[0] + board.w[1] * tv[2] - board.w[2] * tv[1];
  rider.leashVelocity[1] = board.v[1] + board.w[2] * tv[0] - board.w[0] * tv[2];
  rider.leashVelocity[2] = board.v[2] + board.w[0] * tv[1] - board.w[1] * tv[0];
  const leashOn = !onBoard && rider.leashed;
  const leashSum = out.leashForce;
  leashSum.fx = 0; leashSum.fy = 0; leashSum.fz = 0;
  let nearGround = false;
  if (frame.ground) {
    for (const body of world.bodies) {
      if (body.kinematic) continue;
      if (body.x[1] - 0.6 < frame.ground(body.x[0], body.x[2])) { nearGround = true; break; }
    }
  }
  stepRagdoll(world, dt, {
    substeps: SUBSTEPS,
    ground: nearGround ? frame.ground : null,
    forces: (w, h) => {
      for (let i = 0; i < w.bodies.length; i += 1) {
        const body = w.bodies[i];
        if (body.kinematic) continue;
        waterOn(rider, body, i, h);
      }
      if ((rider.state === 'fallen' && rider.stateTime > SWIM_AFTER) || rider.state === 'swim') {
        const head = w.bodies[SEGMENT.head], chest = w.bodies[SEGMENT.chest];
        const under = rider.samples[SEGMENT.head].height - head.x[1];
        // Swimming he keeps his chin up, out of the water.
        const clear = rider.state === 'swim' ? 0.12 : 0.05;
        if (under > -clear) {
          const push = SWIM_UP * clamp((under + clear) / 0.3, 0, 1);
          head.f[1] += push * 0.4; chest.f[1] += push * 0.6;
        }
      }
      if (rider.state === 'swim') swimThrust(rider, w);
      if (leashOn) {
        const foot = w.bodies[SEGMENT.footR];
        const f = leashPull(rider, foot);
        if (f) {
          leashSum.fx -= f[0] / SUBSTEPS; leashSum.fy -= f[1] / SUBSTEPS; leashSum.fz -= f[2] / SUBSTEPS;
        }
      }
    },
  });
  out.leash = leashOn ? leashSum : null;
  if (leashOn) { leashSum.x = rider.leashAnchor[0]; leashSum.y = rider.leashAnchor[1]; leashSum.z = rider.leashAnchor[2]; }

  // --- falls ------------------------------------------------------------------------
  // A board turned over throws him off whatever he was doing on it.
  if ((rider.state === 'prone' || rider.state === 'liedown' || (rider.state === 'jump' && onBoardOf(rider))) && (board.wipeout || up < CAPSIZED)) {
    enter(rider, 'fallen', board);
    events.fell = true;
  } else if (rider.state === 'stand' || rider.state === 'popup') {
    const chest = world.bodies[SEGMENT.chest];
    const i = SEGMENT.chest;
    toWorld(board, rider.pose.position[i], tv);
    const off = Math.hypot(chest.x[0] - tv[0], chest.x[1] - tv[1], chest.x[2] - tv[2]);
    out.chestOff = off;
    if (off > 0.12) events.hit = Math.max(events.hit, clamp((off - 0.12) / 0.08, 0, 1));
    if (board.wipeout || up < CAPSIZED || off > KNOCKED_OFF || slam > SLAMMED) {
      enter(rider, 'fallen', board);
      events.fell = true;
    }
  } else if (rider.state === 'recover') {
    const pelvis = world.bodies[SEGMENT.pelvis], chest = world.bodies[SEGMENT.chest];
    toWorld(board, rider.pose.position[SEGMENT.pelvis], tv);
    const pelvisOff = Math.hypot(pelvis.x[0] - tv[0], pelvis.x[1] - tv[1], pelvis.x[2] - tv[2]);
    toWorld(board, rider.pose.position[SEGMENT.chest], tv);
    const chestOff = Math.hypot(chest.x[0] - tv[0], chest.x[1] - tv[1], chest.x[2] - tv[2]);
    if ((rider.stateTime > 0.8 && pelvisOff < RECOVER_NEAR && chestOff < RECOVER_NEAR) || rider.stateTime > RECOVER_GIVE_UP) {
      // One that went over while he climbed is turned now.
      if (up < 0.3) events.flipBoard = true;
      enter(rider, 'prone', board);
      rider.strokeL = -1; rider.strokeR = -1;
    }
  }

  out.onBoard = onBoardOf(rider);
  if (rider.carry.phase === 'none') out.carry = null;
  bodyPoint(world.bodies[SEGMENT.chest], [0, 0, 0], out.chest);
  bodyPoint(world.bodies[SEGMENT.pelvis], [0, 0, 0], out.pelvis);
  return out;
}

const UP = [0, 1, 0];
const swimFrame = [0, 0, 0, 1];
const railLocal = [0, 0, 0];

function pinOf(world, body) {
  let pin = world.pins.find((p) => p.body === body);
  if (!pin) {
    pin = { body, local: [0, 0, 0], target: [0, 0, 0], targetQ: [0, 0, 0, 1], targetV: [0, 0, 0], stiffness: 0, angularStiffness: 0, damping: 0 };
    world.pins.push(pin);
  }
  return pin;
}

// The way a body's head end points, as a heading about +Y.
const headAxis = [0, 0, 0];
function headingOf(body) {
  qRotate(body.q, UP, headAxis);
  return Math.atan2(headAxis[0], headAxis[2]);
}

// The ground at (x, z): the frame's (the terrain, the solids), else the
// water's own bottom; none is no ground.
const groundSample = { height: -Infinity, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity };
function groundAt(frame, x, z) {
  const g = frame.ground ? frame.ground(x, z) : null;
  if (Number.isFinite(g)) return g;
  groundSample.ground = -Infinity;
  frame.water(x, z, groundSample);
  return groundSample.ground;
}
const groundOf = (frame) => (x, z) => {
  const g = groundAt(frame, x, z);
  return Number.isFinite(g) ? g : 0;
};
// Water over the ground at (x, z) (m); dry ground is ≤ 0, no ground is deep.
const depthSample = { height: -Infinity, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity };
function depthAt(frame, x, z) {
  const ground = groundAt(frame, x, z);
  if (!Number.isFinite(ground)) return Infinity;
  depthSample.height = -Infinity;
  frame.water(x, z, depthSample);
  return Number.isFinite(depthSample.height) ? depthSample.height - ground : -Infinity;
}

// Onto his feet: off the board's right rail facing its nose (stepping off —
// a hand on it, so it stops beside him rather than gliding on), or where he
// is facing the way he swam (standing up out of the water) — from the posture
// he was in, over a moment.
const noseOf = (q) => Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
const offRail = [-0.55, 0, -0.2], offAt = [0, 0, 0];
function enterWalk(rider, board, frame, offBoard, events = null) {
  const pelvis = rider.world.bodies[SEGMENT.pelvis];
  let x = pelvis.x[0], z = pelvis.x[2], yaw = headingOf(pelvis);
  if (offBoard) {
    toWorld(board, offRail, offAt);
    x = offAt[0]; z = offAt[2]; yaw = noseOf(board.q);
    if (events) {
      kick[0] = -board.v[0]; kick[1] = 0; kick[2] = -board.v[2];
      events.kick = kick;
    }
    rider.steadyFor = STEADY_TIME;
  }
  resetWalker(rider.walker, { x, z, yaw, ground: groundOf(frame) });
  enter(rider, 'walk', board);
  readBack(rider, WORLD, rider.from);
  rider.blendFor = offBoard ? STEP_OFF_TIME : STAND_UP_TIME;
}

// His bodies read back into the controls that would build them, in a frame
// (the board's, or the world): where a blend of postures starts.
function readBack(rider, frame, out) {
  const local = rider.localPose;
  rider.world.bodies.forEach((body, i) => {
    toLocal(frame, body.x, local.position[i]);
    qConj(frame.q, bqi);
    qMul(bqi, body.q, local.rotation[i]);
  });
  return captureControls(local, out);
}

// Which way a body faces (its front, +Z at rest), as a heading about +Y.
const frontAxis = [0, 0, 0];
function facingOf(q) {
  qRotate(q, [0, 0, 1], frontAxis);
  return Math.atan2(frontAxis[0], frontAxis[2]);
}

// How far his hips are from the leash's plug, across the ground (m).
function plugDistance(rider, board) {
  toWorld(board, rider.leashLocal, tv);
  const pelvis = rider.world.bodies[SEGMENT.pelvis].x;
  return Math.hypot(tv[0] - pelvis[0], tv[2] - pelvis[2]);
}

// Onto the board beside him. One floating on its deck is turned over as he
// takes hold of it, or he would be pulled up under it.
function climbOn(rider, board, up, events) {
  rider.carry.phase = 'none';
  enter(rider, 'recover', board);
  if (up < 0.3) events.flipBoard = true;
}

// --- jumps -----------------------------------------------------------------------

// A jump: off the ground (the pop-up's key on his feet) or off the board he
// lies or stands on (F), the way the keys point — the board's left or right
// (A, D), over its nose or off its tail (W, S) — or else off its right rail,
// the side he faces standing (regular) and steps off lying.
function startJump(rider, board, from, lean, trim) {
  const leap = rider.leap;
  leap.from = from; leap.air = false; leap.t = 0; leap.load = JUMP_LOAD[from];
  leap.tuck = 0; leap.reach = 0; leap.hug = 0;
  if (from === 'ground') leap.yaw = rider.walker.yaw;
  else {
    let x = -lean, z = trim;
    const n = Math.hypot(x, z);
    if (n < 0.3) { x = -1; z = 0; } else { x /= n; z /= n; }
    tv[0] = x; tv[1] = 0; tv[2] = z;
    qRotate(board.q, tv, tv2);
    leap.yaw = Math.atan2(tv2[0], tv2[2]);
  }
  leap.dir[0] = Math.sin(leap.yaw); leap.dir[1] = Math.cos(leap.yaw);
  enter(rider, 'jump', board);
  // The crouch starts from where his bodies are: on the board, in its frame.
  readBack(rider, frameFor(rider, board), rider.from);
}

// Leaving: from where the crouch has his pelvis, up, and away — off the
// ground at the speed he ran, off the board at its speed and his spring away
// from it, the board kicked back the other way.
const kick = [0, 0, 0];
function takeoff(rider, board, events) {
  const leap = rider.leap, pelvis = rider.world.bodies[SEGMENT.pelvis];
  leap.p[0] = pelvis.x[0]; leap.p[1] = pelvis.x[1]; leap.p[2] = pelvis.x[2];
  if (leap.from === 'ground') {
    const w = rider.walker;
    leap.v[0] = Math.sin(w.yaw) * w.speed; leap.v[1] = JUMP_UP.ground; leap.v[2] = Math.cos(w.yaw) * w.speed;
  } else {
    leap.v[0] = board.v[0] + leap.dir[0] * JUMP_AWAY; leap.v[1] = JUMP_UP.board; leap.v[2] = board.v[2] + leap.dir[1] * JUMP_AWAY;
    kick[0] = -leap.dir[0] * JUMP_KICK; kick[1] = -0.4; kick[2] = -leap.dir[1] * JUMP_KICK;
    events.kick = kick;
  }
  // His soles stay on what he leaves until his legs are straight.
  const footL = rider.world.bodies[SEGMENT.footL], footR = rider.world.bodies[SEGMENT.footR];
  leap.floor = Math.min(footL.x[1], footR.x[1]) - footL.half[1];
  leap.startYaw = facingOf(pelvis.q);
  leap.facing = leap.startYaw;
  leap.air = true; leap.t = 0;
  readBack(rider, WORLD, rider.from);
}

// One frame of a jump: the crouch, then the flight — down on his feet on the
// ground (or the bottom of shallow water), or into water deep enough.
const flightWater = { height: -Infinity, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity };
function stepJump(rider, board, frame, dt, events, trim, run) {
  const leap = rider.leap, walker = rider.walker;
  leap.t += dt;
  if (!leap.air) {
    // Crouching on the ground the stride goes on under him.
    if (leap.from === 'ground') stepWalker(walker, { dt, forward: trim, turn: 0, run, ground: groundOf(frame), depth: (x, z) => depthAt(frame, x, z) });
    if (leap.t >= leap.load) takeoff(rider, board, events);
    return;
  }
  const p = leap.p, v = leap.v;
  p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
  v[1] -= G * dt;
  const ground = groundAt(frame, p[0], p[2]);
  flightWater.height = -Infinity;
  frame.water(p[0], p[2], flightWater);
  const water = flightWater.height;
  const intoWater = Number.isFinite(water) && water - (Number.isFinite(ground) ? ground : -Infinity) > WATER_LANDING;
  const surface = intoWater ? water : Number.isFinite(ground) ? ground : water;
  leap.tuck = smoothstep(0.04, 0.26, leap.t);
  leap.hug += ((intoWater ? 1 : 0) - leap.hug) * Math.min(1, dt * 8);
  // How long till his straight legs would meet what he comes down on.
  const drop = p[1] - jumpLegs(0, 0) - surface;
  const untilDown = (v[1] + Math.sqrt(Math.max(v[1] * v[1] + 2 * G * drop, 0))) / G;
  leap.reach = intoWater ? 0 : 1 - smoothstep(0.08, 0.24, untilDown);
  // Turning in the air to face the way he goes.
  const turn = Math.atan2(Math.sin(leap.yaw - leap.startYaw), Math.cos(leap.yaw - leap.startYaw));
  leap.facing = leap.startYaw + turn * smoothstep(0, 0.3, leap.t);
  if (v[1] < 0 && p[1] - jumpLegs(leap.tuck, leap.reach) <= surface) {
    if (intoWater) {
      // In: the body goes on down with the speed it had, then swims.
      dropBoard(rider, events);
      enter(rider, 'swim', board);
      rider.swimFree = true;
      rider.swimYaw = leap.facing;
    } else {
      // Down on his feet, going on the way he went, the knees giving.
      const along = v[0] * Math.sin(leap.facing) + v[2] * Math.cos(leap.facing);
      resetWalker(walker, { x: p[0], z: p[2], yaw: leap.facing, ground: groundOf(frame), speed: clamp(along, 0, RUN_SPEED) });
      landWalker(walker, LANDING_GIVE * clamp(-v[1] / 4, 0.4, 1.2));
      events.landed = clamp(-v[1] / 6, 0, 1);
      enter(rider, 'walk', board);
      readBack(rider, WORLD, rider.from);
      rider.blendFor = LANDING_TIME;
    }
  } else if (leap.t > 3) {
    dropBoard(rider, events);
    enter(rider, 'fallen', board);
  }
}

// The jump's pose: the crouch (on the ground, the walk's own, sinking; on the
// board, the stand's or a quick pop-up's, in its frame), then the flight's —
// each from where his bodies were when it began.
const flight = { x: 0, y: 0, z: 0, yaw: 0, t: 0, floor: 0, tuck: 0, reach: 0, hug: 0 };
function jumpPose(rider, params) {
  const leap = rider.leap, aim = rider.aim;
  if (!leap.air) {
    const u = smoothstep(0, 1, leap.t / leap.load);
    if (leap.from === 'ground') {
      const w = rider.walker;
      walkControls(w, aim, carryHold(rider, w.x, w.pelvisY, w.z, w.yaw));
      crouchControls(aim, w.yaw, u);
    } else if (leap.from === 'prone') popUpControls(rider.board, u, { ...params, crouch: 0.9 }, aim);
    else standControls(rider.board, { ...params, crouch: Math.max(params.crouch, u) }, aim);
  } else {
    flight.x = leap.p[0]; flight.y = leap.p[1]; flight.z = leap.p[2]; flight.yaw = leap.facing; flight.t = leap.t;
    flight.floor = leap.t < 0.3 ? leap.floor : -Infinity;
    flight.tuck = leap.tuck; flight.reach = leap.reach; flight.hug = leap.hug;
    jumpControls(flight, aim);
    const hold = carryHold(rider, flight.x, flight.y, flight.z, flight.yaw);
    if (hold) {
      const hand = aim[hold.side > 0 ? 'handL' : 'handR'];
      hand[0] = hold.grip[0]; hand[1] = hold.grip[1]; hand[2] = hold.grip[2];
    }
  }
  blendControls(rider.from, aim, smoothstep(0, 0.12, leap.t), rider.controls);
}

// --- on his feet ---------------------------------------------------------------------

// The walk's pose, the board in his hands if he has it (stooping as he picks
// it up or puts it down), blended in from how he came to his feet.
function walkPose(rider) {
  const w = rider.walker, aim = rider.aim, c = rider.carry;
  walkControls(w, aim, carryHold(rider, w.x, w.pelvisY, w.z, w.yaw));
  if (c.phase === 'lift' || c.phase === 'lower') {
    const stoop = Math.sin(Math.PI * clamp(c.t / (c.phase === 'lift' ? LIFT_TIME : LOWER_TIME), 0, 1));
    aim.pelvis[1] -= 0.12 * stoop;
    qFromAxisAngle(ACROSS, 0.35 * stoop, tq);
    qMul(aim.pelvisQ, tq, aim.pelvisQ);
  }
  if (rider.stateTime < rider.blendFor) stepControls(rider.from, aim, rider.stateTime / rider.blendFor, rider.controls);
  else copyControls(aim, rider.controls);
}

// The board in his hands this frame: rising from where it lay to under his
// arm, carried there, or going down to where he puts it. Returns the hand on
// it for the pose (walkControls' carry), and hands the board's pose to the
// scene (out.carry).
const ACROSS = [1, 0, 0];
const carried = { p: [0, 0, 0], q: [0, 0, 0, 1] }, at = { x: 0, y: 0, z: 0, yaw: 0 };
const hold = { side: -1, grip: [0, 0, 0], amount: 0 };
function carryHold(rider, x, y, z, yaw) {
  const c = rider.carry;
  if (c.phase === 'none') { rider.out.carry = null; return null; }
  at.x = x; at.y = y; at.z = z; at.yaw = yaw;
  carryPose(at, c.side, carried.p, carried.q);
  if (c.phase === 'lift') {
    const u = smoothstep(0, 1, c.t / LIFT_TIME);
    for (let k = 0; k < 3; k += 1) c.p[k] = c.p0[k] + (carried.p[k] - c.p0[k]) * u;
    c.p[1] += 0.12 * Math.sin(Math.PI * u);
    qSlerp(c.q0, carried.q, u, c.q);
    hold.amount = smoothstep(0.25, 0.75, c.t / LIFT_TIME);
  } else if (c.phase === 'lower') {
    const u = smoothstep(0, 1, c.t / LOWER_TIME);
    for (let k = 0; k < 3; k += 1) c.p[k] = carried.p[k] + (c.p1[k] - carried.p[k]) * u;
    qSlerp(carried.q, c.q1, u, c.q);
    hold.amount = 1 - smoothstep(0.55, 1, c.t / LOWER_TIME);
  } else {
    c.p[0] = carried.p[0]; c.p[1] = carried.p[1]; c.p[2] = carried.p[2];
    c.q[0] = carried.q[0]; c.q[1] = carried.q[1]; c.q[2] = carried.q[2]; c.q[3] = carried.q[3];
    hold.amount = 1;
  }
  rider.out.carry = c;
  hold.side = c.side;
  carryGrip(c.p, c.q, c.side, rider.board.halfWidth ? rider.board.halfWidth(0.12) : 0.25, hold.grip);
  return hold;
}

// The clock of picking up and putting down; put down, the board is the
// scene's again (out.events.putDown) — and carried into the water, he gets on.
function stepCarry(rider, board, dt, events) {
  const c = rider.carry;
  c.t += dt;
  if (c.phase === 'lift' && c.t >= LIFT_TIME) { c.phase = 'held'; c.t = 0; }
  else if (c.phase === 'lower' && c.t >= LOWER_TIME) {
    c.phase = 'none';
    rider.out.carry = null;
    events.putDown = c.put;
    if (c.then === 'mount') climbOn(rider, board, 1, events);
  }
}

// F on his feet: beside a board floating deep enough, he climbs on; near one
// lying in the shallows or on the sand, he picks it up; carrying it, he puts
// it down.
function boardAction(rider, board, frame, up, events) {
  const c = rider.carry;
  if (c.phase === 'held') { lowerBoard(rider, frame, 'walk'); return; }
  if (c.phase !== 'none') return;
  toLocal(board, rider.world.bodies[SEGMENT.pelvis].x, tv);
  const half = rider.board.length / 2;
  const beside = Math.abs(tv[0]) < MOUNT_REACH && Math.abs(tv[2]) < half + 0.3;
  if (beside && depthAt(frame, board.p[0], board.p[2]) > MOUNT_DEPTH) { climbOn(rider, board, up, events); return; }
  // Near enough to take: his hips within reach of the board's middle line.
  if (Math.hypot(tv[0], tv[2] - clamp(tv[2], -half, half)) < CARRY_REACH) {
    const w = rider.walker;
    c.phase = 'lift'; c.t = 0;
    // Under the arm on the side it lies.
    c.side = (board.p[0] - w.x) * Math.cos(w.yaw) - (board.p[2] - w.z) * Math.sin(w.yaw) >= 0 ? 1 : -1;
    for (let k = 0; k < 3; k += 1) { c.p0[k] = board.p[k]; c.p[k] = board.p[k]; }
    for (let k = 0; k < 4; k += 1) { c.q0[k] = board.q[k]; c.q[k] = board.q[k]; }
  }
}

// Putting it down beside him on its side of him, flat, the nose his way:
// afloat, or on the sand. `then` 'mount': he gets on it once it is down.
function lowerBoard(rider, frame, then) {
  const c = rider.carry, w = rider.walker;
  c.phase = 'lower'; c.t = 0; c.then = then;
  const sin = Math.sin(w.yaw), cos = Math.cos(w.yaw);
  const x = w.x + cos * 0.65 * c.side + sin * 0.15, z = w.z - sin * 0.65 * c.side + cos * 0.15;
  const ground = groundAt(frame, x, z);
  flightWater.height = -Infinity;
  frame.water(x, z, flightWater);
  let y = Math.max(ground, flightWater.height - PUT_DRAFT);
  if (!Number.isFinite(y)) y = w.groundY;
  c.p1[0] = x; c.p1[1] = y; c.p1[2] = z;
  qFromAxisAngle(UP, w.yaw, c.q1);
  c.put = { x, y, z, yaw: w.yaw };
}

// Let go of it where it is (into the water, a fall): the scene's again.
function dropBoard(rider, events) {
  const c = rider.carry;
  if (c.phase === 'none') return;
  c.phase = 'none';
  rider.out.carry = null;
  events.putDown = { x: c.p[0], y: c.p[1], z: c.p[2], yaw: noseOf(c.q) };
}

// --- the scene's side ----------------------------------------------------------------

// What he does to his board, done by the scene after stepRider (Surfboard.jsx,
// the lab): held where his hands have it (the scene does not step a board he
// holds, out.carry), put down where he left it, turned the right way up for
// him to climb on, kicked back by his jump off it.
export function boardFollows(rider, state, dt) {
  const { events, carry } = rider.out;
  if (carry) {
    for (let k = 0; k < 3; k += 1) {
      state.v[k] = dt > 0 ? (carry.p[k] - state.p[k]) / dt : 0;
      state.p[k] = carry.p[k];
      state.w[k] = 0;
    }
    state.q[0] = carry.q[0]; state.q[1] = carry.q[1]; state.q[2] = carry.q[2]; state.q[3] = carry.q[3];
  }
  const put = events.putDown;
  if (put) resetBoard(state, { x: put.x, y: put.y, z: put.z, yaw: put.yaw });
  if (events.flipBoard) resetBoard(state, { x: state.p[0], y: state.p[1], z: state.p[2], yaw: noseOf(state.q) });
  if (events.kick) { state.v[0] += events.kick[0]; state.v[1] += events.kick[1]; state.v[2] += events.kick[2]; }
}

// The leash's two ends, to draw it: his back ankle and the plug in the tail.
// Whether it is on.
export function leashEnds(rider, state, from, to) {
  bodyPoint(rider.world.bodies[SEGMENT.footR], ANKLE_LOCAL, from);
  toWorld(state, rider.leashLocal, to);
  return rider.leashed;
}

// Where on the board he swims for: the rail beside him, level with where he is
// along it but clear of the nose and the fins.
function climbPoint(rider, board, out) {
  const pelvis = rider.world.bodies[SEGMENT.pelvis];
  toLocal(board, pelvis.x, railLocal);
  const half = rider.board.length / 2;
  const z = clamp(railLocal[2], -half + 0.35, half - 0.45);
  const x = (railLocal[0] >= 0 ? 1 : -1) * (rider.board.halfWidth ? rider.board.halfWidth(z) : 0.24);
  railLocal[0] = x; railLocal[1] = rider.board.deckY(x, z); railLocal[2] = z;
  return toWorld(board, railLocal, out);
}

// The crawl's drive: each arm pulling through the water, and the kick, push
// him along his heading — while he is in the water to push against it.
function swimThrust(rider, w) {
  const chest = w.bodies[SEGMENT.chest];
  const wet = rider.samples[SEGMENT.chest].height - chest.x[1] > -0.1;
  if (!wet) return;
  const phaseL = ((rider.swimPhase % 1) + 1) % 1, phaseR = (((rider.swimPhase + 0.5) % 1) + 1) % 1;
  const pull = (phase) => (phase < 0.5 ? Math.sin(Math.PI * phase / 0.5) : 0);
  const thrust = rider.swimEffort * (SWIM_PULL * (pull(phaseL) + pull(phaseR)) + SWIM_KICK);
  const fx = Math.sin(rider.swimYaw) * thrust, fz = Math.cos(rider.swimYaw) * thrust;
  chest.f[0] += fx * 0.6; chest.f[2] += fz * 0.6;
  const pelvis = w.bodies[SEGMENT.pelvis];
  pelvis.f[0] += fx * 0.4; pelvis.f[2] += fz * 0.4;
}

// One arm's stroke: its phase runs 0..1 over STROKE_TIME; a new one starts
// when asked (or, paddling, when the other arm is half way through its own).
function advanceStroke(rider, arm, dt, paddling) {
  const key = `stroke${arm}`, queue = `queue${arm}`;
  if (rider[key] >= 0) {
    rider[key] += dt / STROKE_TIME;
    if (rider[key] >= 1) rider[key] = -1;
  }
  if (rider[key] < 0) {
    const other = rider[arm === 'L' ? 'strokeR' : 'strokeL'];
    const turn = paddling && rider.nextArm === arm && (other < 0 || other >= 0.5);
    if (rider[queue] > 0 || turn) {
      rider[key] = 0;
      rider[queue] = Math.max(0, rider[queue] - 1);
      rider.nextArm = arm === 'L' ? 'R' : 'L';
    }
  }
}

// The water on one part of him: it floats him by its share of his volume under
// the surface, and drags him with its flow — as an exact decay of his speed
// through it, which no stiffness of water can make unstable.
function waterOn(rider, body, i, h) {
  const sample = rider.samples[i];
  if (!(sample.height > -Infinity)) return;
  // How tall the box stands now, and how much of it is under.
  const hx = body.half[0], hy = body.half[1], hz = body.half[2];
  const q = body.q;
  const r10 = 2 * (q[0] * q[1] + q[2] * q[3]), r11 = 1 - 2 * (q[0] * q[0] + q[2] * q[2]), r12 = 2 * (q[1] * q[2] - q[0] * q[3]);
  const reach = Math.abs(r10) * hx + Math.abs(r11) * hy + Math.abs(r12) * hz;
  const wet = clamp((sample.height - (body.x[1] - reach)) / (2 * reach), 0, 1);
  if (wet <= 0) return;
  // Foam is part air: less lift, the same shove.
  const lift = RHO * G * rider.volume[i] * wet * (1 - 0.4 * (sample.whitewater || 0));
  body.f[1] += lift;
  const area = 4 * (hx * hy + hy * hz + hz * hx) / 3;
  const rx = body.v[0] - sample.vx, ry = body.v[1] - sample.vy, rz = body.v[2] - sample.vz;
  const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const k = 0.5 * RHO * 1.0 * area * speed * wet;
  const keep = Math.exp(-k * h / body.mass);
  body.v[0] = sample.vx + rx * keep; body.v[1] = sample.vy + ry * keep; body.v[2] = sample.vz + rz * keep;
  const spin = Math.exp(-4 * wet * h);
  body.w[0] *= spin; body.w[1] *= spin; body.w[2] *= spin;
}

// The leash's pull on the back ankle (N), when it is taut; the board gets the
// opposite (returned so the caller can hand it over).
const ankle = [0, 0, 0], ankleArm = [0, 0, 0], pullF = [0, 0, 0];
const ANKLE_LOCAL = [0, 0.045, -0.06];
function leashPull(rider, foot) {
  bodyPoint(foot, ANKLE_LOCAL, ankle);
  const dx = rider.leashAnchor[0] - ankle[0], dy = rider.leashAnchor[1] - ankle[1], dz = rider.leashAnchor[2] - ankle[2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= LEASH_LENGTH) return null;
  const nx = dx / d, ny = dy / d, nz = dz / d;
  qRotate(foot.q, ANKLE_LOCAL, ankleArm);
  // The ankle's velocity along the rope against the plug's.
  const vax = foot.v[0] + foot.w[1] * ankleArm[2] - foot.w[2] * ankleArm[1];
  const vay = foot.v[1] + foot.w[2] * ankleArm[0] - foot.w[0] * ankleArm[2];
  const vaz = foot.v[2] + foot.w[0] * ankleArm[1] - foot.w[1] * ankleArm[0];
  const opening = (rider.leashVelocity[0] - vax) * nx + (rider.leashVelocity[1] - vay) * ny + (rider.leashVelocity[2] - vaz) * nz;
  const tension = Math.max(0, LEASH_STIFFNESS * (d - LEASH_LENGTH) + LEASH_DAMPING * opening);
  pullF[0] = nx * tension; pullF[1] = ny * tension; pullF[2] = nz * tension;
  foot.f[0] += pullF[0]; foot.f[1] += pullF[1]; foot.f[2] += pullF[2];
  foot.t[0] += ankleArm[1] * pullF[2] - ankleArm[2] * pullF[1];
  foot.t[1] += ankleArm[2] * pullF[0] - ankleArm[0] * pullF[2];
  foot.t[2] += ankleArm[0] * pullF[1] - ankleArm[1] * pullF[0];
  return pullF;
}

export { SEGMENT_NAMES };
