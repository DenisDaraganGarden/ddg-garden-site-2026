// The surfboard and its invisible rider as one rigid body, pushed around by a
// water surface that is only ever asked for its height and flow at a point.
// Nothing here knows about three.js or the scene: the runtime hands in a hull
// (boardShape.js), a water function and the scene clock, and reads back a pose.
//
// Frames. The board's local frame is the hull contract's: +Z to the nose, +Y up
// out of the deck, origin on the centreline at mid-length on the lowest rocker
// point. It is right-handed, so a rider facing the nose has his RIGHT hand on
// local -X. «Right» in the input always means that side: the board leans onto
// its -X rail and turns clockwise seen from above (three.js yaw decreases).
//
// Numerics. Water on a board is stiff: a 1.5 kg board in an 8 m/s bore meets a
// drag that would stop it in a fraction of a millisecond, and a floating board
// is a spring of thousands of N/m. Every force that damps a velocity or springs
// back a position is therefore linearised and solved implicitly (a 6x6 system
// per substep, Baraff-Witkin style), everything else is explicit. The result
// cannot blow up at any mass the settings allow, at a 1/240 s substep or 1/120.
// No object, array or closure is created per step: all scratch lives in this
// module or the body. (What V8 still boxes, doubles passed to calls it did not
// inline, costs a sub-millisecond young-generation sweep every second or so.)

const RHO = 1025; // sea water, kg/m^3
const G = 9.81;
const RHO_AIR = 1.2;

const SUBSTEP = 1 / 240;
// The editor's mooring as a leash: metres of full pull, and its strongest pull
// in board weights.
const MOOR_REACH = 2;
const MOOR_PULL = 1.5;
const MAX_DT = 0.1;

// --- Water on the hull -------------------------------------------------------
// Planing and slamming pressure: F = ½ρ·CP·area·|V|·w along the bottom normal,
// w the flow into the bottom. At small trim this is a lift ½ρU²·CP·sinα per
// area, at normal incidence the drag of a flat plate. CP = 2 is that plate's
// normal-force coefficient across a two-dimensional flow. For planing it sits
// above the thin planing plate's π/2: the margin a real bottom's vee and
// concave give, and what keeps a trimmed 78 kg rider on top down to 3.5 m/s.
const CP = 2;
// Under water both faces are wet and the board is no longer a planing plate
// but a wing of aspect ratio ~0.3 moving along its length: lift slope πAR/2.
// Broadside (heave, slam) it stays a flat plate at CP.
const CP_WING = 0.5;
const GREEN_WATER = 0.05; // m of water over the deck for the switch
// A bottom leaving the water drags a little water with it; real suction on a
// convex bottom exists but is small next to the lift.
const SUCTION = 0.1;
// Speed floor added to |V| in the normal pressure: the wave-making (radiation)
// damping of a plate heaving at rest, which a purely quadratic drag lacks, so a
// floating board settles in seconds instead of ringing forever.
const HEAVE_FLOOR = 0.3; // m/s
// Skin friction per wetted face (flat plate, Re ~ 1e6-1e7).
const SKIN = 0.004;
// Sideways grip of the hull per unit planform area, a lift slope per radian of
// sideslip: a planing surface sliding sideways is a keel as deep as it is wet,
// a few cm over a metre of rail, which is 0.1-0.3 of the planform. Rails and
// the tail bite, the flat middle and the lifted nose mostly skim. More than
// this and the straight keel it models fights every turn: the fins track.
const GRIP = { bottom: 0.1, rail: 0.3, nose: 0.1, tail: 0.3 };
// Contact is soft: pressure starts 2 cm above the surface (spray root, the
// water the bottom pushes up ahead of itself) and is full 3 cm below it.
const CONTACT_ABOVE = 0.02;
const CONTACT_BELOW = 0.03;
// Whitewater is part air: less buoyancy and less lift in foam.
const FOAM_AIR = 0.4;
// Board, rider and air: drag area Cd·A, m^2.
const AIR_DRAG_BOARD = 0.02;
const AIR_DRAG_RIDER = 0.45;

// --- Fins -------------------------------------------------------------------
// Low aspect ratio lifting surfaces with the hull as a reflection plane.
const FIN_SLOPE = 3.2; // dCL/dβ per radian
const FIN_STALL = 0.35; // ~20°: beyond it the side fins let go (a spin-out)
const FIN_STALL_BLEND = 0.1;
const FIN_STALLED_CN = 1.2; // a stalled fin is a flat plate across the flow
const FIN_CD0 = 0.012;
const FIN_ASPECT = 2.5; // effective AR of a thruster fin on its reflection plane

// --- Rider ------------------------------------------------------------------
// A human is ~0.95 as dense as sea water. Slow, he lies on the board, as a
// surfer waits in the lineup and paddles: chest, hips and thighs are the
// first 0.12 m above the deck and hold most of his volume, so the deck rests
// a hand's width under (~7 cm with 75 kg on a 31 L board). Sitting up he
// would be waist deep, his volume spread over 0.45 m and the deck sunk 0.3 m:
// with no body drawn that board looks drowned, so he only stands at speed,
// where the deck is dry and the reach no longer matters.
const RIDER_DENSITY = 0.95;
const RIDER_WAIST = 0.45;
const RIDER_PRONE = 0.12;
// His centre of mass: stance along the board as a fraction of length (behind
// the middle, over the planing area) and height above the deck. The point is a
// compromise between a prone paddler (0.15 m) and a crouched rider (0.7 m).
const RIDER_STANCE = -0.06;
const RIDER_HEIGHT = 0.3;
// His body as its own inertia about his centre of mass, m^2 per kg.
const RIDER_GYRATION = { across: 0.08, vertical: 0.02 };
// Where his weight meets the deck, for his buoyancy: knees and hips.
const RIDER_SPREAD_X = 0.12;
const RIDER_SPREAD_Z = 0.2;
// Balance. The rider keeps the board's roll on a target by moving his weight
// across it: the torque he can make is his load on the deck times how far he
// can shift it (BALANCE_REACH across, twice that along), so he cannot balance
// in the air or while his own body floats him. His gains put a 5 rad/s,
// 0.9-damped response on top of cancelling the topple of his own height.
const BALANCE_FREQUENCY = 5;
const BALANCE_DAMPING = 0.9;
const BALANCE_REACH = 0.22;
// Lying down he also keeps the board level fore and aft, sliding along it
// to the sweet spot where the nose neither digs nor rears: stiffer, since the
// flow's pitching moment on a sunk board grows with every stroke.
const TRIM_FREQUENCY = 10;
// Carving: A/D lean the board onto a rail by up to this much (× tuning.carve).
const LEAN_MAX = 0.6; // rad ≈ 35°
const CARVE_RADIUS = 3.5; // m: a shortboard on its rail
// Weight fore and aft: W/S move him ±0.15 m along the board once he rides;
// slower than that he lies prone over the board's centre of buoyancy.
const SHIFT_MAX = 0.15;
// Paddling: arms give about 1 m/s² from rest, nothing at 2.2 m/s.
const PADDLE_ACCEL = 1;
const PADDLE_TOP = 2.2;
// Pumping the board on a wave (and W while planing, at half).
const PUMP_ACCEL = 0.6;
// Paddle steering at low speed: a turn rate he reaches in STEER_TIME.
const STEER_RATE = 1.2; // rad/s
const STEER_TIME = 0.25;
// S digs the tail: a braking rate, 1/s.
const TAIL_DIG = 0.6;
// Pop: an upward kick and the time before the next.
const POP_SPEED = 1.8;
const POP_COOLDOWN = 0.8;

// --- Sand -------------------------------------------------------------------
const GROUND_FREQUENCY = 60; // rad/s: the board sinks g/ω² ≈ 3 mm into sand
const GROUND_SKIN = 0.01;
const SAND_FRICTION = 0.6;
const SAND_STICK = 200; // 1/s: static friction as a stiff viscous stop

// --- Wipeout ----------------------------------------------------------------
const UPSIDE_DOWN = 0.2;
const UPSIDE_TIME = 0.6;
const BURIED_DEPTH = 0.8;
const BURIED_TIME = 2;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createBoardBody(hull, { boardMass = 3.2, riderMass = 75, tuning = {} } = {}) {
  const points = hull.points;
  const count = points.length;
  const rider = riderMass > 0 ? riderMass : 0;
  const mass = boardMass + rider;
  let volume = 0;
  let area = 0;
  for (const p of points) { volume += p.volume; area += p.area; }

  // The board's mass follows its foam: each column weighs its share of volume.
  const stanceZ = RIDER_STANCE * hull.length;
  const deckAtStance = hull.deckY(0, stanceZ);
  const riderY = deckAtStance + RIDER_HEIGHT;
  let cx = 0, cy = 0, cz = 0, buoyancyZ = 0;
  for (const p of points) {
    const m = boardMass * p.volume / volume;
    cx += m * p.x; cy += m * (p.y + p.height / 2); cz += m * p.z;
    buoyancyZ += p.z * p.volume / volume;
  }
  cy += rider * riderY; cz += rider * stanceZ;
  const com = [cx / mass, cy / mass, cz / mass];

  // Inertia about the centre of mass: columns as small boxes, the rider as a
  // point with a body of his own.
  const I = new Float64Array(9);
  const addPoint = (m, x, y, z) => {
    I[0] += m * (y * y + z * z); I[4] += m * (x * x + z * z); I[8] += m * (x * x + y * y);
    I[1] -= m * x * y; I[2] -= m * x * z; I[5] -= m * y * z;
  };
  for (const p of points) {
    const m = boardMass * p.volume / volume;
    addPoint(m, p.x - com[0], p.y + p.height / 2 - com[1], p.z - com[2]);
    const side2 = p.area, h2 = p.height * p.height;
    I[0] += m * (h2 + side2) / 12; I[4] += m * (2 * side2) / 12; I[8] += m * (h2 + side2) / 12;
  }
  if (rider) {
    addPoint(rider, -com[0], riderY - com[1], stanceZ - com[2]);
    I[0] += rider * RIDER_GYRATION.across; I[4] += rider * RIDER_GYRATION.vertical; I[8] += rider * RIDER_GYRATION.across;
  }
  I[3] = I[1]; I[6] = I[2]; I[7] = I[5];

  // Hull points relative to the centre of mass, with the bottom's own normal
  // (rocker along the board; the rail's turn-down is clamped so a rail point
  // still presses up, not sideways).
  const pr = new Float64Array(count * 3);
  const pn = new Float64Array(count * 3);
  const pa = new Float64Array(count);
  const pv = new Float64Array(count);
  const ph = new Float64Array(count);
  const pg = new Float64Array(count);
  const e = 0.01;
  points.forEach((p, i) => {
    pr[i * 3] = p.x - com[0]; pr[i * 3 + 1] = p.y - com[1]; pr[i * 3 + 2] = p.z - com[2];
    const sx = clamp((hull.bottomY(p.x + e, p.z) - hull.bottomY(p.x - e, p.z)) / (2 * e), -0.3, 0.3);
    const sz = (hull.bottomY(p.x, p.z + e) - hull.bottomY(p.x, p.z - e)) / (2 * e);
    const l = Math.hypot(sx, 1, sz);
    pn[i * 3] = -sx / l; pn[i * 3 + 1] = 1 / l; pn[i * 3 + 2] = -sz / l;
    pa[i] = p.area; pv[i] = p.volume; ph[i] = Math.max(p.height, 0.005);
    pg[i] = GRIP[p.kind] ?? GRIP.bottom;
  });

  // Fins: the plane's normal starts along local +X and is turned by cant
  // (rotation.z) then toe (rotation.y), as three.js turns the fin mesh.
  const fins = hull.fins ?? [];
  const finCount = fins.length;
  const fr = new Float64Array(finCount * 3);
  const froot = new Float64Array(finCount * 3);
  const fn = new Float64Array(finCount * 3);
  const fc = new Float64Array(finCount * 3);
  const fa = new Float64Array(finCount);
  const fd = new Float64Array(finCount);
  const finCentre = [0, 0, 0];
  fins.forEach((f, j) => {
    fr[j * 3] = f.x - com[0]; fr[j * 3 + 1] = f.y - com[1]; fr[j * 3 + 2] = f.z - com[2];
    froot[j * 3] = f.x - com[0]; froot[j * 3 + 1] = hull.bottomY(f.x, f.z) - com[1]; froot[j * 3 + 2] = f.z - com[2];
    const toe = f.toe ?? 0, cant = f.cant ?? 0;
    fn[j * 3] = Math.cos(cant) * Math.cos(toe); fn[j * 3 + 1] = Math.sin(cant); fn[j * 3 + 2] = -Math.cos(cant) * Math.sin(toe);
    fc[j * 3] = Math.sin(toe); fc[j * 3 + 1] = 0; fc[j * 3 + 2] = Math.cos(toe);
    fa[j] = f.area; fd[j] = f.depth;
    finCentre[0] += fr[j * 3] / finCount; finCentre[1] += fr[j * 3 + 1] / finCount; finCentre[2] += fr[j * 3 + 2] / finCount;
  });

  // The rider's buoyancy acts where he meets the deck, spread over knees and
  // hips so that his own body resists a little pitch and roll.
  const rb = new Float64Array(12);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) => {
    const x = sx * RIDER_SPREAD_X, z = stanceZ + sz * RIDER_SPREAD_Z;
    rb[k * 3] = x - com[0]; rb[k * 3 + 1] = hull.deckY(x, z) - com[1]; rb[k * 3 + 2] = z - com[2];
  });

  // Balance gains about the roll (Z) and pitch (X) axes: a 5 rad/s response
  // plus the stiffness that cancels the topple of the centre of mass standing
  // above the deck he floats on.
  const topple = mass * G * Math.max(com[1] - deckAtStance, 0);
  const gains = (inertia, frequency) => {
    const kp = inertia * frequency * frequency + topple;
    return [kp, 2 * BALANCE_DAMPING * Math.sqrt(kp * inertia)];
  };

  return {
    mass, boardMass, riderMass: rider, volume, planformArea: area,
    length: hull.length, width: hull.width,
    tuning: { paddle: tuning.paddle ?? 1, carve: tuning.carve ?? 1, balance: tuning.balance ?? 1 },
    com, inertia: I,
    count, pr, pn, pa, pv, ph, pg,
    finCount, fr, froot, fn, fc, fa, fd, finCentre,
    stance: [-com[0], riderY - com[1], stanceZ - com[2]],
    // Lying down to paddle he slides up over the foam's centre of buoyancy.
    proneShift: buoyancyZ - stanceZ,
    deckStance: [-com[0], deckAtStance - com[1], stanceZ - com[2]],
    riderVolume: RIDER_DENSITY * rider / RHO, riderPoints: rb,
    rollGains: gains(I[8], BALANCE_FREQUENCY), pitchGains: gains(I[0], TRIM_FREQUENCY),
    // Per-step scratch: where each point is and what the water said there.
    rw: new Float64Array(count * 3), at: new Float64Array(count * 5), groundAt: new Float64Array(count),
  };
}

export function createBoardState(pose = {}) {
  const state = {
    p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],
    contact: 0, speed: 0, planing: 0, wetArea: 0, onFace: false, airborne: false,
    wipeout: false, wipeoutTime: 0, upsideTime: 0, buriedTime: 0, popCooldown: 0, riding: 0,
  };
  return resetBoard(state, pose);
}

export function resetBoard(state, { x = 0, y = 0, z = 0, yaw = 0, speed = 0 } = {}) {
  state.p[0] = x; state.p[1] = y; state.p[2] = z;
  state.q[0] = 0; state.q[1] = Math.sin(yaw / 2); state.q[2] = 0; state.q[3] = Math.cos(yaw / 2);
  state.v[0] = speed * Math.sin(yaw); state.v[1] = 0; state.v[2] = speed * Math.cos(yaw);
  state.w[0] = 0; state.w[1] = 0; state.w[2] = 0;
  state.contact = 0; state.speed = Math.abs(speed); state.planing = 0; state.wetArea = 0;
  state.onFace = false; state.airborne = false;
  state.wipeout = false; state.wipeoutTime = 0; state.upsideTime = 0; state.buriedTime = 0; state.popCooldown = 0;
  return state;
}

// The board origin's pose: position into {x,y,z}, rotation (local→world) into
// {x,y,z,w}. THREE.Vector3 and THREE.Quaternion take plain assignment.
export function boardPose(state, position, quaternion) {
  if (position) { position.x = state.p[0]; position.y = state.p[1]; position.z = state.p[2]; }
  if (quaternion) { quaternion.x = state.q[0]; quaternion.y = state.q[1]; quaternion.z = state.q[2]; quaternion.w = state.q[3]; }
}

export function boardDiagnostics(state, out = {}) {
  out.speed = state.speed;
  out.planing = state.planing;
  out.wetArea = state.wetArea;
  out.onFace = state.onFace;
  out.airborne = state.airborne;
  out.riding = state.riding;
  return out;
}

// --- scratch ------------------------------------------------------------------
const R = new Float64Array(9);
const Iw = new Float64Array(9);
const A = new Float64Array(36);
const rhs = new Float64Array(6);
const stiff = new Float64Array(6);
const xi = new Float64Array(6);
const g6 = new Float64Array(6);
const F = new Float64Array(3);
const T = new Float64Array(3);
const c = new Float64Array(3);
const vc = new Float64Array(3);
const sample = { height: 0, vx: 0, vy: 0, vz: 0, whitewater: 0, ground: -Infinity };
const NO_INPUT = Object.freeze({ forward: 0, back: 0, left: 0, right: 0, pop: false, pump: false });
// The substep and the water plane under the board (height, centre x, z and
// slopes), refitted every substep. Kept in a typed array: a module-level `let`
// holding a double is boxed afresh on every store.
const num = new Float64Array(6);
const H_STEP = 0, PLANE_H = 1, PLANE_X = 2, PLANE_Z = 3, PLANE_GX = 4, PLANE_GZ = 5;
const planeAt = (x, z) => num[PLANE_H] + num[PLANE_GX] * (x - num[PLANE_X]) + num[PLANE_GZ] * (z - num[PLANE_Z]);
// (Math.hypot is avoided below: V8 allocates an array for its arguments.)
// Per-substep results the step reads back.
const out = { wetArea: 0, dynamic: 0, buoyant: 0, slope: 0, deckDepth: 0 };

function setRotation(q) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
  R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
  R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
}

// A force that is linear in the velocity (damping) or position (stiffness) of a
// point at lever r along direction e goes into the implicit system: the
// generalised direction g = [e; r×e] couples it to both v and ω.
function implicit(damping, stiffness, ex, ey, ez, rx, ry, rz) {
  const hStep = num[H_STEP];
  g6[0] = ex; g6[1] = ey; g6[2] = ez;
  g6[3] = ry * ez - rz * ey; g6[4] = rz * ex - rx * ez; g6[5] = rx * ey - ry * ex;
  const k = hStep * damping + hStep * hStep * stiffness;
  if (stiffness !== 0) {
    let gv = 0;
    for (let i = 0; i < 6; i += 1) gv += g6[i] * xi[i];
    const s = hStep * hStep * stiffness * gv;
    for (let i = 0; i < 6; i += 1) stiff[i] -= s * g6[i];
  }
  for (let i = 0; i < 6; i += 1) {
    const gi = k * g6[i];
    for (let j = 0; j < 6; j += 1) A[i * 6 + j] += gi * g6[j];
  }
}

// The same for a torque about the world vertical: g = [0; ŷ].
function spin(damping, stiffness) {
  const hStep = num[H_STEP];
  A[4 * 6 + 4] += hStep * damping + hStep * hStep * stiffness;
  stiff[4] -= hStep * hStep * stiffness * xi[4];
}

function force(fx, fy, fz, rx, ry, rz) {
  F[0] += fx; F[1] += fy; F[2] += fz;
  T[0] += ry * fz - rz * fy; T[1] += rz * fx - rx * fz; T[2] += rx * fy - ry * fx;
}

// Cholesky on the symmetric positive definite 6x6 in A, solving into rhs.
function solve6() {
  for (let j = 0; j < 6; j += 1) {
    let s = A[j * 6 + j];
    for (let k = 0; k < j; k += 1) s -= A[j * 6 + k] * A[j * 6 + k];
    const d = Math.sqrt(Math.max(s, 1e-12));
    A[j * 6 + j] = d;
    for (let i = j + 1; i < 6; i += 1) {
      let t = A[i * 6 + j];
      for (let k = 0; k < j; k += 1) t -= A[i * 6 + k] * A[j * 6 + k];
      A[i * 6 + j] = t / d;
    }
  }
  for (let i = 0; i < 6; i += 1) {
    let t = rhs[i];
    for (let k = 0; k < i; k += 1) t -= A[i * 6 + k] * rhs[k];
    rhs[i] = t / A[i * 6 + i];
  }
  for (let i = 5; i >= 0; i -= 1) {
    let t = rhs[i];
    for (let k = i + 1; k < 6; k += 1) t -= A[k * 6 + i] * rhs[k];
    rhs[i] = t / A[i * 6 + i];
  }
}

// Water on every hull point: buoyancy, pressure, friction and grip, and sand.
// Buoyancy is the water's pressure gradient over the wet volume. Under a long
// wave the pressure is hydrostatic below the surface, so the gradient is
// ρg·(−∇η, 1): on a face it pushes the board down the slope as well as up.
// That, not a vertical buoyancy, is what lets a wave carry a floating board.
function hullForces(body, w) {
  const { mass, count, pn, pa, pv, ph, pg, rw, at, groundAt } = body;
  const gx = num[PLANE_GX], gz = num[PLANE_GZ];
  const Zx = R[2], Zy = R[5], Zz = R[8];
  const area = body.planformArea;
  let wetArea = 0, dynamic = 0, buoyant = 0;
  for (let i = 0; i < count; i += 1) {
    const rx = rw[i * 3], ry = rw[i * 3 + 1], rz = rw[i * 3 + 2];
    const Py = c[1] + ry;
    const h = at[i * 5];
    const Vx = vc[0] + w[1] * rz - w[2] * ry;
    const Vy = vc[1] + w[2] * rx - w[0] * rz;
    const Vz = vc[2] + w[0] * ry - w[1] * rx;
    const Wx = Vx - at[i * 5 + 1], Wy = Vy - at[i * 5 + 2], Wz = Vz - at[i * 5 + 3];
    const U = Math.sqrt(Wx * Wx + Wy * Wy + Wz * Wz);
    const nlx = pn[i * 3], nly = pn[i * 3 + 1], nlz = pn[i * 3 + 2];
    const nx = R[0] * nlx + R[1] * nly + R[2] * nlz;
    const ny = R[3] * nlx + R[4] * nly + R[5] * nlz;
    const nz = R[6] * nlx + R[7] * nly + R[8] * nlz;
    const H = ph[i];
    const rho = RHO * (1 - FOAM_AIR * at[i * 5 + 4]);

    // Buoyancy of the wet part of the column, at the wet part's centre. The
    // column's lower end is the bottom, or the deck when the board is upside down.
    const span = Math.max(Math.abs(ny) * H, 0.005);
    const low = Py + Math.min(0, ny * H);
    const wet = clamp((h - low) / span, 0, 1);
    if (wet > 0) {
      const fb = rho * G * pv[i] * wet;
      const along = ny >= 0 ? H * wet / 2 : H * (1 - wet / 2);
      const bx = rx + nx * along, by = ry + ny * along, bz = rz + nz * along;
      force(-gx * fb, fb, -gz * fb, bx, by, bz);
      buoyant += fb;
      if (wet < 1) implicit(0, rho * G * pv[i] / span, 0, 1, 0, bx, by, bz);
    }

    // Pressure along the bottom normal from the flow into whichever face is
    // advancing: the bottom (lift, slam) or, when the board is under, the deck.
    const depth = h - Py;
    const deckDepth = depth - ny * H;
    const tb = clamp((depth + CONTACT_ABOVE) / (CONTACT_ABOVE + CONTACT_BELOW), 0, 1);
    const bottomWet = tb * tb * (3 - 2 * tb);
    const td = clamp((deckDepth + CONTACT_ABOVE) / (CONTACT_ABOVE + CONTACT_BELOW), 0, 1);
    const deckWet = td * td * (3 - 2 * td);
    wetArea += pa[i] * bottomWet;
    const vn = Wx * nx + Wy * ny + Wz * nz;
    const qn = 0.5 * rho * pa[i] * (U + HEAVE_FLOOR);
    // Green water: once it runs over the deck the plate is a submerged wing.
    const green = bottomWet * smoothstep(0, GREEN_WATER, deckDepth);
    const cp = CP + (CP_WING - CP) * green * (1 - Math.abs(vn) / Math.max(U, 1e-6));
    if (vn < 0) {
      const kn = qn * cp * bottomWet;
      if (kn > 0) {
        force(-kn * vn * nx, -kn * vn * ny, -kn * vn * nz, rx, ry, rz);
        dynamic += -kn * vn * ny;
        // Deeper is wetter: the contact ramp is a stiffness too.
        const ramp = 6 * tb * (1 - tb) / (CONTACT_ABOVE + CONTACT_BELOW);
        implicit(kn, qn * cp * ramp * -vn * Math.max(ny, 0), nx, ny, nz, rx, ry, rz);
      }
    } else {
      const kn = qn * Math.max(cp * deckWet, SUCTION * bottomWet);
      if (kn > 0) {
        force(-kn * vn * nx, -kn * vn * ny, -kn * vn * nz, rx, ry, rz);
        implicit(kn, 0, nx, ny, nz, rx, ry, rz);
      }
    }

    // Along the surface: friction forward, grip sideways (lift-like, ∝ U·v_side).
    const zn = Zx * nx + Zy * ny + Zz * nz;
    let tx = Zx - zn * nx, ty = Zy - zn * ny, tz = Zz - zn * nz;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const sx2 = ny * tz - nz * ty, sy2 = nz * tx - nx * tz, sz2 = nx * ty - ny * tx;
    const vf = Wx * tx + Wy * ty + Wz * tz;
    const vs = Wx * sx2 + Wy * sy2 + Wz * sz2;
    const kf = 0.5 * rho * pa[i] * U * SKIN * (bottomWet + deckWet);
    const ks = 0.5 * rho * pa[i] * U * pg[i] * Math.max(wet, 0.5 * bottomWet);
    if (kf > 0) {
      force(-kf * vf * tx, -kf * vf * ty, -kf * vf * tz, rx, ry, rz);
      implicit(kf, 0, tx, ty, tz, rx, ry, rz);
    }
    if (ks > 0) {
      force(-ks * vs * sx2, -ks * vs * sy2, -ks * vs * sz2, rx, ry, rz);
      implicit(ks, 0, sx2, sy2, sz2, rx, ry, rz);
    }

    // Sand: a stiff, critically damped floor under the column's lower end, with
    // Coulomb friction regularised into a stiff viscous stop.
    const ground = groundAt[i];
    if (ground > -1e9) {
      const pen = ground + GROUND_SKIN - low;
      if (pen > 0) {
        const share = pa[i] / area;
        const kg = mass * GROUND_FREQUENCY * GROUND_FREQUENCY * share;
        const cg = 2 * mass * GROUND_FREQUENCY * share;
        const off = ny >= 0 ? 0 : H;
        const ex = rx + nx * off, ey = ry + ny * off, ez = rz + nz * off;
        const Gy = vc[1] + w[2] * ex - w[0] * ez;
        const fg = kg * pen - cg * Gy;
        if (fg > 0) {
          force(0, fg, 0, ex, ey, ez);
          implicit(cg, kg, 0, 1, 0, ex, ey, ez);
          const Gx = vc[0] + w[1] * ez - w[2] * ey;
          const Gz = vc[2] + w[0] * ey - w[1] * ex;
          const slide = Math.sqrt(Gx * Gx + Gz * Gz);
          const kt = Math.min(SAND_STICK * mass * share, SAND_FRICTION * fg / Math.max(slide, 1e-6));
          force(-kt * Gx, 0, -kt * Gz, ex, ey, ez);
          implicit(kt, 0, 1, 0, 0, ex, ey, ez);
          implicit(kt, 0, 0, 0, 1, ex, ey, ez);
        }
      }
    }
  }
  out.wetArea = wetArea;
  out.dynamic = dynamic;
  out.buoyant = buoyant;
}

function substep(state, body, input, water, time, moor, external) {
  const hStep = num[H_STEP];
  const { mass, count, pr, pn, ph, rw, at, groundAt } = body;
  const w = state.w;
  setRotation(state.q);
  // Board axes in the world: X (the rider's left), Y (deck up), Z (nose).
  const Xx = R[0], Xy = R[3], Xz = R[6];
  const Yx = R[1], Yy = R[4], Yz = R[7];
  const Zx = R[2], Zy = R[5], Zz = R[8];

  // World inertia R·I·Rᵀ.
  const I = body.inertia;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      let s = 0;
      for (let a = 0; a < 3; a += 1) {
        const ria = R[i * 3 + a];
        if (ria === 0) continue;
        for (let b = 0; b < 3; b += 1) s += ria * I[a * 3 + b] * R[j * 3 + b];
      }
      Iw[i * 3 + j] = s;
    }
  }
  A.fill(0); stiff.fill(0); F.fill(0); T.fill(0);
  for (let i = 0; i < 3; i += 1) {
    A[i * 6 + i] = mass;
    for (let j = 0; j < 3; j += 1) A[(i + 3) * 6 + j + 3] = Iw[i * 3 + j];
  }
  xi[0] = vc[0]; xi[1] = vc[1]; xi[2] = vc[2]; xi[3] = w[0]; xi[4] = w[1]; xi[5] = w[2];

  // First the water under every point, and a plane through it: its tilt is
  // the direction the water's pressure pushes (below), the rider floats in it
  // and balances against it.
  let sx = 0, sz = 0, sh = 0, sxx = 0, sxz = 0, szz = 0, sxh = 0, szh = 0;
  let ux = 0, uz = 0, foam = 0;
  let groundAny = false;
  for (let i = 0; i < count; i += 1) {
    const lx = pr[i * 3], ly = pr[i * 3 + 1], lz = pr[i * 3 + 2];
    const rx = R[0] * lx + R[1] * ly + R[2] * lz;
    const ry = R[3] * lx + R[4] * ly + R[5] * lz;
    const rz = R[6] * lx + R[7] * ly + R[8] * lz;
    rw[i * 3] = rx; rw[i * 3 + 1] = ry; rw[i * 3 + 2] = rz;
    const Px = c[0] + rx, Pz = c[2] + rz;
    sample.height = 0; sample.vx = 0; sample.vy = 0; sample.vz = 0; sample.whitewater = 0; sample.ground = -Infinity;
    water(Px, Pz, time, sample);
    const h = sample.height;
    at[i * 5] = h; at[i * 5 + 1] = sample.vx; at[i * 5 + 2] = sample.vy; at[i * 5 + 3] = sample.vz;
    at[i * 5 + 4] = clamp(sample.whitewater, 0, 1);
    groundAt[i] = sample.ground;
    if (sample.ground > -1e9) groundAny = true;
    sx += Px; sz += Pz; sh += h; sxx += Px * Px; sxz += Px * Pz; szz += Pz * Pz; sxh += Px * h; szh += Pz * h;
    ux += sample.vx; uz += sample.vz; foam += at[i * 5 + 4];
  }
  const inv = 1 / count;
  ux *= inv; uz *= inv; foam *= inv;
  // Least squares h = hm + gx(x − xm) + gz(z − zm), regularised so a board on
  // its rail (the points nearly in a line) still gets a sane tilt.
  const xm = sx * inv, zm = sz * inv, hm = sh * inv;
  const cxx = sxx * inv - xm * xm + 0.01, czz = szz * inv - zm * zm + 0.01, cxz = sxz * inv - xm * zm;
  const cxh = sxh * inv - xm * hm, czh = szh * inv - zm * hm;
  const det = cxx * czz - cxz * cxz;
  const gx = (cxh * czz - czh * cxz) / det;
  const gz = (czh * cxx - cxh * cxz) / det;
  const nl = Math.sqrt(gx * gx + 1 + gz * gz);
  const Nx = -gx / nl, Ny = 1 / nl, Nz = -gz / nl;
  num[PLANE_H] = hm; num[PLANE_X] = xm; num[PLANE_Z] = zm; num[PLANE_GX] = gx; num[PLANE_GZ] = gz;
  const rhoMean = RHO * (1 - FOAM_AIR * foam);

  hullForces(body, w);
  let buoyant = out.buoyant;
  const dynamic = out.dynamic;

  // Fins, all read from one water sample at their centre.
  if (body.finCount) {
    const fcx = body.finCentre[0], fcy = body.finCentre[1], fcz = body.finCentre[2];
    sample.height = 0; sample.vx = 0; sample.vy = 0; sample.vz = 0; sample.whitewater = 0; sample.ground = -Infinity;
    water(c[0] + R[0] * fcx + R[1] * fcy + R[2] * fcz, c[2] + R[6] * fcx + R[7] * fcy + R[8] * fcz, time, sample);
    const hf = sample.height;
    const rho = RHO * (1 - FOAM_AIR * clamp(sample.whitewater, 0, 1));
    for (let j = 0; j < body.finCount; j += 1) {
      const lx = body.fr[j * 3], ly = body.fr[j * 3 + 1], lz = body.fr[j * 3 + 2];
      const rx = R[0] * lx + R[1] * ly + R[2] * lz;
      const ry = R[3] * lx + R[4] * ly + R[5] * lz;
      const rz = R[6] * lx + R[7] * ly + R[8] * lz;
      const rootY = c[1] + R[3] * body.froot[j * 3] + R[4] * body.froot[j * 3 + 1] + R[5] * body.froot[j * 3 + 2];
      const tipY = rootY - Yy * body.fd[j];
      const immersion = clamp((hf - Math.min(rootY, tipY)) / Math.max(Math.abs(rootY - tipY), 0.005), 0, 1);
      if (immersion <= 0) continue;
      const Wx = vc[0] + w[1] * rz - w[2] * ry - sample.vx;
      const Wy = vc[1] + w[2] * rx - w[0] * rz - sample.vy;
      const Wz = vc[2] + w[0] * ry - w[1] * rx - sample.vz;
      const nlx = body.fn[j * 3], nly = body.fn[j * 3 + 1], nlz = body.fn[j * 3 + 2];
      const nx = R[0] * nlx + R[1] * nly + R[2] * nlz;
      const ny = R[3] * nlx + R[4] * nly + R[5] * nlz;
      const nz = R[6] * nlx + R[7] * nly + R[8] * nlz;
      const clx = body.fc[j * 3], clz = body.fc[j * 3 + 2];
      const cx = R[0] * clx + R[2] * clz, cy = R[3] * clx + R[5] * clz, cz = R[6] * clx + R[8] * clz;
      const uf = Wx * cx + Wy * cy + Wz * cz;
      const us = Wx * nx + Wy * ny + Wz * nz;
      const U = Math.sqrt(uf * uf + us * us);
      if (U < 1e-4) continue;
      const beta = Math.atan2(Math.abs(us), Math.abs(uf));
      const sinB = Math.abs(us) / U;
      const attachedCL = FIN_SLOPE * beta;
      const stalledN = FIN_STALLED_CN * sinB;
      const stall = smoothstep(FIN_STALL, FIN_STALL + FIN_STALL_BLEND, beta);
      const cl = (1 - stall) * attachedCL + stall * stalledN * (Math.abs(uf) / U);
      const cd = FIN_CD0 + (1 - stall) * attachedCL * attachedCL / (Math.PI * FIN_ASPECT) + stall * stalledN * sinB;
      const qf = 0.5 * rho * body.fa[j] * immersion * U;
      // Lift across the flow, against the sideslip; drag along it.
      const sign = (us >= 0 ? 1 : -1) * (uf >= 0 ? 1 : -1);
      const px = (-us * cx + uf * nx) / U, py = (-us * cy + uf * ny) / U, pz = (-us * cz + uf * nz) / U;
      const L = -qf * U * cl * sign, D = -qf * cd;
      force(L * px + D * Wx, L * py + D * Wy, L * pz + D * Wz, rx, ry, rz);
      implicit(qf * (sinB > 1e-6 ? Math.min(cl / sinB, FIN_SLOPE) : FIN_SLOPE), 0, nx, ny, nz, rx, ry, rz);
      implicit(qf * cd, 0, cx, cy, cz, rx, ry, rz);
    }
  }

  // Support: how much of the weight the water and sand carry through the hull,
  // along the deck normal.
  const hullSupport = Math.max(0, F[0] * Yx + F[1] * Yy + F[2] * Yz);

  // Heading on the water and the speed through it.
  let hx = Zx, hz = Zz;
  const hl = Math.sqrt(hx * hx + hz * hz);
  const headed = hl > 0.2;
  hx /= hl || 1; hz /= hl || 1;
  const relX = vc[0] - ux, relZ = vc[2] - uz;
  const along = relX * hx + relZ * hz;
  const through = Math.sqrt(relX * relX + relZ * relZ);

  const { paddle, carve, balance } = body.tuning;
  const forward = input.forward || 0, back = input.back || 0;
  const steer = (input.right || 0) - (input.left || 0);
  const planing = dynamic / (dynamic + buoyant + 1e-6);
  // Riding (standing) or lying: the rider's body says which when there is one
  // (input.stand, 0 lying .. 1 standing, as he gets up); the invisible rider
  // stands above ~3.5 m/s through the water and lies down below it.
  const riding = input.stand ?? smoothstep(1.5, 3.5, through);
  state.riding = riding;

  // The rider's body floats once the deck is under: lying down (slow) it is
  // flat along the deck and fills within its lowest 0.12 m, which is what keeps
  // a paddler's board near the surface; standing (riding) it spreads upward.
  const rider = body.riderMass;
  let riderFloat = 0;
  if (rider > 0) {
    const vk = rhoMean * G * body.riderVolume / 4;
    const reach = RIDER_PRONE + (RIDER_WAIST - RIDER_PRONE) * riding;
    for (let k = 0; k < 4; k += 1) {
      const lx = body.riderPoints[k * 3], ly = body.riderPoints[k * 3 + 1], lz = body.riderPoints[k * 3 + 2];
      const rx = R[0] * lx + R[1] * ly + R[2] * lz;
      const ry = R[3] * lx + R[4] * ly + R[5] * lz;
      const rz = R[6] * lx + R[7] * ly + R[8] * lz;
      const fill = clamp((planeAt(c[0] + rx, c[2] + rz) - c[1] - ry) / reach, 0, 1);
      if (fill <= 0) continue;
      force(-gx * vk * fill, vk * fill, -gz * vk * fill, rx, ry, rz);
      buoyant += vk * fill;
      riderFloat += vk * fill * Yy;
      if (fill < 1) implicit(0, vk / reach, 0, 1, 0, rx, ry, rz);
    }
  }
  const support = clamp((hullSupport + riderFloat) / (mass * G), 0, 1);
  // What the rider presses into the deck: his share of everything that holds
  // the two of them up, less what his own body floats. Only this can he move
  // around to balance or trim; a rider floating off his board has no lever.
  const riderLoad = Math.max(0, rider / mass * (hullSupport + riderFloat) - riderFloat);

  if (headed && support > 0) {
    // Paddling (a hand pushing when there is no rider), fading out by 2.2 m/s.
    let thrust = forward * PADDLE_ACCEL * paddle * Math.max(0, 1 - along / PADDLE_TOP) * support;
    // Pumping: the rider's extension (0..1, from how fast he rises out of a
    // crouch), or W while planing at half.
    if (rider > 0) thrust += PUMP_ACCEL * paddle * planing * Math.max(Number(input.pump) || 0, 0.5 * forward);
    if (thrust > 0) force(mass * thrust * hx, 0, mass * thrust * hz, 0, 0, 0);
    // Digging the tail brakes against the water.
    if (back > 0) {
      const kd = mass * TAIL_DIG * back * support;
      force(-kd * along * hx, 0, -kd * along * hz, 0, 0, 0);
      implicit(kd, 0, hx, 0, hz, 0, 0, 0);
    }
    // Paddle steering: a turn rate servo that fades as the fins take over.
    const slow = 1 - smoothstep(1, 3, through);
    if (steer !== 0 && slow > 0) {
      const gain = Iw[4] / STEER_TIME * Math.min(Math.abs(steer), 1) * support * slow;
      T[1] += gain * (-STEER_RATE * clamp(steer, -1, 1) - w[1]);
      spin(gain, 0);
    }
  }

  if (rider > 0 && balance > 0 && riderLoad > 0) {
    const reach = riderLoad * BALANCE_REACH * balance;
    // Roll against the water's own tilt: lean = the rider's left rail (+X) up.
    const lean = Math.asin(clamp(Xx * Nx + Xy * Ny + Xz * Nz, -1, 1));
    // He leans only as far as his speed carries him round the tightest turn
    // the board can carve: tan(lean) = v²/(g·r). More would drop him inside.
    const carried = Math.atan(through * through / (G * CARVE_RADIUS));
    const leanTarget = Math.min(LEAN_MAX * carve, carried) * clamp(steer, -1, 1) * riding;
    const kr = body.rollGains[0], dr = body.rollGains[1];
    const rollRate = w[0] * Zx + w[1] * Zy + w[2] * Zz;
    const roll = clamp(-balance * (kr * (lean - leanTarget) + dr * rollRate), -reach, reach);
    // Pitch: held level on the water while slow (lying, paddling), only
    // damped once the hull planes and finds its own trim.
    const pitch = Math.asin(clamp(Zx * Nx + Zy * Ny + Zz * Nz, -1, 1));
    const kp = body.pitchGains[0], dp = body.pitchGains[1];
    const pitchRate = w[0] * Xx + w[1] * Xy + w[2] * Xz;
    const hold = balance * (kp * (1 - riding) * pitch - dp * pitchRate);
    const shift = SHIFT_MAX * (forward - back) * riding + body.proneShift * (1 - riding);
    const trim = riderLoad * shift;
    const pitchTorque = clamp(hold, -2 * reach, 2 * reach) + trim;
    T[0] += roll * Zx + pitchTorque * Xx;
    T[1] += roll * Zy + pitchTorque * Xy;
    T[2] += roll * Zz + pitchTorque * Xz;
  }

  // Air.
  const air = 0.5 * RHO_AIR * (AIR_DRAG_BOARD + (rider > 0 ? AIR_DRAG_RIDER : 0)) * Math.sqrt(vc[0] * vc[0] + vc[1] * vc[1] + vc[2] * vc[2]);
  force(-air * vc[0], -air * vc[1], -air * vc[2], 0, 0, 0);

  // A pull from outside at a world point (the leash of a rider in the water).
  if (external) force(external.fx, external.fy, external.fz, external.x - c[0], external.y - c[1], external.z - c[2]);

  // Editor mooring: a horizontal spring and a yaw spring to the checkpoint,
  // critically damped, heave, pitch and roll left to the water.
  if (moor) {
    const k = moor.stiffness ?? 4;
    const d = 2 * Math.sqrt(k);
    const ox = c[0] - (R[0] * body.com[0] + R[1] * body.com[1] + R[2] * body.com[2]) - moor.x;
    const oz = c[2] - (R[6] * body.com[0] + R[7] * body.com[1] + R[8] * body.com[2]) - moor.z;
    const off = Math.sqrt(ox * ox + oz * oz);
    // The mooring is a leash, not a post: past MOOR_REACH it stops growing,
    // and it never pulls harder than MOOR_PULL times the board's weight. A
    // stiff post held the empty board against a breaker until the wave
    // flipped it over the top and threw it.
    const reach = MOOR_REACH;
    const far = off > reach ? reach / off : 1;
    const fx = -mass * k * ox * far - mass * d * vc[0];
    const fz = -mass * k * oz * far - mass * d * vc[2];
    const pull = Math.sqrt(fx * fx + fz * fz);
    const cap = mass * G * MOOR_PULL;
    if (pull <= cap) {
      force(fx, 0, fz, 0, 0, 0);
      implicit(mass * d, far === 1 ? mass * k : 0, 1, 0, 0, 0, 0, 0);
      implicit(mass * d, far === 1 ? mass * k : 0, 0, 0, 1, 0, 0, 0);
    } else {
      force(fx * cap / pull, 0, fz * cap / pull, 0, 0, 0);
    }
    const yaw = Math.atan2(Zx, Zz);
    let err = yaw - (moor.yaw ?? 0);
    err = Math.atan2(Math.sin(err), Math.cos(err));
    T[1] += -Iw[4] * (k * err + d * w[1]);
    spin(Iw[4] * d, Iw[4] * k);
  }

  // Gravity and the gyroscopic term.
  F[1] -= mass * G;
  const Lx = Iw[0] * w[0] + Iw[1] * w[1] + Iw[2] * w[2];
  const Ly = Iw[3] * w[0] + Iw[4] * w[1] + Iw[5] * w[2];
  const Lz = Iw[6] * w[0] + Iw[7] * w[1] + Iw[8] * w[2];
  T[0] -= w[1] * Lz - w[2] * Ly; T[1] -= w[2] * Lx - w[0] * Lz; T[2] -= w[0] * Ly - w[1] * Lx;

  // Solve (M + hD + h²K)Δξ = h·(F, T) − h²·K·ξ and step: velocity first, then
  // position with the new velocity (semi-implicit Euler).
  for (let i = 0; i < 3; i += 1) { rhs[i] = hStep * F[i] + stiff[i]; rhs[i + 3] = hStep * T[i] + stiff[i + 3]; }
  solve6();
  vc[0] += rhs[0]; vc[1] += rhs[1]; vc[2] += rhs[2];
  w[0] += rhs[3]; w[1] += rhs[4]; w[2] += rhs[5];
  c[0] += hStep * vc[0]; c[1] += hStep * vc[1]; c[2] += hStep * vc[2];
  const q = state.q;
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const hw = 0.5 * hStep;
  q[0] = qx + hw * (w[0] * qw + w[1] * qz - w[2] * qy);
  q[1] = qy + hw * (w[1] * qw + w[2] * qx - w[0] * qz);
  q[2] = qz + hw * (w[2] * qw + w[0] * qy - w[1] * qx);
  q[3] = qw + hw * (-w[0] * qx - w[1] * qy - w[2] * qz);
  const ql = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;

  // Never through the sand: whatever the spring let slip, lift out at once.
  if (groundAny) {
    setRotation(q);
    let lift = 0;
    for (let i = 0; i < count; i += 1) {
      const lx = pr[i * 3], ly = pr[i * 3 + 1], lz = pr[i * 3 + 2];
      const ny = R[3] * pn[i * 3] + R[4] * pn[i * 3 + 1] + R[5] * pn[i * 3 + 2];
      const low = c[1] + R[3] * lx + R[4] * ly + R[5] * lz + Math.min(0, ny * ph[i]);
      lift = Math.max(lift, groundAt[i] - low);
    }
    if (lift > 0) {
      c[1] += lift;
      if (vc[1] < 0) vc[1] = 0;
    }
  }

  out.buoyant = buoyant;
  out.slope = Math.sqrt(gx * gx + gz * gz);
  const ds = body.deckStance;
  out.deckDepth = planeAt(c[0] + R[0] * ds[0] + R[1] * ds[1] + R[2] * ds[2], c[2] + R[6] * ds[0] + R[7] * ds[1] + R[8] * ds[2])
    - (c[1] + R[3] * ds[0] + R[4] * ds[1] + R[5] * ds[2]);
}

// Advance the board from time − dt to time. water(x, z, t, out) fills out with
// {height, vx, vy, vz, whitewater, ground}; options.moor holds it to a
// checkpoint {x, z, yaw, stiffness (1/s², default 4)} in the editor, and
// options.substep trades cost for accuracy (every substep samples the water at
// each hull point and once for the fins; 1/120 s still passes every check);
// options.external {x, y, z, fx, fy, fz} is a force (N) held over the step at a
// world point.
export function stepBoard(state, body, input, water, time, dt, options) {
  if (!(dt > 0)) return state;
  dt = Math.min(dt, MAX_DT);
  const steps = Math.ceil(dt / (options?.substep || SUBSTEP) - 1e-9);
  num[H_STEP] = dt / steps;
  const controls = input || NO_INPUT;
  const moor = options?.moor || null;
  const external = options?.external || null;

  // Integrate the centre of mass; the state carries the board origin.
  setRotation(state.q);
  const ox = body.com[0], oy = body.com[1], oz = body.com[2];
  let ax = R[0] * ox + R[1] * oy + R[2] * oz, ay = R[3] * ox + R[4] * oy + R[5] * oz, az = R[6] * ox + R[7] * oy + R[8] * oz;
  const w = state.w;
  c[0] = state.p[0] + ax; c[1] = state.p[1] + ay; c[2] = state.p[2] + az;
  vc[0] = state.v[0] + w[1] * az - w[2] * ay;
  vc[1] = state.v[1] + w[2] * ax - w[0] * az;
  vc[2] = state.v[2] + w[0] * ay - w[1] * ax;

  state.popCooldown = Math.max(0, state.popCooldown - dt);
  if (controls.pop && state.popCooldown === 0 && state.contact > 0.05) {
    vc[1] += POP_SPEED;
    state.popCooldown = POP_COOLDOWN;
  }

  for (let k = 0; k < steps; k += 1) substep(state, body, controls, water, time - dt + (k + 1) * num[H_STEP], moor, external);

  setRotation(state.q);
  ax = R[0] * ox + R[1] * oy + R[2] * oz; ay = R[3] * ox + R[4] * oy + R[5] * oz; az = R[6] * ox + R[7] * oy + R[8] * oz;
  state.p[0] = c[0] - ax; state.p[1] = c[1] - ay; state.p[2] = c[2] - az;
  state.v[0] = vc[0] - (w[1] * az - w[2] * ay);
  state.v[1] = vc[1] - (w[2] * ax - w[0] * az);
  state.v[2] = vc[2] - (w[0] * ay - w[1] * ax);

  state.speed = Math.sqrt(state.v[0] * state.v[0] + state.v[1] * state.v[1] + state.v[2] * state.v[2]);
  state.wetArea = out.wetArea;
  state.contact = out.wetArea / body.planformArea;
  state.planing = out.dynamic / (out.dynamic + out.buoyant + 1e-6);
  state.airborne = state.contact < 0.02;
  state.onFace = state.contact > 0.2 && out.slope > 0.1;

  // Wipeout: upside down for a moment, or held deep under for a while.
  state.upsideTime = R[4] < UPSIDE_DOWN ? state.upsideTime + dt : 0;
  state.buriedTime = out.deckDepth > BURIED_DEPTH ? state.buriedTime + dt : 0;
  state.wipeoutTime = Math.max(state.upsideTime, state.buriedTime);
  if (state.upsideTime > UPSIDE_TIME || state.buriedTime > BURIED_TIME) state.wipeout = true;
  return state;
}
