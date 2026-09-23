import * as THREE from 'three';

// The house's materials: a standard material per finish whose colour, relief
// and roughness come from three procedural map sets (npm run house:textures —
// weathered wood, asphalt granules, galvanised iron), laid by each piece's
// `aSurface` (beachHouse.js): a single board with the grain along it,
// clapboard in 22 cm courses with butt joints, shakes, upright boards, three-
// tab shingles, iron, rope. The finish colour tints the maps (their mean is
// 1). Paint hides the grain and flakes off it; age (`uWeather`) streaks the
// walls under the eaves, the band and the sills, darkens them from the sand,
// bleaches colour, rusts iron and greens shingles. Everything is in metres and
// world space, so a board's grain follows the board and nothing swims.

const MAPS = ['wood-albedo', 'wood-normal', 'wood-surface', 'shingle-albedo', 'shingle-normal', 'shingle-surface', 'metal-albedo', 'metal-surface'];
export const houseMapUrls = (lowPower = false) => MAPS.map((name) => `/textures/house/${lowPower ? 'mobile/' : ''}${name}.webp`);

// The loaded maps as uniforms: albedo is colour, the rest data; all repeat.
export function houseMaps(textures, gl) {
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const maps = {};
  textures.forEach((texture, i) => {
    texture.colorSpace = MAPS[i].endsWith('albedo') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    maps[MAPS[i]] = texture;
  });
  return maps;
}

// How age treats a finish: 0 bare wood, 1 paint, 2 roofing, 3 iron, 4 other.
const ROLE_KIND = {
  siding: 0, shakes: 0, deck: 0, wood: 0, door: 0,
  trim: 1, awning: 1, shedWall: 1,
  roof: 2, shedRoof: 2,
  metal: 3,
};

// Colours are linear: grey wood under paint, rust, moss.
const GLSL = /* glsl */ `
uniform sampler2D uWoodAlbedo;
uniform sampler2D uWoodNormal;
uniform sampler2D uWoodSurface;
uniform sampler2D uShingleAlbedo;
uniform sampler2D uShingleNormal;
uniform sampler2D uShingleSurface;
uniform sampler2D uMetalAlbedo;
uniform sampler2D uMetalSurface;
uniform float uTextured;
uniform float uWeather;
uniform float uWeatherKind;
uniform float uWeatherSeed;
uniform vec4 uDripLines;
varying vec3 vHouseSurface;
varying vec3 vWeatherPosition;
varying vec3 vWeatherNormal;

const vec2 WOOD_TILE = vec2(2.0, 1.0);
const float SHINGLE_TILE = 0.5;
const float METAL_TILE = 1.0;

// A finish at a point: a tint of its colour (1 on average), a tangent-space
// normal, a factor on its roughness, the dark of cavities and joints, and the
// point in metres of the board with x along its grain (paint splits along it).
struct HouseSample {
  vec3 tint;
  vec3 normal;
  float roughness;
  float occlusion;
  vec2 grain;
};

float houseHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Weathered wood at a point in metres, the grain along x.
HouseSample houseWood(vec2 p) {
  vec2 st = p / WOOD_TILE;
  vec3 s = texture2D(uWoodSurface, st).rgb;
  return HouseSample(texture2D(uWoodAlbedo, st).rgb * 2.0, texture2D(uWoodNormal, st).xyz * 2.0 - 1.0, s.g / 0.8, s.r, p);
}
// The same with the grain along y: the relief's axes swap with the lookup's.
HouseSample houseWoodUpright(vec2 p) {
  HouseSample h = houseWood(p.yx);
  h.normal = vec3(h.normal.y, h.normal.x, h.normal.z);
  return h;
}

HouseSample houseSurface(vec2 uv, vec3 surface) {
  HouseSample h = HouseSample(vec3(1.0), vec3(0.0, 0.0, 1.0), 1.0, 1.0, uv);
  if (uTextured < 0.5) return h;
  float seed = surface.x, scale = surface.z;
  int pattern = int(surface.y + 0.5);
  if (pattern == 0) {
    // A board of its own: its own stretch of wood and its own shade.
    h = houseWood(uv + vec2(houseHash(seed * 17.0) * 23.0, houseHash(seed * 29.0) * 7.0));
    h.tint *= 0.88 + 0.24 * houseHash(seed * 41.0);
  } else if (pattern == 1) {
    // Clapboard: 22 cm courses up the wall, boards of 1.6–4 m along them,
    // each lapping the one below, a hairline at every butt joint.
    float course = floor(uv.y / 0.22), up = fract(uv.y / 0.22);
    float run = 1.6 + 2.4 * houseHash(course * 3.1 + seed);
    float along = uv.x + houseHash(course * 5.7) * 9.0;
    float board = floor(along / run), at = fract(along / run) * run, id = course * 13.0 + board;
    h = houseWood(vec2(along, up * 0.22) + vec2(houseHash(id) * 23.0, houseHash(id + 0.5) * 7.0));
    h.tint *= 0.86 + 0.28 * houseHash(id * 1.7);
    float joint = 1.0 - smoothstep(0.002, 0.006, min(at, run - at));
    h.occlusion *= (1.0 - 0.75 * joint) * mix(0.62, 1.0, smoothstep(0.0, 0.2, up));
    h.normal = normalize(h.normal + vec3(0.0, -0.1, 0.0));
  } else if (pattern == 2 || pattern == 8) {
    // Shakes on a wall (17 cm courses from scale) or wood shingles on a roof
    // (courses of scale): odd widths, the grain running down each piece.
    float height = pattern == 2 ? 0.17 : max(scale, 0.12);
    float v = pattern == 2 ? uv.y - scale : uv.y;
    float course = floor(v / height), up = fract(v / height);
    float along = uv.x + houseHash(course * 7.3) * 5.0;
    float cell = floor(along / 0.21), inCell = fract(along / 0.21);
    float split = 0.2 + 0.6 * houseHash(course * 11.0 + cell);
    float id = course * 17.0 + cell + step(split, inCell) * 0.5;
    float gap = min(abs(inCell - split), min(inCell, 1.0 - inCell)) * 0.21;
    h = houseWoodUpright(vec2(along, up * height) + vec2(houseHash(id) * 13.0, houseHash(id + 0.3) * 5.0));
    h.tint *= 0.8 + 0.35 * houseHash(id * 2.3);
    h.occlusion *= (1.0 - 0.8 * (1.0 - smoothstep(0.002, 0.005, gap))) * mix(0.6, 1.0, smoothstep(0.0, 0.25, up));
    h.normal = normalize(h.normal + vec3(0.0, -0.12, 0.0));
  } else if (pattern == 3) {
    // Upright boards 15 cm wide, the first joint at scale.
    float across = uv.x - scale;
    float board = floor(across / 0.15), at = fract(across / 0.15) * 0.15;
    h = houseWoodUpright(vec2(across, uv.y) + vec2(houseHash(board + seed) * 5.0, houseHash(board * 3.1 + seed) * 17.0));
    h.tint *= 0.86 + 0.28 * houseHash(board * 1.9 + seed);
    h.occlusion *= 1.0 - 0.75 * (1.0 - smoothstep(0.002, 0.006, min(at, 0.15 - at)));
  } else if (pattern == 4) {
    // Asphalt shingles: granules everywhere; on a roof slab (scale, its
    // course) three tabs a course, slots between them, tabs of a blend of
    // shades, the shade of the course above along each butt.
    vec2 st = uv / SHINGLE_TILE;
    vec3 s = texture2D(uShingleSurface, st).rgb;
    h = HouseSample(texture2D(uShingleAlbedo, st).rgb * 2.0, texture2D(uShingleNormal, st).xyz * 2.0 - 1.0, s.g / 0.9, s.r, uv);
    if (scale > 0.0) {
      float course = floor(uv.y / scale), up = fract(uv.y / scale);
      float along = uv.x + course * 0.1667 + houseHash(course * 3.3) * 0.05;
      float tab = floor(along / 0.3333), at = fract(along / 0.3333) * 0.3333;
      float slot = (1.0 - smoothstep(0.003, 0.006, min(at, 0.3333 - at))) * (1.0 - smoothstep(0.5, 0.55, up));
      h.tint *= (0.86 + 0.28 * houseHash(course * 7.1 + tab)) * (1.0 - 0.6 * slot);
      h.occlusion *= (1.0 - 0.7 * slot) * mix(0.55, 1.0, smoothstep(0.0, 0.12, 1.0 - up));
    }
  } else if (pattern == 5) {
    // Galvanised iron, each sheet from its own patch of spangle.
    vec2 st = uv / METAL_TILE + vec2(houseHash(seed * 13.0), houseHash(seed * 19.0)) * 5.0;
    h.tint = texture2D(uMetalAlbedo, st).rgb * 2.0;
    h.roughness = texture2D(uMetalSurface, st).g / 0.4;
  } else if (pattern == 7) {
    // Rope: three strands twisting round it.
    float strand = fract(uv.x / 0.035 + uv.y * 3.0), groove = smoothstep(0.35, 0.5, abs(strand - 0.5));
    h.tint *= 1.0 - 0.3 * groove;
    h.occlusion *= 1.0 - 0.4 * groove;
    h.normal = normalize(vec3(0.0, (strand - 0.5) * 1.2, 1.0));
  }
  return h;
}

float weatherNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = houseHash(i.x + i.y * 57.0), b = houseHash(i.x + 1.0 + i.y * 57.0);
  float c = houseHash(i.x + (i.y + 1.0) * 57.0), d = houseHash(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float weatherFbm(vec2 p) { return 0.5 * weatherNoise(p) + 0.3 * weatherNoise(p * 2.13 + 7.1) + 0.2 * weatherNoise(p * 4.37 + 3.3); }

// The finish's colour on the sample, painted or bare, and aged: the relief and
// roughness of bared wood come back where paint flakes off.
vec3 houseShade(vec3 finish, inout HouseSample h) {
  bool painted = uWeatherKind > 0.5 && uWeatherKind < 1.5;
  vec3 wood = h.tint, woodNormal = h.normal;
  float woodRoughness = h.roughness;
  vec3 albedo = painted ? finish * mix(vec3(1.0), wood, 0.12) : finish * wood;
  if (painted) {
    h.normal = normalize(mix(vec3(0.0, 0.0, 1.0), h.normal, 0.4));
    h.roughness = 0.85;
  }
  if (uWeather > 0.0) {
    vec3 n = normalize(vWeatherNormal);
    // Down the surface is gravity projected onto it; a floor has none.
    vec3 fall = vec3(0.0, -1.0, 0.0) + n * n.y;
    float steep = length(fall);
    vec3 down = steep > 0.15 ? fall / steep : vec3(0.0, 0.0, 1.0);
    vec3 across = normalize(cross(n, down));
    vec2 q = vec2(dot(vWeatherPosition, across), dot(vWeatherPosition, down)) + uWeatherSeed;
    float y = vWeatherPosition.y;
    // Streaks: noise drawn out down the surface, heaviest just under the
    // lines the rain runs off.
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
    } else if (painted) {
      // Paint gives way where the weather works longest, in slivers that run
      // along the board's grain.
      float failing = smoothstep(0.78 - uWeather * 0.35, 0.92 - uWeather * 0.35, weatherFbm(q * 0.8 + 3.0));
      float flake = failing * smoothstep(0.5, 0.58, weatherNoise(vec2(h.grain.x * 3.5, h.grain.y * 16.0) + uWeatherSeed));
      aged = mix(aged, vec3(0.21, 0.19, 0.16) * wood, flake);
      h.normal = normalize(mix(h.normal, woodNormal, flake));
      h.roughness = mix(h.roughness, woodRoughness, flake);
    } else if (uWeatherKind < 2.5) {
      // Moss in dark olive patches, speckled.
      float moss = smoothstep(0.62, 0.8, weatherFbm(q * 1.3 + 5.0)) * (0.6 + 0.4 * weatherNoise(q * 8.0)) * uWeather;
      aged = mix(aged, vec3(0.07, 0.085, 0.04), moss * 0.55);
    } else if (uWeatherKind < 3.5) {
      float rust = clamp(max(smoothstep(0.5, 0.75, weatherFbm(q * 1.7)), streaks) * uWeather, 0.0, 1.0);
      aged = mix(aged, vec3(0.3, 0.11, 0.04), rust);
      h.roughness = mix(h.roughness, 2.0, rust * 0.6);
    }
    float dark = uWeather * (0.45 * streaks + 0.25 * blotch + 0.35 * damp);
    albedo = aged * (1.0 - clamp(dark, 0.0, 0.8));
  }
  return albedo * mix(1.0, h.occlusion, 0.85);
}
`;

// A finish's material. `shared` holds the building's own uniforms (uTextured,
// uWeather, uWeatherSeed, uDripLines), one set for all its finishes; `maps` the
// loaded textures (houseMaps).
export function houseMaterial(role, maps, shared, options = {}) {
  const material = new THREE.MeshStandardMaterial({ name: `house-${role}`, roughness: 0.86, metalness: 0, ...options });
  // Any normal map turns on the tangent frame; the relief itself is ours.
  material.normalMap = maps['wood-normal'];
  const uniforms = {
    ...shared,
    uWeatherKind: { value: ROLE_KIND[role] ?? 4 },
    uWoodAlbedo: { value: maps['wood-albedo'] },
    uWoodNormal: { value: maps['wood-normal'] },
    uWoodSurface: { value: maps['wood-surface'] },
    uShingleAlbedo: { value: maps['shingle-albedo'] },
    uShingleNormal: { value: maps['shingle-normal'] },
    uShingleSurface: { value: maps['shingle-surface'] },
    uMetalAlbedo: { value: maps['metal-albedo'] },
    uMetalSurface: { value: maps['metal-surface'] },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSurface;\nvarying vec3 vHouseSurface;\nvarying vec3 vWeatherPosition;\nvarying vec3 vWeatherNormal;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vHouseSurface = aSurface;\n  vWeatherPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWeatherNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  HouseSample houseSample = houseSurface(vNormalMapUv, vHouseSurface);\n  diffuseColor.rgb = houseShade(diffuseColor.rgb, houseSample);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * houseSample.roughness, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '  normal = normalize(tbn * vec3(houseSample.normal.xy * normalScale, houseSample.normal.z));');
  };
  material.customProgramCacheKey = () => 'beach-house-material';
  return material;
}
