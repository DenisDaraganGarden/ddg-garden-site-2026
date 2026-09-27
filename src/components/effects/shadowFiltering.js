import { ShaderChunk } from 'three';
import { PCSS_SHADOW_GLSL } from './shadowPcss.js';

// Keep Three's hardware PCF and five taps. Each tap must compare against the
// receiver plane at THAT sample, not the centre's depth: the latter turns a
// sloping, fully lit terrace into stripes, especially with a wide cascade.
const receiverPlanePcf = /* glsl */`
#define DDG_RECEIVER_PLANE_SHADOWS
vec2 ddgReceiverPlaneGradient(vec4 shadowCoord) {
  vec3 coord = shadowCoord.xyz / shadowCoord.w;
  vec3 dx = dFdx(coord), dy = dFdy(coord);
  float determinant = dx.x * dy.y - dx.y * dy.x;
  if (abs(determinant) <= max(1e-30, 1e-6 * length(dx.xy) * length(dy.xy))) return vec2(0.0);
  return vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant;
}

float ddgReceiverPlaneTap(sampler2DShadow shadowMap, vec2 mapSize,
    vec3 center, vec2 gradient, vec2 offset) {
  vec2 uv = center.xy + offset;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  vec2 fraction = fract(uv * mapSize - 0.5);
  // Hardware bilinear PCF compares four texels to one depth. Cover the uphill
  // part of that footprint as well; otherwise radius=0 still self-shadows.
  vec2 uphill = mix(1.0 - fraction, fraction, step(vec2(0.0), gradient));
  float footprint = dot(abs(gradient) / mapSize, uphill);
  float depth = center.z + dot(gradient, offset) - footprint - 0.0000002;
  if (depth < 0.0 || depth > 1.0) return 1.0;
  return texture(shadowMap, vec3(uv, depth));
}

float getShadow(sampler2DShadow shadowMap, vec2 shadowMapSize,
    float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, vec2 gradient) {
  vec3 coord = shadowCoord.xyz / shadowCoord.w;
  coord.z += shadowBias;
  if (any(lessThan(coord.xy, vec2(0.0))) || any(greaterThan(coord.xy, vec2(1.0))) || coord.z > 1.0) return 1.0;
  if (shadowRadius <= 0.0) {
    return mix(1.0, ddgReceiverPlaneTap(shadowMap, shadowMapSize, coord, gradient, vec2(0.0)), shadowIntensity);
  }
  vec2 radius = shadowRadius / shadowMapSize;
  float phi = interleavedGradientNoise(gl_FragCoord.xy) * PI2;
  float shadow = 0.0;
  for (int i = 0; i < 5; i++) {
    shadow += ddgReceiverPlaneTap(shadowMap, shadowMapSize, coord, gradient, vogelDiskSample(i, 5, phi) * radius);
  }
  return mix(1.0, shadow * 0.2, shadowIntensity);
}

float getShadow(sampler2DShadow shadowMap, vec2 shadowMapSize,
    float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord) {
  return getShadow(shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius,
    shadowCoord, ddgReceiverPlaneGradient(shadowCoord));
}
`;

export function receiverPlaneCsmChunk(chunk) {
  if (chunk.includes('ddgCsmReceiverGradient')) return chunk;
  // Derivatives inside CSM's per-pixel cascade branch are undefined on the
  // split. Evaluate the two planes BEFORE that branch, then only filter the
  // chosen map. No extra shadow texture reads in the other cascade.
  const gradients = /* glsl */`
#if defined(DDG_RECEIVER_PLANE_SHADOWS) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  vec2 ddgCsmReceiverGradient[NUM_DIR_LIGHT_SHADOWS];
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
    ddgCsmReceiverGradient[i] = ddgReceiverPlaneGradient(vDirectionalShadowCoord[i]);
  }
  #pragma unroll_loop_end
#endif
`;
  return gradients + chunk.replace(/getShadow\( directionalShadowMap[^;]*?vDirectionalShadowCoord\[ i \] \)/g,
    (call) => call.slice(0, -1) + '\n#ifdef DDG_RECEIVER_PLANE_SHADOWS\n, ddgCsmReceiverGradient[ i ]\n#endif\n#ifdef DDG_PCSS_SHADOWS\n, ddgShadowDepthToUv(directionalShadowMatrix[ i ])\n#endif\n)');
}

export function receiverPlaneShadowChunk(chunk) {
  if (chunk.includes('ddgReceiverPlaneTap')) return chunk;
  const start = chunk.indexOf('float getShadow( sampler2DShadow');
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start);
  if (start < 0 || end < 0) throw new Error('Three PCF shader changed: review receiver-plane filtering.');
  const pcf = chunk.slice(0, start) + receiverPlanePcf + '\n\t' + chunk.slice(end);
  const basicStart = pcf.search(/#else\s+float getShadow\( sampler2D /);
  const basicEnd = pcf.indexOf('#if NUM_POINT_LIGHT_SHADOWS > 0', basicStart);
  if (basicStart < 0 || basicEnd < 0) throw new Error('Three basic shadow shader changed: review PCSS.');
  return pcf.slice(0, basicStart) + '#else // SHADOWMAP_TYPE_BASIC\n' + PCSS_SHADOW_GLSL + '\n#endif\n' + pcf.slice(basicEnd);
}

// One shared filter for ordinary lights, CSM and late-loaded model materials.
// Install before any canvas compiles; material-owned hooks remain untouched.
export function installReceiverPlaneShadows() {
  ShaderChunk.shadowmap_pars_fragment = receiverPlaneShadowChunk(ShaderChunk.shadowmap_pars_fragment);
  ShaderChunk.lights_fragment_begin = receiverPlaneCsmChunk(ShaderChunk.lights_fragment_begin);
}
