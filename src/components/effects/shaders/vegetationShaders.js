// Instanced pond vegetation. Surface leaves use a compact hand-derived PBR
// atlas; underwater blades remain procedural so large meadows stay cheap.

export const surfaceVegetationVertexShader = `
  attribute vec2 aScatter;
  attribute vec2 aCluster;
  attribute float aScale;
  attribute float aRotation;
  attribute float aType;
  attribute float aTone;
  attribute float aPhase;

  varying vec2 vLeafUv;
  varying float vLeafVariant;
  varying float vTone;
  varying float vPhase;
  varying vec2 vLeafRotation;
  varying float vInsideWater;
  varying vec3 vLeafNormal;
  varying vec3 vLeafWorldPosition;
  varying vec4 vLeafReflectionPosition;

  uniform sampler2D uState;
  uniform sampler2D uNormalMap;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uClustering;
  uniform float uSize;
  uniform float uWaterExtent;
  uniform float uWaveAmplitude;
  uniform float uWaveChoppiness;
  uniform float uTime;
  uniform mat4 uReflectionMatrix;

  vec3 decodeNormal(vec3 packedNormal) {
    return normalize((packedNormal * 2.0) - 1.0);
  }

  void main() {
    vec2 placement = mix(aScatter, aCluster, clamp(uClustering, 0.0, 1.0));
    vec2 leafCenter = uCenter + placement * uRadius;
    vec2 simulationUv = vec2(
      leafCenter.x / max(uWaterExtent, 0.001) + 0.5,
      0.5 - leafCenter.y / max(uWaterExtent, 0.001)
    );

    vec2 validUv = step(vec2(0.012), simulationUv)
      * step(simulationUv, vec2(0.988));
    vInsideWater = validUv.x * validUv.y;
    simulationUv = clamp(simulationUv, vec2(0.001), vec2(0.999));

    float rawHeight = texture2D(uState, simulationUv).r;
    float smoothHeight = texture2D(uNormalMap, simulationUv).a * 2.0 - 1.0;
    float heightSample = mix(rawHeight, smoothHeight, 0.84);
    float displacement = heightSample * uWaveAmplitude;
    vec3 waterNormal = decodeNormal(texture2D(uNormalMap, simulationUv).rgb);

    float sizeVariation = mix(0.52, 1.46, aScale);
    vec2 local = position.xy * uSize * sizeVariation;

    float angle = aRotation + sin(uTime * 0.22 + aPhase) * 0.025;
    float cosine = cos(angle);
    float sine = sin(angle);
    vec2 rotatedLocal = vec2(
      local.x * cosine - local.y * sine,
      local.x * sine + local.y * cosine
    );

    vec2 worldXZ = leafCenter + rotatedLocal;
    worldXZ += waterNormal.xz * displacement * clamp(uWaveChoppiness, 0.0, 1.25) * 0.34;
    float slopeHeight = -dot(waterNormal.xz, rotatedLocal) / max(waterNormal.y, 0.45);
    float worldY = displacement + clamp(slopeHeight, -0.035, 0.035) + 0.014;

    vLeafUv = uv;
    vLeafVariant = floor(min(aType, 0.9999) * 4.0);
    vTone = aTone;
    vPhase = aPhase;
    vLeafRotation = vec2(cosine, sine);
    vLeafNormal = waterNormal;
    vLeafWorldPosition = vec3(worldXZ.x, worldY, worldXZ.y);
    vLeafReflectionPosition = uReflectionMatrix * vec4(vLeafWorldPosition, 1.0);

    gl_Position = projectionMatrix * viewMatrix * vec4(vLeafWorldPosition, 1.0);
  }
`;

export const surfaceVegetationFragmentShader = `
  varying vec2 vLeafUv;
  varying float vLeafVariant;
  varying float vTone;
  varying float vPhase;
  varying vec2 vLeafRotation;
  varying float vInsideWater;
  varying vec3 vLeafNormal;
  varying vec3 vLeafWorldPosition;
  varying vec4 vLeafReflectionPosition;

  uniform sampler2D uLeafAlbedoMap;
  uniform sampler2D uLeafNormalMap;
  uniform sampler2D uLeafMaterialMap;
  uniform sampler2D uReflectionTexture;
  uniform float uReflectionActive;
  uniform vec3 uColor;
  uniform float uSaturation;
  uniform float uSubsurfaceStrength;
  uniform float uReflectionStrength;
  uniform float uEnvironmentExposure;
  uniform float uEnvironmentReflection;
  uniform vec3 uEnvironmentAmbientColor;
  uniform float uEnvironmentDiffuse;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonIntensity;

  #include <common>
  #include <dithering_pars_fragment>

  vec3 applySaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
  }

  float reflectionEdgeMask(vec2 uv) {
    vec2 lower = smoothstep(vec2(0.0), vec2(0.035), uv);
    vec2 upper = 1.0 - smoothstep(vec2(0.965), vec2(1.0), uv);
    return lower.x * lower.y * upper.x * upper.y;
  }

  vec2 resolveAtlasUv(vec2 uv, float variant) {
    float column = mod(variant, 2.0);
    float row = floor(variant * 0.5);
    // Every atlas cell contains its own transparent gutter. Sampling the whole
    // cell keeps mipmaps inside the assigned UV island.
    return (uv + vec2(column, row)) * 0.5;
  }

  void main() {
    if (vInsideWater < 0.5) {
      discard;
    }

    vec2 atlasUv = resolveAtlasUv(vLeafUv, vLeafVariant);
    vec4 materialSample = texture2D(uLeafMaterialMap, atlasUv);
    float opacity = materialSample.a;
    if (opacity < 0.42) {
      discard;
    }

    vec3 albedo = pow(max(texture2D(uLeafAlbedoMap, atlasUv).rgb, vec3(0.0)), vec3(2.2));
    float roughness = materialSample.r;
    float specularMap = materialSample.g;
    float transmissionMap = materialSample.b;
    vec3 tangentNormal = texture2D(uLeafNormalMap, atlasUv).xyz * 2.0 - 1.0;
    vec2 rotatedSlope = vec2(
      tangentNormal.x * vLeafRotation.x - tangentNormal.y * vLeafRotation.y,
      tangentNormal.x * vLeafRotation.y + tangentNormal.y * vLeafRotation.x
    );
    vec3 normal = normalize(
      vLeafNormal * max(tangentNormal.z, 0.34)
      + vec3(rotatedSlope.x, 0.0, rotatedSlope.y) * 0.42
    );

    vec3 tint = max(uColor, vec3(0.025));
    vec3 color = mix(albedo, albedo * tint * 1.85, 0.28);
    color = applySaturation(color, clamp(uSaturation, 0.0, 2.0));
    color *= mix(0.82, 1.18, vTone);

    vec3 lightDirection = normalize(uMoonDirection);
    vec3 viewDirection = normalize(cameraPosition - vLeafWorldPosition);
    float moonDiffuse = max(dot(normal, lightDirection), 0.0);
    float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float rim = pow(1.0 - nDotV, 2.0);
    float ambientLuma = max(
      dot(uEnvironmentAmbientColor, vec3(0.2126, 0.7152, 0.0722)),
      0.001
    );
    vec3 ambientChroma = clamp(
      uEnvironmentAmbientColor / ambientLuma,
      vec3(0.62),
      vec3(1.5)
    );
    vec3 skyFill = vec3(0.36) * mix(
      vec3(1.0),
      ambientChroma,
      clamp(uEnvironmentDiffuse, 0.0, 2.2) * 0.22
    );
    vec3 lighting = skyFill + uMoonColor
      * moonDiffuse
      * (0.24 + clamp(uMoonIntensity, 0.0, 4.0) * 0.3);
    color *= lighting;
    color += albedo * uMoonColor * rim * 0.045;

    float reverseLight = max(dot(-normal, lightDirection), 0.0);
    float transmissionLight = 0.06 + reverseLight * 0.78 + rim * 0.24;
    vec3 transmissionColor = applySaturation(albedo * vec3(1.14, 1.56, 0.38), 1.18);
    color += transmissionColor
      * transmissionMap
      * clamp(uSubsurfaceStrength, 0.0, 1.0)
      * transmissionLight
      * (0.42 + clamp(uMoonIntensity, 0.0, 4.0) * 0.18);

    vec2 reflectionUv = (
      vLeafReflectionPosition.xy / max(vLeafReflectionPosition.w, 0.0001)
    ) * 0.5 + 0.5;
    // Keep the low-resolution planar capture as a quiet detail. The procedural
    // wet lobe below carries the material, so reflections do not pixelate or lag.
    reflectionUv += normal.xz * (0.00045 + specularMap * 0.00085);
    vec2 clampedReflectionUv = clamp(reflectionUv, vec2(0.002), vec2(0.998));
    vec4 reflectedScene = texture2D(uReflectionTexture, clampedReflectionUv);
    float reflectedSceneMask = reflectionEdgeMask(reflectionUv)
      * step(0.0001, vLeafReflectionPosition.w)
      * uReflectionActive
      * clamp(reflectedScene.a, 0.0, 1.0);

    float environmentLevel = clamp(
      0.16 + uEnvironmentExposure * 0.22 + uEnvironmentReflection * 0.34,
      0.0,
      1.15
    );
    vec3 ambientReflection = mix(
      vec3(0.025, 0.055, 0.07),
      uMoonColor * (0.18 + environmentLevel * 0.28),
      0.64
    );
    vec3 reflectedColor = mix(ambientReflection, reflectedScene.rgb, reflectedSceneMask * 0.24);
    float fresnel = 0.025 + 0.34 * pow(1.0 - nDotV, 3.0);
    float reflectionAmount = clamp(uReflectionStrength, 0.0, 1.0)
      * specularMap
      * (0.16 + fresnel * 1.18)
      * mix(0.72, 0.24, roughness)
      * (0.62 + environmentLevel * 0.38);
    color = mix(color, reflectedColor, clamp(reflectionAmount, 0.0, 0.4));

    vec3 halfDirection = normalize(viewDirection + lightDirection);
    float wetHighlight = pow(
      max(dot(normal, halfDirection), 0.0),
      mix(24.0, 112.0, specularMap * (1.0 - roughness * 0.45))
    );
    wetHighlight *= specularMap
      * clamp(uReflectionStrength, 0.0, 1.0)
      * clamp(uMoonIntensity, 0.0, 4.0)
      * (0.28 + fresnel * 1.25);
    color += uMoonColor * wetHighlight * 0.64;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export const underwaterAlgaeVertexShader = `
  attribute float aRibbonPlane;
  attribute vec2 aScatter;
  attribute vec2 aCluster;
  attribute float aHeight;
  attribute float aWidth;
  attribute float aYaw;
  attribute float aPhase;
  attribute float aTone;
  attribute float aSpecies;

  varying vec2 vRibbonUv;
  varying float vTone;
  varying float vPhase;
  varying float vHeightAlongBlade;
  varying float vSpecies;
  varying float vInsideWater;
  varying vec3 vRibbonNormal;

  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uLength;
  uniform float uSway;
  uniform float uPatchiness;
  uniform float uSpeciesMix;
  uniform vec2 uFlowDirection;
  uniform float uFlowStrength;
  uniform float uWaterDepth;
  uniform float uWaterExtent;
  uniform float uReliefStrength;
  uniform float uReliefScale;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i += 1) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 placement = mix(aScatter, aCluster, clamp(uPatchiness, 0.0, 1.0));
    vec2 bladeCenter = uCenter + placement * uRadius;
    vec2 seabedUv = vec2(
      bladeCenter.x / max(uWaterExtent, 0.001) + 0.5,
      0.5 - bladeCenter.y / max(uWaterExtent, 0.001)
    );
    vec2 validUv = step(vec2(0.018), seabedUv)
      * step(seabedUv, vec2(0.982));
    vInsideWater = validUv.x * validUv.y;
    seabedUv = clamp(seabedUv, vec2(0.001), vec2(0.999));

    float relief = (fbm(seabedUv * uReliefScale) - 0.5) * uReliefStrength;
    float species = mix(0.16, aSpecies, clamp(uSpeciesMix, 0.0, 1.0));
    float broadSpecies = smoothstep(0.28, 0.38, species)
      * (1.0 - smoothstep(0.66, 0.76, species));
    float filamentSpecies = smoothstep(0.68, 0.82, species);
    float speciesLength = mix(1.0, 1.18, broadSpecies);
    speciesLength = mix(speciesLength, 1.34, filamentSpecies);
    float bladeLength = min(
      uLength * mix(0.58, 1.34, aHeight) * speciesLength,
      max(uWaterDepth - relief - 0.16, 0.02)
    );
    float t = position.y;
    float widthProfile = mix(0.038, 0.086, broadSpecies);
    widthProfile = mix(widthProfile, 0.018, filamentSpecies);
    float tipProfile = mix(1.0 - t * 0.74, sin((1.0 - t) * 1.57079632679), broadSpecies);
    tipProfile = mix(tipProfile, 1.0 - t * 0.58, filamentSpecies);
    float taperedWidth = position.x * widthProfile * aWidth * max(tipProfile, 0.08);
    float ribbonAngle = aYaw + aRibbonPlane * 1.57079632679;
    vec2 ribbonRight = vec2(cos(ribbonAngle), sin(ribbonAngle));

    vec2 currentDirection = normalize(uFlowDirection + vec2(
      sin(aPhase * 1.7),
      cos(aPhase * 1.3)
    ) * 0.16);
    float speciesFrequency = mix(1.0, 1.38, filamentSpecies);
    float swayWave = sin(uTime * 0.64 * speciesFrequency + aPhase + t * 3.1)
      + 0.38 * sin(uTime * 1.08 - aPhase * 0.61 + t * mix(5.4, 8.2, filamentSpecies));
    float steadyLean = clamp(uFlowStrength, 0.0, 2.0) * mix(0.42, 0.7, broadSpecies);
    float bend = (steadyLean + swayWave * 0.2 * clamp(uSway, 0.0, 1.5))
      * bladeLength
      * pow(t, mix(1.22, 1.48, filamentSpecies));
    vec2 crossCurrent = vec2(-currentDirection.y, currentDirection.x);
    float sideFlutter = sin(uTime * 0.9 + aPhase * 1.8 + t * 4.7)
      * 0.045
      * bladeLength
      * pow(t, 1.6)
      * clamp(uSway, 0.0, 1.5)
      * mix(0.72, 1.35, filamentSpecies);

    vec2 worldXZ = bladeCenter
      + ribbonRight * taperedWidth
      + currentDirection * bend
      + crossCurrent * sideFlutter;
    float worldY = -uWaterDepth + relief + 0.018 + bladeLength * t;

    vec3 normal = normalize(vec3(-ribbonRight.y, 0.16, ribbonRight.x));
    vRibbonUv = uv;
    vTone = aTone;
    vPhase = aPhase;
    vHeightAlongBlade = t;
    vSpecies = species;
    vRibbonNormal = normal;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldXZ.x, worldY, worldXZ.y, 1.0);
  }
`;

export const underwaterAlgaeFragmentShader = `
  varying vec2 vRibbonUv;
  varying float vTone;
  varying float vPhase;
  varying float vHeightAlongBlade;
  varying float vSpecies;
  varying float vInsideWater;
  varying vec3 vRibbonNormal;

  uniform vec3 uColor;
  uniform float uSaturation;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonIntensity;
  uniform vec3 uEnvironmentAmbientColor;
  uniform float uEnvironmentDiffuse;
  uniform vec3 uWaterScatteringColor;
  uniform float uWaterTurbidity;
  uniform float uPlantAoStrength;

  #include <common>
  #include <dithering_pars_fragment>

  vec3 applySaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
  }

  void main() {
    if (vInsideWater < 0.5) {
      discard;
    }

    float side = abs(vRibbonUv.x * 2.0 - 1.0);
    float edge = 1.0 - smoothstep(0.7, 0.99, side);
    float baseFade = smoothstep(0.0, 0.055, vHeightAlongBlade);
    float broadSpecies = smoothstep(0.28, 0.38, vSpecies)
      * (1.0 - smoothstep(0.66, 0.76, vSpecies));
    float filamentSpecies = smoothstep(0.68, 0.82, vSpecies);
    float tipFade = 1.0 - smoothstep(
      mix(0.78, 0.9, broadSpecies),
      1.0,
      vHeightAlongBlade
    );
    float filament = 0.78 + 0.22 * sin(
      vHeightAlongBlade * 54.0 + vPhase + vRibbonUv.x * 6.0
    );
    float alpha = edge * baseFade * tipFade;
    if (alpha < 0.08) {
      discard;
    }

    vec3 speciesTint = mix(vec3(0.72, 1.06, 0.56), vec3(0.52, 1.16, 0.72), broadSpecies);
    speciesTint = mix(speciesTint, vec3(0.86, 1.08, 0.42), filamentSpecies);
    vec3 color = uColor * speciesTint * mix(0.62, 1.36, vTone);
    color = applySaturation(color, clamp(uSaturation, 0.0, 2.0));
    color *= mix(filament, 0.9 + filament * 0.1, broadSpecies);

    float moonDiffuse = abs(dot(normalize(vRibbonNormal), normalize(uMoonDirection)));
    float topLift = mix(0.68, 1.08, vHeightAlongBlade);
    float ambientLuma = max(
      dot(uEnvironmentAmbientColor, vec3(0.2126, 0.7152, 0.0722)),
      0.001
    );
    vec3 ambientChroma = clamp(
      uEnvironmentAmbientColor / ambientLuma,
      vec3(0.62),
      vec3(1.5)
    );
    vec3 lighting = vec3(0.42) * mix(
      vec3(1.0),
      ambientChroma,
      clamp(uEnvironmentDiffuse, 0.0, 2.2) * 0.2
    ) + uMoonColor
      * moonDiffuse
      * (0.16 + clamp(uMoonIntensity, 0.0, 4.0) * 0.2);
    float rootAo = mix(
      1.0 - clamp(uPlantAoStrength, 0.0, 1.0) * 0.58,
      1.0,
      smoothstep(0.02, 0.34, vHeightAlongBlade)
    );
    float waterHaze = clamp(uWaterTurbidity, 0.0, 1.0)
      * (1.0 - smoothstep(0.12, 1.0, vHeightAlongBlade))
      * 0.18;
    color *= lighting * topLift * rootAo;
    color = mix(color, uWaterScatteringColor * 0.36, waterHaze);

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
