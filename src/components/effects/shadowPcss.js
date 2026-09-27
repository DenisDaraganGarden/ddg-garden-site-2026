// Raw depth remains in Three's existing shadow target. No duplicate maps or
// geometry passes: PCSS searches blockers, then filters a contact-sized kernel.
export const RAW_SHADOW_COMPARE_GLSL = /* glsl */`
float ddgRawShadowTexel(sampler2D map, vec2 size, vec3 center, vec2 gradient, vec2 pixel) {
  if (any(lessThan(pixel, vec2(0.0))) || any(greaterThanEqual(pixel, size))) return 1.0;
  vec2 uv = (pixel + 0.5) / size;
  float receiver = center.z + dot(gradient, uv - center.xy) - 0.0000002;
  return step(receiver, texelFetch(map, ivec2(pixel), 0).r);
}
float ddgRawShadowCompare(sampler2D map, vec2 size, vec3 center, vec2 gradient, vec2 uv) {
  vec2 pixel = uv * size - 0.5;
  vec2 base = floor(pixel), f = fract(pixel);
  float a = ddgRawShadowTexel(map, size, center, gradient, base);
  float b = ddgRawShadowTexel(map, size, center, gradient, base + vec2(1.0, 0.0));
  float c = ddgRawShadowTexel(map, size, center, gradient, base + vec2(0.0, 1.0));
  float d = ddgRawShadowTexel(map, size, center, gradient, base + vec2(1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export const PCSS_SHADOW_GLSL = /* glsl */`
#define DDG_RECEIVER_PLANE_SHADOWS
#define DDG_PCSS_SHADOWS
#if NUM_DIR_LIGHT_SHADOWS > 0
uniform mat4 directionalShadowMatrix[NUM_DIR_LIGHT_SHADOWS];
#endif
vec2 ddgReceiverPlaneGradient(vec4 shadowCoord) {
  vec3 coord = shadowCoord.xyz / shadowCoord.w;
  vec3 dx = dFdx(coord), dy = dFdy(coord);
  float determinant = dx.x * dy.y - dx.y * dy.x;
  if (abs(determinant) <= max(1e-30, 1e-6 * length(dx.xy) * length(dy.xy))) return vec2(0.0);
  return vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant;
}
vec2 ddgShadowDepthToUv(mat4 matrix) {
  float depthScale = length(vec3(matrix[0].z, matrix[1].z, matrix[2].z));
  return vec2(length(vec3(matrix[0].x, matrix[1].x, matrix[2].x)),
    length(vec3(matrix[0].y, matrix[1].y, matrix[2].y))) / max(depthScale, 1e-8);
}
vec2 ddgPcssDisk(int index, int count, float phi) {
  float r = sqrt((float(index) + 0.5) / float(count));
  float theta = float(index) * 2.39996323 + phi;
  return vec2(cos(theta), sin(theta)) * r;
}
${RAW_SHADOW_COMPARE_GLSL}
float getShadow(sampler2D map, vec2 size, float intensity, float bias,
    float radius, vec4 shadowCoord, vec2 gradient, vec2 depthToUv) {
  vec3 coord = shadowCoord.xyz / shadowCoord.w;
  coord.z += bias;
  if (intensity <= 0.0 || coord.z > 1.0 || coord.z < 0.0 ||
      any(lessThan(coord.xy, vec2(0.0))) || any(greaterThan(coord.xy, vec2(1.0)))) return 1.0;
  if (radius <= 0.0) return mix(1.0,
    ddgRawShadowCompare(map, size, coord, gradient, coord.xy), intensity);
  float phi = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.28318530718;
  vec2 filterRadius = vec2(radius) / size;
  if (depthToUv.x > 0.0) {
    // Directional sun: penumbra = blocker/receiver gap * tan(angular radius).
    // At the existing softness 1.5 this is the sun's ~0.266 degree half-angle.
    vec2 angularScale = depthToUv * (radius * 0.0031);
    vec2 searchRadius = clamp(coord.z * angularScale, 2.0 / size, 32.0 / size);
    float gaps = 0.0, blockers = 0.0;
    for (int i = 0; i < 12; i++) {
      // Always cover the bilinear footprint: a centre-only blocker test
      // would discard partial edge coverage and bring stair steps back.
      vec2 pixel = i < 4
        ? floor(coord.xy * size - 0.5) + vec2(float(i % 2), float(i / 2))
        : floor((coord.xy + ddgPcssDisk(i - 4, 8, phi) * searchRadius) * size);
      if (any(lessThan(pixel, vec2(0.0))) || any(greaterThanEqual(pixel, size))) continue;
      vec2 uv = (pixel + 0.5) / size;
      float receiver = coord.z + dot(gradient, uv - coord.xy) - 0.0000002;
      float gap = receiver - texelFetch(map, ivec2(pixel), 0).r;
      if (gap > 0.0) { gaps += gap; blockers += 1.0; }
    }
    if (blockers == 0.0) return 1.0;
    filterRadius = min(angularScale * (gaps / blockers), 32.0 / size);
  }
  float shadow = 0.0;
  for (int i = 0; i < 12; i++) {
    vec2 uv = coord.xy + ddgPcssDisk(i, 12, phi) * filterRadius;
    shadow += ddgRawShadowCompare(map, size, coord, gradient, uv);
  }
  return mix(1.0, shadow / 12.0, intensity);
}
float getShadow(sampler2D map, vec2 size, float intensity, float bias,
    float radius, vec4 coord, vec2 gradient) {
  return getShadow(map, size, intensity, bias, radius, coord, gradient, vec2(0.0));
}
float getShadow(sampler2D map, vec2 size, float intensity, float bias,
    float radius, vec4 coord) {
  return getShadow(map, size, intensity, bias, radius, coord, ddgReceiverPlaneGradient(coord));
}
`;
