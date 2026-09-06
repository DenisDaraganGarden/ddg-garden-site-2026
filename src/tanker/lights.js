import * as THREE from 'three';
import { sceneDepthFragment, sceneDepthVertex } from '../components/effects/shaders/sceneDepth.js';

// Navigation and deck lights as point sprites: no lamp geometry, one draw call
// for the whole ship, and a pixel floor so the lights survive the horizon the
// way a lighthouse does. Metres in the tanker frame: bow +X, port -Z, y=0 at
// the waterline. The aft masthead sweeps like a beacon, the red strobe above it
// blinks, the rest burn steadily with a mains flicker on the deck floods.
export const TANKER_LIGHT_PATTERN = Object.freeze({ steady: 0, flash: 1, beacon: 2, flicker: 3 });

const deckFloods = [-31, -8, 15, 38].flatMap((x, index) => [-1, 1].map((side) => ({
  id: `deck-${index}-${side < 0 ? 'port' : 'starboard'}`,
  position: [x, 8.72, side * 2.6],
  color: '#ffd79a',
  size: 0.9,
  pattern: 'flicker',
  phase: index * 0.37 + (side + 1) * 0.11,
})));

export const TANKER_LIGHTS = Object.freeze([
  { id: 'masthead-fore', position: [47, 21.0, 0], color: '#fff3d0', size: 1.5, pattern: 'steady' },
  { id: 'masthead-aft', position: [-47, 26.2, 0], color: '#fff3d0', size: 1.9, pattern: 'beacon' },
  { id: 'aft-strobe', position: [-47, 28.4, 0], color: '#ff3a2c', size: 1.1, pattern: 'flash', period: 1.6, phase: 0.35, duty: 0.1 },
  { id: 'port', position: [-40.1, 13.25, -8.0], color: '#ff2d1c', size: 1.1, pattern: 'steady' },
  { id: 'starboard', position: [-40.1, 13.25, 8.0], color: '#25ff78', size: 1.1, pattern: 'steady' },
  { id: 'stern', position: [-69.6, 6.4, 0], color: '#fff3d0', size: 1.0, pattern: 'steady' },
  { id: 'bridge-port', position: [-40.9, 15.2, -6.5], color: '#ffe3ae', size: 0.8, pattern: 'flicker', phase: 0.1 },
  { id: 'bridge-starboard', position: [-40.9, 15.2, 6.5], color: '#ffe3ae', size: 0.8, pattern: 'flicker', phase: 0.6 },
  ...deckFloods,
]);

export const TANKER_LIGHTS_DEFAULTS = Object.freeze({
  intensity: 1, // 0 turns them off
  dayLevel: 0.35, // share of the night brightness kept in daylight
  beaconPeriod: 4, // seconds between beacon flashes
  sizeScale: 1,
  minPixels: 9, // CSS pixels: the floor that keeps a light visible at the horizon
  maxPixels: 36,
});

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec4 aPattern; // type, period, phase, duty
  uniform float uTime;
  uniform float uIntensity;
  uniform float uNight;
  uniform float uDayLevel;
  uniform float uBeaconPeriod;
  uniform float uSizeScale;
  uniform float uMinPixels;
  uniform float uMaxPixels;
  uniform float uPixelRatio;
  uniform float uViewportHeight;
  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    float type = aPattern.x;
    float period = aPattern.y > 0.0 ? aPattern.y : uBeaconPeriod;
    float t = fract(uTime / period + aPattern.z);
    float brightness = 1.0;
    if (type == 1.0) {
      brightness = 1.0 - step(aPattern.w, t);
    } else if (type == 2.0) {
      float d = (t - 0.5) * period / 0.55;
      brightness = 0.16 + exp(-d * d);
    } else if (type == 3.0) {
      brightness = 0.88 + 0.12 * sin(uTime * 9.0 + aPattern.z * 40.0) * sin(uTime * 3.7 + aPattern.z * 17.0);
    }
    vBrightness = brightness * uIntensity * mix(uDayLevel, 1.0, clamp(uNight, 0.0, 1.0));
    vColor = aColor;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Metres in the ship frame; the lab shows a scale model, so the glow follows the object's scale.
    float worldScale = length(modelMatrix[0].xyz);
    float pixels = aSize * worldScale * uSizeScale * projectionMatrix[1][1] * uViewportHeight * 0.5 / max(-mvPosition.z, 0.01);
    // A flash also swells: the beacon grows as it fires, the strobe pops.
    gl_PointSize = clamp(pixels, uMinPixels * uPixelRatio, uMaxPixels * uPixelRatio) * (0.75 + 0.45 * brightness);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    float core = exp(-d * 9.0);
    float halo = exp(-d * 2.4) * 0.5;
    float alpha = (core + halo) * vBrightness;
    // Only the glow writes depth, so the scene fog sees the lamp at the ship's
    // distance and a mast behind the corner of the sprite is not cut off.
    if (alpha < 0.03) discard;
    vec3 color = mix(vColor, vec3(1.0), core * 0.55) * (0.5 + vBrightness * 1.6);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createTankerLights(lights = TANKER_LIGHTS) {
  const count = lights.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const patterns = new Float32Array(count * 4);
  const color = new THREE.Color();
  lights.forEach((light, index) => {
    positions.set(light.position, index * 3);
    color.set(light.color);
    colors.set([color.r, color.g, color.b], index * 3);
    sizes[index] = light.size;
    patterns.set([
      TANKER_LIGHT_PATTERN[light.pattern] ?? 0,
      light.period ?? 0,
      light.phase ?? 0,
      light.duty ?? 0.5,
    ], index * 4);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPattern', new THREE.BufferAttribute(patterns, 4));
  geometry.computeBoundingSphere();

  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: TANKER_LIGHTS_DEFAULTS.intensity },
    uNight: { value: 0 },
    uDayLevel: { value: TANKER_LIGHTS_DEFAULTS.dayLevel },
    uBeaconPeriod: { value: TANKER_LIGHTS_DEFAULTS.beaconPeriod },
    uSizeScale: { value: TANKER_LIGHTS_DEFAULTS.sizeScale },
    uMinPixels: { value: TANKER_LIGHTS_DEFAULTS.minPixels },
    uMaxPixels: { value: TANKER_LIGHTS_DEFAULTS.maxPixels },
    uPixelRatio: { value: 1 },
    uViewportHeight: { value: 1080 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'tanker-lights',
    uniforms,
    vertexShader: sceneDepthVertex(vertexShader),
    fragmentShader: sceneDepthFragment(fragmentShader),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'tanker_lights';
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.userData.ddgNoShadow = true;
  return { points, geometry, material, uniforms, count };
}

// Per frame. `viewportHeight` in device pixels (gl.getDrawingBufferSize),
// `night` 0..1 from the scene lighting, `intensity` 0 switches the lights off.
export function updateTankerLights(lights, {
  time = 0,
  night = 0,
  intensity = TANKER_LIGHTS_DEFAULTS.intensity,
  dayLevel = TANKER_LIGHTS_DEFAULTS.dayLevel,
  beaconPeriod = TANKER_LIGHTS_DEFAULTS.beaconPeriod,
  sizeScale = TANKER_LIGHTS_DEFAULTS.sizeScale,
  pixelRatio = 1,
  viewportHeight = 1080,
} = {}) {
  if (!lights) return;
  const { uniforms } = lights;
  uniforms.uTime.value = time;
  uniforms.uNight.value = night;
  uniforms.uIntensity.value = Math.max(0, intensity);
  uniforms.uDayLevel.value = THREE.MathUtils.clamp(dayLevel, 0, 1);
  uniforms.uBeaconPeriod.value = Math.max(0.5, beaconPeriod);
  uniforms.uSizeScale.value = Math.max(0.05, sizeScale);
  uniforms.uPixelRatio.value = pixelRatio;
  uniforms.uViewportHeight.value = viewportHeight;
  lights.points.visible = intensity > 0;
}

export function disposeTankerLights(lights) {
  lights?.geometry.dispose();
  lights?.material.dispose();
}
