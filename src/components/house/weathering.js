// Age in the material, without textures: rain streaks running down from the
// eaves, the band and the sills, damp climbing from the sand, grime in large
// blotches, colour bleached by the sun; paint flakes off to the grey wood
// under it, iron rusts in patches and runs, moss spreads on the shingles.
// Procedural in world space, so a streak follows the wall it is on and does
// not swim with the view. `uWeather` 0…1 scales all of it; 0 is the colour.

const KIND = { wood: 0, paint: 1, roofing: 2, iron: 3, other: 4 };
const ROLE_KIND = {
  siding: 'wood', shakes: 'wood', deck: 'wood', wood: 'wood', door: 'wood',
  trim: 'paint', awning: 'paint', shedWall: 'paint',
  roof: 'roofing', shedRoof: 'roofing',
  metal: 'iron',
};
export const weatherKindOf = (role) => KIND[ROLE_KIND[role] ?? 'other'];

// Colours are linear: grey wood under paint, rust, moss.
const GLSL = /* glsl */ `
uniform float uWeather;
uniform float uWeatherKind;
uniform float uWeatherSeed;
uniform vec4 uDripLines;
varying vec3 vWeatherPosition;
varying vec3 vWeatherNormal;

float weatherHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float weatherNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(weatherHash(i), weatherHash(i + vec2(1.0, 0.0)), u.x), mix(weatherHash(i + vec2(0.0, 1.0)), weatherHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float weatherFbm(vec2 p) { return 0.5 * weatherNoise(p) + 0.3 * weatherNoise(p * 2.13 + 7.1) + 0.2 * weatherNoise(p * 4.37 + 3.3); }

vec3 weathered(vec3 albedo) {
  if (uWeather <= 0.0) return albedo;
  vec3 n = normalize(vWeatherNormal);
  // Down the surface is gravity projected onto it; a floor has none.
  vec3 fall = vec3(0.0, -1.0, 0.0) + n * n.y;
  float steep = length(fall);
  vec3 down = steep > 0.15 ? fall / steep : vec3(0.0, 0.0, 1.0);
  vec3 across = normalize(cross(n, down));
  vec2 q = vec2(dot(vWeatherPosition, across), dot(vWeatherPosition, down)) + uWeatherSeed;
  float y = vWeatherPosition.y;
  // Streaks: noise drawn out down the surface, heaviest just under the lines
  // the rain runs off.
  float drip = 0.0;
  for (int i = 0; i < 4; i++) {
    float below = uDripLines[i] - y;
    drip += below > 0.0 ? exp(-below * 0.9) : 0.0;
  }
  float streaks = smoothstep(0.5, 0.85, weatherNoise(vec2(q.x * 6.0, q.y * 0.35))) * smoothstep(0.15, 0.6, steep) * (0.3 + drip);
  float blotch = smoothstep(0.45, 0.8, weatherFbm(q * 0.6 + 11.0));
  float damp = 1.0 - smoothstep(0.0, 0.8, y);
  float grey = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  vec3 aged = mix(albedo, vec3(grey), uWeather * 0.35);
  if (uWeatherKind < 0.5) {
    aged = mix(aged, vec3(grey * 0.92, grey * 0.94, grey), uWeather * 0.3);
  } else if (uWeatherKind < 1.5) {
    // Paint gives way where the weather works longest, in slivers that run
    // down the board with the grain.
    float failing = smoothstep(0.78 - uWeather * 0.35, 0.92 - uWeather * 0.35, weatherFbm(q * 0.8 + 3.0));
    float flake = failing * smoothstep(0.5, 0.58, weatherNoise(vec2(q.x * 16.0, q.y * 3.5)));
    aged = mix(aged, vec3(0.21, 0.19, 0.16), flake);
  } else if (uWeatherKind < 2.5) {
    // Moss in dark olive patches, speckled.
    float moss = smoothstep(0.62, 0.8, weatherFbm(q * 1.3 + 5.0)) * (0.6 + 0.4 * weatherNoise(q * 8.0)) * uWeather;
    aged = mix(aged, vec3(0.07, 0.085, 0.04), moss * 0.55);
  } else if (uWeatherKind < 3.5) {
    float rust = clamp(max(smoothstep(0.5, 0.75, weatherFbm(q * 1.7)), streaks) * uWeather, 0.0, 1.0);
    aged = mix(aged, vec3(0.3, 0.11, 0.04), rust);
  }
  float dark = uWeather * (0.45 * streaks + 0.25 * blotch + 0.35 * damp);
  return aged * (1.0 - clamp(dark, 0.0, 0.8));
}
`;

// Give a standard material the weathering. `shared` holds the building's
// uniforms (uWeather, uWeatherSeed, uDripLines), one set for all its finishes.
export function weatherMaterial(material, kind, shared) {
  const uniforms = { ...shared, uWeatherKind: { value: kind } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWeatherPosition;\nvarying vec3 vWeatherNormal;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vWeatherPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWeatherNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = weathered(diffuseColor.rgb);');
  };
  material.customProgramCacheKey = () => 'beach-house-weather';
  return material;
}
