export const fullScreenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const simulationFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2 uResolution;
  uniform vec2 uPointerUv;
  uniform float uImpulseActive;
  uniform float uImpulseStrength;
  uniform float uRippleRadius;
  uniform float uRippleImpulse;
  uniform float uDamping;
  uniform float uDelta;
  uniform float uTime;
  uniform float uAmbientWaveIntensity;
  uniform float uAmbientWaveSpeed;
  uniform float uWaveLength;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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

  void main() {
    vec2 texel = 1.0 / uResolution;

    vec4 stateSample = texture2D(uState, vUv);
    float height = stateSample.r;
    float velocity = stateSample.g;

    float hL = texture2D(uState, vUv - vec2(texel.x, 0.0)).r;
    float hR = texture2D(uState, vUv + vec2(texel.x, 0.0)).r;
    float hD = texture2D(uState, vUv - vec2(0.0, texel.y)).r;
    float hU = texture2D(uState, vUv + vec2(0.0, texel.y)).r;
    float hDL = texture2D(uState, vUv - texel).r;
    float hDR = texture2D(uState, vUv + vec2(texel.x, -texel.y)).r;
    float hUL = texture2D(uState, vUv + vec2(-texel.x, texel.y)).r;
    float hUR = texture2D(uState, vUv + texel).r;

    float crossAverage = (hL + hR + hD + hU) * 0.25;
    float diagonalAverage = (hDL + hDR + hUL + hUR) * 0.25;
    float neighbourAverage = mix(crossAverage, diagonalAverage, 0.35);
    float laplacian = neighbourAverage - height;
    float frameScale = clamp(uDelta * 60.0, 0.4, 1.2);
    float waveLengthFactor = clamp(0.9 / max(uWaveLength, 0.35), 0.45, 1.6);

    velocity += laplacian * 0.22 * waveLengthFactor * frameScale;
    velocity *= pow(uDamping, frameScale);
    height += velocity * frameScale;

    if (uImpulseActive > 0.5 && uImpulseStrength > 0.0) {
      float dist = distance(vUv, uPointerUv);
      float radius = max(uRippleRadius, 0.0005);
      float impulse = exp(-(dist * dist) / (radius * radius));
      velocity += impulse * uRippleImpulse * uImpulseStrength * 0.12;
    }

    if (uAmbientWaveIntensity > 0.0) {
      float t = uTime * uAmbientWaveSpeed;
      float noiseVal = noise(vUv * 8.0 + t);
      noiseVal += noise(vUv * 16.0 - t * 0.5) * 0.5;
      velocity += (noiseVal - 0.75) * uAmbientWaveIntensity * 0.005;
    }

    height = clamp(height, -0.85, 0.85);
    velocity = clamp(velocity, -0.85, 0.85);

    gl_FragColor = vec4(height, velocity, laplacian, 1.0);
  }
`;

export const normalFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2 uResolution;
  uniform float uNormalStrength;
  uniform float uNormalBlur;
  uniform float uWaveLength;

  float sampleHeight(vec2 uv, vec2 offset) {
    return texture2D(uState, uv + offset).r;
  }

  void main() {
    vec2 texel = 1.0 / uResolution;
    float lengthFactor = mix(0.85, 1.65, clamp((uWaveLength - 0.35) / 2.8, 0.0, 1.0));
    vec2 radius = texel * max(uNormalBlur, 0.35) * lengthFactor;

    float hC = sampleHeight(vUv, vec2(0.0));
    float hL = sampleHeight(vUv, vec2(-radius.x, 0.0));
    float hR = sampleHeight(vUv, vec2(radius.x, 0.0));
    float hD = sampleHeight(vUv, vec2(0.0, -radius.y));
    float hU = sampleHeight(vUv, vec2(0.0, radius.y));
    float hDL = sampleHeight(vUv, vec2(-radius.x, -radius.y));
    float hDR = sampleHeight(vUv, vec2(radius.x, -radius.y));
    float hUL = sampleHeight(vUv, vec2(-radius.x, radius.y));
    float hUR = sampleHeight(vUv, vec2(radius.x, radius.y));

    float softH = (hC * 4.0 + hL + hR + hD + hU + hDL + hDR + hUL + hUR) / 12.0;
    float dX = (hDL + 2.0 * hL + hUL) - (hDR + 2.0 * hR + hUR);
    float dZ = (hDL + 2.0 * hD + hDR) - (hUL + 2.0 * hU + hUR);

    vec3 normal = normalize(vec3(dX * 0.25 * uNormalStrength, 1.0, dZ * 0.25 * uNormalStrength));
    gl_FragColor = vec4((normal * 0.5) + 0.5, (softH * 0.5) + 0.5);
  }
`;

export const probeFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uState;
  uniform sampler2D uNormalMap;
  uniform vec2 uProbeUv[5];

  vec2 readProbeUv(float index) {
    vec2 probeUv = uProbeUv[0];

    for (int i = 0; i < 5; i += 1) {
      if (abs(index - float(i)) < 0.5) {
        probeUv = uProbeUv[i];
      }
    }

    return probeUv;
  }

  void main() {
    float index = floor(vUv.x * 5.0);
    vec2 probeUv = clamp(readProbeUv(index), 0.001, 0.999);

    float height = texture2D(uState, probeUv).r;
    vec3 normal = texture2D(uNormalMap, probeUv).rgb * 2.0 - 1.0;

    gl_FragColor = vec4(
      clamp((height * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.x * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.z * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.y * 0.5) + 0.5, 0.0, 1.0)
    );
  }
`;

export const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vSurfaceWorldPosition;
  varying vec3 vWaterNormal;
  varying float vHeightSample;
  varying float vNormalHeight;

  uniform sampler2D uState;
  uniform sampler2D uNormalMap;
  uniform float uWaveAmplitude;
  uniform float uWaveChoppiness;
  uniform float uWaveLength;

  vec3 decodeNormal(vec3 packedNormal) {
    return normalize((packedNormal * 2.0) - 1.0);
  }

  void main() {
    vUv = uv;

    float rawHeightSample = texture2D(uState, uv).r;
    float softHeightSample = texture2D(uNormalMap, uv).a * 2.0 - 1.0;
    float heightSample = mix(rawHeightSample, softHeightSample, 0.84);
    float displacement = heightSample * uWaveAmplitude;
    vec3 displacedPosition = csm_Position;
    float choppiness = clamp(uWaveChoppiness, 0.0, 1.25);
    vec3 worldNormal = decodeNormal(texture2D(uNormalMap, uv).rgb);

    displacedPosition.x += worldNormal.x * displacement * choppiness * 0.34;
    displacedPosition.y -= worldNormal.z * displacement * choppiness * 0.34;
    displacedPosition.z += displacement;

    vWaterNormal = worldNormal;
    vHeightSample = heightSample;
    vNormalHeight = texture2D(uNormalMap, uv).a;

    csm_Position = displacedPosition;
    csm_Normal = normalize(vec3(worldNormal.x, -worldNormal.z, worldNormal.y));

    vec4 surfaceWorldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vSurfaceWorldPosition = surfaceWorldPosition.xyz;
  }
`;

export const waterFragmentShader = `
  varying vec2 vUv;
  varying vec3 vSurfaceWorldPosition;
  varying vec3 vWaterNormal;
  varying float vHeightSample;
  varying float vNormalHeight;

  uniform vec3 uEnvTint;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonSpecularStrength;
  uniform float uMoonSpecularPower;
  uniform float uWaterDepth;
  uniform float uWaterTurbidity;
  uniform int uDebugView;

  void main() {
    vec3 surfaceNormal = normalize(vWaterNormal);
    vec3 viewDir = normalize(cameraPosition - vSurfaceWorldPosition);
    vec3 lightDir = normalize(uMoonDirection);
    float fresnel = pow(1.0 - max(dot(surfaceNormal, viewDir), 0.0), 5.0);
    float slope = 1.0 - clamp(surfaceNormal.y, 0.0, 1.0);
    float depthFactor = clamp(uWaterDepth / 8.0, 0.0, 1.0);
    float moonHighlight = pow(max(dot(surfaceNormal, normalize(viewDir + lightDir)), 0.0), uMoonSpecularPower)
      * uMoonSpecularStrength
      * fresnel;

    float causticsPreview = pow(clamp(slope * 1.8, 0.0, 1.0), 1.5);

    if (uDebugView == 1) {
      float normalizedHeight = clamp((vHeightSample * 0.5) + 0.5, 0.0, 1.0);
      csm_DiffuseColor = vec4(vec3(normalizedHeight), 1.0);
      csm_Transmission = 0.0;
      csm_UnlitFac = 1.0;
      return;
    }

    if (uDebugView == 2) {
      csm_DiffuseColor = vec4((surfaceNormal * 0.5) + 0.5, 1.0);
      csm_Transmission = 0.0;
      csm_UnlitFac = 1.0;
      return;
    }

    if (uDebugView == 3) {
      csm_DiffuseColor = vec4(vec3(causticsPreview), 1.0);
      csm_Transmission = 0.0;
      csm_UnlitFac = 1.0;
      return;
    }

    if (uDebugView == 4) {
      csm_DiffuseColor = vec4(vec3(0.04, 0.06, 0.09), 1.0);
      csm_Transmission = 0.0;
      csm_UnlitFac = 1.0;
      return;
    }

    vec3 deepWater = mix(vec3(0.008, 0.011, 0.017), uEnvTint * 0.1, fresnel * 0.38);
    vec3 emissive = uEnvTint * (0.022 + fresnel * 0.03) + uMoonColor * moonHighlight * 0.45;

    float transparency = (1.0 - uWaterTurbidity);
    float opacity = mix(0.75, 0.99, fresnel * 0.4 + uWaterTurbidity * 0.5);
    
    csm_DiffuseColor = vec4(deepWater, opacity);
    csm_Emissive = emissive;
    csm_Roughness = clamp(mix(0.18, 0.04, fresnel) + slope * 0.05 + (1.0 - vNormalHeight) * 0.05, 0.03, 0.36);
    csm_Metalness = 0.06;
    csm_Clearcoat = 1.0;
    csm_ClearcoatRoughness = clamp(mix(0.2, 0.035, fresnel), 0.03, 0.26);
    csm_Transmission = mix(0.1, 0.85, transparency * (1.0 - fresnel * 0.6));
    csm_Thickness = 1.45 + depthFactor * 1.9;
  }
`;

export const seabedVertexShader = `
  varying vec2 vUv;
  varying vec3 vSeabedWorldPosition;
  varying float vRelief;

  uniform float uReliefStrength;
  uniform float uReliefScale;

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

  float sampleRelief(vec2 p) {
    return (fbm(p * uReliefScale) - 0.5) * uReliefStrength;
  }

  void main() {
    vUv = uv;

    float relief = sampleRelief(uv);
    float e = 0.015;
    float dx = sampleRelief(uv + vec2(e, 0.0)) - relief;
    float dy = sampleRelief(uv + vec2(0.0, e)) - relief;

    vec3 displacedPosition = csm_Position;
    displacedPosition.z += relief;
    csm_Position = displacedPosition;
    csm_Normal = normalize(vec3(-dx, -dy, 1.0));

    vRelief = relief;
    vSeabedWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
  }
`;

export const seabedFragmentShader = `
  varying vec2 vUv;
  varying vec3 vSeabedWorldPosition;
  varying float vRelief;

  uniform sampler2D uState;
  uniform sampler2D uNormalMap;
  uniform vec2 uStateResolution;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uWaterDepth;
  uniform float uCausticsIntensity;
  uniform float uCausticsScale;
  uniform float uCausticsSharpness;
  uniform sampler2D uSeabedTexture;
  uniform float uSeabedTextureScale;
  uniform float uSeabedSaturation;
  uniform float uSeabedBrightness;
  uniform int uDebugView;

  vec3 decodeNormal(vec3 packedNormal) {
    return normalize((packedNormal * 2.0) - 1.0);
  }

  vec3 applySaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
  }

  void main() {
    vec2 texel = 1.0 / uStateResolution;
    float h = texture2D(uState, vUv).r;
    float hL = texture2D(uState, vUv - vec2(texel.x, 0.0)).r;
    float hR = texture2D(uState, vUv + vec2(texel.x, 0.0)).r;
    float hD = texture2D(uState, vUv - vec2(0.0, texel.y)).r;
    float hU = texture2D(uState, vUv + vec2(0.0, texel.y)).r;

    vec3 waterNormal = decodeNormal(texture2D(uNormalMap, vUv).rgb);
    vec3 waterNormalL = decodeNormal(texture2D(uNormalMap, vUv - vec2(texel.x, 0.0)).rgb);
    vec3 waterNormalR = decodeNormal(texture2D(uNormalMap, vUv + vec2(texel.x, 0.0)).rgb);
    vec3 waterNormalD = decodeNormal(texture2D(uNormalMap, vUv - vec2(0.0, texel.y)).rgb);
    vec3 waterNormalU = decodeNormal(texture2D(uNormalMap, vUv + vec2(0.0, texel.y)).rgb);
    vec3 lightDir = normalize(uMoonDirection);
    vec3 refracted = refract(-lightDir, waterNormal, 0.75);
    vec3 refractedL = refract(-lightDir, waterNormalL, 0.75);
    vec3 refractedR = refract(-lightDir, waterNormalR, 0.75);
    vec3 refractedD = refract(-lightDir, waterNormalD, 0.75);
    vec3 refractedU = refract(-lightDir, waterNormalU, 0.75);
    float curvature = length(vec2(hR - hL, hU - hD));
    float projectionScale = 0.06 * uCausticsScale;

    float travel = uWaterDepth / max(-refracted.y, 0.2);
    float travelL = uWaterDepth / max(-refractedL.y, 0.2);
    float travelR = uWaterDepth / max(-refractedR.y, 0.2);
    float travelD = uWaterDepth / max(-refractedD.y, 0.2);
    float travelU = uWaterDepth / max(-refractedU.y, 0.2);

    vec2 projected = vUv + refracted.xz * travel * projectionScale;
    vec2 projectedL = (vUv - vec2(texel.x, 0.0)) + refractedL.xz * travelL * projectionScale;
    vec2 projectedR = (vUv + vec2(texel.x, 0.0)) + refractedR.xz * travelR * projectionScale;
    vec2 projectedD = (vUv - vec2(0.0, texel.y)) + refractedD.xz * travelD * projectionScale;
    vec2 projectedU = (vUv + vec2(0.0, texel.y)) + refractedU.xz * travelU * projectionScale;

    vec2 dProjectedX = (projectedR - projectedL) * 0.5;
    vec2 dProjectedY = (projectedU - projectedD) * 0.5;
    float area = abs(dProjectedX.x * dProjectedY.y - dProjectedX.y * dProjectedY.x);
    float focus = clamp(1.0 - area * 140.0, 0.0, 1.0);
    focus = pow(focus, mix(1.0, 4.2, clamp(uCausticsSharpness, 0.0, 1.0)));

    float slope = clamp(1.0 - waterNormal.y, 0.0, 1.0);
    float caustics = focus * (0.22 + slope * 1.4 + curvature * 10.0) * uCausticsIntensity;
    caustics *= clamp(dot(waterNormal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    caustics *= clamp(-refracted.y * 1.2, 0.0, 1.0);

    float depthValue = clamp((-vSeabedWorldPosition.y) / max(uWaterDepth + 1.5, 0.01), 0.0, 1.0);

    if (uDebugView == 3) {
      csm_DiffuseColor = vec4(vec3(caustics), 1.0);
      csm_UnlitFac = 1.0;
      return;
    }

    if (uDebugView == 4) {
      csm_DiffuseColor = vec4(vec3(depthValue, depthValue * 0.6, 1.0 - depthValue), 1.0);
      csm_UnlitFac = 1.0;
      return;
    }

    vec3 seabedTexture = texture2D(uSeabedTexture, vUv * uSeabedTextureScale).rgb;
    seabedTexture = applySaturation(seabedTexture, uSeabedSaturation);
    seabedTexture *= uSeabedBrightness;

    vec3 baseColor = mix(vec3(0.06, 0.08, 0.1), vec3(0.1, 0.12, 0.15), clamp(vRelief + 0.5, 0.0, 1.0));
    baseColor = mix(baseColor, seabedTexture, 0.85); // Blend with texture
    baseColor *= exp(-uWaterDepth * 0.035); // Slightly less aggressive depth darkening
    vec3 causticColor = uMoonColor * caustics * 1.5; // Boost caustics intensity significantly

    csm_DiffuseColor = vec4(baseColor + causticColor * 0.5, 1.0);
    csm_Emissive = causticColor * 0.6; // Use emissive for caustics to glow through murky water
    csm_Roughness = clamp(0.75 - caustics * 0.25, 0.4, 0.95);
    csm_Metalness = 0.02;
  }
`;
