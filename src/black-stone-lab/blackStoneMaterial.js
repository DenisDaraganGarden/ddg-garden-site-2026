import * as THREE from 'three';

export const BLACK_STONE_PRESETS = Object.freeze({
  hybrid: Object.freeze({
    layering: 0.76,
    fracture: 0.68,
    veins: 0.32,
    polish: 0.52,
    wetness: 0.42,
    microRelief: 0.58,
  }),
  slate: Object.freeze({
    layering: 0.94,
    fracture: 0.48,
    veins: 0.2,
    polish: 0.2,
    wetness: 0.08,
    microRelief: 0.72,
  }),
  obsidian: Object.freeze({
    layering: 0.28,
    fracture: 0.92,
    veins: 0.12,
    polish: 0.86,
    wetness: 0.18,
    microRelief: 0.26,
  }),
  wet: Object.freeze({
    layering: 0.72,
    fracture: 0.64,
    veins: 0.32,
    polish: 0.58,
    wetness: 0.78,
    microRelief: 0.42,
  }),
});

export const BLACK_STONE_DIAGNOSTICS = Object.freeze({
  beauty: 0,
  roughness: 1,
  normal: 2,
  masks: 3,
});

const BLACK_STONE_VERTEX_PARS = /* glsl */ `
  varying vec3 vStonePosition;
  varying vec3 vStoneObjectNormal;
  varying vec3 vStoneViewPosition;
  varying vec3 vStoneViewNormal;
`;

const BLACK_STONE_VERTEX_BODY = /* glsl */ `
  vStonePosition = position;
  vStoneObjectNormal = normal;
  vStoneViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vStoneViewNormal = normalize(normalMatrix * normal);
`;

const BLACK_STONE_FRAGMENT_PARS = /* glsl */ `
  uniform float uLayering;
  uniform float uFracture;
  uniform float uVeins;
  uniform float uPolish;
  uniform float uWetness;
  uniform float uMicroRelief;
  uniform float uDiagnostic;

  varying vec3 vStonePosition;
  varying vec3 vStoneObjectNormal;
  varying vec3 vStoneViewPosition;
  varying vec3 vStoneViewNormal;

  float stoneHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float stoneNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(stoneHash(i + vec3(0.0, 0.0, 0.0)), stoneHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(stoneHash(i + vec3(0.0, 1.0, 0.0)), stoneHash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(stoneHash(i + vec3(0.0, 0.0, 1.0)), stoneHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(stoneHash(i + vec3(0.0, 1.0, 1.0)), stoneHash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float stoneFbm(vec3 p) {
    float value = stoneNoise(p) * 0.56;
    p = p * 2.03 + vec3(17.1, 3.7, 11.9);
    value += stoneNoise(p) * 0.29;
    p = p * 2.01 + vec3(5.4, 19.3, 2.8);
    value += stoneNoise(p) * 0.15;
    return value;
  }

  vec3 perturbStoneNormal(vec3 surfacePosition, vec3 surfaceNormal, float height, float strength) {
    vec3 sigmaX = dFdx(surfacePosition);
    vec3 sigmaY = dFdy(surfacePosition);
    vec3 r1 = cross(sigmaY, surfaceNormal);
    vec3 r2 = cross(surfaceNormal, sigmaX);
    float determinant = dot(sigmaX, r1);
    vec2 gradient = vec2(dFdx(height), dFdy(height));
    vec3 surfaceGradient = sign(determinant) * (gradient.x * r1 + gradient.y * r2);
    return normalize(abs(determinant) * surfaceNormal - surfaceGradient * strength);
  }
`;

const BLACK_STONE_FRAGMENT_BODY = /* glsl */ `
  vec3 stoneP = vStonePosition * 0.145;
  vec3 stoneLayerDirection = normalize(vec3(0.28, 0.91, -0.31));
  vec3 stoneObjectNormal = normalize(vStoneObjectNormal);

  float stoneBroad = stoneFbm(stoneP * 0.72 + vec3(2.1, 8.7, -4.2));
  float stoneGrain = stoneNoise(stoneP * 8.4 + vec3(12.4, -2.5, 6.8));
  float stoneWarp = stoneNoise(stoneP * 1.55 + vec3(stoneBroad * 2.4, 3.1, -6.7));

  float stoneLayerFrequency = mix(8.0, 18.0, uLayering);
  float stoneLayerCoordinate = dot(stoneP, stoneLayerDirection) * stoneLayerFrequency;
  stoneLayerCoordinate += (stoneBroad - 0.5) * mix(2.0, 6.4, uLayering);
  stoneLayerCoordinate += (stoneWarp - 0.5) * 4.4;
  stoneLayerCoordinate += (stoneNoise(stoneP * 3.1 + vec3(-4.6, 7.2, 1.4)) - 0.5) * 2.1;
  float stoneLayerWave = 0.5 + 0.5 * cos(stoneLayerCoordinate);
  float stoneThinLayer = pow(stoneLayerWave, mix(6.0, 14.0, uLayering));
  float stoneLayerBreak = smoothstep(
    0.24,
    0.78,
    stoneNoise(stoneP * 2.45 + vec3(stoneBroad * 1.7, -11.4, 5.9))
  );
  stoneThinLayer *= mix(0.16, 1.0, stoneLayerBreak);
  float stoneCleavageFacing = smoothstep(0.32, 0.92, abs(dot(stoneObjectNormal, stoneLayerDirection)));
  float stoneLayerSheen = stoneThinLayer * mix(0.18, 1.0, uLayering);

  float stoneFractureField = stoneFbm(stoneP * 1.86 + vec3(stoneWarp * 2.1, -8.3, stoneBroad * 1.7));
  float stoneFractureRidge = 1.0 - smoothstep(0.025, 0.11, abs(stoneFractureField - 0.58));
  float stoneGlassFacet = smoothstep(0.63, 0.78, stoneFractureField);
  stoneGlassFacet *= mix(0.28, 1.0, stoneCleavageFacing);
  stoneGlassFacet *= uFracture;

  float stoneChipField = stoneNoise(stoneP * 7.2 + vec3(stoneFractureField * 3.0, 14.2, -9.1));
  float stoneChipMask = smoothstep(0.76, 0.94, stoneChipField) * uFracture;

  vec3 stoneVeinWarp = vec3(
    stoneNoise(stoneP * 0.62 + vec3(7.2, 0.4, 2.1)),
    stoneNoise(stoneP * 0.62 + vec3(-3.5, 9.1, 5.8)),
    stoneNoise(stoneP * 0.62 + vec3(4.8, -5.2, 11.7))
  );
  float stoneVeinField = stoneNoise(stoneP * 0.88 + stoneVeinWarp * 2.25);
  stoneVeinField += sin(dot(stoneP, vec3(1.2, 3.8, -0.9)) + stoneBroad * 4.0) * 0.055;
  float stoneVeinLine = 1.0 - smoothstep(0.018, 0.072, abs(stoneVeinField - 0.56));
  float stoneVeinMask = stoneVeinLine * smoothstep(0.28, 0.76, stoneBroad) * uVeins;

  float stoneWetField = stoneFbm(stoneP * 0.56 + vec3(4.2, -3.8, 9.6));
  float stoneWetThreshold = mix(0.88, 0.48, uWetness);
  float stoneWetPatch = smoothstep(stoneWetThreshold, stoneWetThreshold + 0.085, stoneWetField);
  float stoneDripField = stoneNoise(vec3(stoneP.x * 1.45, stoneP.y * 0.2, stoneP.z * 1.45) + vec3(-7.1, 2.0, 5.4));
  float stoneWetMask = clamp((stoneWetPatch + smoothstep(0.77, 0.93, stoneDripField) * 0.32) * uWetness * 1.55, 0.0, 1.0);

  float stonePolishMask = clamp(
    uPolish * (stoneGlassFacet * 0.74 + stoneLayerSheen * 0.15 + stoneCleavageFacing * 0.055),
    0.0,
    1.0
  );

  vec3 stoneDryBlack = mix(vec3(0.0025, 0.0032, 0.0042), vec3(0.012, 0.015, 0.018), stoneBroad);
  stoneDryBlack *= mix(0.86, 1.15, stoneGrain);
  stoneDryBlack = mix(
    stoneDryBlack,
    vec3(0.026, 0.031, 0.034),
    stoneLayerSheen * 0.12 + stoneChipMask * 0.38 + stoneFractureRidge * uFracture * 0.08
  );
  vec3 stoneColor = mix(stoneDryBlack, vec3(0.052, 0.061, 0.065), stoneVeinMask * 0.64);
  stoneColor *= mix(1.0, 0.76, stoneWetMask);

  float stoneDryRoughness = mix(0.78, 0.94, stoneGrain) + stoneChipMask * 0.045;
  float stonePolishedRoughness = mix(0.31, 0.12, uPolish);
  float stoneRoughness = mix(
    stoneDryRoughness,
    stonePolishedRoughness,
    clamp(stonePolishMask + stoneGlassFacet * 0.24, 0.0, 0.72)
  );
  stoneRoughness -= stoneLayerSheen * uLayering * 0.07;
  stoneRoughness += stoneFractureRidge * uFracture * 0.06;
  stoneRoughness = mix(stoneRoughness, 0.065, stoneWetMask);
  stoneRoughness = clamp(stoneRoughness, 0.055, 0.94);

  float stoneClearcoat = clamp(stonePolishMask * 0.3 + stoneGlassFacet * 0.1 + stoneWetMask * 0.72, 0.0, 0.78);
  float stoneClearcoatRoughness = mix(0.28, 0.045, max(stoneWetMask, stonePolishMask * 0.72));

  float stoneRelief = (stoneGrain - 0.5) * 0.052;
  stoneRelief += (stoneThinLayer - 0.18) * uLayering * 0.007;
  stoneRelief += (stoneChipField - 0.5) * uFracture * 0.026;
  stoneRelief += stoneFractureRidge * uFracture * 0.013;
  stoneRelief += stoneVeinMask * 0.01;
  vec3 stoneNormal = perturbStoneNormal(
    vStoneViewPosition,
    normalize(vStoneViewNormal),
    stoneRelief,
    mix(0.045, 0.28, uMicroRelief)
  );
`;

const BLACK_STONE_DEBUG_OUTPUT = /* glsl */ `
  if (uDiagnostic > 0.5 && uDiagnostic < 1.5) {
    gl_FragColor = vec4(vec3(stoneRoughness), 1.0);
  } else if (uDiagnostic > 1.5 && uDiagnostic < 2.5) {
    gl_FragColor = vec4(stoneNormal * 0.5 + 0.5, 1.0);
  } else if (uDiagnostic > 2.5) {
    gl_FragColor = vec4(
      stoneVeinMask,
      stoneWetMask,
      clamp(stoneGlassFacet + stoneLayerSheen * 0.3, 0.0, 1.0),
      1.0
    );
  }
`;

export function createBlackStoneUniforms(parameters = BLACK_STONE_PRESETS.hybrid, diagnostic = 'beauty') {
  return {
    uLayering: { value: parameters.layering },
    uFracture: { value: parameters.fracture },
    uVeins: { value: parameters.veins },
    uPolish: { value: parameters.polish },
    uWetness: { value: parameters.wetness },
    uMicroRelief: { value: parameters.microRelief },
    uDiagnostic: { value: BLACK_STONE_DIAGNOSTICS[diagnostic] ?? 0 },
  };
}

export function createBlackStoneMaterial(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#171a1d',
    metalness: 0,
    roughness: 0.72,
    clearcoat: 0.01,
    clearcoatRoughness: 0.24,
    envMapIntensity: 0.26,
    ior: 1.48,
    specularIntensity: 0.42,
    transmission: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BLACK_STONE_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BLACK_STONE_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BLACK_STONE_FRAGMENT_PARS}`)
      .replace('#include <logdepthbuf_fragment>', `#include <logdepthbuf_fragment>\n${BLACK_STONE_FRAGMENT_BODY}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor = vec4(stoneColor, 1.0);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = stoneRoughness;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = stoneNormal;')
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal = normalize(mix(clearcoatNormal, stoneNormal, 0.32));\n#endif',
      )
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = stoneClearcoat;')
      .replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = stoneClearcoatRoughness;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${BLACK_STONE_DEBUG_OUTPUT}`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'ddg-black-stone-v2';

  return material;
}

export function updateBlackStoneUniforms(uniforms, parameters, diagnostic) {
  uniforms.uLayering.value = parameters.layering;
  uniforms.uFracture.value = parameters.fracture;
  uniforms.uVeins.value = parameters.veins;
  uniforms.uPolish.value = parameters.polish;
  uniforms.uWetness.value = parameters.wetness;
  uniforms.uMicroRelief.value = parameters.microRelief;
  uniforms.uDiagnostic.value = BLACK_STONE_DIAGNOSTICS[diagnostic] ?? 0;
}
