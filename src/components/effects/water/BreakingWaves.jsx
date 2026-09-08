import { seaRippleShader } from './seaRippleShader.js';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerCrestDelay, gerstnerPeriod, gerstnerPixelShader, gerstnerShader, gerstnerWeatherAt, resolveGerstnerTrains, syncGerstnerUniforms } from './gerstnerWaves';
import { coastCoordinates, coastPoint } from '../../../terrain/terrainModel.js';
import { BREAK_SAMPLES, breakLineMean, coastBreakLine, coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
import { coastBreakVisibility } from './coastBreakLine';
import { FOAM_BORE_SLOTS, createFoamFieldUniforms, foamFieldShader } from './foamField';
import { SPRAY_TIERS, buildSprayGeometry, createSprayUniforms, sprayFragmentBody, sprayFragmentVaryings, sprayInstanceCount, sprayShader, sprayVertexBody, syncSprayUniforms } from './spray';
import { SURF_SHAPE, surfPeelSpan, surfPeelTravelOffset, surfPlungeTime, surfProfileShader } from './surfProfile';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';
import { BOAT_CUTOUT_STENCIL_REF } from './constants';
import { sceneDepthFragment, sceneDepthVertex } from '../shaders/sceneDepth';

// Breaking waves as a loft. A height field cannot overhang, so the surf is a
// separate layer added over the swell: the plunging cross-section from
// surfProfile.js — back, ballistic lip with its underside, front face — swept
// along the crest, each section with its own height and break moment so the
// break peels — where the coast says: every section breaks on the isobath of
// depth H / 0.78 (coastFrame.js), so a shoal or the spit pulls the break line
// out and the crest, refracted toward it, bends around. Two meshes share the
// loft: the water sheet, shaded like every
// other water surface, and a shell standing off it where the foam has volume
// (the aerated lip, the roller after landing), through which a short ray
// march samples the painterly clouds' noise: lumps, gaps, Beer/powder light.
// The roller also writes into the foam field, so the trail outlives the wave.

// Seven, not four: a coast shows several lines of surf at once — one just
// breaking, one running in, one spent — and with four the sea had a single
// line at a time. Each ribbon is three draws, so this is the honest ceiling.
const RIBBON_COUNT = FOAM_BORE_SLOTS;

function buildRibbonGeometry(segments, rows) {
  const positions = new Float32Array((segments + 1) * (rows + 1) * 3);
  let cursor = 0;
  for (let row = 0; row <= rows; row += 1) {
    for (let segment = 0; segment <= segments; segment += 1) {
      positions[cursor] = segment / segments;
      positions[cursor + 1] = row / rows;
      cursor += 3;
    }
  }
  const indices = [];
  const at = (row, segment) => row * (segments + 1) + segment;
  for (let row = 0; row < rows; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = at(row, segment), b = at(row, segment + 1), c = at(row + 1, segment), d = at(row + 1, segment + 1);
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

// The loft: where a profile point sits in the world for crest position s, in
// the terrain's coast frame (q across the shore, along the shore). The wave
// stands on the swell: the same Gerstner displacement and fades the open water
// uses, so the loft's edges lie exactly on it and fade out there.
const loftShader = /* glsl */`
  #include <fog_pars_vertex>
  #define BREAK_SAMPLES ${BREAK_SAMPLES}
  ${gerstnerShader}
  ${coastWaterShader}
  ${seaRippleShader}
  ${surfProfileShader}
  uniform float uAlong0;       // coast s of the crest's start
  uniform float uCrestLength;
  uniform float uBreakLine[BREAK_SAMPLES + 1]; // q where each section breaks
  uniform float uBreakVisible[BREAK_SAMPLES + 1]; // 0 where one crest would cross land
  uniform float uBreakMean;
  uniform float uRefraction;   // how far the crest follows the break line's shape
  uniform float uTravel;       // metres past the mean break line: the break phase
  uniform float uPose;         // metres past the mean break line: where the wave stands
  uniform float uHeight;
  uniform float uPeel;
  uniform float uPeelSpan;    // local event length, never the full crest length
  uniform float uRunup;
  uniform float uSpent;        // metres past its own break after which a section is gone
  uniform float uRibbonVisible;
  // The crest's height follows the swell's weather at its break point, so a
  // gust's bigger sections break earlier and farther out than the lulls; the
  // ends taper to the swell. The CPU break line uses the same field.
  float surfHeightAt(float s) {
    vec2 at = coastPoint(uBreakMean, uAlong0 + s * uCrestLength);
    return uHeight * gerstnerWeather(at).x * smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.94, 1.0, s));
  }
  float surfPhaseAt(float s) { return coastCrestWiggle(uAlong0 + s * uCrestLength, uWidth); }
  float surfBreakAt(float s) {
    float x = clamp(s, 0.0, 1.0) * float(BREAK_SAMPLES);
    int i = int(floor(x));
    float f = fract(x);
    return mix(uBreakLine[i], uBreakLine[min(i + 1, BREAK_SAMPLES)], f * f * (3.0 - 2.0 * f));
  }
  float surfBreakVisibleAt(float s) {
    float x = clamp(s, 0.0, 1.0) * float(BREAK_SAMPLES);
    int i = int(floor(x));
    float f = fract(x);
    return mix(uBreakVisible[i], uBreakVisible[min(i + 1, BREAK_SAMPLES)], f * f * (3.0 - 2.0 * f));
  }
  // Refraction: the crest keeps the break line's shape by uRefraction and stays
  // straight for the rest, so a section standing over deeper water breaks later.
  float surfTravelAt(float s) {
    return uTravel + (1.0 - uRefraction) * (uBreakMean - surfBreakAt(s)) - s * uPeelSpan * uPeel;
  }
  // On the sand the bore flattens into the swash sheet as it runs up.
  SurfPoint surfAt(float s, float t) {
    float travel = surfTravelAt(s);
    float q = surfBreakAt(s) + travel - uTravel + uPose;
    // Running up the beach the bore thins into a sheet, but it keeps a third of
    // its height until the very top of the run-up: a wave that shrinks to
    // nothing before it lands never reads as hitting the shore.
    return surfProfile(t, travel, surfHeightAt(s) * (1.0 - 0.65 * smoothstep(0.0, max(uRunup, 0.5), q)));
  }
  vec3 surfSwell(vec2 p) {
    float dist = distance(p, cameraPosition.xz);
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(coastLocal(p));
    vec3 normal;
    float jacobian;
    vec2 drift;
    // The shared cell, not a constant: the loft's edges have to lie on the very
    // swell the open water and the shore band draw, or they hover over it.
    vec3 world = gerstnerDisplace(p, fade, waterCell(p), normal, jacobian, drift);
    world.y += seaRippleDisplacement(world.xz);
    return world;
  }
  // The crest's centre line, in the coast frame's land coordinate: the break
  // line refracted, the wave's travel, and the wander along the shore.
  float surfCenterU(float s) {
    float sAlong = uAlong0 + s * uCrestLength;
    return coastShore(sAlong) + surfBreakAt(s) + surfTravelAt(s) - uTravel + uPose + coastCrestWiggle(sAlong, uWidth);
  }
  // The section is swept along the NORMAL of the crest, not along a fixed
  // direction to the shore: where the break line bends around the spit's shoal,
  // or the crest wanders, the section turns with it instead of shearing.
  // And the wave stands on the bed, not on the still line: past the waterline
  // the whole section rides the sand, so the bore runs up the beach instead of
  // through it — and the normal, finite differences of this same function,
  // follows the beach's slope for free.
  // dq: metres to rewind the crest by, so a mote born a moment ago is placed
  // where the wave stood then instead of riding along with it.
  vec3 surfWorld(float s, SurfPoint sp, float dq) {
    float sAlong = uAlong0 + s * uCrestLength;
    float h = 0.5 / uCrestLength;                       // half a metre along the crest
    float k = surfCenterU(s + h) - surfCenterU(s - h);  // du/ds, metres per metre
    float x = (sp.p.x + dq) * inversesqrt(1.0 + k * k);
    float along = sAlong - k * x;
    float u = surfCenterU(s) + x;
    vec2 xz = coastLand() * u + coastAlong() * along;
    float bed = max(coastGround(vec2(u - coastShore(along), along)), 0.0);
    return surfSwell(xz) + vec3(0.0, sp.p.y - sp.base + bed, 0.0);
  }
  vec3 surfSwellNormal(vec2 p) {
    float dist = distance(p, cameraPosition.xz);
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(coastLocal(p));
    vec3 normal;
    float jacobian;
    vec2 drift;
    gerstnerDisplace(p, fade, waterCell(p), normal, jacobian, drift);
    return normal;
  }
  // The edges of the loft coincide with the swell and vanish into it.
  float surfEdgeAlpha(float s, float t) {
    return smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t)) * smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.96, 1.0, s)) * surfBreakVisibleAt(s);
  }
  // Normal by centred finite differences inside each continuous part of the
  // profile. The old one-sided step crossed the top/underside seam at a few
  // rows, flipping the foam shell's light into a visible zigzag.
  vec3 surfNormal(float s, float t, vec3 w) {
    // A mesh row falls exactly on t=.5. A zero centred step there produces an
    // up-vector for the entire crest: the dark, ruler-straight seam seen from
    // low angles. Use the derivative of the adjoining continuous piece at a
    // join, never a step through the lip's top/underside split.
    float t0, t1;
    if (t < 0.3) { t0 = max(0.0, t - 0.008); t1 = min(0.2999, t + 0.008); }
    else if (t < 0.5) { t0 = max(0.3001, t - 0.008); t1 = min(0.4999, t + 0.008); }
    else if (t < 0.7) { t0 = max(0.5001, t - 0.008); t1 = min(0.6999, t + 0.008); }
    else { t0 = max(0.7001, t - 0.008); t1 = min(1.0, t + 0.008); }
    float s0 = max(0.0, s - 0.003);
    float s1 = min(1.0, s + 0.003);
    vec3 ws0 = surfWorld(s0, surfAt(s0, t), 0.0);
    vec3 ws1 = surfWorld(s1, surfAt(s1, t), 0.0);
    vec3 wt0 = surfWorld(s, surfAt(s, t0), 0.0);
    vec3 wt1 = surfWorld(s, surfAt(s, t1), 0.0);
    vec3 n = cross(ws1 - ws0, wt1 - wt0);
    n = dot(n, n) > 1e-10 ? normalize(n) : vec3(0.0, 1.0, 0.0);
    // Toward the rim the section is a sliver and its own normal turns edge-on;
    // hand it back to the swell it lies on, so the ribbon has no rim at all.
    float rim = smoothstep(0.0, 0.16, t) * (1.0 - smoothstep(0.84, 1.0, t));
    return normalize(mix(surfSwellNormal(w.xz), n, rim));
  }
  // The bore runs all the way in and ends by thinning into the swash sheet at
  // the top of its run-up — it must not evaporate in mid-beach. Only the last
  // metre fades, and by then the sheet is centimetres thick and the foam field
  // has taken the swash over; a section still alive past its bore length, or
  // one over sand that stands well clear of the water, ends there.
  float surfRunupAlpha(vec3 w, float s, float ground) {
    return (1.0 - smoothstep(uRunup - 1.0, uRunup, coastLocal(w.xz).x))
      * (1.0 - smoothstep(uSpent - 4.0, uSpent, surfTravelAt(s)))
      * (1.0 - smoothstep(0.35, 0.75, max(ground, 0.0)));
  }
`;

const sheetVertexShader = /* glsl */`
  ${loftShader}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  varying float vShade;
  varying float vGround;
  void main() {
    float s = position.x, t = position.y;
    SurfPoint sp = surfAt(s, t);
    vec3 w = surfWorld(s, sp, 0.0);
    float ground = coastGround(coastLocal(w.xz));
    vWorld = w;
    vGround = ground;
    vNormal = surfNormal(s, t, w);
    vFoamUv = vec2(s * uCrestLength, sp.arc);
    vFoam = sp.foam;
    vThickness = sp.thickness;
    vAlpha = uRibbonVisible * sp.alpha * surfRunupAlpha(w, s, ground) * surfEdgeAlpha(s, t);
    vShade = sp.shade;
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const sheetFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${gerstnerShader}
  ${gerstnerPixelShader}
  ${waterShadingShader}
  ${coastWaterShader}
  ${foamFieldShader}
  uniform float uFoamThreshold;
  uniform float uFoamSoftness;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  varying float vShade;
  varying float vGround;
  void main() {
    // The sheet is transparent at its edge. Keep its interpolated coverage in
    // the physical range before the blend state receives it; with MSAA, a
    // fragment may be evaluated at the pixel centre outside this thin triangle.
    float alpha = clamp(vAlpha, 0.0, 1.0);
    if (alpha <= 0.002) discard;
    // No water under the sand: the loft is clipped by the bed, not by whatever
    // the beach happens to write into the depth buffer first.
    if (vWorld.y < vGround + 0.005) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = normalize(vNormal);
    if (dot(n, view) < 0.0) n = -n;
    float rippleWet = smoothstep(0.4, 0.8, -vGround);
    n = waterRippleNormal(n, vWorld.xz, pixel, 0.5, rippleWet);
    // The ribbon's foam is the water's foam. It is drawn in the same
    // world-space flow frame, so the lace runs on across the seam instead of
    // stopping at the mesh's edge; it takes whichever is greater of what the
    // profile knows and what the field remembers, and it ages with the field.
    // Anything else and the breaker wears a texture of its own.
    vec3 memory = sampleFoamField(vWorld.xz);
    float crest = gerstnerWhitecaps(vWorld.xz, uFoamThreshold, uFoamSoftness);
    float coverage = max(vFoam * 0.95, max(memory.x * memory.z, crest * 0.9 * (1.0 - memory.z)));
    float age = mix(0.35, memory.y, memory.z) * (1.0 - vFoam);
    float bed = uShoreReady > 0.5 ? exp(-max(-coastGround(coastLocal(vWorld.xz)), 0.0) * uBedReach) : 0.0;
    vec3 color = shadeWater(vWorld, n, view, pixel, vFoamUv, coverage, age, vThickness, 0.0, bed) * clamp(vShade, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The foam shell: the same loft pushed off the water by the puff, so the ray
// march below has a slab to walk through.
const shellVertexShader = /* glsl */`
  ${loftShader}
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform float uNoiseReady;
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uRoller;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vShell;
  varying float vPuff;
  varying float vAlpha;
  varying float vGround;
  void main() {
    float s = position.x, t = position.y;
    SurfPoint sp = surfAt(s, t);
    vec3 w = surfWorld(s, sp, 0.0);
    vec3 n = surfNormal(s, t, w);
    // Foam stands up off the water; under the lip it hangs down. The normal is
    // outward by construction now, so its sign is not guessed from n.y — on the
    // vertical face of a reared wave that guess flipped between neighbouring
    // vertices and tore the shell by half a metre.
    bool underside = t >= 0.5 && t < 0.7;
    n *= underside ? -1.0 : 1.0;
    // Lumps: the same cloud volume shapes the silhouette, tumbling with the roller.
    // The shell noise itself is world based, but shading follows vFoamUv below:
    // the colour therefore travels along the actual crest-and-arc profile,
    // rather than sliding through it as a second water-flow texture.
    float lump = uNoiseReady > 0.5 ? texture(uNoise, vec3((w.xz - uWind * uTime * 0.1) * 0.45, fract(w.y * 0.45 + gerstnerNoise(w.xz * 0.021) * 3.0))).r : 0.5;
    // Keep the landed bore low. Noise may break its silhouette, but it may not
    // inflate it into a second rounded wave behind the short lip.
    float shell = sp.puff * uRoller * surfHeightAt(s) * (0.48 + 0.42 * lump);
    vWorld = w + n * shell;
    vNormal = n;
    vFoamUv = vec2(s * uCrestLength, sp.arc);
    vShell = shell;
    vPuff = sp.puff;
    vGround = coastGround(coastLocal(w.xz));
    vAlpha = uRibbonVisible * sp.alpha * surfRunupAlpha(w, s, vGround) * surfEdgeAlpha(s, t);
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// Both transparent foam passes use premultiplied blending. Fog, tone mapping
// and output transfer must operate on the straight colour first; applying a
// nonlinear transform after premultiplication makes thin fragments brighter
// than their alpha permits and shows their underlying triangles.
const transparentPremultipliedOutput = /* glsl */`
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float transparentFogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float transparentFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * gl_FragColor.a, transparentFogFactor);
    #endif
    float transparentAlpha = gl_FragColor.a;
    gl_FragColor.rgb /= max(transparentAlpha, 0.0001);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= transparentAlpha;
`;

const shellFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${gerstnerShader}
  ${waterShadingShader}
  ${coastWaterShader}
  uniform float uRollerDensity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vShell;
  varying float vPuff;
  varying float vAlpha;
  varying float vGround;
  #define SHELL_STEPS 12
  void main() {
    if (vAlpha <= 0.002 || vShell < 0.004 || uNoiseReady < 0.5) discard;
    if (vWorld.y < vGround + 0.005) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    float facing = max(dot(n, view), 0.25);
    // The shell is thin next to its curvature: walk straight down to the water.
    float depth = vShell / facing;
    float stepLength = depth / float(SHELL_STEPS);
    float sunDiffuse = 0.35 + 0.65 * max(dot(n, uSunDirection), 0.0);
    // The shell has its own volume march, but it belongs to the same sun as
    // the water below it. Sample the CSM/cloud visibility once at the shell
    // rather than once per march step: the shell is centimetres thick and the
    // direct-light field cannot vary across it at a visible scale.
    float keyVisibility = waterKeyVisibility(vWorld);
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < SHELL_STEPS; i++) {
      float d = (float(i) + 0.5) * stepLength;
      float h = 1.0 - d / depth;                 // 1 at the shell, 0 on the water
      vec3 p = vWorld - view * d;
      // Lumps from the cloud volume, carried with the wave (crest, arc) and
      // tumbling along the arc; a finer octave tears their edges.
      // World coordinates with the sliding slice, like every other foam in this
      // water: read in the profile's own frame the lumps were a stamp repeated
      // along the crest, which is what read as cauliflower.
      vec3 q = (p - vec3(uWind.x, 0.0, uWind.y) * uTime * 0.12) * 0.9;
      q.z += gerstnerNoise(p.xz * 0.021) * 3.0;
      float lump = texture(uNoise, q * 0.55).r;
      float tear = texture(uNoise, q * 1.7 + vec3(0.0, 0.0, 0.37)).b;
      // Denser toward the water, eroded toward the shell: rounded tops.
      float density = smoothstep(0.45, 1.0, lump * 0.9 + tear * 0.45 + (1.0 - h) * 0.7 - 0.4) * vPuff * uRollerDensity;
      if (density <= 0.001) continue;
      float alpha = 1.0 - exp(-density * stepLength * 4.5);
      // Beer/powder: light comes in from the shell side and fades toward the water.
      float powder = 1.0 - exp(-density * 2.6);
      float shade = exp(-(1.0 - h) * 1.4);
      vec3 lit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance * (0.5 + 0.5 * h) + uSunRadiance * keyVisibility * sunDiffuse * shade * (0.3 + 0.7 * powder)) / WATER_PI * uFoamBrightness;
      light += transmittance * alpha * lit;
      transmittance *= 1.0 - alpha;
      if (transmittance < 0.02) break;
    }
    float alpha = (1.0 - transmittance) * vAlpha;
    gl_FragColor = vec4(light * vAlpha, alpha);
${transparentPremultipliedOutput}
  }
`;

// Step one draws the motes flat white: the medium comes next, and a plain
// disc is the honest way to see whether they leave the lip on the right arc.
const sprayVertexShader = /* glsl */`
  ${loftShader}
  ${sprayShader}
  void main() {
${sprayVertexBody}
    #include <fog_vertex>
  }
`;

const sprayFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${gerstnerShader}
  ${waterShadingShader}
  ${sprayFragmentVaryings}
  void main() {
${sprayFragmentBody}
${transparentPremultipliedOutput}
  }
`;

const DRAWING_BUFFER = new THREE.Vector2();
const hash = (n) => ((n * 9301 + 49297) % 233280) / 233280;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const smoothstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// coast: { definition, along0, length, breakQ } — the terrain's coast frame
// and the stretch of shore (coast s) the breakers work.
export default function BreakingWaves({ settings, lighting, noise = null, coast, foamBores = null, timeline = null, wireframe = false, sprayTier = SPRAY_TIERS.high, sceneBindings = null, qualityProfile = null }) {
  const tier = qualityProfile?.isLowPower ? SPRAY_TIERS.low
    : (qualityProfile?.isMobileDevice ? SPRAY_TIERS.medium : sprayTier);
  const activeNoise = useWaterNoise(noise);
  const mesh = useMemo(() => {
    // Resolve the 8.9 m crest meander by physical length. A fixed 160
    // columns over 760 m left fewer than two segments per short bend.
    const spacing = qualityProfile?.isLowPower ? 4 : (qualityProfile?.isMobileDevice ? 2 : 1);
    return {
      segments: Math.max(48, Math.min(1024, Math.ceil(coast.length / spacing / 8) * 8)),
      // Include each top/underside transition (t=.3/.5/.7) exactly.
      rows: qualityProfile?.isLowPower ? 20 : (qualityProfile?.isMobileDevice ? 40 : 60),
      count: qualityProfile?.isLowPower ? 2 : (qualityProfile?.isMobileDevice ? 3 : RIBBON_COUNT),
    };
  }, [coast.length, qualityProfile?.isLowPower, qualityProfile?.isMobileDevice]);
  const geometry = useMemo(() => buildRibbonGeometry(mesh.segments, mesh.rows), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Shading uniforms are shared by reference between the ribbons: one sync
  // updates every material. Each ribbon's two materials share its uniforms.
  const shading = useMemo(() => createWaterShadingUniforms(), []);
  const ribbons = useMemo(() => Array.from({ length: mesh.count }, (_, index) => {
    const uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...shading,
      ...createGerstnerUniforms(),
      ...createCoastWaterUniforms(),
      ...createFoamFieldUniforms(),
      ...(sceneBindings ?? {}),
      ...createSprayUniforms(),
      uFoamThreshold: { value: 0.55 },
      uFoamSoftness: { value: 0.15 },
      uAlong0: { value: 0 },
      uCrestLength: { value: 100 },
      uBreakLine: { value: new Float32Array(BREAK_SAMPLES + 1).fill(-10) },
      uBreakVisible: { value: new Float32Array(BREAK_SAMPLES + 1).fill(1) },
      uBreakMean: { value: -10 },
      uRefraction: { value: 0.7 },
      uTravel: { value: -1000 },
      uPose: { value: -1000 },
      uHeight: { value: 1 },
      uPeel: { value: 0 },
      uPeelSpan: { value: 1 },
      uRunup: { value: 10 },
      uSpent: { value: 60 },
      uRibbonVisible: { value: 1 },
      uWidth: { value: 9 },
      uSteepen: { value: 16 },
      uLean: { value: 0.45 },
      uJet: { value: 1.6 },
      uLift: { value: 0.6 },
      uSheet: { value: 0.16 },
      uBore: { value: 14 },
      uSpeed: { value: 4.5 },
      uRoller: { value: 0.5 },
      uRollerDensity: { value: 1 },
    };
    // The loft's edges lie on the swell; the offset keeps them from fighting it for depth.
    const cockpitStencil = {
      stencilWrite: true,
      stencilRef: BOAT_CUTOUT_STENCIL_REF,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    };
    const spray = new THREE.ShaderMaterial({ uniforms, vertexShader: sceneDepthVertex(sprayVertexShader), fragmentShader: sceneDepthFragment(sprayFragmentShader), fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, ...cockpitStencil });
    const sheet = new THREE.ShaderMaterial({ uniforms, vertexShader: sceneDepthVertex(sheetVertexShader), fragmentShader: sceneDepthFragment(sheetFragmentShader), fog: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...cockpitStencil });
    const shell = new THREE.ShaderMaterial({ uniforms, vertexShader: sceneDepthVertex(shellVertexShader), fragmentShader: sceneDepthFragment(shellFragmentShader), fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, ...cockpitStencil });
    return { index, uniforms, sheet, shell, spray, spawn: -index * 9, height: 1, lineFor: '' };
  }), [mesh.count, sceneBindings, shading]);
  useEffect(() => () => ribbons.forEach((ribbon) => { ribbon.sheet.dispose(); ribbon.shell.dispose(); ribbon.spray.dispose(); }), [ribbons]);
  useEffect(() => { ribbons.forEach((ribbon) => { ribbon.sheet.wireframe = wireframe; ribbon.shell.wireframe = wireframe; }); }, [ribbons, wireframe]);
  // One quad and one id buffer for every ribbon; only instanceCount differs,
  // and that lives on the geometry rather than on the buffers.
  const sprayGeometries = useMemo(() => {
    const first = buildSprayGeometry();
    return [first, ...Array.from({ length: mesh.count - 1 }, () => buildSprayGeometry(undefined, first.userData.sprayBase))];
  }, [mesh.count]);
  useEffect(() => () => sprayGeometries.forEach((geometry) => geometry.dispose()), [sprayGeometries]);
  const schedule = useRef({ lastSpawn: 0, spawned: mesh.count });

  useEffect(() => {
    syncWaterShadingUniforms(shading, settings, lighting);
    ribbons.forEach((ribbon) => {
      const { uniforms } = ribbon;
      syncGerstnerUniforms(uniforms, settings);
      syncCoastWaterUniforms(uniforms, coast, coast.breakQ ?? -10);
      uniforms.uAlong0.value = coast.along0;
      uniforms.uCrestLength.value = coast.length;
      uniforms.uRefraction.value = settings.surfRefraction;
      uniforms.uSpent.value = settings.surfBoreLength + 30;
      ribbon.lineFor = '';
      uniforms.uWidth.value = settings.surfWidth;
      uniforms.uSteepen.value = settings.surfBreakLength;
      uniforms.uLean.value = settings.surfLean;
      uniforms.uJet.value = settings.surfJet;
      uniforms.uLift.value = settings.surfLift;
      uniforms.uSheet.value = settings.surfSheet;
      uniforms.uPeel.value = settings.surfPeel;
      uniforms.uPeelSpan.value = surfPeelSpan(settings);
      uniforms.uBore.value = settings.surfBoreLength;
      uniforms.uRunup.value = settings.surfRunup;
      uniforms.uSpeed.value = Math.max(settings.surfSpeed, 0.1);
      uniforms.uRoller.value = settings.surfRoller;
      uniforms.uRollerDensity.value = settings.surfRollerDensity;
      uniforms.uFoamThreshold.value = settings.foamThreshold;
      uniforms.uFoamSoftness.value = settings.foamSoftness;
      syncSprayUniforms(uniforms, settings, tier);
    });
  }, [coast, lighting, ribbons, settings, shading, tier]);

  useFrame(({ clock, camera, gl }) => {
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
    const trains = resolveGerstnerTrains(settings);
    tickWaterShadingUniforms(shading, time, activeNoise);
    const viewport = gl.getDrawingBufferSize(DRAWING_BUFFER);
    // Travel is measured from the mean break line: the wave is born well out
    // to sea and is over once its bore has run its length.
    const start = -settings.surfBreakLength - 45;
    const end = settings.surfBoreLength + 40;
    const period = Math.max(settings.surfPeriod, 1);
    const speed = Math.max(settings.surfSpeed, 0.1);
    // Frozen: one breaker stands on the break line and the phase morphs it
    // (0 = rearing up, 1 = spent bore) without moving it, so one camera sees
    // every stage; the others park out of sight.
    const frozen = settings.surfFreeze;
    const plungeAt = surfPlungeTime(SURF_SHAPE.crest * settings.surfHeight, -0.2 * settings.surfHeight, settings.surfLift);
    const frozenTravel = THREE.MathUtils.lerp(-settings.surfBreakLength - 3, speed * plungeAt + settings.surfBoreLength + 3, settings.surfPhase);
    ribbons.forEach((ribbon) => {
      let travel = frozen ? (ribbon.index === 0 ? frozenTravel : -1000) : start + speed * (time - ribbon.spawn);
      ribbon.uniforms.uGerstnerTime.value = time;
      tickShoreDepth(ribbon.uniforms, coast);
      const field = coast.foamField;
      ribbon.uniforms.uFoamField.value = field?.texture ?? null;
      ribbon.uniforms.uFoamMemory.value = field?.texture ? 1 : 0;
      if (field?.texture) ribbon.uniforms.uFoamWindow.value.copy(field.window);
      ribbon.uniforms.uPeel.value = frozen ? 0 : settings.surfPeel;
      if (frozen) ribbon.spawn = time - (travel - start) / speed;
      if (!frozen && travel > end) {
        // A breaker is the crest of the swell arriving, not a wave of its own:
        // its birth is locked to the primary train's phase at the break line,
        // so the surf lies ON the long wave lines instead of drifting across
        // them. Whole periods are skipped until the spawn interval is met —
        // not every swell crest breaks, but every breaker is a swell crest.
        const at = coastPoint(ribbon.uniforms.uBreakMean.value, coast.along0 + coast.length * 0.5, coast.definition);
        const swellPeriod = gerstnerPeriod(trains, settings.speed);
        // Spawn BEFORE the selected swell arrives; adding the travel time
        // instead scheduled the break two travel times after that crest.
        let next = time + gerstnerCrestDelay(trains, at.x, at.z, time, settings.speed) - Math.abs(start) / speed;
        // Not every crest breaks, and the ones that do are not evenly spaced:
        // the interval is drawn from the sets, so the lines arrive in groups
        // the way a sea actually delivers them.
        const gap = period * (0.45 + 1.1 * hash(schedule.current.spawned * 3 + 11));
        const earliest = Math.max(time, schedule.current.lastSpawn + gap);
        if (Number.isFinite(swellPeriod) && Number.isFinite(next)) {
          next += Math.max(0, Math.ceil((earliest - next) / swellPeriod)) * swellPeriod;
        } else next = earliest;
        schedule.current.lastSpawn = next;
        schedule.current.spawned += 1;
        ribbon.spawn = next;
        ribbon.height = 1 - settings.surfSets * 0.5 + settings.surfSets * hash(schedule.current.spawned);
        travel = start + speed * (time - next);
      }
      const height = settings.surfHeight * (frozen ? 1 : ribbon.height);
      // The break line for this wave: where the coast is shallower than
      // H / 0.78, section by section, with the crest's height read from the
      // swell's weather at its own break point — first with the plain height
      // to find the line, then with the heights along it. Refreshed when the
      // height or the weather changes.
      const lineKey = `${height}|${settings.gusts}|${settings.surfBreakDistance}`;
      if (ribbon.lineFor !== lineKey) {
        const guess = breakLineMean(coastBreakLine(coast.definition, height, coast.along0, coast.length, 8));
        const heightAt = (s) => { const at = coastPoint(guess, s, coast.definition); return height * gerstnerWeatherAt(at.x, at.z, settings.gusts); };
        const line = coastBreakLine(coast.definition, height, coast.along0, coast.length, BREAK_SAMPLES, 0.78, heightAt);
        for (let i = 0; i < line.length; i += 1) line[i] += settings.surfBreakDistance;
        ribbon.uniforms.uBreakLine.value = line;
        const visible = coastBreakVisibility(line, coast.length);
        const mean = breakLineMean(line);
        ribbon.uniforms.uBreakVisible.value = visible;
        ribbon.uniforms.uBreakMean.value = mean;
        // The foam field is a separate pass, so give it the same refracted
        // isobath and the same split mask as this loft. One scalar bore centre
        // alone cannot follow a crest that bends around the spit.
        if (foamBores?.breakLines?.[ribbon.index]) {
          foamBores.breakLines[ribbon.index].set(line);
          foamBores.breakVisible[ribbon.index].set(visible);
          foamBores.breakMeans[ribbon.index] = mean;
          foamBores.lineRevision += 1;
        }
        ribbon.lineFor = lineKey;
      }
      // The band that emits: as wide as the frustum is at this distance, so the
      // pool is spent on crest the camera can see and not behind it.
      const spray = ribbon.uniforms;
      spray.uSprayTime.value = time;
      spray.uSprayFrozen.value = frozen ? 1 : 0;
      const mid = coastPoint(spray.uBreakMean.value + travel, coast.along0 + coast.length * 0.5, coast.definition);
      const distance = Math.hypot(camera.position.x - mid.x, camera.position.z - mid.z);
      const projectionY = camera.projectionMatrix.elements[5];
      const projectionX = camera.projectionMatrix.elements[0];
      spray.uSprayViewport.value = viewport.height;
      spray.uSprayS0.value = 0.5;
      // The band follows the camera along the crest and is as wide as the view:
      // pinned to the middle it clung to one piece, spread over the whole crest
      // it thinned to nothing. Both were wrong for the same reason — the pool is
      // finite and belongs where the camera is looking.
      const local = coastCoordinates(camera.position.x, camera.position.z, coast.definition);
      spray.uSprayS0.value = THREE.MathUtils.clamp((local.s - coast.along0) / coast.length, 0, 1);
      spray.uSpraySpan.value = Math.min(Math.max(1.6 * distance / Math.max(projectionX, 0.1), 18), 120) / coast.length;
      const alive = !frozen || ribbon.index === 0;
      // A frozen inspection keeps one crest. `uTravel` cancels from the
      // centre-line transform, so parking the other ribbons at -1000 alone
      // still leaves their sheet and shell exactly on top of the chosen wave.
      // Their transparent passes then fight in depth and flash under motion.
      ribbon.uniforms.uRibbonVisible.value = alive ? 1 : 0;
      sprayGeometries[ribbon.index].instanceCount = alive
        ? sprayInstanceCount({ distance, height, viewportHeight: viewport.height, viewportWidth: viewport.width, projectionY, overdraw: tier.overdraw, max: tier.max })
        : 0;
      ribbon.uniforms.uTravel.value = travel;
      ribbon.uniforms.uPose.value = frozen ? Math.max(1.4, frozenTravel) : travel;
      ribbon.uniforms.uHeight.value = height;
      // What the wave leaves on the water: once the lip has landed (the same
      // timing the profile uses, at mid-crest) the roller writes into the foam
      // field, so the trail outlives the wave.
      const bore = foamBores?.[ribbon.index];
      if (bore) {
        // Same bounded peeling phase as surfTravelAt(s) at the bore's centre.
        // FoamField receives this helper too: its texture must not keep the old
        // 760-m crest-length ramp after the visible loft became local.
        const midTravel = travel + surfPeelTravelOffset(0.5, settings);
        const plunge = surfPlungeTime(SURF_SHAPE.crest * height, -0.2 * height, settings.surfLift);
        const psi = clamp01((midTravel - speed * plunge) / Math.max(settings.surfBoreLength, 0.1));
        // The field starts when the profile's low roller starts, then weakens
        // with that same bore phase. Otherwise the geometry has already become
        // a bore while its physical trail waits several metres to appear.
        const strength = smoothstep(0, 0.08, psi) * (1 - 0.65 * psi);
        const crestQ = ribbon.uniforms.uBreakMean.value + travel;
        // The run-up front: the water's edge on the sand, once the wave has landed.
        const front = psi > 0 ? crestQ + settings.surfWidth * 0.16 + 1 : -100;
        bore.set(crestQ + settings.surfWidth * 0.1, strength * 0.45, settings.surfWidth * 0.55, front);
      }
    });
  }, -25);

  // The bore schedule precedes the foam pass. Texture readers follow it, so
  // all water layers see the same newly advanced ping-pong target this frame.
  useFrame(() => {
    const field = coast.foamField;
    ribbons.forEach(({ uniforms }) => {
      uniforms.uFoamField.value = field?.texture ?? null;
      uniforms.uFoamMemory.value = field?.texture ? 1 : 0;
      if (field?.texture) uniforms.uFoamWindow.value.copy(field.window);
    });
  });

  return ribbons.flatMap((ribbon) => [
    <mesh key={`spray-${ribbon.index}`} name={`breaking-spray-${ribbon.index}`} geometry={sprayGeometries[ribbon.index]} material={ribbon.spray} frustumCulled={false} renderOrder={5} />,
    <mesh key={`sheet-${ribbon.index}`} name={`breaking-wave-${ribbon.index}`} geometry={geometry} material={ribbon.sheet} frustumCulled={false} renderOrder={2} />,
    <mesh key={`shell-${ribbon.index}`} name={`breaking-foam-${ribbon.index}`} geometry={geometry} material={ribbon.shell} frustumCulled={false} renderOrder={3} />,
  ]);
}
