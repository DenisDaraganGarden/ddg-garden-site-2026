import * as THREE from 'three';

export const COASTAL_PEBBLE_PALETTE = Object.freeze(['#ede5d2', '#b2afa5', '#f4ecdb', '#918d81', '#bfb09a', '#615f58', '#d6cfc0', '#868988', '#a9967d', '#e7dbc3']);

const fragment = /* glsl */`
varying vec3 vRockP;
varying vec3 vRockProjectionNormal;
varying vec3 vRockWorld;
varying float vRockCavity;
uniform sampler2D uRockColor;
uniform sampler2D uRockNormal;
uniform sampler2D uRockSurface;
uniform float uRockTile;
uniform float uRockRelief;
uniform float uRockWetness;
uniform float uRockWaterline;
uniform float uRockAlgae;
uniform float uRockPebble;
uniform float uRockPorosity;

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
`;

/** Triplanar, metre-scaled MeshStandardMaterial. No terrain texture arrays,
 * terrain ecology or surf simulation are loaded just to draw a dry stone.
 * All relief is mesh + normal maps: no per-fragment ray-march loop. */
export function createCoastalRockMaterial(maps, { type = 'limestone', pebble = false } = {}) {
  const uniforms = {
    uRockColor: { value: maps.color }, uRockNormal: { value: maps.normal }, uRockSurface: { value: maps.surface },
    uRockTile: { value: pebble ? .16 : .6 }, uRockRelief: { value: 1 },
    uRockWetness: { value: 0 }, uRockWaterline: { value: .36 }, uRockAlgae: { value: 0 },
    uRockPebble: { value: pebble ? 1 : 0 }, uRockPorosity: { value: type === 'coquina' ? 1 : .2 },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .86, metalness: 0 });
  material.name = `azov-${pebble ? 'pebble' : type}-pbr`;
  material.userData.rockUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float rockCavity;
varying vec3 vRockP;
varying vec3 vRockProjectionNormal;
varying vec3 vRockWorld;
varying float vRockCavity;
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
      roughnessFactor = mix(roughnessFactor, .22 + rockSurface.r * .10, rockWet);
      roughnessFactor = mix(roughnessFactor, .56, rockFilm * .35);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 rockNX = texture2D(uRockNormal, rockUvX).xyz * 2.0 - 1.0;
      vec3 rockNY = texture2D(uRockNormal, rockUvY).xyz * 2.0 - 1.0;
      vec3 rockNZ = texture2D(uRockNormal, rockUvZ).xyz * 2.0 - 1.0;
      float rockNormalGain = uRockRelief * mix(1.0, .30, uRockPebble) * mix(1.0, .78, rockWet);
      rockNX.xy *= rockNormalGain; rockNY.xy *= rockNormalGain; rockNZ.xy *= rockNormalGain;
      normal = normalize(rockMappedNormal(normal, -vViewPosition, rockUvX, rockNX) * rockWeights.x
        + rockMappedNormal(normal, -vViewPosition, rockUvY, rockNY) * rockWeights.y
        + rockMappedNormal(normal, -vViewPosition, rockUvZ, rockNZ) * rockWeights.z);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      float rockOcclusion = rockSurface.g * (1.0 - vRockCavity);
      reflectedLight.indirectDiffuse *= rockOcclusion;
      reflectedLight.indirectSpecular *= mix(1.0, rockOcclusion, .35 + .25 * uRockPorosity);
    `);
  };
  material.customProgramCacheKey = () => 'azov-rock-triplanar-pbr-v1';
  return material;
}

export function updateCoastalRockMaterial(material, settings) {
  const uniforms = material.userData.rockUniforms;
  uniforms.uRockWetness.value = settings.wetness;
  uniforms.uRockWaterline.value = settings.waterline;
  uniforms.uRockRelief.value = settings.relief;
  uniforms.uRockAlgae.value = settings.algae;
  material.envMapIntensity = settings.environmentIntensity;
  material.wireframe = settings.wireframe;
}
