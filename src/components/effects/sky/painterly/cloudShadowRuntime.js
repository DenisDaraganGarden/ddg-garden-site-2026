import * as THREE from 'three';
import { applyGardenLightShader } from '../../../../lighting/gardenLightShader.js';

// The cloud target already integrates density along the sun ray and stores
// transmittance (white = clear, black = blocked). Receivers only project their
// actual world point into that finished target.
const BINDER_STATE = new WeakMap();
const DEFAULT_ORIGIN = new THREE.Vector2();
const DEFAULT_SUN = new THREE.Vector3(0, 1, 0);
const DEFAULT_FLASH_POSITION = new THREE.Vector3(0, 1800, -4000);
// A sampler must always hold a texture of its own kind, even when the branch
// that reads it is off: an unset sampler2D lands on whatever unit 0 holds (a
// depth texture, on the post pass) and the driver reports a format mismatch.
// White is "no cloud in the way"; black is "no weather cell".
const solid = (value) => { const texture = new THREE.DataTexture(new Uint8Array([value, value, value, 255]), 1, 1); texture.needsUpdate = true; return texture; };
const EMPTY_WHITE = solid(255);
const EMPTY_BLACK = solid(0);
const DEFAULT_FLASH_COLOR = new THREE.Color(0, 0, 0);
// A lightning flash is diffuse light from the whole channel, added to the
// ambient irradiance in the same units as a directional light's colour, so it
// lands on every lit material through the one chunk three already computes.
const patchDirectionalLights = (source) => source.replace(
  /getDirectionalLightInfo\(\s*[^,]+,\s*directLight\s*\);/g,
  (call) => `${call}\n\t\t// ddgCloudDirectionalAttenuation\n\t\tdirectLight.color *= ddgCloudTransmission( vDdgCloudShadowWorldPosition );`,
).replace(
  /vec3 irradiance = getAmbientLightIrradiance\( ambientLightColor \);/,
  // geometryNormal is three's view-space normal; the bolt lives in world space.
  (line) => `${line}\n\t// ddgFlashIrradiance\n\tirradiance += ddgFlashIrradiance( vDdgCloudShadowWorldPosition, inverseTransformDirection( geometryNormal, viewMatrix ) );`,
);

export const DDG_CLOUD_SHADOW_GLSL = /* glsl */`
uniform sampler2D uDdgCloudShadowTexture;
uniform vec2 uDdgCloudShadowOrigin;
uniform float uDdgCloudShadowExtent;
uniform vec3 uDdgCloudShadowSun;
uniform float uDdgCloudShadowAltitude;
uniform float uDdgCloudShadowStrength;
uniform float uDdgCloudShadowEnabled;
uniform float uDdgFlash;
uniform vec3 uDdgFlashPosition;
uniform vec3 uDdgFlashColor;

vec3 ddgFlashIrradiance(vec3 worldPos, vec3 n) {
  if (uDdgFlash <= 0.0005) return vec3(0.0);
  vec3 c = vec3(uDdgFlashPosition.x, clamp(worldPos.y, 0.0, uDdgFlashPosition.y), uDdgFlashPosition.z);
  vec3 d = c - worldPos;
  float d2 = dot(d, d);
  float wrap = clamp(dot(n, d * inversesqrt(max(d2, 1.0))) * 0.5 + 0.5, 0.0, 1.0);
  return uDdgFlashColor * uDdgFlash * wrap * 1.0e6 / (d2 + 1.0e6);
}

float ddgCloudTransmission(vec3 worldPos) {
  if (uDdgCloudShadowEnabled < 0.5) return 1.0;
  vec2 projected = worldPos.xz - uDdgCloudShadowSun.xz * worldPos.y / max(uDdgCloudShadowSun.y, 0.08);
  vec2 uv = (projected - uDdgCloudShadowOrigin) / max(uDdgCloudShadowExtent, 1.0) + 0.5;
  vec2 edge = min(uv, 1.0 - uv);
  float bounds = smoothstep(0.0, 0.025, min(edge.x, edge.y));
  float transmission = texture2D(uDdgCloudShadowTexture, clamp(uv, 0.0, 1.0)).r;
  return mix(1.0, transmission, bounds * uDdgCloudShadowStrength);
}
`;

// Rain for the product post pass: the weather map and wind of the painterly
// volume, so the curtains fall from the same cells the clouds build.
export const DDG_RAIN_GLSL = /* glsl */`
uniform sampler2D uDdgWeather;
uniform vec2 uDdgWeatherWind;
uniform float uDdgWeatherPeriod;
uniform float uDdgRain;
uniform float uDdgRainCells;
uniform float uDdgRainSteps;
uniform float uDdgStorm;
uniform float uDdgRainDrops;
uniform float uDdgRainDropSize;

float ddgRainCell(vec2 xz) {
  vec2 uv = fract((xz + uDdgWeatherWind) / max(uDdgWeatherPeriod, 1.0));
  float threshold = mix(0.78, 0.35, clamp(uDdgRainCells, 0.0, 1.0));
  return smoothstep(threshold, threshold + 0.25, texture2D(uDdgWeather, uv).r);
}

// Curtains of rain between the eye and what it sees: under the raining cells,
// from the cloud base down to the ground, streaked by the fog noise falling.
// Returns the veil's opacity along this ray up to maxDistance.
float ddgRainVeil(vec3 origin, vec3 ray, float maxDistance, float dither) {
  if (uDdgRain <= 0.001 || uDdgCloudShadowEnabled < 0.5) return 0.0;
  float far = min(maxDistance, 16000.0);
  if (ray.y > 0.0001) far = min(far, (uDdgCloudShadowAltitude - origin.y) / ray.y);
  if (far <= 20.0) return 0.0;
  float stepLength = far / max(uDdgRainSteps, 1.0);
  float opticalDepth = 0.0;
  for (int i = 0; i < 12; i += 1) {
    if (float(i) >= uDdgRainSteps) break;
    float t = (float(i) + dither) * stepLength;
    vec3 p = origin + ray * t;
    // The slider is the artist's rain: a floor everywhere, denser in the cells.
    float cell = max(ddgRainCell(p.xz), uDdgRain * 0.35);
    if (cell > 0.002) {
      float streak = texture2D(uNoiseTexture, vec2((p.x + p.z * 0.7) * 0.0018, p.y * 0.0003 - uTime * 0.09)).r;
      opticalDepth += cell * (0.35 + streak * 1.3) * smoothstep(40.0, 220.0, t) * stepLength;
    }
  }
  return 1.0 - exp(-opticalDepth * uDdgRain * 0.0007);
}

// Rain at the camera: two layers of falling drops in screen space, a
// special effect in front of the lens rather than a simulation. Each column
// has its own phase, each cell holds one thin streak or nothing, and the two
// layers fall at different speeds so the eye reads depth. uDdgRainDrops sets
// how many cells carry a drop; uDdgRainDropSize scales the cell, so the streak.
float ddgDropLayer(vec2 uv, float aspect, float columns, float rows, float speed, float seed, float chance) {
  vec2 g = vec2(uv.x * aspect * columns, uv.y * rows);
  float col = floor(g.x);
  float phase = fract(sin(col * 12.9898 + seed) * 43758.5453);
  float y = g.y + uTime * speed * (0.8 + phase * 0.5) + phase * 7.0;
  float cell = floor(y);
  float h = fract(sin(dot(vec2(col, cell), vec2(127.1, 311.7)) + seed) * 43758.5453);
  float fx = abs(fract(g.x) - 0.5) * 2.0;
  float fy = fract(y);
  float across = 1.0 - smoothstep(0.0, 0.45, fx);
  float along = smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.3, 0.42, fy));
  return step(h, chance) * across * along;
}

float ddgRainStreaks(vec2 uv, float aspect) {
  if (uDdgRain <= 0.001 || uDdgRainDrops <= 0.001 || uDdgCloudShadowEnabled < 0.5) return 0.0;
  float localCell = max(ddgRainCell(uCameraWorldPosition.xz), uDdgRain);
  float size = clamp(uDdgRainDropSize, 0.5, 2.0);
  float chance = mix(0.03, 0.22, clamp(uDdgRainDrops, 0.0, 1.0));
  float drops = ddgDropLayer(uv, aspect, 320.0 / size, 10.0 / size, 8.0, 0.0, chance)
    + ddgDropLayer(uv, aspect, 520.0 / size, 16.0 / size, 12.0, 3.7, chance) * 0.6;
  return min(drops, 1.0) * localCell * uDdgRain;
}
`;

export function createRainUniforms() {
  return {
    uDdgWeather: { value: null },
    uDdgWeatherWind: { value: new THREE.Vector2() },
    uDdgWeatherPeriod: { value: 18000 },
    uDdgRain: { value: 0 },
    uDdgRainCells: { value: 0.5 },
    uDdgRainSteps: { value: 10 },
    uDdgStorm: { value: 0 },
    uDdgRainDrops: { value: 0.6 },
    uDdgRainDropSize: { value: 1 },
  };
}

export function updateRainUniforms(uniforms, descriptor) {
  const active = Boolean(descriptor?.enabled && descriptor?.weather);
  uniforms.uDdgWeather.value = active ? descriptor.weather : EMPTY_BLACK;
  uniforms.uDdgWeatherWind.value.copy(descriptor?.wind ?? DEFAULT_ORIGIN);
  uniforms.uDdgWeatherPeriod.value = Math.max(Number(descriptor?.weatherPeriod) || 18000, 1);
  uniforms.uDdgRain.value = active ? THREE.MathUtils.clamp(Number(descriptor?.rain) || 0, 0, 1) : 0;
  uniforms.uDdgRainCells.value = THREE.MathUtils.clamp(Number(descriptor?.rainCells) || 0, 0, 1);
  uniforms.uDdgStorm.value = active ? THREE.MathUtils.clamp(Number(descriptor?.storm) || 0, 0, 1) : 0;
  uniforms.uDdgRainDrops.value = THREE.MathUtils.clamp(Number(descriptor?.rainDrops ?? 0.6), 0, 1);
  uniforms.uDdgRainDropSize.value = THREE.MathUtils.clamp(Number(descriptor?.rainDropSize ?? 1), 0.5, 2);
  return uniforms;
}

export function createCloudShadowUniforms() {
  return {
    uDdgCloudShadowTexture: { value: null },
    uDdgCloudShadowOrigin: { value: new THREE.Vector2() },
    uDdgCloudShadowExtent: { value: 24000 },
    uDdgCloudShadowSun: { value: new THREE.Vector3(0, 1, 0) },
    uDdgCloudShadowAltitude: { value: 2600 },
    uDdgCloudShadowStrength: { value: 0 },
    uDdgCloudShadowEnabled: { value: 0 },
    uDdgFlash: { value: 0 },
    uDdgFlashPosition: { value: new THREE.Vector3() },
    uDdgFlashColor: { value: new THREE.Color() },
  };
}

// Receivers take the authored shadow strength. The post pass passes 1: its
// shafts, rain and sun-behind-a-cloud belong to the clouds themselves, not to
// how dark their shadow is painted on land and water.
export function updateCloudShadowUniforms(uniforms, descriptor, strength = descriptor?.strength) {
  const active = Boolean(descriptor?.enabled && descriptor?.texture && Number(strength) > 0);
  uniforms.uDdgCloudShadowTexture.value = descriptor?.texture ?? EMPTY_WHITE;
  uniforms.uDdgCloudShadowOrigin.value.copy(descriptor?.origin ?? DEFAULT_ORIGIN);
  uniforms.uDdgCloudShadowExtent.value = Math.max(Number(descriptor?.extent) || 24000, 1);
  uniforms.uDdgCloudShadowSun.value.copy(descriptor?.sun ?? DEFAULT_SUN).normalize();
  uniforms.uDdgCloudShadowAltitude.value = Math.max(Number(descriptor?.altitude) || 2600, 0);
  uniforms.uDdgCloudShadowStrength.value = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
  uniforms.uDdgCloudShadowEnabled.value = active ? 1 : 0;
  uniforms.uDdgFlash.value = descriptor?.enabled ? THREE.MathUtils.clamp(Number(descriptor?.flash) || 0, 0, 1) : 0;
  uniforms.uDdgFlashPosition.value.copy(descriptor?.flashPosition ?? DEFAULT_FLASH_POSITION);
  uniforms.uDdgFlashColor.value.copy(descriptor?.flashColor ?? DEFAULT_FLASH_COLOR);
  return uniforms;
}

export function applyCloudShadowShader(shader, uniforms, { csmPending = false } = {}) {
  Object.assign(shader.uniforms, uniforms);
  // A fallback wrapper can be captured by CSM later. Leave CSM's source
  // intact; csmAdapter calls this function again after its chunk replacement.
  if (csmPending) return;
  // Свет сада (src/lighting) — в ту же единственную точку, что проходят все
  // освещённые материалы, и в обоих путях: без CSM и после его подмены.
  applyGardenLightShader(shader);
  if (!shader.vertexShader.includes('vDdgCloudShadowWorldPosition')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDdgCloudShadowWorldPosition;')
      // This follows transformed geometry, instancing and batching without
      // relying on worldPosition, which Three only declares under some flags.
      .replace('#include <project_vertex>', `vec4 ddgCloudWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  ddgCloudWorldPosition = batchingMatrix * ddgCloudWorldPosition;
#endif
#ifdef USE_INSTANCING
  ddgCloudWorldPosition = instanceMatrix * ddgCloudWorldPosition;
#endif
vDdgCloudShadowWorldPosition = ( modelMatrix * ddgCloudWorldPosition ).xyz;
#include <project_vertex>`);
  }
  const hasDeclaration = shader.fragmentShader.includes('uDdgCloudShadowTexture');
  if (!hasDeclaration) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDdgCloudShadowWorldPosition;\n${DDG_CLOUD_SHADOW_GLSL}`);
  } else if (!shader.fragmentShader.includes('varying vec3 vDdgCloudShadowWorldPosition;')) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDdgCloudShadowWorldPosition;');
  }
  // Plant materials already declare the shared function for leaf
  // transmission. This marker independently guarantees their normal direct
  // lighting gets exactly one attenuation insertion as well.
  if (!shader.fragmentShader.includes('ddgCloudDirectionalAttenuation')) {
    shader.fragmentShader = patchDirectionalLights(shader.fragmentShader);
    // Three hands ordinary onBeforeCompile hooks unresolved chunks. The caller
    // marks CSM-pending materials above, so expanding this fallback cannot
    // prevent a later CSM callback from replacing its own chunk.
    if (shader.fragmentShader.includes('#include <lights_fragment_begin>')) {
      const directionalChunk = patchDirectionalLights(THREE.ShaderChunk.lights_fragment_begin);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', directionalChunk);
    }
  }
}

// Attach to a non-CSM Standard/PBR material. CSM users pass the ref as
// `cloudShadowRef` to createCsmAdapter so the patch runs after CSM expansion.
export function bindCloudShadowMaterial(material, cloudShadowRef) {
  if (!material || BINDER_STATE.has(material)) return BINDER_STATE.get(material)?.dispose;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const uniforms = createCloudShadowUniforms();
  const state = {
    update() { updateCloudShadowUniforms(uniforms, cloudShadowRef?.current); },
    dispose: null,
  };
  const cloudCompile = function ddgCloudShadowCompile(shader, renderer) {
    previousCompile?.call(material, shader, renderer);
    applyCloudShadowShader(shader, uniforms, {
      csmPending: Object.hasOwn(material.defines ?? {}, 'USE_CSM'),
    });
  };
  const cloudKey = function ddgCloudShadowCacheKey() {
    return `${previousKey?.call(material) ?? material.type}|ddg-cloud-shadow-v3|ddg-garden-v1`;
  };
  material.onBeforeCompile = cloudCompile;
  material.customProgramCacheKey = cloudKey;
  state.dispose = () => {
    if (BINDER_STATE.get(material) !== state) return;
    // CSM can wrap this callback after the fallback receiver sees a material.
    // Never restore through that newer owner during a CSM toggle or unmount.
    if (material.onBeforeCompile === cloudCompile) {
      material.onBeforeCompile = previousCompile;
      material.customProgramCacheKey = previousKey;
      material.needsUpdate = true;
    }
    BINDER_STATE.delete(material);
  };
  material.needsUpdate = true;
  BINDER_STATE.set(material, state);
  return state.dispose;
}

export function updateBoundCloudShadowMaterial(material) {
  BINDER_STATE.get(material)?.update();
}
