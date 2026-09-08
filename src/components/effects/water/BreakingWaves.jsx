import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerShader, gerstnerWeatherAt, syncGerstnerUniforms } from './gerstnerWaves';
import { coastPoint } from '../../../terrain/terrainModel.js';
import { BREAK_SAMPLES, breakLineMean, coastBreakLine, coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
import { SPRAY_TIERS, buildSprayGeometry, createSprayUniforms, sprayInstanceCount, sprayShader, sprayVertexBody, syncSprayUniforms } from './spray';
import { SURF_SHAPE, surfPlungeTime, surfProfileShader } from './surfProfile';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

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

const RIBBON_SEGMENTS = 160;
const RIBBON_ROWS = 44;
const RIBBON_COUNT = 4;

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
  ${surfProfileShader}
  uniform float uAlong0;       // coast s of the crest's start
  uniform float uCrestLength;
  uniform float uBreakLine[BREAK_SAMPLES + 1]; // q where each section breaks
  uniform float uBreakMean;
  uniform float uRefraction;   // how far the crest follows the break line's shape
  uniform float uTravel;       // metres past the mean break line: the break phase
  uniform float uPose;         // metres past the mean break line: where the wave stands
  uniform float uHeight;
  uniform float uPeel;
  uniform float uRunup;
  uniform float uSpent;        // metres past its own break after which a section is gone
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
  // Refraction: the crest keeps the break line's shape by uRefraction and stays
  // straight for the rest, so a section standing over deeper water breaks later.
  float surfTravelAt(float s) {
    return uTravel + (1.0 - uRefraction) * (uBreakMean - surfBreakAt(s)) - s * uCrestLength * uPeel;
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
    return gerstnerDisplace(p, fade, waterCell(p), normal, jacobian, drift);
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
    return smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t)) * smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.96, 1.0, s));
  }
  // Normal by finite differences; a collapsed row (the jet before launch) has
  // no area and gets the up vector rather than a NaN.
  vec3 surfNormal(float s, float t, vec3 w) {
    float ts = t + (fract((t - 0.1) / 0.2) < 0.96 ? 0.008 : -0.008);
    vec3 ws = surfWorld(s + 0.003, surfAt(s + 0.003, t), 0.0);
    vec3 wt = surfWorld(s, surfAt(s, ts), 0.0);
    vec3 n = cross(ws - w, wt - w) * (ts > t ? 1.0 : -1.0);
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
    vAlpha = sp.alpha * surfRunupAlpha(w, s, ground) * surfEdgeAlpha(s, t);
    vShade = sp.shade;
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const sheetFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${gerstnerShader}
  ${waterShadingShader}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  varying float vShade;
  varying float vGround;
  void main() {
    if (vAlpha <= 0.002) discard;
    // No water under the sand: the loft is clipped by the bed, not by whatever
    // the beach happens to write into the depth buffer first.
    if (vWorld.y < vGround + 0.005) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = normalize(vNormal);
    if (dot(n, view) < 0.0) n = -n;
    n = waterRippleNormal(n, vWorld.xz, pixel, 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, vFoamUv, vFoam * 0.95, 0.0, vThickness, 0.0, 0.0) * vShade;
    gl_FragColor = vec4(color, vAlpha);
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
    float lump = uNoiseReady > 0.5 ? texture(uNoise, vec3(s * uCrestLength * 0.11, sp.arc * 0.23 - uTime * 0.35, 0.21)).r : 0.5;
    float shell = sp.puff * uRoller * surfHeightAt(s) * (0.45 + 1.1 * lump);
    vWorld = w + n * shell;
    vNormal = n;
    vFoamUv = vec2(s * uCrestLength, sp.arc);
    vShell = shell;
    vPuff = sp.puff;
    vGround = coastGround(coastLocal(w.xz));
    vAlpha = sp.alpha * surfRunupAlpha(w, s, vGround) * surfEdgeAlpha(s, t);
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const shellFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${gerstnerShader}
  ${waterShadingShader}
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
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < SHELL_STEPS; i++) {
      float d = (float(i) + 0.5) * stepLength;
      float h = 1.0 - d / depth;                 // 1 at the shell, 0 on the water
      vec3 p = vWorld - view * d;
      // Lumps from the cloud volume, carried with the wave (crest, arc) and
      // tumbling along the arc; a finer octave tears their edges.
      vec3 q = vec3(vFoamUv.x, vFoamUv.y - uTime * 1.2, p.y) * 0.35;
      float lump = texture(uNoise, q * 0.25).r;
      float tear = texture(uNoise, q * 0.9 + vec3(0.0, 0.0, 0.37)).b;
      // Denser toward the water, eroded toward the shell: rounded tops.
      float density = smoothstep(0.45, 1.0, lump * 0.9 + tear * 0.45 + (1.0 - h) * 0.7 - 0.4) * vPuff * uRollerDensity;
      if (density <= 0.001) continue;
      float alpha = 1.0 - exp(-density * stepLength * 4.5);
      // Beer/powder: light comes in from the shell side and fades toward the water.
      float powder = 1.0 - exp(-density * 2.6);
      float shade = exp(-(1.0 - h) * 1.4);
      vec3 lit = vec3(0.9, 0.92, 0.88) * (uFillIrradiance * (0.5 + 0.5 * h) + uSunRadiance * sunDiffuse * shade * (0.3 + 0.7 * powder)) / WATER_PI * uFoamBrightness;
      light += transmittance * alpha * lit;
      transmittance *= 1.0 - alpha;
      if (transmittance < 0.02) break;
    }
    float alpha = (1.0 - transmittance) * vAlpha;
    gl_FragColor = vec4(light * vAlpha, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
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
  varying vec2 vQuad;
  varying float vOpacity;
  void main() {
    float rad2 = dot(vQuad, vQuad);
    if (rad2 > 1.0) discard;
    float alpha = vOpacity * (1.0 - rad2);
    gl_FragColor = vec4(vec3(0.95, 0.96, 0.94) * alpha, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DRAWING_BUFFER = new THREE.Vector2();
const hash = (n) => ((n * 9301 + 49297) % 233280) / 233280;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const smoothstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// coast: { definition, along0, length, breakQ } — the terrain's coast frame
// and the stretch of shore (coast s) the breakers work.
export default function BreakingWaves({ settings, lighting, noise = null, coast, foamBores = null, timeline = null, wireframe = false, sprayTier = SPRAY_TIERS.high }) {
  const tier = sprayTier;
  const activeNoise = useWaterNoise(noise);
  const geometry = useMemo(() => buildRibbonGeometry(RIBBON_SEGMENTS, RIBBON_ROWS), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Shading uniforms are shared by reference between the ribbons: one sync
  // updates every material. Each ribbon's two materials share its uniforms.
  const shading = useMemo(() => createWaterShadingUniforms(), []);
  const ribbons = useMemo(() => Array.from({ length: RIBBON_COUNT }, (_, index) => {
    const uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...shading,
      ...createGerstnerUniforms(),
      ...createCoastWaterUniforms(),
      ...createSprayUniforms(),
      uAlong0: { value: 0 },
      uCrestLength: { value: 100 },
      uBreakLine: { value: new Float32Array(BREAK_SAMPLES + 1).fill(-10) },
      uBreakMean: { value: -10 },
      uRefraction: { value: 0.7 },
      uTravel: { value: -1000 },
      uPose: { value: -1000 },
      uHeight: { value: 1 },
      uPeel: { value: 0 },
      uRunup: { value: 10 },
      uSpent: { value: 60 },
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
    const spray = new THREE.ShaderMaterial({ uniforms, vertexShader: sprayVertexShader, fragmentShader: sprayFragmentShader, fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide });
    const sheet = new THREE.ShaderMaterial({ uniforms, vertexShader: sheetVertexShader, fragmentShader: sheetFragmentShader, fog: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shell = new THREE.ShaderMaterial({ uniforms, vertexShader: shellVertexShader, fragmentShader: shellFragmentShader, fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide });
    return { index, uniforms, sheet, shell, spray, spawn: -index * 9, height: 1, lineFor: '' };
  }), [shading]);
  useEffect(() => () => ribbons.forEach((ribbon) => { ribbon.sheet.dispose(); ribbon.shell.dispose(); ribbon.spray.dispose(); }), [ribbons]);
  useEffect(() => { ribbons.forEach((ribbon) => { ribbon.sheet.wireframe = wireframe; ribbon.shell.wireframe = wireframe; }); }, [ribbons, wireframe]);
  // One quad and one id buffer for every ribbon; only instanceCount differs,
  // and that lives on the geometry rather than on the buffers.
  const sprayGeometries = useMemo(() => {
    const first = buildSprayGeometry();
    return [first, ...Array.from({ length: RIBBON_COUNT - 1 }, () => buildSprayGeometry(undefined, first.userData.sprayBase))];
  }, []);
  useEffect(() => () => sprayGeometries.forEach((geometry) => geometry.dispose()), [sprayGeometries]);
  const schedule = useRef({ lastSpawn: 0, spawned: RIBBON_COUNT });

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
      uniforms.uBore.value = settings.surfBoreLength;
      uniforms.uRunup.value = settings.surfRunup;
      uniforms.uSpeed.value = Math.max(settings.surfSpeed, 0.1);
      uniforms.uRoller.value = settings.surfRoller;
      uniforms.uRollerDensity.value = settings.surfRollerDensity;
      syncSprayUniforms(uniforms, settings, tier);
    });
  }, [coast, lighting, ribbons, settings, shading, tier]);

  useFrame(({ clock, camera, gl }) => {
    const time = timeline ? timeline.elapsed : clock.elapsedTime;
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
      ribbon.uniforms.uPeel.value = frozen ? 0 : settings.surfPeel;
      if (frozen) ribbon.spawn = time - (travel - start) / speed;
      if (!frozen && travel > end) {
        const next = Math.max(schedule.current.lastSpawn + period, time);
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
        ribbon.uniforms.uBreakMean.value = breakLineMean(line);
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
      spray.uSpraySpan.value = Math.min(Math.max(2.4 * distance / Math.max(projectionX, 0.1), 25), 160) / coast.length;
      const alive = !frozen || ribbon.index === 0;
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
        const midTravel = travel - 0.5 * coast.length * ribbon.uniforms.uPeel.value;
        const plunge = surfPlungeTime(SURF_SHAPE.crest * height, -0.2 * height, settings.surfLift);
        const psi = clamp01((midTravel - speed * plunge) / Math.max(settings.surfBoreLength, 0.1));
        const strength = smoothstep(0, 0.25, psi) * (1 - 0.5 * psi);
        const crestQ = ribbon.uniforms.uBreakMean.value + travel;
        // The run-up front: the water's edge on the sand, once the wave has landed.
        const front = psi > 0 ? crestQ + settings.surfWidth * 0.16 + 1 : -100;
        bore.set(crestQ + settings.surfWidth * 0.1, strength * 0.45, settings.surfWidth * 0.16, front);
      }
    });
  });

  return ribbons.flatMap((ribbon) => [
    <mesh key={`spray-${ribbon.index}`} name={`breaking-spray-${ribbon.index}`} geometry={sprayGeometries[ribbon.index]} material={ribbon.spray} frustumCulled={false} renderOrder={5} />,
    <mesh key={`sheet-${ribbon.index}`} name={`breaking-wave-${ribbon.index}`} geometry={geometry} material={ribbon.sheet} frustumCulled={false} renderOrder={2} />,
    <mesh key={`shell-${ribbon.index}`} name={`breaking-foam-${ribbon.index}`} geometry={geometry} material={ribbon.shell} frustumCulled={false} renderOrder={3} />,
  ]);
}
