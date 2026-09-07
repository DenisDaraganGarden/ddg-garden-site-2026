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

export const surfShape = (theta) => Math.cos(theta) + 0.18 * Math.cos(2 * theta) + 0.16 * Math.sin(2 * theta);

// Crest phase and the crest-to-trough range of f, found once numerically. The
// mean over a period is zero, so f / range is the level in units of H.
export const SURF_SHAPE = (() => {
  let peak = { theta: 0, value: -Infinity };
  let low = Infinity;
  const samples = 1 << 16;
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * 2 * Math.PI - Math.PI;
    const value = surfShape(theta);
    if (value > peak.value) peak = { theta, value };
    low = Math.min(low, value);
  }
  const range = peak.value - low;
  return Object.freeze({ thetaPeak: peak.theta, range, crest: peak.value / range, trough: low / range });
})();

// Seconds for the lip to fall from zRoot to zLand when thrown up at lift m/s.
export const surfPlungeTime = (zRoot, zLand, lift) =>
  (lift + Math.sqrt(Math.max(lift * lift + 2 * SURF_GRAVITY * (zRoot - zLand), 0))) / SURF_GRAVITY;

export const surfProfileShader = /* glsl */`
#define SURF_G ${SURF_GRAVITY.toFixed(2)}
#define SURF_TAU 6.2831853
#define SURF_THETA_P ${SURF_SHAPE.thetaPeak.toFixed(6)}
#define SURF_F_RANGE ${SURF_SHAPE.range.toFixed(6)}
#define SURF_CREST ${SURF_SHAPE.crest.toFixed(6)}
#define SURF_TROUGH ${SURF_SHAPE.trough.toFixed(6)}
uniform float uWidth;    // one wavelength across the profile, m
uniform float uSteepen;  // metres of travel over which the face rears up before the lip leaves
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
};

float surfLevel(float x, float H) {
  float th = SURF_TAU / uWidth * x + SURF_THETA_P;
  return H * (cos(th) + 0.18 * cos(2.0 * th) + 0.16 * sin(2.0 * th)) / SURF_F_RANGE;
}
float surfLean(float z, float H, float lean) {
  float rise = smoothstep(SURF_TROUGH * H, SURF_CREST * H, z);
  return lean * H * rise * rise;
}
float surfPlunge(float zRoot, float zLand) {
  return (uLift + sqrt(max(uLift * uLift + 2.0 * SURF_G * (zRoot - zLand), 0.0))) / SURF_G;
}

// dn: metres travelled past the point where the lip leaves the crest
// (negative before). H: this section's height. t: 0..1 around the profile —
// back of the wave, jet top, jet underside, front face.
SurfPoint surfProfile(float t, float dn, float H) {
  float tau = max(dn, 0.0) / max(uSpeed, 0.1);
  float rearing = smoothstep(-uSteepen, 0.0, dn);
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
  float Hb = H * (1.0 - 0.6 * psi);
  float lean = uLean * rearing * (1.0 - psi);
  // The lip leaves from the crest; once landed, the crest sinks with the body.
  vec2 root = vec2(surfLean(SURF_CREST * Hb, Hb, lean), SURF_CREST * Hb);
  float emerge = smoothstep(0.0, 0.06, tau);
  float spent = smoothstep(0.0, 0.2, psi);
  float jetLen = aMax * length(vec2(uJet, uLift - 0.5 * SURF_G * aMax));

  float jetOut = smoothstep(0.0, 0.15, aMax / max(tauImp, 0.01)) * (1.0 - smoothstep(0.0, 0.4, psi));
  SurfPoint o;
  o.alpha = 1.0;
  o.puff = 0.0;
  o.shade = 1.0;
  o.base = surfLevel(0.5 * uWidth, Hb);
  if (t < 0.3) {
    float u = t / 0.3;
    float x = -0.5 * uWidth + 0.5 * uWidth * u;
    float z = surfLevel(x, Hb);
    o.p = vec2(x + surfLean(z, Hb, lean), z);
    o.thickness = 3.0;
    // Crumbs: foam born at the crest as it rears, and the bore's own foam.
    o.foam = 0.45 * smoothstep(0.8, 1.0, u) * rearing + 0.5 * psi * smoothstep(0.6, 1.0, u);
    o.arc = 0.5 * uWidth * u;
  } else if (t < 0.7) {
    bool top = t < 0.5;
    float u = top ? (t - 0.3) / 0.2 : 1.0 - (t - 0.5) / 0.2;
    float a = aMax * u;
    vec2 jet = root + vec2(uJet * a, uLift * a - 0.5 * SURF_G * a * a);
    vec2 tangent = vec2(uJet, uLift - SURF_G * a);
    vec2 down = normalize(vec2(tangent.y, -tangent.x));
    float th = uSheet * H * emerge * (1.0 - 0.82 * u);
    o.p = top ? jet : jet + down * th;
    // Landed: the sheet is foam now; it hands over to the roller and goes.
    o.alpha = 1.0 - spent;
    o.thickness = th;
    float aeration = aMax / max(tauImp, 0.01) * u;
    o.foam = top ? 0.15 + 0.85 * aeration * aeration : 0.08 + 0.3 * aeration;
    o.puff = top ? aeration * aeration : 0.25 * aeration;
    o.shade = top ? 1.0 : 1.0 - 0.5 * jetOut;
    o.arc = 0.5 * uWidth + (top ? jetLen * u : jetLen * (2.0 - u));
  } else {
    float u = (t - 0.7) / 0.3;
    float x = 0.5 * uWidth * u;
    float z = surfLevel(x, Hb);
    vec2 body = vec2(x * frontScale + surfLean(z, Hb, lean), z);
    // The face starts where the sheet's underside leaves the body.
    vec2 rootUnder = root + normalize(vec2(uLift, -uJet)) * uSheet * H * emerge * (1.0 - spent);
    o.p = mix(rootUnder, body, smoothstep(0.0, 0.15, u));
    o.thickness = 3.0;
    // The roller: after landing the upper face boils; before, crumbs slide down.
    float roller = smoothstep(0.0, 0.25, psi) * (1.0 - 0.5 * psi) * smoothstep(0.7, 0.05, u);
    o.foam = max(roller, 0.35 * rearing * smoothstep(0.5, 0.0, u));
    o.puff = roller;
    o.shade = 1.0 - 0.45 * jetOut * smoothstep(0.55, 0.0, u);
    o.arc = 0.5 * uWidth + 2.0 * jetLen + 0.5 * uWidth * u;
  }
  return o;
}
`;
