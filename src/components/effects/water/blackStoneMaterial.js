import * as THREE from 'three';

// The approved look-dev sculpture: polished wet obsidian interrupted by dry,
// stratified cleavage, chipped edges, faint veins and a separate micro-relief.
// They are also the fallback for older saved scenes that predate the dedicated
// editor controls.
export const BLACK_STONE_DEFAULTS = Object.freeze({
  layering: 0.99,
  layerScale: 2.2,
  layerRelief: 1,
  layerSharpness: 1,
  layerEdgeChips: 0.78,
  fracture: 0.85,
  fractureScale: 3.15,
  veins: 0.19,
  veinScale: 3.9,
  polish: 0.71,
  wearScale: 2.3,
  wetness: 0.98,
  dryRoughness: 0.78,
  microRelief: 0.78,
});

// The editor's sculpture keys as material parameters. The scene and the
// laboratory both read the published file through this one mapping.
export function blackStoneParametersFromSettings(settings) {
  return {
    layering: settings.sculptureLayering,
    layerScale: settings.sculptureLayerScale,
    layerRelief: settings.sculptureLayerRelief,
    layerSharpness: settings.sculptureLayerSharpness,
    layerEdgeChips: settings.sculptureLayerEdgeChips,
    fracture: settings.sculptureFracture,
    fractureScale: settings.sculptureFractureScale,
    veins: settings.sculptureVeins,
    veinScale: settings.sculptureVeinScale,
    polish: settings.sculpturePolish,
    wearScale: settings.sculptureWearScale,
    wetness: settings.sculptureWetness,
    dryRoughness: settings.sculptureDryRoughness,
    microRelief: settings.sculptureMicroRelief,
  };
}

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
  uniform vec3 uStoneTint;

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
        mix(stoneHash(i), stoneHash(i + vec3(1.0, 0.0, 0.0)), f.x),
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
#ifdef STONE_LITE
    // A phone reads the stone at a quarter of the desktop's pixels per
    // centimetre; the third octave is below what it can show.
    return value + 0.075;
#else
    p = p * 2.01 + vec3(5.4, 19.3, 2.8);
    return value + stoneNoise(p) * 0.15;
#endif
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
  stoneLayerCoordinate += (stoneNoise(stoneLayerP * 1.45 + vec3(-4.6, 7.2, 1.4)) - 0.5) * 2.2;
  float stoneLayerWave = 0.5 + 0.5 * cos(stoneLayerCoordinate);
  float stoneLayerAA = max(fwidth(stoneLayerCoordinate) * 0.65, 0.018);
  float stoneLayerSharpPower = mix(3.0, 12.0, uLayerSharpness);
  float stoneLayerRidge = pow(clamp(stoneLayerWave, 0.0, 1.0), stoneLayerSharpPower);
  float stoneLayerValley = 1.0 - smoothstep(0.1 - stoneLayerAA, 0.28 + stoneLayerAA, stoneLayerWave);
  float stoneLayerEdge = 1.0 - smoothstep(0.035 + stoneLayerAA, 0.12 + stoneLayerAA, abs(stoneLayerWave - 0.34));
  float stoneLayerBreak = smoothstep(0.24, 0.76, stoneNoise(stoneLayerP * 2.15 + vec3(stoneBroad * 1.7, -11.4, 5.9)));
  float stoneLayerBreakMask = mix(0.32, 1.0, stoneLayerBreak);
  float stoneCleavageFacing = smoothstep(0.32, 0.92, abs(dot(stoneObjectNormal, stoneLayerDirection)));
  float stoneLayerExposure = mix(0.5, 1.0, smoothstep(0.08, 0.82, 1.0 - abs(dot(stoneObjectNormal, stoneLayerDirection))));
  float stoneLayerSheen = stoneLayerRidge * stoneLayerBreakMask * uLayering;
#ifdef STONE_LITE
  float stoneLayerChipCluster = smoothstep(0.58, 0.82, stoneBroad);
#else
  float stoneLayerChipCluster = smoothstep(0.58, 0.82, stoneFbm(stoneLayerP * 2.9 + vec3(5.1, -7.4, 2.6)));
#endif
  float stoneLayerChipCell = stoneNoise(stoneLayerP * 9.0 + vec3(stoneBroad * 3.0, 11.2, -4.7));
  float stoneLayerChipMask = smoothstep(0.79, 0.93, stoneLayerChipCell) * stoneLayerChipCluster * stoneLayerEdge * stoneLayerExposure * uLayerEdgeChips * uLayering;
  float stoneLayerHeight = (((stoneLayerRidge - 0.3) * 0.55 - stoneLayerValley * 0.95) * stoneLayerBreakMask * stoneLayerExposure * uLayering) - stoneLayerChipMask * 1.15;

  float stoneFractureWarp = stoneNoise(stoneFractureP * 0.92 + vec3(stoneWarp * 1.7, 5.3, -2.8));
  float stoneFractureField = stoneFbm(stoneFractureP * 1.86 + vec3(stoneFractureWarp * 2.1, -8.3, stoneBroad * 1.7));
  float stoneFractureRidge = 1.0 - smoothstep(0.018, 0.092, abs(stoneFractureField - 0.58));
  float stoneGlassFacet = smoothstep(0.63, 0.78, stoneFractureField) * mix(0.28, 1.0, stoneCleavageFacing) * uFracture;
#ifdef STONE_LITE
  float stoneChipCluster = smoothstep(0.5, 0.74, stoneFractureField);
#else
  float stoneChipCluster = smoothstep(0.5, 0.74, stoneFbm(stoneFractureP * 2.7 + vec3(-3.7, stoneFractureField * 2.8, 8.4)));
#endif
  float stoneChipField = stoneNoise(stoneFractureP * 10.5 + vec3(stoneFractureField * 3.0, 14.2, -9.1));
  float stoneChipMask = smoothstep(0.78, 0.93, stoneChipField) * mix(0.28, 1.0, stoneChipCluster) * mix(0.48, 1.0, stoneFractureRidge) * uFracture;

#ifdef STONE_LITE
  // Veins are a few millimetres wide: on a phone they are one noisy pixel.
  float stoneVeinMask = 0.0;
#else
  vec3 stoneVeinWarp = vec3(
    stoneNoise(stoneVeinP * 0.62 + vec3(7.2, 0.4, 2.1)),
    stoneNoise(stoneVeinP * 0.62 + vec3(-3.5, 9.1, 5.8)),
    stoneNoise(stoneVeinP * 0.62 + vec3(4.8, -5.2, 11.7))
  );
  float stoneVeinField = stoneNoise(stoneVeinP * 0.88 + stoneVeinWarp * 2.25);
  stoneVeinField += sin(dot(stoneVeinP, vec3(1.2, 3.8, -0.9)) + stoneBroad * 4.0) * 0.055;
  float stoneVeinMask = (1.0 - smoothstep(0.014, 0.056, abs(stoneVeinField - 0.56))) * smoothstep(0.28, 0.76, stoneBroad) * uVeins;
#endif

  float stoneWearField = stoneFbm(stoneWearP * 1.15 + vec3(6.2, -4.1, 12.8));
  float stoneWearBreak = stoneNoise(stoneWearP * 2.7 + vec3(-8.4, stoneBroad * 2.0, 3.6));
  float stoneWearMask = smoothstep(0.56, 0.8, stoneWearField) * mix(0.35, 1.0, stoneCleavageFacing) * mix(0.45, 1.0, stoneWearBreak);
#ifdef STONE_LITE
  float stoneRoughPatch = smoothstep(0.42, 0.74, stoneWearField);
#else
  float stoneRoughPatch = smoothstep(0.42, 0.74, stoneFbm(stoneWearP * 3.2 + vec3(11.6, -7.3, stoneFractureField * 1.8)));
#endif
  float stoneFineGrain = stoneNoise(stoneWearP * 14.5 + vec3(-5.2, 13.1, 2.9));
  float stonePoreMask = smoothstep(0.84, 0.96, stoneFineGrain) * stoneRoughPatch;

  float stoneWetField = stoneFbm(stoneP * 0.56 + vec3(4.2, -3.8, 9.6));
  float stoneWetThreshold = mix(0.88, 0.48, uWetness);
  float stoneWetPatch = smoothstep(stoneWetThreshold, stoneWetThreshold + 0.085, stoneWetField);
  float stoneDripField = stoneNoise(vec3(stoneP.x * 1.45, stoneP.y * 0.2, stoneP.z * 1.45) + vec3(-7.1, 2.0, 5.4));
  float stoneWetMask = clamp((stoneWetPatch + smoothstep(0.77, 0.93, stoneDripField) * 0.32) * uWetness * 1.55, 0.0, 1.0);
  float stonePolishMask = clamp(uPolish * (stoneGlassFacet * 0.6 + stoneLayerSheen * 0.1 + stoneWearMask * 0.34), 0.0, 1.0);

  vec3 stoneDryBlack = mix(vec3(0.0025, 0.0032, 0.0042), vec3(0.012, 0.015, 0.018), stoneBroad);
  stoneDryBlack *= mix(0.86, 1.15, stoneGrain);
  stoneDryBlack = mix(stoneDryBlack, vec3(0.026, 0.031, 0.034), stoneLayerSheen * 0.22 + stoneLayerChipMask * 0.42 + stoneChipMask * 0.46 + stoneFractureRidge * uFracture * 0.09);
  stoneDryBlack *= mix(1.0, 0.78, stoneLayerValley * stoneLayerExposure * uLayering * 0.5);
  vec3 stoneColor = mix(stoneDryBlack, vec3(0.052, 0.061, 0.065), stoneVeinMask * 0.64);
  stoneColor = mix(stoneColor, stoneColor * 0.72, stonePoreMask * uDryRoughness * 0.56);
  stoneColor *= mix(1.0, 0.76, stoneWetMask);
  // The user-facing sculpture colour is prepared as a lifted, hue-preserving
  // tint on the CPU, so a near-black swatch cannot erase the procedural detail.
  stoneColor *= uStoneTint;

  float stoneDryRoughness = mix(0.7, 0.9, stoneGrain);
  stoneDryRoughness += uDryRoughness * (0.035 + stoneRoughPatch * 0.16 + stoneChipMask * 0.12 + stoneLayerChipMask * 0.13 + stoneFractureRidge * 0.07);
  stoneDryRoughness += stoneLayerValley * stoneLayerExposure * uLayering * 0.05;
  float stonePolishedRoughness = mix(0.31, 0.12, uPolish);
  float stoneRoughness = mix(stoneDryRoughness, stonePolishedRoughness, clamp(stonePolishMask + stoneGlassFacet * 0.24, 0.0, 0.72));
  stoneRoughness -= stoneLayerSheen * 0.06;
  stoneRoughness += stoneFractureRidge * uFracture * 0.06;
  stoneRoughness = mix(stoneRoughness, 0.065, stoneWetMask);
  stoneRoughness = clamp(stoneRoughness, 0.055, 0.94);
  float stoneClearcoat = clamp(stonePolishMask * 0.3 + stoneGlassFacet * 0.1 + stoneWetMask * 0.72, 0.0, 0.78);
  float stoneClearcoatRoughness = mix(0.28, 0.045, max(stoneWetMask, stonePolishMask * 0.72));

  float stoneDryFilmMask = 1.0 - smoothstep(0.07, 0.62, stoneWetMask);
  float stoneDryMicroMask = stoneDryFilmMask * clamp(0.22 + stoneRoughPatch * 0.58 + stoneChipMask * 0.82 + stoneFractureRidge * 0.42, 0.0, 1.0);
  float stoneLayerRelief = stoneLayerHeight * 0.055 * stoneDryFilmMask;
  float stoneMicroHeight = (stoneGrain - 0.5) * 0.04;
  stoneMicroHeight += (stoneFineGrain - 0.5) * (0.025 + uDryRoughness * 0.022);
  stoneMicroHeight -= stonePoreMask * (0.018 + uDryRoughness * 0.022);
  stoneMicroHeight -= stoneChipMask * (0.026 + uFracture * 0.025);
  stoneMicroHeight += stoneFractureRidge * uFracture * 0.016;
  stoneMicroHeight += stoneVeinMask * 0.01;
  stoneMicroHeight *= stoneDryMicroMask;
  vec3 stoneNormal = perturbStoneNormal(vStoneViewPosition, normalize(vStoneViewNormal), stoneLayerRelief, uLayerRelief * 0.28);
#ifndef STONE_LITE
  stoneNormal = perturbStoneNormal(vStoneViewPosition, stoneNormal, stoneMicroHeight, mix(0.045, 0.28, uMicroRelief));
#endif
`;

const BLACK_STONE_DEBUG_OUTPUT = /* glsl */ `
  if (uDiagnostic > 0.5 && uDiagnostic < 1.5) {
    gl_FragColor = vec4(vec3(stoneRoughness), 1.0);
  } else if (uDiagnostic > 1.5 && uDiagnostic < 2.5) {
    gl_FragColor = vec4(stoneNormal * 0.5 + 0.5, 1.0);
  } else if (uDiagnostic > 2.5) {
    gl_FragColor = vec4(stoneVeinMask, stoneWetMask, clamp(stoneGlassFacet * 0.35 + stoneFractureRidge * 0.28 + stoneChipMask * 0.72 + stoneLayerChipMask * 0.92 + stoneLayerValley * uLayering * 0.16, 0.0, 1.0), 1.0);
  }
`;

function toStoneTint(value) {
  return value?.isColor ? value.clone() : new THREE.Color(value || '#171a1d');
}

export function createBlackStoneUniforms(
  parameters = BLACK_STONE_DEFAULTS,
  diagnostic = 'beauty',
  stoneTint = '#171a1d',
) {
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
    uStoneTint: { value: toStoneTint(stoneTint) },
  };
}

export function createBlackStoneMaterial(uniforms, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#171a1d',
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.72,
    clearcoat: options.clearcoat ?? 0.01,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.24,
    envMapIntensity: options.envMapIntensity ?? 0.26,
    ior: options.ior ?? 1.48,
    specularIntensity: options.specularIntensity ?? 0.42,
    transmission: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: options.side ?? THREE.DoubleSide,
  });

  // The lite stone is the phone's: two fbm octaves instead of three, no
  // veins, no micro-relief pass, the cluster masks read fields already paid
  // for. About 18 noise evaluations a pixel instead of 42. The desktop keeps
  // the approved look-dev material untouched.
  if (options.lite) {
    material.defines = { ...(material.defines ?? {}), STONE_LITE: '' };
  }
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
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal = normalize(mix(clearcoatNormal, stoneNormal, 0.32));\n#endif')
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = stoneClearcoat;')
      .replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = stoneClearcoatRoughness;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${BLACK_STONE_DEBUG_OUTPUT}`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => (options.lite ? 'ddg-black-stone-lite-v1' : 'ddg-black-stone-production-v1');
  return material;
}

export function updateBlackStoneUniforms(
  uniforms,
  parameters = BLACK_STONE_DEFAULTS,
  diagnostic = 'beauty',
  stoneTint,
) {
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
  if (stoneTint !== undefined) {
    uniforms.uStoneTint.value.copy(toStoneTint(stoneTint));
  }
}
