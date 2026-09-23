import {
  JOINTS, SEGMENT, SEGMENT_NAMES, createRiderRagdoll, segmentVolume,
} from './riderSkeleton.js';
import {
  createControls, createPose, jointTargets, popUpControls, proneControls, solvePose, standControls,
} from './riderPose.js';
import {
  bodyPoint, driveKinematic, placeBody, qConj, qFromAxisAngle, qMul, qRotate, qRotateInverse, qSlerp, setKinematic, stepRagdoll,
} from './ragdoll.js';

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
//   recover  back to the board: pulled to it as a swimmer pulls himself along
//            his leash, then lying on it again.
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
// After a fall: in the water at least this long, back by this long anyway.
const FALL_SETTLE = 1.2;
const FALL_GIVE_UP = 3.2;
// A man under water swims for the air: this much lift at the chest and head
// once the first tumble is over and while the head is under.
const SWIM_UP = 220;
const SWIM_AFTER = 0.5;
const RECOVER_PULL = 1.5;
const RECOVER_NEAR = 0.2;
const RECOVER_GIVE_UP = 6;
// The leash: 6 ft of urethane that stretches.
const LEASH_LENGTH = 1.85;
const LEASH_STIFFNESS = 380;
const LEASH_DAMPING = 32;
// The legs as a spring under the trunk: an impact sinks the hips, a drop lets
// them rise; ~2 Hz, a little under critical.
const LEG_FREQUENCY = 2 * Math.PI * 2.1;
const LEG_DAMPING = 0.75;
const SINK_RANGE = [-0.07, 0.22];

// Which bodies the pose carries in each state.
const CARRIED = {
  prone: ['pelvis', 'abdomen', 'chest'],
  popup: ['pelvis', 'abdomen', 'chest', 'footL', 'footR'],
  liedown: ['pelvis', 'abdomen', 'chest', 'footL', 'footR'],
  stand: ['pelvis', 'footL', 'footR'],
  fallen: [],
  recover: [],
};
// Muscle strength by state, as a share of each joint's own stiffness.
const TONE = { prone: 1, popup: 1, liedown: 1, stand: 1, fallen: 0.06, recover: 0.35 };
const LEG_JOINTS = new Set(['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// board: { length, deckY(x, z), halfWidth(z) } in the board's frame.
export function createRider(board) {
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
    state: 'prone',
    stateTime: 0,
    // Where each body stood on the board when its state began, for the blend.
    entry: { position: SEGMENT_NAMES.map(() => [0, 0, 0]), rotation: SEGMENT_NAMES.map(() => [0, 0, 0, 1]) },
    strokeL: -1, strokeR: -1, nextArm: 'L', queueL: 0, queueR: 0,
    counters: { popUp: 0, strokeLeft: 0, strokeRight: 0 },
    crouch: 0, crouchRate: 0, lastCrouch: 0,
    sink: 0, sinkV: 0, sway: 0, swayV: 0,
    boardV: null,
    slowFor: 0,
    samples: SEGMENT_NAMES.map(() => ({ height: -Infinity, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity })),
    volume: SEGMENT_NAMES.map((_, i) => segmentVolume(i)),
    leashLocal: [0, board.deckY(0, -board.length / 2 + 0.06) + 0.01, -board.length / 2 + 0.06],
    leashAnchor: [0, 0, 0], leashVelocity: [0, 0, 0],
    out: {
      onBoard: true,
      stand: 0,
      input: { forward: 0, back: 0, left: 0, right: 0, pop: false, pump: 0, stand: 0 },
      leash: null,
      leashForce: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
      events: { fell: false, stood: false, landed: 0, hit: 0, flipBoard: false },
      chest: [0, 0, 0], pelvis: [0, 0, 0],
      // How far his chest is off where the pose holds it (m), standing.
      chestOff: 0,
    },
  };
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
      toLocal(board, body.x, rider.entry.position[i]);
      qConj(board.q, bqi);
      qMul(bqi, body.q, rider.entry.rotation[i]);
    }
  });
  const tone = TONE[state];
  rider.world.joints.forEach((joint, i) => {
    joint.stiffness = rider.baseStiffness[i] * (state === 'prone' && LEG_JOINTS.has(JOINTS[i].name) ? 0.25 : tone);
  });
  rider.world.pins.length = 0;
}

// The controls' counters only ever grow; a rider starting now takes their
// present values as seen, or a press from before would read as one now.
export function syncRider(rider, intent) {
  rider.counters.popUp = intent?.popUp ?? 0;
  rider.counters.strokeLeft = intent?.strokeLeft ?? 0;
  rider.counters.strokeRight = intent?.strokeRight ?? 0;
}

// Put him on the board at once, lying: a respawn.
export function resetRider(rider, board) {
  setState(rider, 'prone');
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
}

// --- one frame -------------------------------------------------------------------

// frame: { dt, board: { p, q, v, w, speed, wipeout }, intent, water(x, z, out),
// ground(x, z) | null }. The board is where it stands after this frame's step.
export function stepRider(rider, frame) {
  const { dt, board, intent } = frame;
  const out = rider.out;
  const events = out.events;
  events.fell = false; events.stood = false; events.landed = 0; events.hit = 0; events.flipBoard = false;
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
  const lean = clamp(intent.lean || 0, -1, 1);
  const trim = clamp(intent.trim || 0, -1, 1);
  // The crouch eases in like a body, and how fast he rises out of it is his pump.
  const crouchTarget = clamp(intent.crouch || 0, 0, 1);
  const previousCrouch = rider.crouch;
  rider.crouch += (crouchTarget - rider.crouch) * Math.min(1, dt * 9);
  rider.crouchRate = (rider.crouch - previousCrouch) / dt;

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
    if (popUp) { enter(rider, 'popup', board); events.stood = true; }
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
    // A board that has stopped cannot hold a standing man: he lies back down.
    rider.slowFor = frame.board.speed < SLOW_SPEED ? rider.slowFor + dt : 0;
    if (rider.slowFor > SLOW_TIME) enter(rider, 'liedown', board);
  } else if (state === 'fallen') {
    const settled = rider.stateTime > FALL_SETTLE;
    if ((settled && (popUp || strokeLeft || strokeRight || trim > 0.2)) || rider.stateTime > FALL_GIVE_UP) {
      enter(rider, 'recover', board);
    }
  }
  // Stand value for the board: how much of him is up on his feet.
  out.stand = rider.state === 'stand' ? 1
    : rider.state === 'popup' ? smoothstep(0.3, 0.9, rider.stateTime / POPUP_TIME)
      : rider.state === 'liedown' ? 1 - smoothstep(0.1, 0.7, rider.stateTime / LIEDOWN_TIME) : 0;
  input.stand = out.stand;

  // --- the pose, in the board's frame ---------------------------------------------
  const onBoard = rider.state !== 'fallen' && rider.state !== 'recover';
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
  else proneControls(rider.board, { strokeL: rider.strokeL, strokeR: rider.strokeR, arch: 0.6 + 0.4 * Math.max(trim, 0) }, rider.controls);
  solvePose(rider.controls, rider.pose);

  // Muscles: toward the pose's joint rotations on the board, toward a loose
  // body in the water.
  if (onBoard || rider.state === 'recover') jointTargets(rider.pose, JOINTS, rider.targets);
  world.joints.forEach((joint, i) => {
    const target = rider.state === 'fallen' ? rider.relaxed[i] : rider.targets[i];
    joint.target[0] = target[0]; joint.target[1] = target[1]; joint.target[2] = target[2]; joint.target[3] = target[3];
  });

  // The carried bodies: to their pose on the board, blended in from where
  // they were when this state began.
  const blend = smoothstep(0, BLEND_TIME, rider.stateTime);
  world.bodies.forEach((body, i) => {
    if (!body.kinematic) return;
    const lp = rider.pose.position[i], lq = rider.pose.rotation[i];
    const ep = rider.entry.position[i], eq = rider.entry.rotation[i];
    tv[0] = ep[0] + (lp[0] - ep[0]) * blend; tv[1] = ep[1] + (lp[1] - ep[1]) * blend; tv[2] = ep[2] + (lp[2] - ep[2]) * blend;
    qSlerp(eq, lq, blend, tq);
    toWorld(board, tv, tv2);
    qMul(board.q, tq, tq2);
    driveKinematic(body, tv2, tq2);
  });

  // Recover: pulled to the board, pelvis and chest, harder by the second.
  if (rider.state === 'recover') {
    const pull = smoothstep(0, RECOVER_PULL, rider.stateTime);
    for (const name of ['pelvis', 'chest']) {
      const i = SEGMENT[name];
      let pin = world.pins.find((p) => p.body === world.bodies[i]);
      if (!pin) {
        pin = { body: world.bodies[i], local: [0, 0, 0], target: [0, 0, 0], targetQ: [0, 0, 0, 1], targetV: [0, 0, 0], stiffness: 0, angularStiffness: 0, damping: 0 };
        world.pins.push(pin);
      }
      toWorld(board, rider.pose.position[i], pin.target);
      qMul(board.q, rider.pose.rotation[i], pin.targetQ);
      pin.targetV[0] = board.v[0]; pin.targetV[1] = board.v[1]; pin.targetV[2] = board.v[2];
      pin.stiffness = 200 + 7800 * pull * pull;
      pin.angularStiffness = 40 + 900 * pull * pull;
      pin.damping = 2 + 6 * pull;
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
  const leashOn = !onBoard;
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
      if (rider.state === 'fallen' && rider.stateTime > SWIM_AFTER) {
        const head = w.bodies[SEGMENT.head], chest = w.bodies[SEGMENT.chest];
        const under = rider.samples[SEGMENT.head].height - head.x[1];
        if (under > 0) {
          const push = SWIM_UP * clamp(under / 0.3, 0, 1);
          head.f[1] += push * 0.4; chest.f[1] += push * 0.6;
        }
      }
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
  if ((rider.state === 'prone' || rider.state === 'liedown') && (board.wipeout || up < CAPSIZED)) {
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
      // A board floating on its deck is turned over before he climbs on.
      if (up < 0.3) events.flipBoard = true;
      enter(rider, 'prone', board);
      rider.strokeL = -1; rider.strokeR = -1;
    }
  }

  out.onBoard = rider.state !== 'fallen' && rider.state !== 'recover';
  bodyPoint(world.bodies[SEGMENT.chest], [0, 0, 0], out.chest);
  bodyPoint(world.bodies[SEGMENT.pelvis], [0, 0, 0], out.pelvis);
  return out;
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
