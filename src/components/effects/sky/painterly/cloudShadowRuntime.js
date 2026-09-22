import * as THREE from 'three';

// The cloud target already integrates density along the sun ray and stores
// transmittance (white = clear, black = blocked). Receivers only project their
// actual world point into that finished target.
const BINDER_STATE = new WeakMap();
const DEFAULT_ORIGIN = new THREE.Vector2();
const DEFAULT_SUN = new THREE.Vector3(0, 1, 0);
const DEFAULT_FLASH_POSITION = new THREE.Vector3(0, 1800, -4000);
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

export function updateCloudShadowUniforms(uniforms, descriptor) {
  const active = Boolean(descriptor?.enabled && descriptor?.texture && Number(descriptor?.strength) > 0);
  uniforms.uDdgCloudShadowTexture.value = descriptor?.texture ?? null;
  uniforms.uDdgCloudShadowOrigin.value.copy(descriptor?.origin ?? DEFAULT_ORIGIN);
  uniforms.uDdgCloudShadowExtent.value = Math.max(Number(descriptor?.extent) || 24000, 1);
  uniforms.uDdgCloudShadowSun.value.copy(descriptor?.sun ?? DEFAULT_SUN).normalize();
  uniforms.uDdgCloudShadowAltitude.value = Math.max(Number(descriptor?.altitude) || 2600, 0);
  uniforms.uDdgCloudShadowStrength.value = THREE.MathUtils.clamp(Number(descriptor?.strength) || 0, 0, 1);
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
    return `${previousKey?.call(material) ?? material.type}|ddg-cloud-shadow-v3`;
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
