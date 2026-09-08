import * as THREE from 'three';

// Spray: the breaking crest throws water into the air, and that is where the
// surf stops being a surface. A shell over the ribbon can only ever have an
// edge, and an edge reads as geometry — which is exactly what Denis rejected.
// A cloud has no edge because it ends in density, so the spray is built the
// way the painterly clouds are, but as thousands of separate motes.
//
// Nothing about a mote is stored. Its whole life is a closed function of its
// id and the clock: the phase it was born on, where on the crest, how fast,
// how heavy. That costs no simulation pass, no ping-pong buffer, no readback,
// and it keeps working in the laboratory's frozen frame, where Denis actually
// tunes. The price is that motes cannot collide with anything; they do not
// need to.
//
// Birth is not invented: a mote asks the very profile the ribbon is lofted
// from (surfProfile) where the foam stands off the water right now, and is
// kept in proportion to that. So the spray appears exactly where the shell
// stands and dies exactly when it dies — and if the shell is turned down, the
// spray does not move.

export const SPRAY_POOL = 24576;
export const SPRAY_TIERS = Object.freeze({
  // Overdraw above one is deliberate: mist is what many faint motes make when
  // they overlap, so the layers ARE the effect, not waste.
  low: { max: 3000, overdraw: 0.7, taps: 0, far: [70, 110], curl: 0 },
  medium: { max: 10000, overdraw: 1.5, taps: 1, far: [95, 150], curl: 0.35 },
  high: { max: 22000, overdraw: 2.6, taps: 1, far: [110, 170], curl: 0.35 },
});
const GRAVITY = 9.81;
// A mote is a puff of spray, not a beach ball: centimetres at birth, growing
// to something a hand could hold as it tears apart. The count is derived from
// this radius, so the two can never drift apart.
// Most of the pool is rejected at birth — a mote is only kept in proportion to
// the foam standing off the water where it was born — so the coverage budget
// has to be spent on the survivors, not on the draws.
export const SPRAY_ACCEPTANCE = 0.32;
export const SPRAY_RADIUS = 0.02;
export const SPRAY_GROW = 0.11;

// One quad per mote, the id the only per-instance datum. The attributes are
// built once and shared by reference between the ribbons' geometries — only
// instanceCount differs, and that lives on the geometry, not the buffer.
export function buildSprayGeometry(pool = SPRAY_POOL, shared = null) {
  const geometry = new THREE.InstancedBufferGeometry();
  const base = shared ?? {
    position: new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    index: new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
    id: new THREE.InstancedBufferAttribute(Float32Array.from({ length: pool }, (_, i) => i), 1),
  };
  geometry.setAttribute('position', base.position);
  geometry.setAttribute('aId', base.id);
  geometry.setIndex(base.index);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  geometry.userData.sprayBase = base;
  return geometry;
}

// The flight, in closed form. dv/da = -(v - wind)/tau + g integrates to
//   x(a) = (wind + g*tau)*a + (v0 - wind - g*tau)*tau*(1 - exp(-a/tau)),
// so a mote's position is one exp away and never drifts from the lip's own
// ballistic arc. tau is the mote's weight: 0.05 s is haze that hangs and blows
// away, 0.5 s is a thrown drop that falls. spray.check.js integrates the ODE
// numerically and asserts this closed form against it.
export function sprayFlight(v0, wind, tau, age) {
  const terminal = [wind[0], wind[1] - GRAVITY * tau, wind[2]];
  const decay = 1 - Math.exp(-age / tau);
  return [0, 1, 2].map((i) => terminal[i] * age + (v0[i] - terminal[i]) * tau * decay);
}

// How many motes are worth drawing: not a function of distance but of the area
// they would cover. A mote is a fixed size in metres, so its area on screen
// grows as 1/d²; holding the painted area flat is what keeps the fill cost the
// same whether the camera is on the crest or a hundred metres off it.
export function sprayInstanceCount({ distance, height, viewportHeight, viewportWidth, projectionY, overdraw, max, minPx = 2.5, radius = SPRAY_RADIUS + SPRAY_GROW * 0.5 }) {
  const pxPerMetre = 0.5 * viewportHeight * projectionY / Math.max(distance, 1);
  const quadPx = Math.max(2 * radius * Math.sqrt(Math.max(height, 0.05) / 0.45) * pxPerMetre, minPx);
  const budget = viewportWidth * viewportHeight * overdraw;
  // The floor is small on purpose: a metre from the crest a single mote covers
  // tens of thousands of pixels, and a floor of a few hundred would paint the
  // frame nine times over. spray.check.js holds the budget from five metres out.
  const drawn = Math.round(budget / (quadPx * quadPx * 0.785) / SPRAY_ACCEPTANCE);
  // The floor is small on purpose: a metre from the crest a single mote covers
  // tens of thousands of pixels, and a floor of a few hundred would paint the
  // frame nine times over. spray.check.js holds the budget from five metres out.
  return Math.min(Math.max(drawn, 60), max);
}

// The vertex half. It expects the loft (loftShader) and gerstnerNoise to be
// declared above it, so it can ask surfProfile where the foam stands.
export const sprayShader = /* glsl */`
attribute float aId;
uniform vec2 uWind;          // the shading uniforms are shared, but only this one is read here
uniform float uSprayTime;
uniform float uSprayCycle;
uniform float uSprayAmount;
uniform float uSprayJetShare;
uniform float uSprayRoll;
uniform float uSprayCurl;
uniform float uSprayWind;
uniform float uSprayGrow;      // metres the radius gains over a life
uniform float uSprayRadius;    // radius at birth, metres
uniform float uSprayS0;        // crest position nearest the camera, 0..1
uniform float uSpraySpan;      // width of the emitting band, in s
uniform float uSprayFrozen;    // 1 while the laboratory holds the wave still
uniform vec2 uSprayFar;        // metres where the spray thins out and is gone
uniform float uSprayNear;      // metres below which a mote is faded, so one quad cannot fill the screen
uniform float uSprayMinPx;
uniform float uSprayViewport;  // drawing buffer height, pixels
varying vec2 vQuad;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vView;
varying float vRadius;
varying float vOpacity;
varying float vDetail;
float sprayHash(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
`;

export const sprayVertexBody = /* glsl */`
  vQuad = position.xy * 2.0;
  // The clock. The phase is hashed, not a ramp over the id: the live count
  // changes every frame, and a ramp would mean a shrinking count keeps only a
  // contiguous band of phases — the whole plume one age, dying together.
  float ph = sprayHash(aId * 0.6180339887) * uSprayCycle;
  float t0 = uSprayTime - ph;
  float age = mod(t0, uSprayCycle);
  float cycle = floor(t0 / uSprayCycle);
  float seed = sprayHash(aId * 0.6180339887 + cycle * 7.7771 + 1.0);
  float life = uSprayCycle * mix(0.35, 1.0, sprayHash(seed + 3.1) * sprayHash(seed + 3.1));
  if (age > life || uSprayAmount <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  // Birth: ask the profile itself where foam stands off the water, and keep
  // the mote in proportion to that. The wave is rewound to where it stood when
  // the mote left it, so the plume is left behind instead of riding along.
  float s = clamp(uSprayS0 + (sprayHash(seed + 5.7) - 0.5) * uSpraySpan, 0.0, 1.0);
  float travelBack = uSpeed * age * (1.0 - uSprayFrozen);
  float H = surfHeightAt(s);
  bool lip = sprayHash(seed + 9.3) < uSprayJetShare;
  float t = lip ? mix(0.30, 0.50, sprayHash(seed + 2.7)) : mix(0.70, 0.82, sprayHash(seed + 2.7));
  SurfPoint sp = surfProfile(t, surfTravelAt(s) - travelBack, H);
  float weight = sp.puff * (lip ? sp.alpha : 1.0) * uSprayAmount;
  if (weight < sprayHash(seed + 4.1) * 0.75) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec2 jit = (vec2(sprayHash(seed + 6.2), sprayHash(seed + 7.4)) - 0.5) * (lip ? 0.10 : 0.70) * H;
  sp.p += jit;
  vec3 born = surfWorld(s, sp, -travelBack);
  float waterY = born.y - (sp.p.y - sp.base);

  // The frame of the crest here: forward is toward the shore along the loft's
  // own normal, so a bent crest throws its spray the way it faces.
  float hs = 0.5 / uCrestLength;
  float slope = surfCenterU(s + hs) - surfCenterU(s - hs);
  vec2 fwd = (coastLand() - coastAlong() * slope) * inversesqrt(1.0 + slope * slope);
  vec2 alg = coastAlong();
  // The lip's own ballistic velocity where it exists; on the face, the burst of
  // the impact, turned about the crest's axis so the roller rolls.
  vec2 vp = lip ? sp.vel * 1.0
                : vec2(uSpeed * 0.45 + uJet * 0.5, 2.2 * sqrt(H / 0.45) * weight) + vec2(jit.y, -jit.x) * uSprayRoll;
  vec3 v0 = vec3(fwd.x, 0.0, fwd.y) * (vp.x + uSpeed * (1.0 - uSprayFrozen))
    + vec3(0.0, vp.y, 0.0)
    + vec3(alg.x, 0.0, alg.y) * (sprayHash(seed + 8.8) - 0.5) * (lip ? 0.7 : 1.8);

  float tau = mix(0.05, 0.5, sprayHash(seed + 1.9) * sprayHash(seed + 1.9));
  vec3 wind = vec3(uWind.x, 0.0, uWind.y) * uSprayWind;
  vec3 terminal = wind + vec3(0.0, -${GRAVITY.toFixed(2)} * tau, 0.0);
  vec3 flight = terminal * age + (v0 - terminal) * tau * (1.0 - exp(-age / tau));
  // The same divergence-free curl the foam field drifts on: a young mote flies
  // a clean parabola, an old one is torn into haze.
  vec2 c0 = (born.xz + flight.xz) * 0.09 + uGerstnerTime * 0.05;
  float cx = gerstnerNoise(c0 + vec2(0.0, 0.8)) - gerstnerNoise(c0 - vec2(0.0, 0.8));
  float cz = gerstnerNoise(c0 + vec2(0.8, 0.0)) - gerstnerNoise(c0 - vec2(0.8, 0.0));
  flight += vec3(cx, 0.35 * (gerstnerNoise(c0 * 1.7) - 0.5), -cz) * uSprayCurl * pow(age, 1.5);
  vec3 world = born + flight;

  float span = age / max(life, 0.01);
  // Motes are not one size: a few heavy gobbets among a haze of fine ones is
  // what separates spray from a string of beads.
  float radius = (uSprayRadius + uSprayGrow * span) * mix(0.45, 2.1, sprayHash(seed + 11.3) * sprayHash(seed + 11.3));
  float opacity = weight * smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.72, 1.0, span));
  // A mote that has fallen back into the water is gone. The level is known from
  // the profile, so no depth texture is needed — and it fades over its OWN
  // diameter, or the depth test slices the big ones flat on the surface.
  opacity *= smoothstep(-0.5 * radius, 2.2 * radius, world.y - waterY);

  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  float dist = -mvPosition.z;
  opacity *= (1.0 - smoothstep(uSprayFar.x, uSprayFar.y, dist)) * smoothstep(0.0, uSprayNear, dist);
  if (opacity <= 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  // A mote thinner than a couple of pixels cannot be drawn without crawling,
  // so it is drawn larger and fainter with its painted energy preserved. The
  // chord below still uses the physical radius, or the medium would thin out.
  float pxRadius = radius * projectionMatrix[1][1] * 0.5 * uSprayViewport / max(dist, 0.05);
  float grow = max(1.0, uSprayMinPx / max(pxRadius, 0.001));
  vRadius = radius;
  vOpacity = opacity / (grow * grow);
  // Detail is for the motes big enough on screen to show it. The plan had this
  // inverted, which handed every near mote a constant density — a smooth ball
  // instead of a torn puff, exactly the sprite look this system exists to avoid.
  vDetail = smoothstep(2.5, 8.0, pxRadius);

  vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vView = normalize(cameraPosition - world);
  vWorld = world;
  float draw = radius * grow;
  gl_Position = projectionMatrix * (mvPosition + vec4((vRight * vQuad.x + vUp * vQuad.y) * draw, 0.0));
`;

// The fragment half. It expects gerstnerShader (for the hashed noise) and
// waterShadingShader (for the sun, the sky and the noise volume) above it.
export const sprayFragmentVaryings = /* glsl */`
uniform float uSprayScale;
uniform float uSprayExtinction;
uniform float uSprayTaps;
varying vec2 vQuad;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vView;
varying float vRadius;
varying float vOpacity;
varying float vDetail;
`;

export const sprayFragmentBody = /* glsl */`
  float rad2 = dot(vQuad, vQuad);
  if (rad2 > 1.0) discard;
  // The quad is not a sprite but a chord through a sphere of froth: the eye
  // passes through more of the medium at the centre than at the rim, which is
  // what gives a mote a body instead of an edge.
  float chord = 2.0 * vRadius * sqrt(1.0 - rad2);
  // The noise is read in WORLD coordinates, not in the quad's. This one line
  // is what makes a plume read as one body: two overlapping motes sample the
  // same field where they overlap and merge, instead of stacking as two discs.
  // The sample point, not the mote's centre: vWorld is one value for the whole
  // quad, so reading the noise there gave every mote a single constant — a
  // smooth ball. Walking the quad's own surface is what breaks it up.
  vec3 here = vWorld + (vRight * vQuad.x + vUp * vQuad.y) * vRadius;
  vec3 nq = (here - vec3(uWind.x, 0.0, uWind.y) * uTime * 0.15) * uSprayScale;
  nq.z += gerstnerNoise(here.xz * 0.021) * 3.0;   // the volume tiles; a sliding slice does not
  vec4 nA = texture(uNoise, nq);
  // The silhouette must be torn, not round: the falloff to the rim is added to
  // the noise and then thresholded, so the noise decides where the mote ends.
  // A smooth ball is what a sprite looks like, and a sprite is what this
  // system exists to avoid.
  float raw = nA.r * 0.62 + nA.g * 0.48 + 0.62 * (1.0 - rad2);
  float dens = smoothstep(0.42 + 0.34 * (1.0 - nA.b), 1.02, raw);
  dens = mix(0.30 * (1.0 - rad2), dens, vDetail);               // a distant mote is its own average, not a flicker
  float alpha = (1.0 - exp(-uSprayExtinction * dens * chord)) * vOpacity;
  if (alpha < 0.003) discard;

  // The sphere's normal: lit crown, shaded underside, without a second march.
  vec3 nS = normalize(vRight * vQuad.x + vUp * vQuad.y + vView * sqrt(max(1.0 - rad2, 0.0)));
  float sunT = 1.0 - 0.55 * dens;
  if (uSprayTaps > 0.5) {
    vec4 nB = texture(uNoise, nq + uSunDirection * (0.6 * vRadius * uSprayScale));
    float dB = clamp(nB.r * 0.72 + nB.g * 0.38 - 0.28, 0.0, 1.0);
    sunT = exp(-uSprayExtinction * dB * 0.6 * vRadius);
  }
  float powder = 1.0 - exp(-dens * 2.6);
  // Forward scattering is ADDED, never multiplied in: with the sun behind the
  // camera a factor would make the spray darker than the foam it comes from.
  float forward = pow(max(dot(-vView, uSunDirection), 0.0), 6.0);
  vec3 lit = vec3(0.94, 0.95, 0.92) * (
      uFillIrradiance * (0.35 + 0.65 * (0.5 + 0.5 * nS.y))
    + uSunRadiance * sunT * (0.25 + 0.75 * powder) * (0.35 + 0.65 * max(dot(nS, uSunDirection), 0.0))
    + uSunRadiance * sunT * powder * forward * 1.2) / WATER_PI * uFoamBrightness;
  gl_FragColor = vec4(lit * alpha, alpha);
`;

export function createSprayUniforms() {
  return {
    uSprayTime: { value: 0 },
    uSprayCycle: { value: 2.2 },
    uSprayAmount: { value: 1 },
    uSprayJetShare: { value: 0.35 },
    uSprayRoll: { value: 3 },
    uSprayCurl: { value: 0.35 },
    uSprayWind: { value: 0.9 },
    uSprayGrow: { value: SPRAY_GROW },
    uSprayRadius: { value: SPRAY_RADIUS },
    uSprayS0: { value: 0.5 },
    uSpraySpan: { value: 0.35 },
    uSprayFrozen: { value: 0 },
    uSprayFar: { value: new THREE.Vector2(110, 170) },
    uSprayNear: { value: 1.2 },
    uSprayMinPx: { value: 2.5 },
    uSprayViewport: { value: 800 },
    // The noise feature must be SMALLER than a mote, or every mote samples one
    // constant and reads as a flat disc. At 8 m^-1 the grain is about 12 cm
    // inside a mote a few centimetres across, so the medium breaks up.
    uSprayScale: { value: 8 },
    uSprayExtinction: { value: 2.4 },
    uSprayTaps: { value: 1 },
  };
}

export function syncSprayUniforms(uniforms, settings, tier = SPRAY_TIERS.high) {
  uniforms.uSprayAmount.value = Number(settings.sprayAmount ?? 1);
  uniforms.uSprayCurl.value = Number(settings.sprayCurl ?? tier.curl);
  uniforms.uSprayWind.value = Number(settings.foamDrift ?? 0.9);
  uniforms.uSprayScale.value = Number(settings.sprayGrain ?? 8);
  uniforms.uSprayExtinction.value = Number(settings.sprayDensity ?? 2.4);
  uniforms.uSprayTaps.value = tier.taps;
  uniforms.uSprayFar.value.set(Number(settings.sprayFar ?? tier.far[1]) * 0.65, Number(settings.sprayFar ?? tier.far[1]));
}
