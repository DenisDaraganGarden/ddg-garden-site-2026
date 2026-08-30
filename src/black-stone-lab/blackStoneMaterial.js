import * as THREE from 'three';

export const BLACK_STONE_PRESETS = Object.freeze({
  hybrid: Object.freeze({
    layering: 0.76,
    layerScale: 2.15,
    layerRelief: 0.72,
    layerSharpness: 0.64,
    layerEdgeChips: 0.58,
    fracture: 0.72,
    fractureScale: 2.6,
    veins: 0.28,
    veinScale: 2.25,
    polish: 0.46,
    wearScale: 2.15,
    wetness: 0.42,
    dryRoughness: 0.72,
    microRelief: 0.64,
  }),
  slate: Object.freeze({
    layering: 0.94,
    layerScale: 2.65,
    layerRelief: 0.9,
    layerSharpness: 0.82,
    layerEdgeChips: 0.68,
    fracture: 0.55,
    fractureScale: 3.1,
    veins: 0.18,
    veinScale: 2.8,
    polish: 0.16,
    wearScale: 2.3,
    wetness: 0.08,
    dryRoughness: 0.9,
    microRelief: 0.78,
  }),
  obsidian: Object.freeze({
    layering: 0.25,
    layerScale: 1.35,
    layerRelief: 0.42,
    layerSharpness: 0.86,
    layerEdgeChips: 0.3,
    fracture: 0.88,
    fractureScale: 2.1,
    veins: 0.1,
    veinScale: 3.1,
    polish: 0.74,
    wearScale: 1.5,
    wetness: 0.18,
    dryRoughness: 0.38,
    microRelief: 0.3,
  }),
  wet: Object.freeze({
    layering: 0.7,
    layerScale: 2.05,
    layerRelief: 0.68,
    layerSharpness: 0.6,
    layerEdgeChips: 0.48,
    fracture: 0.68,
    fractureScale: 2.45,
    veins: 0.28,
    veinScale: 2.3,
    polish: 0.5,
    wearScale: 2.0,
    wetness: 0.78,
    dryRoughness: 0.66,
    microRelief: 0.58,
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
  uniform float uLayerScale;
  uniform float uLayerRelief;
  uniform float uLayerSharpness;
  uniform float uLayerEdgeChips;
  uniform float uFracture;
  uniform float uFractureScale;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uPolish;
  uniform float uWearScale;
  uniform float uWetness;
  uniform float uDryRoughness;
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
  vec3 stoneLayerP = stoneP * max(uLayerScale, 0.35);
  vec3 stoneFractureP = stoneP * max(uFractureScale, 0.35);
  vec3 stoneVeinP = stoneP * max(uVeinScale, 0.35);
  vec3 stoneWearP = stoneP * max(uWearScale, 0.35);
  vec3 stoneLayerDirection = normalize(vec3(0.28, 0.91, -0.31));
  vec3 stoneObjectNormal = normalize(vStoneObjectNormal);

  float stoneBroad = stoneFbm(stoneP * 0.72 + vec3(2.1, 8.7, -4.2));
  float stoneGrain = stoneNoise(stoneP * 8.4 + vec3(12.4, -2.5, 6.8));
  float stoneWarp = stoneNoise(stoneP * 1.55 + vec3(stoneBroad * 2.4, 3.1, -6.7));

  float stoneLayerFrequency = mix(8.0, 15.0, uLayering);
  float stoneLayerCoordinate = dot(stoneLayerP, stoneLayerDirection) * stoneLayerFrequency;
  stoneLayerCoordinate += (stoneBroad - 0.5) * mix(1.4, 4.2, uLayering);
  stoneLayerCoordinate += (stoneWarp - 0.5) * 3.1;
  stoneLayerCoordinate += (
    stoneNoise(stoneLayerP * 1.45 + vec3(-4.6, 7.2, 1.4)) - 0.5
  ) * 2.2;
  float stoneLayerWave = 0.5 + 0.5 * cos(stoneLayerCoordinate);
  float stoneLayerAA = max(fwidth(stoneLayerCoordinate) * 0.65, 0.018);
  float stoneLayerSharpPower = mix(3.0, 12.0, uLayerSharpness);
  float stoneLayerRidge = pow(clamp(stoneLayerWave, 0.0, 1.0), stoneLayerSharpPower);
  float stoneLayerValley = 1.0 - smoothstep(
    0.1 - stoneLayerAA,
    0.28 + stoneLayerAA,
    stoneLayerWave
  );
  float stoneLayerEdge = 1.0 - smoothstep(
    0.035 + stoneLayerAA,
    0.12 + stoneLayerAA,
    abs(stoneLayerWave - 0.34)
  );
  float stoneLayerBreak = smoothstep(
    0.24,
    0.76,
    stoneNoise(stoneLayerP * 2.15 + vec3(stoneBroad * 1.7, -11.4, 5.9))
  );
  float stoneLayerBreakMask = mix(0.32, 1.0, stoneLayerBreak);
  float stoneCleavageFacing = smoothstep(0.32, 0.92, abs(dot(stoneObjectNormal, stoneLayerDirection)));
  float stoneLayerExposure = mix(
    0.5,
    1.0,
    smoothstep(0.08, 0.82, 1.0 - abs(dot(stoneObjectNormal, stoneLayerDirection)))
  );
  float stoneThinLayer = stoneLayerRidge * stoneLayerBreakMask * uLayering;
  float stoneLayerSheen = stoneThinLayer;
  float stoneLayerChipCluster = smoothstep(
    0.58,
    0.82,
    stoneFbm(stoneLayerP * 2.9 + vec3(5.1, -7.4, 2.6))
  );
  float stoneLayerChipCell = stoneNoise(
    stoneLayerP * 9.0 + vec3(stoneBroad * 3.0, 11.2, -4.7)
  );
  float stoneLayerChipMask = smoothstep(0.79, 0.93, stoneLayerChipCell)
    * stoneLayerChipCluster
    * stoneLayerEdge
    * stoneLayerExposure
    * uLayerEdgeChips
    * uLayering;
  float stoneLayerHeight = (
    ((stoneLayerRidge - 0.3) * 0.55 - stoneLayerValley * 0.95)
      * stoneLayerBreakMask
      * stoneLayerExposure
      * uLayering
  ) - stoneLayerChipMask * 1.15;

  float stoneFractureWarp = stoneNoise(stoneFractureP * 0.92 + vec3(stoneWarp * 1.7, 5.3, -2.8));
  float stoneFractureField = stoneFbm(
    stoneFractureP * 1.86 + vec3(stoneFractureWarp * 2.1, -8.3, stoneBroad * 1.7)
  );
  float stoneFractureRidge = 1.0 - smoothstep(0.018, 0.092, abs(stoneFractureField - 0.58));
  float stoneGlassFacet = smoothstep(0.63, 0.78, stoneFractureField);
  stoneGlassFacet *= mix(0.28, 1.0, stoneCleavageFacing);
  stoneGlassFacet *= uFracture;

  float stoneChipCluster = smoothstep(
    0.5,
    0.74,
    stoneFbm(stoneFractureP * 2.7 + vec3(-3.7, stoneFractureField * 2.8, 8.4))
  );
  float stoneChipField = stoneNoise(
    stoneFractureP * 10.5 + vec3(stoneFractureField * 3.0, 14.2, -9.1)
  );
  float stoneChipSeed = smoothstep(0.78, 0.93, stoneChipField);
  float stoneChipMask = stoneChipSeed
    * mix(0.28, 1.0, stoneChipCluster)
    * mix(0.48, 1.0, stoneFractureRidge)
    * uFracture;

  vec3 stoneVeinWarp = vec3(
    stoneNoise(stoneVeinP * 0.62 + vec3(7.2, 0.4, 2.1)),
    stoneNoise(stoneVeinP * 0.62 + vec3(-3.5, 9.1, 5.8)),
    stoneNoise(stoneVeinP * 0.62 + vec3(4.8, -5.2, 11.7))
  );
  float stoneVeinField = stoneNoise(stoneVeinP * 0.88 + stoneVeinWarp * 2.25);
  stoneVeinField += sin(dot(stoneVeinP, vec3(1.2, 3.8, -0.9)) + stoneBroad * 4.0) * 0.055;
  float stoneVeinLine = 1.0 - smoothstep(0.014, 0.056, abs(stoneVeinField - 0.56));
  float stoneVeinMask = stoneVeinLine * smoothstep(0.28, 0.76, stoneBroad) * uVeins;

  float stoneWearField = stoneFbm(stoneWearP * 1.15 + vec3(6.2, -4.1, 12.8));
  float stoneWearBreak = stoneNoise(stoneWearP * 2.7 + vec3(-8.4, stoneBroad * 2.0, 3.6));
  float stoneWearMask = smoothstep(0.56, 0.8, stoneWearField)
    * mix(0.35, 1.0, stoneCleavageFacing)
    * mix(0.45, 1.0, stoneWearBreak);
  float stoneRoughPatch = smoothstep(
    0.42,
    0.74,
    stoneFbm(stoneWearP * 3.2 + vec3(11.6, -7.3, stoneFractureField * 1.8))
  );
  float stoneFineGrain = stoneNoise(stoneWearP * 14.5 + vec3(-5.2, 13.1, 2.9));
  float stonePoreMask = smoothstep(0.84, 0.96, stoneFineGrain) * stoneRoughPatch;

  float stoneWetField = stoneFbm(stoneP * 0.56 + vec3(4.2, -3.8, 9.6));
  float stoneWetThreshold = mix(0.88, 0.48, uWetness);
  float stoneWetPatch = smoothstep(stoneWetThreshold, stoneWetThreshold + 0.085, stoneWetField);
  float stoneDripField = stoneNoise(vec3(stoneP.x * 1.45, stoneP.y * 0.2, stoneP.z * 1.45) + vec3(-7.1, 2.0, 5.4));
  float stoneWetMask = clamp((stoneWetPatch + smoothstep(0.77, 0.93, stoneDripField) * 0.32) * uWetness * 1.55, 0.0, 1.0);

  float stonePolishMask = clamp(
    uPolish * (stoneGlassFacet * 0.6 + stoneLayerSheen * 0.1 + stoneWearMask * 0.34),
    0.0,
    1.0
  );

  vec3 stoneDryBlack = mix(vec3(0.0025, 0.0032, 0.0042), vec3(0.012, 0.015, 0.018), stoneBroad);
  stoneDryBlack *= mix(0.86, 1.15, stoneGrain);
  stoneDryBlack = mix(
    stoneDryBlack,
    vec3(0.026, 0.031, 0.034),
    stoneLayerSheen * 0.22
      + stoneLayerChipMask * 0.42
      + stoneChipMask * 0.46
      + stoneFractureRidge * uFracture * 0.09
  );
  stoneDryBlack *= mix(
    1.0,
    0.78,
    stoneLayerValley * stoneLayerExposure * uLayering * 0.5
  );
  vec3 stoneColor = mix(stoneDryBlack, vec3(0.052, 0.061, 0.065), stoneVeinMask * 0.64);
  stoneColor = mix(stoneColor, stoneColor * 0.72, stonePoreMask * uDryRoughness * 0.56);
  stoneColor *= mix(1.0, 0.76, stoneWetMask);

  float stoneDryRoughness = mix(0.7, 0.9, stoneGrain);
  stoneDryRoughness += uDryRoughness * (
    0.035
      + stoneRoughPatch * 0.16
      + stoneChipMask * 0.12
      + stoneLayerChipMask * 0.13
      + stoneFractureRidge * 0.07
  );
  stoneDryRoughness += stoneLayerValley * stoneLayerExposure * uLayering * 0.05;
  float stonePolishedRoughness = mix(0.31, 0.12, uPolish);
  float stoneRoughness = mix(
    stoneDryRoughness,
    stonePolishedRoughness,
    clamp(stonePolishMask + stoneGlassFacet * 0.24, 0.0, 0.72)
  );
  stoneRoughness -= stoneLayerSheen * 0.06;
  stoneRoughness += stoneFractureRidge * uFracture * 0.06;
  stoneRoughness = mix(stoneRoughness, 0.065, stoneWetMask);
  stoneRoughness = clamp(stoneRoughness, 0.055, 0.94);

  float stoneClearcoat = clamp(stonePolishMask * 0.3 + stoneGlassFacet * 0.1 + stoneWetMask * 0.72, 0.0, 0.78);
  float stoneClearcoatRoughness = mix(0.28, 0.045, max(stoneWetMask, stonePolishMask * 0.72));

  float stoneDryFilmMask = 1.0 - smoothstep(0.07, 0.62, stoneWetMask);
  float stoneDryMicroMask = stoneDryFilmMask
    * clamp(
      0.22 + stoneRoughPatch * 0.58 + stoneChipMask * 0.82 + stoneFractureRidge * 0.42,
      0.0,
      1.0
    );
  float stoneLayerRelief = stoneLayerHeight * 0.055 * stoneDryFilmMask;
  float stoneMicroHeight = (stoneGrain - 0.5) * 0.04;
  stoneMicroHeight += (stoneFineGrain - 0.5) * (0.025 + uDryRoughness * 0.022);
  stoneMicroHeight -= stonePoreMask * (0.018 + uDryRoughness * 0.022);
  stoneMicroHeight -= stoneChipMask * (0.026 + uFracture * 0.025);
  stoneMicroHeight += stoneFractureRidge * uFracture * 0.016;
  stoneMicroHeight += stoneVeinMask * 0.01;
  stoneMicroHeight *= stoneDryMicroMask;
  vec3 stoneNormal = perturbStoneNormal(
    vStoneViewPosition,
    normalize(vStoneViewNormal),
    stoneLayerRelief,
    uLayerRelief * 0.28
  );
  stoneNormal = perturbStoneNormal(
    vStoneViewPosition,
    stoneNormal,
    stoneMicroHeight,
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
      clamp(
        stoneGlassFacet * 0.35
          + stoneFractureRidge * 0.28
          + stoneChipMask * 0.72
          + stoneLayerChipMask * 0.92
          + stoneLayerValley * uLayering * 0.16,
        0.0,
        1.0
      ),
      1.0
    );
  }
`;

export function createBlackStoneUniforms(parameters = BLACK_STONE_PRESETS.hybrid, diagnostic = 'beauty') {
  return {
    uLayering: { value: parameters.layering },
    uLayerScale: { value: parameters.layerScale },
    uLayerRelief: { value: parameters.layerRelief },
    uLayerSharpness: { value: parameters.layerSharpness },
    uLayerEdgeChips: { value: parameters.layerEdgeChips },
    uFracture: { value: parameters.fracture },
    uFractureScale: { value: parameters.fractureScale },
    uVeins: { value: parameters.veins },
    uVeinScale: { value: parameters.veinScale },
    uPolish: { value: parameters.polish },
    uWearScale: { value: parameters.wearScale },
    uWetness: { value: parameters.wetness },
    uDryRoughness: { value: parameters.dryRoughness },
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
  material.customProgramCacheKey = () => 'ddg-black-stone-v4';

  return material;
}

export function updateBlackStoneUniforms(uniforms, parameters, diagnostic) {
  uniforms.uLayering.value = parameters.layering;
  uniforms.uLayerScale.value = parameters.layerScale;
  uniforms.uLayerRelief.value = parameters.layerRelief;
  uniforms.uLayerSharpness.value = parameters.layerSharpness;
  uniforms.uLayerEdgeChips.value = parameters.layerEdgeChips;
  uniforms.uFracture.value = parameters.fracture;
  uniforms.uFractureScale.value = parameters.fractureScale;
  uniforms.uVeins.value = parameters.veins;
  uniforms.uVeinScale.value = parameters.veinScale;
  uniforms.uPolish.value = parameters.polish;
  uniforms.uWearScale.value = parameters.wearScale;
  uniforms.uWetness.value = parameters.wetness;
  uniforms.uDryRoughness.value = parameters.dryRoughness;
  uniforms.uMicroRelief.value = parameters.microRelief;
  uniforms.uDiagnostic.value = BLACK_STONE_DIAGNOSTICS[diagnostic] ?? 0;
}
