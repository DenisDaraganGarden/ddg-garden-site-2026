import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createWaterShadingUniforms, syncWaterShadingUniforms, tickWaterShadingUniforms, useWaterNoise, waterShadingShader } from './waterShading';

// Breaking waves as ribbons. A height field cannot overhang, so the surf is a
// separate layer added over the swell: a strip crest x profile whose cross
// section is evaluated in the vertex shader from a break phase. Phase 0 is a
// plain hump; toward 1 the front face steepens and the lip is thrown forward
// on an arc and curls under (the tube); past 1 the shape collapses into a
// foaming bore that runs up the beach. The lip thickness is known from the
// profile, so translucency costs nothing. The break point travels along the
// crest (peel); waves spawn on a period with a sets variation in height.

const RIBBON_SEGMENTS = 160;
const RIBBON_ROWS = 28;
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

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  uniform vec2 uOrigin;
  uniform vec2 uCrestDir;
  uniform vec2 uShoreDir;
  uniform float uCrestLength;
  uniform float uWaveN;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uBreakN;
  uniform float uBreakLength;
  uniform float uPeel;
  uniform float uBoreLength;
  uniform float uRunup;
  uniform float uCurl;
  uniform float uLipRadius;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  #define PI 3.14159265

  // Cross-section at crest position s: x forward (toward the shore), y up.
  vec2 profile(float s, float t, out float thickness, out float foam) {
    float raw = (uWaveN - uBreakN - s * uCrestLength * uPeel) / uBreakLength;
    float phi = clamp(raw, 0.0, 1.0);
    float psi = clamp((raw - 1.0) * uBreakLength / max(uBoreLength, 0.1), 0.0, 1.0);
    float H = uHeight * smoothstep(0.0, 0.06, s) * smoothstep(1.0, 0.94, s);
    float hump = pow(max(sin(PI * t), 0.0), mix(1.0, 2.0, phi));
    vec2 h = vec2((t - 0.5) * uWidth - phi * uWidth * 0.2 * smoothstep(0.5, 1.0, t), H * hump);
    // The lip: from the crest, thrown forward on an arc and curling under.
    float u = smoothstep(0.58, 1.0, t);
    float theta = u * uCurl * phi;
    float R = uLipRadius * H;
    vec2 lip = vec2(0.0, H) + vec2(R, -0.15 * H) + R * vec2(-cos(theta), sin(theta));
    vec2 p = mix(h, lip, u * phi);
    thickness = mix(H * 0.6 + 0.2, 0.05, u * phi);
    foam = phi * max(u * (0.45 + 0.55 * smoothstep(0.3, 1.0, u)), smoothstep(0.62, 1.0, t) * 0.45);
    // Collapse: the shape sinks to a foaming step and runs on as a bore.
    vec2 bore = vec2((t - 0.5) * uWidth * 0.8, H * 0.4 * pow(max(sin(PI * t), 0.0), 0.7));
    p = mix(p, bore, psi);
    foam = max(foam, psi * smoothstep(0.25, 0.6, t));
    thickness = mix(thickness, 2.0, psi);
    return p;
  }
  vec3 worldAt(float s, float t, out float thickness, out float foam) {
    vec2 p = profile(s, t, thickness, foam);
    vec2 xz = uOrigin + uCrestDir * (s * uCrestLength) + uShoreDir * (uWaveN + p.x);
    return vec3(xz.x, p.y - 0.06, xz.y);
  }
  void main() {
    float s = position.x, t = position.y;
    float thickness, foam, scratchT, scratchF;
    vec3 w = worldAt(s, t, thickness, foam);
    vec3 ws = worldAt(s + 0.004, t, scratchT, scratchF);
    vec3 wt = worldAt(s, t + 0.02, scratchT, scratchF);
    vNormal = normalize(cross(wt - w, ws - w));
    vWorld = w;
    vFoam = foam;
    vThickness = thickness;
    vAlpha = 1.0 - smoothstep(uRunup - 4.0, uRunup, uWaveN + (t - 0.5) * uWidth);
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  ${waterShadingShader}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vFoam;
  varying float vThickness;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.002) discard;
    vec3 view = normalize(cameraPosition - vWorld);
    float pixel = length(vec2(fwidth(vWorld.x), fwidth(vWorld.z)));
    vec3 n = normalize(vNormal);
    if (dot(n, view) < 0.0) n = -n;
    n = waterRippleNormal(n, vWorld.xz, pixel, 0.5);
    vec3 color = shadeWater(vWorld, n, view, pixel, vFoam * 0.95, vThickness, 0.0);
    gl_FragColor = vec4(color, vAlpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const hash = (n) => ((n * 9301 + 49297) % 233280) / 233280;

export default function BreakingWaves({ settings, lighting, noise = null, shore }) {
  const activeNoise = useWaterNoise(noise);
  const geometry = useMemo(() => buildRibbonGeometry(RIBBON_SEGMENTS, RIBBON_ROWS), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Shading uniforms are shared by reference between the ribbons: one sync
  // updates every material.
  const shading = useMemo(() => createWaterShadingUniforms(), []);
  const ribbons = useMemo(() => Array.from({ length: RIBBON_COUNT }, (_, index) => {
    const uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...shading,
      uOrigin: { value: new THREE.Vector2() },
      uCrestDir: { value: new THREE.Vector2(1, 0) },
      uShoreDir: { value: new THREE.Vector2(0, 1) },
      uCrestLength: { value: 100 },
      uWaveN: { value: -1000 },
      uHeight: { value: 1 },
      uWidth: { value: 9 },
      uBreakN: { value: -30 },
      uBreakLength: { value: 16 },
      uPeel: { value: 0 },
      uBoreLength: { value: 14 },
      uRunup: { value: 10 },
      uCurl: { value: 4 },
      uLipRadius: { value: 0.6 },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, transparent: true, side: THREE.DoubleSide });
    return { index, uniforms, material, spawn: -index * 9, height: 1 };
  }), [shading]);
  useEffect(() => () => ribbons.forEach((ribbon) => ribbon.material.dispose()), [ribbons]);
  const schedule = useRef({ lastSpawn: 0, spawned: RIBBON_COUNT });

  useEffect(() => {
    syncWaterShadingUniforms(shading, settings, lighting);
    ribbons.forEach(({ uniforms }) => {
      uniforms.uOrigin.value.fromArray(shore.origin);
      uniforms.uCrestDir.value.fromArray(shore.crestDir);
      uniforms.uShoreDir.value.fromArray(shore.shoreDir);
      uniforms.uCrestLength.value = shore.length;
      uniforms.uWidth.value = settings.surfWidth;
      uniforms.uBreakN.value = -settings.surfBreakDistance;
      uniforms.uBreakLength.value = settings.surfBreakLength;
      uniforms.uPeel.value = settings.surfPeel;
      uniforms.uBoreLength.value = settings.surfBoreLength;
      uniforms.uRunup.value = settings.surfRunup;
      uniforms.uCurl.value = settings.surfCurl;
      uniforms.uLipRadius.value = settings.surfLipRadius;
    });
  }, [lighting, ribbons, settings, shading, shore]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    tickWaterShadingUniforms(shading, time, activeNoise);
    const start = -settings.surfBreakDistance - 50;
    const period = Math.max(settings.surfPeriod, 1);
    const speed = Math.max(settings.surfSpeed, 0.1);
    ribbons.forEach((ribbon) => {
      let n = start + speed * (time - ribbon.spawn);
      if (n > settings.surfRunup + 8) {
        const next = Math.max(schedule.current.lastSpawn + period, time);
        schedule.current.lastSpawn = next;
        schedule.current.spawned += 1;
        ribbon.spawn = next;
        ribbon.height = 1 - settings.surfSets * 0.5 + settings.surfSets * hash(schedule.current.spawned);
        n = start + speed * (time - next);
      }
      ribbon.uniforms.uWaveN.value = n;
      ribbon.uniforms.uHeight.value = settings.surfHeight * ribbon.height;
    });
  });

  return ribbons.map((ribbon) => (
    <mesh key={ribbon.index} name={`breaking-wave-${ribbon.index}`} geometry={geometry} material={ribbon.material} frustumCulled={false} renderOrder={2} />
  ));
}
