// Procedural pond vegetation. Both layers are texture-free and rendered as
// instanced geometry, so changing their density only changes instanceCount.

export const surfaceVegetationVertexShader = `
  attribute vec2 aScatter;
  attribute vec2 aCluster;
  attribute float aScale;
  attribute float aRotation;
  attribute float aType;
  attribute float aTone;
  attribute float aPhase;

  varying vec2 vLeafUv;
  varying float vLeafType;
  varying float vTone;
  varying float vPhase;
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
    float largeLeaf = step(0.72, aType);
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

    float sizeVariation = mix(0.18 + aScale * 0.34, 0.78 + aScale * 0.56, largeLeaf);
    vec2 local = position.xy * uSize * sizeVariation;
    local.x *= mix(0.72, 1.0, largeLeaf);

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

    vLeafUv = uv * 2.0 - 1.0;
    vLeafType = largeLeaf;
    vTone = aTone;
    vPhase = aPhase;
    vLeafNormal = waterNormal;
    vLeafWorldPosition = vec3(worldXZ.x, worldY, worldXZ.y);
    vLeafReflectionPosition = uReflectionMatrix * vec4(vLeafWorldPosition, 1.0);

    gl_Position = projectionMatrix * viewMatrix * vec4(vLeafWorldPosition, 1.0);
  }
`;

export const surfaceVegetationFragmentShader = `
  varying vec2 vLeafUv;
  varying float vLeafType;
  varying float vTone;
  varying float vPhase;
  varying float vInsideWater;
  varying vec3 vLeafNormal;
  varying vec3 vLeafWorldPosition;
  varying vec4 vLeafReflectionPosition;

  uniform sampler2D uReflectionTexture;
  uniform float uReflectionActive;
  uniform vec3 uColor;
  uniform float uSaturation;
  uniform float uSubsurfaceStrength;
  uniform float uReflectionStrength;
  uniform float uEnvironmentExposure;
  uniform float uEnvironmentReflection;
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

  void main() {
    if (vInsideWater < 0.5) {
      discard;
    }

    vec2 p = vLeafUv;
    float radius = length(p);
    float shapeDistance;

    if (vLeafType > 0.5) {
      shapeDistance = radius;
      float notchWidth = mix(0.075, 0.16, clamp(p.x, 0.0, 1.0));
      if (p.x > 0.02 && abs(p.y) < notchWidth) {
        discard;
      }
    } else {
      // Three small ovals inside one card read as natural duckweed while the
      // whole patch still costs a single instance.
      float leafA = length(vec2((p.x + 0.32) / 0.52, (p.y + 0.02) / 0.34));
      float leafB = length(vec2((p.x - 0.25) / 0.48, (p.y - 0.15) / 0.32));
      float leafC = length(vec2((p.x + 0.02) / 0.38, (p.y + 0.36) / 0.28));
      shapeDistance = min(leafA, min(leafB, leafC));
    }

    float edge = 1.0 - smoothstep(0.88, 0.99, shapeDistance);
    if (edge < 0.05) {
      discard;
    }

    float angle = atan(p.y, p.x);
    float radialVeins = pow(max(cos(angle * mix(5.0, 8.0, vLeafType)), 0.0), 18.0);
    radialVeins *= smoothstep(0.12, 0.82, radius) * (1.0 - smoothstep(0.78, 0.96, radius));
    float centerVein = (1.0 - smoothstep(0.025, 0.11, abs(p.y)))
      * smoothstep(-0.78, 0.6, p.x);
    float mottling = 0.5 + 0.5 * sin(
      p.x * 17.0 + p.y * 13.0 + sin(p.y * 21.0 + vPhase) * 1.7 + vPhase
    );
    float veinMask = clamp(radialVeins + centerVein * mix(0.45, 0.8, vLeafType), 0.0, 1.0);
    float thinEdge = smoothstep(0.34, 0.96, shapeDistance);
    // A procedural thickness map: edges and mottled tissue transmit light,
    // while the denser veins remain darker and more opaque.
    float transmissionMap = clamp(
      0.12 + thinEdge * 0.7 + mottling * 0.2 - veinMask * 0.38,
      0.03,
      1.0
    );
    // A separate wetness/reflectivity map breaks up the otherwise flat cards.
    float wetnessMap = clamp(
      0.38 + mottling * 0.34 + vLeafType * 0.1 - veinMask * 0.12,
      0.0,
      1.0
    );

    vec3 color = uColor * mix(0.72, 1.24, vTone);
    color = applySaturation(color, clamp(uSaturation, 0.0, 2.0));
    color *= 0.62 + mottling * 0.2;
    color += color * (radialVeins * 0.18 + centerVein * mix(0.08, 0.2, vLeafType));

    vec2 radialDirection = p / max(radius, 0.08);
    vec2 microSlope = vec2(
      sin(p.x * 31.0 + p.y * 11.0 + vPhase),
      cos(p.y * 29.0 - p.x * 13.0 + vPhase * 0.73)
    ) * (0.012 + wetnessMap * 0.016);
    microSlope += radialDirection
      * smoothstep(0.18, 0.96, shapeDistance)
      * mix(0.012, 0.045, vLeafType);

    vec3 normal = normalize(vLeafNormal + vec3(microSlope.x, 0.0, microSlope.y));
    vec3 lightDirection = normalize(uMoonDirection);
    vec3 viewDirection = normalize(cameraPosition - vLeafWorldPosition);
    float moonDiffuse = max(dot(normal, lightDirection), 0.0);
    float rim = pow(1.0 - clamp(normal.y, 0.0, 1.0), 2.0);
    vec3 lighting = vec3(0.46) + uMoonColor
      * moonDiffuse
      * (0.22 + clamp(uMoonIntensity, 0.0, 4.0) * 0.28);
    color *= lighting;
    color += uMoonColor * rim * 0.035;

    float reverseLight = max(dot(-normal, lightDirection), 0.0);
    float transmissionLight = 0.08 + sqrt(moonDiffuse) * 0.24 + reverseLight * 0.72;
    vec3 transmissionColor = applySaturation(
      uColor * vec3(1.32, 1.58, 0.46),
      clamp(uSaturation * 1.08, 0.0, 2.0)
    );
    color += transmissionColor
      * transmissionMap
      * clamp(uSubsurfaceStrength, 0.0, 1.0)
      * transmissionLight
      * (0.46 + clamp(uMoonIntensity, 0.0, 4.0) * 0.16);
    color *= 1.0 - veinMask * clamp(uSubsurfaceStrength, 0.0, 1.0) * 0.055;

    vec2 reflectionUv = (
      vLeafReflectionPosition.xy / max(vLeafReflectionPosition.w, 0.0001)
    ) * 0.5 + 0.5;
    // Keep the low-resolution planar capture as a quiet detail. The procedural
    // wet lobe below carries the material, so reflections do not pixelate or lag.
    reflectionUv += normal.xz * (0.0007 + wetnessMap * 0.0009);
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
    float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.025 + 0.34 * pow(1.0 - nDotV, 3.0);
    float reflectionAmount = clamp(uReflectionStrength, 0.0, 1.0)
      * wetnessMap
      * (0.16 + fresnel * 1.18)
      * (0.62 + environmentLevel * 0.38);
    color = mix(color, reflectedColor, clamp(reflectionAmount, 0.0, 0.46));

    vec3 halfDirection = normalize(viewDirection + lightDirection);
    float wetHighlight = pow(max(dot(normal, halfDirection), 0.0), mix(34.0, 78.0, wetnessMap));
    wetHighlight *= wetnessMap
      * clamp(uReflectionStrength, 0.0, 1.0)
      * clamp(uMoonIntensity, 0.0, 4.0)
      * (0.32 + fresnel * 1.35);
    color += uMoonColor * wetHighlight * 0.72;

    gl_FragColor = vec4(color, edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export const underwaterAlgaeVertexShader = `
  attribute float aRibbonPlane;
  attribute vec2 aScatter;
  attribute float aHeight;
  attribute float aWidth;
  attribute float aYaw;
  attribute float aPhase;
  attribute float aTone;

  varying vec2 vRibbonUv;
  varying float vTone;
  varying float vPhase;
  varying float vHeightAlongBlade;
  varying float vInsideWater;
  varying vec3 vRibbonNormal;

  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uLength;
  uniform float uSway;
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
    vec2 bladeCenter = uCenter + aScatter * uRadius;
    vec2 seabedUv = vec2(
      bladeCenter.x / max(uWaterExtent, 0.001) + 0.5,
      0.5 - bladeCenter.y / max(uWaterExtent, 0.001)
    );
    vec2 validUv = step(vec2(0.018), seabedUv)
      * step(seabedUv, vec2(0.982));
    vInsideWater = validUv.x * validUv.y;
    seabedUv = clamp(seabedUv, vec2(0.001), vec2(0.999));

    float relief = (fbm(seabedUv * uReliefScale) - 0.5) * uReliefStrength;
    float bladeLength = min(
      uLength * mix(0.68, 1.28, aHeight),
      max(uWaterDepth - relief - 0.16, 0.02)
    );
    float t = position.y;
    float taperedWidth = position.x * 0.046 * aWidth * (1.0 - t * 0.76);
    float ribbonAngle = aYaw + aRibbonPlane * 1.57079632679;
    vec2 ribbonRight = vec2(cos(ribbonAngle), sin(ribbonAngle));

    vec2 currentDirection = normalize(vec2(0.82, 0.36) + vec2(
      sin(aPhase * 1.7),
      cos(aPhase * 1.3)
    ) * 0.18);
    float swayWave = sin(uTime * 0.72 + aPhase + t * 3.2)
      + 0.42 * sin(uTime * 1.17 - aPhase * 0.61 + t * 6.1);
    float bend = (0.34 * t + swayWave * 0.22 * clamp(uSway, 0.0, 1.5))
      * bladeLength
      * pow(t, 1.28);
    vec2 crossCurrent = vec2(-currentDirection.y, currentDirection.x);
    float sideFlutter = sin(uTime * 0.9 + aPhase * 1.8 + t * 4.7)
      * 0.045
      * bladeLength
      * pow(t, 1.6)
      * clamp(uSway, 0.0, 1.5);

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
    vRibbonNormal = normal;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldXZ.x, worldY, worldXZ.y, 1.0);
  }
`;

export const underwaterAlgaeFragmentShader = `
  varying vec2 vRibbonUv;
  varying float vTone;
  varying float vPhase;
  varying float vHeightAlongBlade;
  varying float vInsideWater;
  varying vec3 vRibbonNormal;

  uniform vec3 uColor;
  uniform float uSaturation;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonIntensity;

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
    float tipFade = 1.0 - smoothstep(0.78, 1.0, vHeightAlongBlade);
    float filament = 0.78 + 0.22 * sin(
      vHeightAlongBlade * 54.0 + vPhase + vRibbonUv.x * 6.0
    );
    float alpha = edge * baseFade * tipFade;
    if (alpha < 0.08) {
      discard;
    }

    vec3 color = uColor * mix(0.64, 1.32, vTone);
    color = applySaturation(color, clamp(uSaturation, 0.0, 2.0));
    color *= filament;

    float moonDiffuse = abs(dot(normalize(vRibbonNormal), normalize(uMoonDirection)));
    float topLift = mix(0.68, 1.08, vHeightAlongBlade);
    vec3 lighting = vec3(0.46) + uMoonColor
      * moonDiffuse
      * (0.16 + clamp(uMoonIntensity, 0.0, 4.0) * 0.2);
    color *= lighting * topLift;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
