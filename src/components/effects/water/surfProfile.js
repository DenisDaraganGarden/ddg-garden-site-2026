// The cross-section of a plunging breaker, in metres, in the wave's own frame:
// x toward the shore, z up, still water at z = 0, the crest at x = 0.
//
// Unbroken, the wave is the shoaling shape of Bosboom & Stive,
// f(θ) = cos θ + 0.18 cos 2θ + 0.16 sin 2θ: a steep front and a flat back.
// As it rears up the front face is compressed toward the crest and the crest
// overtakes the trough (a forward shear growing with height), so the face goes
// vertical. Then the lip leaves: water thrown off the crest is a ballistic jet,
// x = Δu·a, z = w₀·a − g·a²/2 for a particle ejected a seconds ago, and the
// sheet those particles form curls under itself because the older water has
// fallen further. Under it is air; the tube is the hollow. The sheet has a
// thickness that thins toward the tip, so its translucency is known without a
// depth pass. When the tip meets the face the tube closes: the body sinks into
// a bore, the sheet dissolves and the roller of foam takes over.
//
// The same profile is lofted along the crest (BreakingWaves.jsx); every
// section has its own height and break moment, so the break peels.

export const SURF_GRAVITY = 9.81;
export const SURF_REARING_WIDTH_SHARE = 0.35;
export const SURF_BORE_HEIGHT_FRACTION = 0.22;
export const SURF_SHEET_TIP_TAPER = 0.82;

export const surfShape = (theta) => Math.cos(theta) + 0.18 * Math.cos(2 * theta) + 0.16 * Math.sin(2 * theta);

// Crest phase and the crest-to-trough range of f, found once numerically. The
// mean over a period is zero, so f / range is the level in units of H.
// thetaTrough: where the front slope bottoms out, past the crest.
export const SURF_SHAPE = (() => {
  let peak = { theta: 0, value: -Infinity };
  let low = { theta: 0, value: Infinity };
  const samples = 1 << 16;
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * 2 * Math.PI - Math.PI;
    const value = surfShape(theta);
    if (value > peak.value) peak = { theta, value };
    if (value < low.value) low = { theta, value };
  }
  const range = peak.value - low.value;
  const thetaTrough = low.theta < peak.theta ? low.theta + 2 * Math.PI : low.theta;
  return Object.freeze({ thetaPeak: peak.theta, thetaTrough, range, crest: peak.value / range, trough: low.value / range });
})();

// Seconds for the lip to fall from zRoot to zLand when thrown up at lift m/s.
export const surfPlungeTime = (zRoot, zLand, lift) =>
  (lift + Math.sqrt(Math.max(lift * lift + 2 * SURF_GRAVITY * (zRoot - zLand), 0))) / SURF_GRAVITY;

// A peeling breaker is a local event travelling along a crest, not a phase
// ramp over the whole coastline.  Keep its lag bounded by the length of the
// visible event: this same value is used by the loft and by the CPU bore that
// writes the foam field, so the two cannot drift into a diagonal rope.
const surfPositive = (value) => Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0;

// The visible rear-up: the last third of a wavelength at the default break
// length (16 m of shoaling deforming the whole face turned one small Azov
// breaker into a long white rope), stretched in proportion to the slider:
// 4 m rears four times more abruptly, 40 m two and a half times longer. A cap
// at that third left the slider's whole range doing nothing.
export const SURF_BREAK_LENGTH_DEFAULT = 16;
export const surfRearingLength = ({ surfWidth, surfBreakLength }) =>
  Math.max(0.75, surfPositive(surfWidth) * SURF_REARING_WIDTH_SHARE) * surfPositive(surfBreakLength) / SURF_BREAK_LENGTH_DEFAULT;

export const surfPeelSpan = ({ surfWidth, surfBreakLength, surfBoreLength }) =>
  Math.max(1, surfRearingLength({ surfWidth, surfBreakLength }) + surfPositive(surfBoreLength));

export const surfPeelTravelOffset = (s, settings) => {
  const progress = Math.min(Math.max(surfPositive(s), 0), 1);
  return progress > 0 ? -progress * surfPositive(settings.surfPeel) * surfPeelSpan(settings) : 0;
};

export const surfBoreHeightRatio = (phase) =>
  1 - (1 - SURF_BORE_HEIGHT_FRACTION) * Math.min(Math.max(surfPositive(phase), 0), 1);

export const surfSheetThickness = ({ height, sheet, emerge = 1, arc = 0, spent = 0 }) =>
  surfPositive(height) * surfPositive(sheet) * Math.min(Math.max(surfPositive(emerge), 0), 1)
  * (1 - SURF_SHEET_TIP_TAPER * Math.min(Math.max(surfPositive(arc), 0), 1))
  * (1 - Math.min(Math.max(surfPositive(spent), 0), 1));

export const surfJetDown = ({ jet, lift, elapsed = 0 }) => {
  const x = surfPositive(lift) - SURF_GRAVITY * surfPositive(elapsed);
  const z = -surfPositive(jet);
  const length = Math.hypot(x, z);
  return length > 1e-6 ? [x / length, z / length] : [0, -1];
};

// Convert a local coast q into the scalar mean-break frame used by a foam
// bore. This is the CPU twin of foamField's qBore correction: a refracted
// ribbon follows L(s), while one bore record is stored at its mean L̄.
export const surfFoamBoreFrameQ = ({ q, peel = 0, wiggle = 0, refraction = 0, breakAt = 0, breakMean = 0 }) =>
  Number(q) + Number(peel) - Number(wiggle) - Math.min(Math.max(Number(refraction) || 0, 0), 1) * (Number(breakAt) - Number(breakMean));

// CPU twin of surfProfile below, for the laboratory's section drawing and the
// node checks. The same formulas in the same order; keep them in step with the
// GLSL (surfProfile.check.js holds both to the joints and the landing).
const smooth = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// The profile's knobs from the flat surf settings.
export const surfProfileParams = (settings) => ({
  width: surfPositive(settings.surfWidth), steepen: surfPositive(settings.surfBreakLength), lean: surfPositive(settings.surfLean),
  jet: surfPositive(settings.surfJet), lift: surfPositive(settings.surfLift), sheet: surfPositive(settings.surfSheet),
  bore: surfPositive(settings.surfBoreLength), speed: surfPositive(settings.surfSpeed),
});

// Metres past the break a frozen breaker stands at for a phase 0..1: from
// rearing up to a spent bore, as BreakingWaves poses its inspection ribbon.
export const surfFrozenTravel = (settings, phase = settings.surfPhase) => {
  const plunge = surfPlungeTime(SURF_SHAPE.crest * settings.surfHeight, -0.2 * settings.surfHeight, settings.surfLift);
  const start = -settings.surfBreakLength - 3;
  return lerp(start, Math.max(settings.surfSpeed, 0.1) * plunge + settings.surfBoreLength + 3, phase);
};

export const surfLevelAt = (x, H, width) => {
  const th = (2 * Math.PI / width) * x + SURF_SHAPE.thetaPeak;
  return H * surfShape(th) / SURF_SHAPE.range;
};
// Where the front slope (crest to trough, monotonic) comes down to level z.
export const surfFrontAt = (z, H, width) => {
  let lo = 0, hi = (SURF_SHAPE.thetaTrough - SURF_SHAPE.thetaPeak) / (2 * Math.PI) * width;
  if (z <= surfLevelAt(hi, H, width)) return hi;
  for (let i = 0; i < 8; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (surfLevelAt(mid, H, width) > z) lo = mid; else hi = mid;
  }
  const a = surfLevelAt(lo, H, width), b = surfLevelAt(hi, H, width);
  return lo + (hi - lo) * Math.min(Math.max((a - z) / Math.max(a - b, 1e-9), 0), 1);
};
const surfLeanAt = (z, H, lean) => {
  const rise = smooth(SURF_SHAPE.trough, SURF_SHAPE.crest, z / Math.max(H, 0.00001));
  return lean * H * rise * rise;
};
const surfDownOf = (tx, tz) => {
  const length = Math.hypot(tz, tx);
  return length > 0.00001 ? [tz / length, -tx / length] : [0, -1];
};

// Water behind a point of the body toward the light: the horizontal chord
// through the section at its height. 0.7: this crest is sharper than a
// cosine. A flat 3 m made the whole body glow alike, a tenth of a crest's.
export const surfChordAt = (z, Hb, width, boreFace) => {
  const h = Math.min(Math.max(z / Math.max(Hb, 1e-4) - SURF_SHAPE.trough, 0), 1);
  return Math.max(0.7 * width * (1 + boreFace) / (2 * Math.PI) * Math.acos(2 * h - 1), 0.1);
};

// One point of the section: t 0..1 around the profile (back, lip top, lip
// underside, front face), dn metres past the break, H the section's height.
export function surfProfilePoint(t, dn, H, P) {
  const g = SURF_GRAVITY;
  const plungeFrom = (zRoot, zLand) => (P.lift + Math.sqrt(Math.max(P.lift * P.lift + 2 * g * (zRoot - zLand), 0))) / g;
  const tau = Math.max(dn, 0) / Math.max(P.speed, 0.1);
  const rearLength = surfRearingLength({ surfWidth: P.width, surfBreakLength: P.steepen });
  const rearing = smooth(-rearLength, 0, dn);
  const zc = SURF_SHAPE.crest * H;
  const frontScale = lerp(1, 0.32, rearing);
  let tauImp = plungeFrom(zc, -0.2 * H);
  const xTip = P.lean * H * rearing + P.jet * tauImp;
  const zLand = Math.min(surfLevelAt((xTip - P.lean * H * 0.25) / frontScale, H, P.width), zc - 0.3 * H);
  tauImp = plungeFrom(zc, zLand);
  const aMax = Math.min(tau, tauImp);
  const psi = Math.min(Math.max((dn - P.speed * tauImp) / Math.max(P.bore, 0.1), 0), 1);
  const Hb = H * lerp(1, SURF_BORE_HEIGHT_FRACTION, psi);
  const splash = smooth(0, 0.1, psi) * (1 - smooth(0.1, 0.45, psi));
  const lean = P.lean * rearing * (1 - psi);
  const root = [surfLeanAt(SURF_SHAPE.crest * Hb, Hb, lean), SURF_SHAPE.crest * Hb];
  const emerge = smooth(0, 0.06, tau);
  const spent = smooth(0, 0.1, psi);
  const boreFace = lerp(frontScale, 0.72, smooth(0.04, 0.75, psi));
  const o = { alpha: 1, puff: 0, foam: 0, vel: [0, 0], splash, base: surfLevelAt(0.5 * P.width, Hb, P.width), part: 'back', tauImp, psi, rearing, aMax };
  if (t < 0.3) {
    const u = t / 0.3;
    const x = -0.5 * P.width + 0.5 * P.width * u;
    const z = surfLevelAt(x, Hb, P.width);
    [o.x, o.z] = [x + surfLeanAt(z, Hb, lean), z];
    o.thickness = surfChordAt(z, Hb, P.width, boreFace);
    o.foam = 0.45 * smooth(0.8, 1, u) * rearing + 0.5 * psi * smooth(0.6, 1, u);
  } else if (t < 0.7) {
    const top = t < 0.5;
    const u = top ? (t - 0.3) / 0.2 : 1 - (t - 0.5) / 0.2;
    const a = aMax * u;
    const jx = root[0] + P.jet * a;
    const jz = root[1] + P.lift * a - 0.5 * g * a * a;
    const [dx, dz] = surfDownOf(P.jet, P.lift - g * a);
    const th = P.sheet * H * emerge * (1 - SURF_SHEET_TIP_TAPER * u) * (1 - spent);
    [o.x, o.z] = top ? [jx, jz] : [jx + dx * th, jz + dz * th];
    o.alpha = 1 - spent;
    o.thickness = th;
    const aeration = aMax / Math.max(tauImp, 0.01) * u;
    o.foam = top ? 0.15 + 0.85 * aeration * aeration : 0.08 + 0.3 * aeration;
    o.puff = top ? aeration * aeration : 0.25 * aeration;
    o.part = top ? 'lip' : 'under';
    o.vel = [P.jet, P.lift - g * a];
  } else {
    const u = (t - 0.7) / 0.3;
    const [dx, dz] = surfDownOf(P.jet, P.lift);
    const under = P.sheet * H * emerge * (1 - spent);
    const rootUnder = [root[0] + dx * under, root[1] + dz * under];
    const x0 = surfFrontAt(rootUnder[1], Hb, P.width);
    const x = lerp(x0, 0.5 * P.width, u);
    const z = surfLevelAt(x, Hb, P.width);
    const body = [x * boreFace + surfLeanAt(z, Hb, lean), z];
    const z0 = surfLevelAt(x0, Hb, P.width);
    const k = 1 - smooth(0, 0.35, u);
    [o.x, o.z] = [body[0] + (rootUnder[0] - (x0 * boreFace + surfLeanAt(z0, Hb, lean))) * k, body[1] + (rootUnder[1] - z0) * k];
    o.thickness = surfChordAt(o.z, Hb, P.width, boreFace);
    const reach = smooth(0, 0.2, psi);
    const roller = smooth(0, 0.08, psi) * (1 - 0.65 * psi) * (1 - smooth(0.05, 0.85, u)) * smooth(0.8 - reach, 1 - reach, u);
    const burst = splash * smooth(0.5, 0.95, u);
    o.foam = Math.max(Math.max(roller, burst), 0.18 * rearing * (1 - smooth(0, 0.5, u)));
    o.puff = roller * (0.42 + 0.32 * (1 - psi)) + burst;
    o.part = 'face';
  }
  return o;
}

// What one breaker writes into the foam field (foamField.js) this frame, in
// metres past the mean break line: the deposit's reference q, its strength,
// its half width and the run-up front (null before landing). BreakingWaves
// feeds the field with it and the laboratory's section draws the same
// numbers, so the drawing shows where the 3D foam lies.
export const surfFoamBore = (settings, travel, height, frozen = false) => {
  // Same bounded peeling phase as surfTravelAt(s) at the bore's centre. The
  // face is read from the profile itself: its bore phase, and how far its
  // foam reaches. A phase of its own (a plunge to -0.2 H instead of the face
  // the lip meets) started the field's trail a third of the bore late.
  // A frozen inspection has no peel: the loft drops it, so must the trail.
  const midTravel = travel + (frozen ? 0 : surfPeelTravelOffset(0.5, settings));
  const P = surfProfileParams(settings);
  const face = Array.from({ length: 13 }, (_, i) => surfProfilePoint(0.7 + 0.3 * Math.min(i / 12, 0.9999), midTravel, height, P));
  const psi = face[0].psi;
  // The field starts when the profile's low roller starts, then weakens
  // with that same bore phase. Otherwise the geometry has already become
  // a bore while its physical trail waits several metres to appear.
  const strength = smooth(0, 0.08, psi) * (1 - 0.65 * psi);
  // The deposit's front edge sits where the face's foam falls to half on its
  // shoreward side, half-way into the deposit's own ragged front (0.16 of its
  // half width): at the impact that is the foot of the face, later the
  // roller's edge. A fixed tenth of the width put the foam on the water up to
  // a metre and a half ahead of the roller, onto the clean lower face.
  const peak = Math.max(...face.map((p) => p.foam));
  const edge = face.filter((p) => p.foam >= 0.5 * peak).pop();
  const halfWidth = settings.surfWidth * 0.55;
  return {
    x: travel + edge.x - 0.16 * halfWidth, strength: strength * 0.45, halfWidth,
    front: psi > 0 ? travel + settings.surfWidth * 0.16 + 1 : null, psi,
  };
};

// CPU twin of one bore's fresh deposit in foamField's update pass, mid-crest:
// qBore and bore.x in the same mean-break frame, bore = surfFoamBore(...).
// macro/detail are the shader's tear noise; 0.5 is the typical patch.
export function foamBoreDeposit(qBore, bore, deposit = 1, macro = 0.5, detail = 0.5) {
  const trace = 0.42 + 0.58 * smooth(0.34, 0.68, macro * 0.68 + detail * 0.32);
  const ragged = bore.halfWidth * (0.52 + 0.96 * macro);
  const tail = 1 - smooth(ragged * 0.15, ragged * 3.2, Math.max(bore.x - qBore, 0));
  const front = 1 - smooth(0, ragged * 0.32, Math.max(qBore - bore.x, 0));
  return bore.strength * deposit * tail * front * trace;
}

export const surfProfileShader = /* glsl */`
#define SURF_G ${SURF_GRAVITY.toFixed(2)}
#define SURF_TAU 6.2831853
#define SURF_THETA_P ${SURF_SHAPE.thetaPeak.toFixed(6)}
#define SURF_THETA_T ${SURF_SHAPE.thetaTrough.toFixed(6)}
#define SURF_F_RANGE ${SURF_SHAPE.range.toFixed(6)}
#define SURF_CREST ${SURF_SHAPE.crest.toFixed(6)}
#define SURF_TROUGH ${SURF_SHAPE.trough.toFixed(6)}
uniform float uWidth;    // one wavelength across the profile, m
uniform float uSteepen;  // break length, m: the face rears up over max(0.75, 0.35 uWidth) · uSteepen / 16 of travel before the lip leaves
uniform float uLean;     // how far the crest overtakes the trough at launch, share of H
uniform float uJet;      // lip throw relative to the crest, m/s
uniform float uLift;     // upward speed of the lip at launch, m/s
uniform float uSheet;    // lip thickness at the root, share of H
uniform float uBore;     // metres of travel over which the landed wave decays into the bore
uniform float uSpeed;    // wave speed c, m/s

struct SurfPoint {
  vec2 p;          // x forward, z up
  float thickness; // metres of water behind the point, for the translucency
  float foam;      // foam coverage on the surface
  float puff;      // how much foam volume stands off the surface here (0..1)
  float alpha;     // the sheet dissolves after landing
  float arc;       // distance along the profile, for the foam streaks
  float shade;     // light reaching the point: the tube is in the lip's shadow
  float base;      // level of the profile's edges; the loft stands the wave on the swell from here
  vec2 vel;        // the water's own velocity here in the profile's plane; only the jet has one
  float splash;    // the splash-up where the lip has landed, 0..1; the spray bursts from the tip
  vec2 anchor;     // where a landed lip folds back to: its root, or under it for the underside
  float spent;     // how far the landed lip has gone, 0..1
};

float surfLevel(float x, float H) {
  float th = SURF_TAU / uWidth * x + SURF_THETA_P;
  return H * (cos(th) + 0.18 * cos(2.0 * th) + 0.16 * sin(2.0 * th)) / SURF_F_RANGE;
}
// Where the front slope (crest to trough, monotonic) comes down to level z:
// bisection and a last linear step (surfFrontAt is the CPU twin).
float surfFront(float z, float H) {
  float lo = 0.0;
  float hi = (SURF_THETA_T - SURF_THETA_P) / SURF_TAU * uWidth;
  if (z <= surfLevel(hi, H)) return hi;
  for (int i = 0; i < 8; i++) {
    float mid = 0.5 * (lo + hi);
    if (surfLevel(mid, H) > z) lo = mid; else hi = mid;
  }
  float a = surfLevel(lo, H);
  float b = surfLevel(hi, H);
  return lo + (hi - lo) * clamp((a - z) / max(a - b, 1e-9), 0.0, 1.0);
}
float surfLean(float z, float H, float lean) {
  // The crest tapers to H=0 at its ends. Equal smoothstep edges are undefined
  // there and can turn an otherwise invisible end vertex into a NaN triangle.
  float rise = smoothstep(SURF_TROUGH, SURF_CREST, z / max(H, 0.00001));
  return lean * H * rise * rise;
}
// Water behind a point of the body toward the light: the horizontal chord
// through the section at its height (surfChordAt is the CPU twin).
float surfChord(float z, float Hb, float boreFace) {
  float h = clamp(z / max(Hb, 1e-4) - SURF_TROUGH, 0.0, 1.0);
  return max(0.7 * uWidth * (1.0 + boreFace) / SURF_TAU * acos(2.0 * h - 1.0), 0.1);
}
float surfPlunge(float zRoot, float zLand) {
  return (uLift + sqrt(max(uLift * uLift + 2.0 * SURF_G * (zRoot - zLand), 0.0))) / SURF_G;
}
vec2 surfJetDown(vec2 tangent) {
  vec2 down = vec2(tangent.y, -tangent.x);
  float len = length(down);
  return len > 0.00001 ? down / len : vec2(0.0, -1.0);
}

// dn: metres travelled past the point where the lip leaves the crest
// (negative before). H: this section's height. t: 0..1 around the profile —
// back of the wave, jet top, jet underside, front face.
SurfPoint surfProfile(float t, float dn, float H) {
  float tau = max(dn, 0.0) / max(uSpeed, 0.1);
  // The water shoals for a long distance, but its visible face only rears in
  // the last third of a wavelength at the default uSteepen, in proportion to
  // it otherwise (surfRearingLength is the CPU twin).
  float rearLength = max(0.75, uWidth * ${SURF_REARING_WIDTH_SHARE.toFixed(2)}) * uSteepen / ${SURF_BREAK_LENGTH_DEFAULT.toFixed(1)};
  float rearing = smoothstep(-rearLength, 0.0, dn);
  float zc = SURF_CREST * H;
  float frontScale = mix(1.0, 0.32, rearing);
  // Where the tip lands: a first guess on the face, then the face it meets.
  float tauImp = surfPlunge(zc, -0.2 * H);
  float xTip = uLean * H * rearing + uJet * tauImp;
  float zLand = min(surfLevel((xTip - uLean * H * 0.25) / frontScale, H), zc - 0.3 * H);
  tauImp = surfPlunge(zc, zLand);
  float aMax = min(tau, tauImp);
  // After landing the body sinks into a bore and the lean relaxes.
  float psi = clamp((dn - uSpeed * tauImp) / max(uBore, 0.1), 0.0, 1.0);
  // Once the lip lands the wall loses most of its height and spreads into a
  // low bore.  It remains a real water surface through uBore; only the thin
  // ballistic sheet is allowed to disappear early.
  float Hb = H * mix(1.0, ${SURF_BORE_HEIGHT_FRACTION.toFixed(2)}, psi);
  // The lip hits the trough: the water bursts up ahead of the wave, then the
  // roller settles onto the bore's face and rides it to the sand.
  float splash = smoothstep(0.0, 0.1, psi) * (1.0 - smoothstep(0.1, 0.45, psi));
  float lean = uLean * rearing * (1.0 - psi);
  // The lip leaves from the crest; once landed, the crest sinks with the body.
  vec2 root = vec2(surfLean(SURF_CREST * Hb, Hb, lean), SURF_CREST * Hb);
  float emerge = smoothstep(0.0, 0.06, tau);
  float spent = smoothstep(0.0, 0.10, psi);
  float boreFace = mix(frontScale, 0.72, smoothstep(0.04, 0.75, psi));
  float jetLen = aMax * length(vec2(uJet, uLift - 0.5 * SURF_G * aMax));

  float jetOut = smoothstep(0.0, 0.15, aMax / max(tauImp, 0.01)) * (1.0 - smoothstep(0.0, 0.4, psi));
  SurfPoint o;
  o.alpha = 1.0;
  o.puff = 0.0;
  o.shade = 1.0;
  o.vel = vec2(0.0);
  o.splash = splash;
  o.spent = 0.0;
  o.base = surfLevel(0.5 * uWidth, Hb);
  if (t < 0.3) {
    float u = t / 0.3;
    float x = -0.5 * uWidth + 0.5 * uWidth * u;
    float z = surfLevel(x, Hb);
    o.p = vec2(x + surfLean(z, Hb, lean), z);
    o.thickness = surfChord(z, Hb, boreFace);
    o.anchor = o.p;
    // Crumbs: foam born at the crest as it rears, and the bore's own foam.
    o.foam = 0.45 * smoothstep(0.8, 1.0, u) * rearing + 0.5 * psi * smoothstep(0.6, 1.0, u);
    o.arc = 0.5 * uWidth * u;
  } else if (t < 0.7) {
    bool top = t < 0.5;
    float u = top ? (t - 0.3) / 0.2 : 1.0 - (t - 0.5) / 0.2;
    float a = aMax * u;
    vec2 jet = root + vec2(uJet * a, uLift * a - 0.5 * SURF_G * a * a);
    vec2 tangent = vec2(uJet, uLift - SURF_G * a);
    o.vel = tangent;
    vec2 down = surfJetDown(tangent);
    // The underside and the bore's first body point meet at u=0. It must
    // collapse with the spent sheet too; otherwise their 7 cm separation
    // becomes a black line at the foot of a small breaker.
    float th = uSheet * H * emerge * (1.0 - ${SURF_SHEET_TIP_TAPER.toFixed(2)} * u) * (1.0 - spent);
    o.p = top ? jet : jet + down * th;
    // Landed: the sheet is foam now; it hands over to the roller and goes.
    o.alpha = 1.0 - spent;
    o.anchor = top ? root : root + surfJetDown(vec2(uJet, uLift)) * uSheet * H * emerge * (1.0 - spent);
    o.spent = spent;
    o.thickness = th;
    float aeration = aMax / max(tauImp, 0.01) * u;
    o.foam = top ? 0.15 + 0.85 * aeration * aeration : 0.08 + 0.3 * aeration;
    o.puff = top ? aeration * aeration : 0.25 * aeration;
    o.shade = top ? 1.0 : 1.0 - 0.5 * jetOut;
    o.arc = 0.5 * uWidth + (top ? jetLen * u : jetLen * (2.0 - u));
  } else {
    float u = (t - 0.7) / 0.3;
    // The face starts where the sheet's underside leaves the body, and runs
    // down from there: it begins on the front slope at the underside root's
    // own height. Started at the crest, its first stretch climbed from under
    // the lip back up to the top and turned — a knee, and under a thick lip a
    // loop, the surface folded over itself.
    vec2 rootUnder = root + surfJetDown(vec2(uJet, uLift)) * uSheet * H * emerge * (1.0 - spent);
    float x0 = surfFront(rootUnder.y, Hb);
    float x = mix(x0, 0.5 * uWidth, u);
    float z = surfLevel(x, Hb);
    // The reared face relaxes with the bore instead of carrying its vertical
    // silhouette down the beach after the jet has gone.
    vec2 body = vec2(x * boreFace + surfLean(z, Hb, lean), z);
    float z0 = surfLevel(x0, Hb);
    vec2 start = vec2(x0 * boreFace + surfLean(z0, Hb, lean), z0);
    o.p = body + (rootUnder - start) * (1.0 - smoothstep(0.0, 0.35, u));
    o.thickness = surfChord(o.p.y, Hb, boreFace);
    o.anchor = o.p;
    // Foam is born where the lip comes down, at the foot of the face: the
    // splash-up stands there. The roller then climbs the face to the crest
    // (reach) and boils there as the bore runs. Born at the top of the face,
    // under the lip's root, it stood up through the lip as a wall of steam
    // above the crest while the tube was still open.
    float reach = smoothstep(0.0, 0.2, psi);
    float roller = smoothstep(0.0, 0.08, psi) * (1.0 - 0.65 * psi) * (1.0 - smoothstep(0.05, 0.85, u)) * smoothstep(0.8 - reach, 1.0 - reach, u);
    float burst = splash * smoothstep(0.5, 0.95, u);
    o.foam = max(max(roller, burst), 0.18 * rearing * (1.0 - smoothstep(0.0, 0.5, u)));
    o.puff = roller * (0.42 + 0.32 * (1.0 - psi)) + burst;
    o.shade = 1.0 - 0.45 * jetOut * (1.0 - smoothstep(0.0, 0.55, u));
    o.arc = 0.5 * uWidth + 2.0 * jetLen + 0.5 * uWidth * u;
  }
  return o;
}
`;
