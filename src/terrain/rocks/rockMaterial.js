import * as THREE from 'three';

export const COASTAL_PEBBLE_PALETTE = Object.freeze(['#ede5d2', '#b2afa5', '#f4ecdb', '#918d81', '#bfb09a', '#615f58', '#d6cfc0', '#868988', '#a9967d', '#e7dbc3']);

const fragment = /* glsl */`
varying vec3 vRockP;
varying vec3 vRockProjectionNormal;
varying vec3 vRockWorld;
varying float vRockCavity;
varying float vRockFracture;
uniform sampler2D uRockColor;
uniform sampler2D uRockNormal;
uniform sampler2D uRockSurface;
uniform sampler2D uRockFractureColor;
uniform sampler2D uRockFractureNormal;
uniform sampler2D uRockFractureSurface;
uniform float uRockTile;
uniform float uRockRelief;
uniform float uRockWetness;
uniform float uRockWaterline;
uniform float uRockAlgae;
uniform float uRockPebble;
uniform float uRockPorosity;
uniform float uRockDamageRelief;
uniform float uRockBlend;
uniform float uRockDiagnostic;

float rockField(vec3 p) {
  return .5 + .23 * sin(p.x * 1.7 + sin(p.z * 2.3)) * sin(p.y * 2.1 + p.z * .9)
    + .12 * sin(p.z * 6.1 + sin(p.x * 3.9)) * cos(p.y * 4.5 - p.x * 1.8);
}
vec3 rockMappedNormal(vec3 n, vec3 position, vec2 uv, vec3 mapN) {
  vec3 q0 = dFdx(position), q1 = dFdy(position);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * inv, B * inv, n) * mapN);
}
// The sculpture's surface-gradient principle, with the larger relief baked
// into one shared map instead of evaluating dozens of noise octaves per pixel.
vec3 rockHeightNormal(vec3 position, vec3 n, float height) {
  vec3 sx = dFdx(position), sy = dFdy(position);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float determinant = dot(sx, r1);
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(determinant) * n - gradient);
}
`;

/** Triplanar, metre-scaled MeshStandardMaterial. No terrain texture arrays,
 * terrain ecology or surf simulation are loaded just to draw a dry stone.
 * All relief is mesh + normal maps: no per-fragment ray-march loop. */
export function createCoastalRockMaterial(maps, { type = 'limestone', pebble = false, fractureMaps = null } = {}) {
  const uniforms = {
    uRockColor: { value: maps.color }, uRockNormal: { value: maps.normal }, uRockSurface: { value: maps.surface },
    uRockTile: { value: pebble ? .16 : .6 }, uRockRelief: { value: 1 },
    uRockWetness: { value: 0 }, uRockWaterline: { value: .36 }, uRockAlgae: { value: 0 },
    uRockPebble: { value: pebble ? 1 : 0 }, uRockPorosity: { value: type === 'coquina' ? 1 : .2 },
    uRockFractureColor: { value: fractureMaps?.color }, uRockFractureNormal: { value: fractureMaps?.normal },
    uRockFractureSurface: { value: fractureMaps?.surface }, uRockDamageRelief: { value: .8 },
    uRockBlend: { value: .85 }, uRockDiagnostic: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .86, metalness: 0 });
  material.name = `azov-${pebble ? 'pebble' : type}-pbr`;
  if (fractureMaps && !pebble) material.defines = { ROCK_DAMAGE: '' };
  material.userData.rockUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float rockCavity;
attribute float rockFracture;
varying vec3 vRockP;
varying vec3 vRockProjectionNormal;
varying vec3 vRockWorld;
varying float vRockCavity;
varying float vRockFracture;
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec3 rockScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
      vec3 rockOffset = vec3(0.0);
      vec4 rockWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        rockScale *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        rockOffset = fract(instanceMatrix[3].xyz * vec3(.37, .53, .29)) * 17.0;
        rockWorld = instanceMatrix * rockWorld;
      #endif
      vRockP = transformed * rockScale + rockOffset;
      vRockProjectionNormal = normalize(objectNormal / max(rockScale, vec3(.0001)));
      vRockWorld = (modelMatrix * rockWorld).xyz;
      vRockCavity = rockCavity;
      vRockFracture = rockFracture;
    `);
    shader.fragmentShader = fragment + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec3 rockWeights = pow(abs(normalize(vRockProjectionNormal)), vec3(4.0));
      rockWeights /= max(dot(rockWeights, vec3(1.0)), .0001);
      vec2 rockUvX = vRockP.zy / uRockTile, rockUvY = vRockP.xz / uRockTile, rockUvZ = vRockP.xy / uRockTile;
      vec3 rockColor = texture2D(uRockColor, rockUvX).rgb * rockWeights.x
        + texture2D(uRockColor, rockUvY).rgb * rockWeights.y + texture2D(uRockColor, rockUvZ).rgb * rockWeights.z;
      vec3 rockSurface = texture2D(uRockSurface, rockUvX).rgb * rockWeights.x
        + texture2D(uRockSurface, rockUvY).rgb * rockWeights.y + texture2D(uRockSurface, rockUvZ).rgb * rockWeights.z;
      float rockFresh = 0.0;
      vec4 rockDamage = vec4(.8, 1.0, .52, 0.0);
      float rockDamageHeight = 0.0;
      #ifdef ROCK_DAMAGE
        rockDamage = texture2D(uRockFractureSurface, rockUvX) * rockWeights.x
          + texture2D(uRockFractureSurface, rockUvY) * rockWeights.y
          + texture2D(uRockFractureSurface, rockUvZ) * rockWeights.z;
        rockDamage = rockDamage.abgr; // roughness, AO, height, blend
        // The vertex field marks actual removed rock. The texture breaks its
        // boundary into flakes and also makes shallow spalls in the old crust.
        float rockExposed = smoothstep(.12, .76, vRockFracture + (rockDamage.a - .5) * .4);
        rockFresh = clamp(rockExposed * .92 + smoothstep(.36, .64, rockDamage.a) * .48, 0.0, 1.0) * uRockBlend;
        rockDamageHeight = (rockDamage.b - .52) * .018 * uRockDamageRelief * rockFresh;
        // Fresh calcite has less stained pores and a finer crystalline grain.
        // Keep mineral hue from the generated albedo; do not paint a white rim.
        vec3 rockFreshColor = texture2D(uRockFractureColor, rockUvX).rgb * rockWeights.x
          + texture2D(uRockFractureColor, rockUvY).rgb * rockWeights.y
          + texture2D(uRockFractureColor, rockUvZ).rgb * rockWeights.z;
        rockColor = mix(rockColor, rockFreshColor, rockFresh);
      #endif
      float rockMacro = rockField(vRockP * 2.1);
      float rockWetEdge = vRockWorld.y + (rockField(vRockWorld * 7.0) - .5) * .11
        + (rockSurface.b - .5) * .012 * uRockRelief;
      float rockWet = uRockWetness * (1.0 - smoothstep(uRockWaterline - .11, uRockWaterline + .11, rockWetEdge));
      float rockFilm = uRockAlgae * (1.0 - smoothstep(uRockWaterline - .14, uRockWaterline + .02, rockWetEdge))
        * smoothstep(.37, .67, rockField(vRockWorld * 18.0));
      rockColor *= mix(.88, 1.07, rockMacro);
      rockColor = mix(rockColor, rockColor * vec3(.27, .35, .12), rockFilm);
      diffuseColor.rgb *= rockColor * mix(1.0, .42, rockWet);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(rockSurface.r - uRockPebble * .15, .38, .98);
      roughnessFactor = mix(roughnessFactor, rockDamage.r, rockFresh);
      roughnessFactor = mix(roughnessFactor, .22 + rockSurface.r * .10, rockWet);
      roughnessFactor = mix(roughnessFactor, .56, rockFilm * .35);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 rockNX = texture2D(uRockNormal, rockUvX).xyz * 2.0 - 1.0;
      vec3 rockNY = texture2D(uRockNormal, rockUvY).xyz * 2.0 - 1.0;
      vec3 rockNZ = texture2D(uRockNormal, rockUvZ).xyz * 2.0 - 1.0;
      float rockNormalGain = uRockRelief * mix(1.0, .30, uRockPebble) * mix(1.0, .78, rockWet);
      #ifdef ROCK_DAMAGE
        rockNormalGain *= .48;
      #endif
      rockNX.xy *= rockNormalGain; rockNY.xy *= rockNormalGain; rockNZ.xy *= rockNormalGain;
      #ifdef ROCK_DAMAGE
        vec3 rockFX = texture2D(uRockFractureNormal, rockUvX).xyz * 2.0 - 1.0;
        vec3 rockFY = texture2D(uRockFractureNormal, rockUvY).xyz * 2.0 - 1.0;
        vec3 rockFZ = texture2D(uRockFractureNormal, rockUvZ).xyz * 2.0 - 1.0;
        float rockFractureGain = uRockRelief * mix(.3, .8, uRockDamageRelief) * mix(1.0, .78, rockWet);
        rockFX.xy *= rockFractureGain; rockFY.xy *= rockFractureGain; rockFZ.xy *= rockFractureGain;
        rockNX = normalize(mix(normalize(rockNX), normalize(rockFX), rockFresh));
        rockNY = normalize(mix(normalize(rockNY), normalize(rockFY), rockFresh));
        rockNZ = normalize(mix(normalize(rockNZ), normalize(rockFZ), rockFresh));
      #endif
      normal = normalize(rockMappedNormal(normal, -vViewPosition, rockUvX, rockNX) * rockWeights.x
        + rockMappedNormal(normal, -vViewPosition, rockUvY, rockNY) * rockWeights.y
        + rockMappedNormal(normal, -vViewPosition, rockUvZ, rockNZ) * rockWeights.z);
      #ifdef ROCK_DAMAGE
        normal = rockHeightNormal(-vViewPosition, normal, rockDamageHeight);
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      float rockOcclusion = mix(rockSurface.g, rockDamage.g, rockFresh) * (1.0 - vRockCavity);
      reflectedLight.indirectDiffuse *= rockOcclusion;
      reflectedLight.indirectSpecular *= mix(1.0, rockOcclusion, .35 + .25 * uRockPorosity);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      if (uRockDiagnostic > .5) gl_FragColor = vec4(vec3(rockFresh), 1.0);
    `);
  };
  material.customProgramCacheKey = () => `azov-rock-triplanar-pbr-v3-${fractureMaps && !pebble ? 'fractured' : 'worn'}`;
  return material;
}

export function updateCoastalRockMaterial(material, settings) {
  const uniforms = material.userData.rockUniforms;
  uniforms.uRockWetness.value = settings.wetness;
  uniforms.uRockWaterline.value = settings.waterline;
  uniforms.uRockRelief.value = settings.relief;
  uniforms.uRockAlgae.value = settings.algae;
  uniforms.uRockDamageRelief.value = settings.damage ?? .8;
  uniforms.uRockBlend.value = settings.blend ?? .85;
  uniforms.uRockDiagnostic.value = settings.showBlend ? 1 : 0;
  material.envMapIntensity = settings.environmentIntensity;
  material.wireframe = settings.wireframe;
}
