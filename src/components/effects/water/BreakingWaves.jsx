import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGerstnerUniforms, gerstnerShader, syncGerstnerUniforms } from './gerstnerWaves';
import { BREAK_SAMPLES, breakLineMean, coastBreakLine, coastWaterShader, createCoastWaterUniforms, syncCoastWaterUniforms, tickShoreDepth } from './coastFrame';
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
  // Height and phase vary smoothly along the crest (Bosboom & Stive's example
  // modulation), the ends taper to the swell, and the break moment peels.
  float surfHeightAt(float s) {
    float y = s * uCrestLength;
    return uHeight * smoothstep(0.0, 0.06, s) * smoothstep(1.0, 0.94, s) * (0.9 + 0.1 * cos(SURF_TAU * y / 9.0));
  }
  float surfPhaseAt(float s) {
    float y = s * uCrestLength;
    return (0.32 * sin(SURF_TAU * y / 12.7) + 0.16 * sin(SURF_TAU * y / 8.9 + 1.7)) * uWidth / SURF_TAU * 0.5;
  }
  float surfBreakAt(float s) {
    float x = clamp(s, 0.0, 1.0) * float(BREAK_SAMPLES);
    int i = int(floor(x));
    return mix(uBreakLine[i], uBreakLine[min(i + 1, BREAK_SAMPLES)], fract(x));
  }
  // Refraction: the crest keeps the break line's shape by uRefraction and stays
  // straight for the rest, so a section standing over deeper water breaks later.
  float surfTravelAt(float s) {
    return uTravel + (1.0 - uRefraction) * (uBreakMean - surfBreakAt(s)) - s * uCrestLength * uPeel;
  }
  SurfPoint surfAt(float s, float t) {
    return surfProfile(t, surfTravelAt(s), surfHeightAt(s));
  }
  vec3 surfSwell(vec2 p) {
    float dist = distance(p, cameraPosition.xz);
    float fade = (1.0 - smoothstep(uGerstnerFade.x, uGerstnerFade.y, dist)) * coastSwellFade(coastLocal(p));
    vec3 normal;
    float jacobian;
    vec2 drift;
    return gerstnerDisplace(p, fade, 1.5, normal, jacobian, drift);
  }
  vec3 surfWorld(float s, SurfPoint sp) {
    float q = surfBreakAt(s) + surfTravelAt(s) - uTravel + uPose + sp.p.x + surfPhaseAt(s);
    vec2 xz = coastPoint(q, uAlong0 + s * uCrestLength);
    return surfSwell(xz) + vec3(0.0, sp.p.y - sp.base, 0.0);
  }
  // The edges of the loft coincide with the swell and vanish into it.
  float surfEdgeAlpha(float s, float t) {
    return smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t) * smoothstep(0.0, 0.04, s) * smoothstep(1.0, 0.96, s);
  }
  // Normal by finite differences; a collapsed row (the jet before launch) has
  // no area and gets the up vector rather than a NaN.
  vec3 surfNormal(float s, float t, vec3 w) {
    float ts = t + (fract(t / 0.2) < 0.95 ? 0.008 : -0.008);
    vec3 ws = surfWorld(s + 0.003, surfAt(s + 0.003, t));
    vec3 wt = surfWorld(s, surfAt(s, ts));
    vec3 n = cross(wt - w, ws - w) * (ts > t ? 1.0 : -1.0);
    return dot(n, n) > 1e-10 ? normalize(n) : vec3(0.0, 1.0, 0.0);
  }
  // A section is gone when it has run up the beach or, on a spit, when it has
  // travelled its bore out past its own break.
  float surfRunupAlpha(vec3 w, float s) {
    return (1.0 - smoothstep(uRunup - 4.0, uRunup, coastLocal(w.xz).x)) * (1.0 - smoothstep(uSpent - 8.0, uSpent, surfTravelAt(s)));
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
  void main() {
    float s = position.x, t = position.y;
    SurfPoint sp = surfAt(s, t);
    vec3 w = surfWorld(s, sp);
    vWorld = w;
    vNormal = surfNormal(s, t, w);
    vFoamUv = vec2(s * uCrestLength, sp.arc);
    vFoam = sp.foam;
    vThickness = sp.thickness;
    vAlpha = sp.alpha * surfRunupAlpha(w, s) * surfEdgeAlpha(s, t);
    vShade = sp.shade;
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const sheetFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${waterShadingShader}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  varying float vShade;
  void main() {
    if (vAlpha <= 0.002) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = normalize(vNormal);
    if (dot(n, view) < 0.0) n = -n;
    n = waterRippleNormal(n, vWorld.xz, pixel, 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, vFoamUv, vFoam * 0.95, 0.0, vThickness, 0.0) * vShade;
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
  void main() {
    float s = position.x, t = position.y;
    SurfPoint sp = surfAt(s, t);
    vec3 w = surfWorld(s, sp);
    vec3 n = surfNormal(s, t, w);
    // Foam stands up off the water; under the lip it hangs down.
    bool underside = t >= 0.5 && t < 0.7;
    n *= sign(n.y + 1e-4) * (underside ? -1.0 : 1.0);
    // Lumps: the same cloud volume shapes the silhouette, tumbling with the roller.
    float lump = uNoiseReady > 0.5 ? texture(uNoise, vec3(s * uCrestLength * 0.11, sp.arc * 0.23 - uTime * 0.35, 0.21)).r : 0.5;
    float shell = sp.puff * uRoller * surfHeightAt(s) * (0.45 + 1.1 * lump);
    vWorld = w + n * shell;
    vNormal = n;
    vFoamUv = vec2(s * uCrestLength, sp.arc);
    vShell = shell;
    vPuff = sp.puff;
    vAlpha = sp.alpha * surfRunupAlpha(w, s) * surfEdgeAlpha(s, t);
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const shellFragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${waterShadingShader}
  uniform float uRollerDensity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vFoamUv;
  varying float vShell;
  varying float vPuff;
  varying float vAlpha;
  #define SHELL_STEPS 12
  void main() {
    if (vAlpha <= 0.002 || vShell < 0.004 || uNoiseReady < 0.5) discard;
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

const hash = (n) => ((n * 9301 + 49297) % 233280) / 233280;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const smoothstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// coast: { definition, along0, length, breakQ } — the terrain's coast frame
// and the stretch of shore (coast s) the breakers work.
export default function BreakingWaves({ settings, lighting, noise = null, coast, foamBores = null }) {
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
    const sheet = new THREE.ShaderMaterial({ uniforms, vertexShader: sheetVertexShader, fragmentShader: sheetFragmentShader, fog: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shell = new THREE.ShaderMaterial({ uniforms, vertexShader: shellVertexShader, fragmentShader: shellFragmentShader, fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide });
    return { index, uniforms, sheet, shell, spawn: -index * 9, height: 1, lineFor: NaN };
  }), [shading]);
  useEffect(() => () => ribbons.forEach((ribbon) => { ribbon.sheet.dispose(); ribbon.shell.dispose(); }), [ribbons]);
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
      ribbon.lineFor = NaN;
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
    });
  }, [coast, lighting, ribbons, settings, shading]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    tickWaterShadingUniforms(shading, time, activeNoise);
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
      // The break line for this wave's height: where the coast is shallower
      // than H / 0.78, section by section, refreshed when the height changes.
      if (ribbon.lineFor !== height) {
        const line = coastBreakLine(coast.definition, height, coast.along0, coast.length);
        for (let i = 0; i < line.length; i += 1) line[i] += settings.surfBreakDistance;
        ribbon.uniforms.uBreakLine.value = line;
        ribbon.uniforms.uBreakMean.value = breakLineMean(line);
        ribbon.lineFor = height;
      }
      ribbon.uniforms.uTravel.value = travel;
      ribbon.uniforms.uPose.value = frozen ? 1.4 : travel;
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
        bore.set(ribbon.uniforms.uBreakMean.value + travel + settings.surfWidth * 0.1, strength * 0.45, settings.surfWidth * 0.16, 0);
      }
    });
  });

  return ribbons.flatMap((ribbon) => [
    <mesh key={`sheet-${ribbon.index}`} name={`breaking-wave-${ribbon.index}`} geometry={geometry} material={ribbon.sheet} frustumCulled={false} renderOrder={2} />,
    <mesh key={`shell-${ribbon.index}`} name={`breaking-foam-${ribbon.index}`} geometry={geometry} material={ribbon.shell} frustumCulled={false} renderOrder={3} />,
  ]);
}
