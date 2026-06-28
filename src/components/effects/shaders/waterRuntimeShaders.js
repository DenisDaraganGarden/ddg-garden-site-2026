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

  // Smoothly saturate toward a ceiling instead of hard-clipping, which flattens wave
  // crests into "canyons". Identity below the knee, gentle roll-off above it.
  float softLimit(float value, float knee, float ceiling) {
    float a = abs(value);
    float range = max(ceiling - knee, 0.0001);
    float over = max(a - knee, 0.0);
    float soft = knee + range * (1.0 - exp(-over / range));
    return sign(value) * mix(a, soft, step(knee, a));
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
      float falloff = exp(-(dist * dist) / (radius * radius));
      // Stir up concentric ripples (nearly zero-mean) instead of pressing a smooth
      // bowl, so dragging the cursor keeps making waves rather than flattening the water.
      float ring = sin((dist / radius) * 7.0 - uTime * 9.0);
      velocity += falloff * (ring - 0.12) * uRippleImpulse * uImpulseStrength * 0.5;
    }

    if (uAmbientWaveIntensity > 0.0) {
      float t = uTime * uAmbientWaveSpeed;
      float noiseVal = noise(vUv * 8.0 + t);
      noiseVal += noise(vUv * 16.0 - t * 0.5) * 0.5;
      velocity += (noiseVal - 0.75) * uAmbientWaveIntensity * 0.02;
    }

    height = softLimit(height, 0.55, 1.05);
    velocity = softLimit(velocity, 0.6, 1.0);

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
  uniform float uBoatReflectionIntensity;
  uniform float uReflectionActive;
  uniform float uWaterDepth;
  uniform float uWaterTurbidity;
  uniform sampler2D uReflectionTexture;
  uniform mat4 uReflectionMatrix;
  uniform int uDebugView;

  // Warm sunset sky, ported from the ocean prototype (getSkyColor)
  vec3 oceanSky(vec3 e, vec3 sunDir) {
    float ey = max(e.y, 0.0);
    float sh = clamp(sunDir.y * 1.6, 0.0, 1.0);
    vec3 zen = mix(vec3(0.09, 0.15, 0.16), vec3(0.10, 0.30, 0.40), sh);
    vec3 hor = mix(vec3(0.34, 0.42, 0.37), vec3(0.55, 0.72, 0.74), sh);
    vec3 sky = mix(hor, zen, pow(ey, 0.5 + sh * 0.3));
    float sd = max(dot(e, sunDir), 0.0);
    vec3 sc = mix(vec3(0.70, 0.85, 0.78), vec3(0.95, 1.0, 0.92), sh);
    sky += sc * (pow(sd, 800.0) * 6.0 + pow(sd, 128.0) * 0.8 + pow(sd, 8.0) * 0.25);
    return sky;
  }

  void main() {
    vec3 surfaceNormal = normalize(vWaterNormal);
    vec3 viewDir = normalize(cameraPosition - vSurfaceWorldPosition);
    vec3 lightDir = normalize(uMoonDirection);
    float ndv = max(dot(surfaceNormal, viewDir), 0.0);
    float fresnel = pow(1.0 - ndv, 4.0);
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

    // ---- Adapted ocean look (ported from the ocean prototype) ----
    // Reflected view ray, kept pointing at the sky dome
    vec3 reflectDir = reflect(-viewDir, surfaceNormal);
    reflectDir.y = abs(reflectDir.y);

    // Warm sunset sky used as the water's reflected environment
    vec3 skyReflection = oceanSky(reflectDir, lightDir);

    // Strong Fresnel: deep & colourful looking down, mirror-bright at grazing angles
    float fres = clamp(1.0 - dot(surfaceNormal, viewDir), 0.0, 1.0);
    fres = 0.03 + 0.97 * pow(fres, 4.0);

    // Deep ocean body, warmed slightly on the crests (subsurface scatter)
    vec3 deepOcean = vec3(0.014, 0.046, 0.060);
    float crest = clamp(vHeightSample * 0.6 + 0.3, 0.0, 1.0);
    vec3 waterBody = deepOcean + vec3(0.05, 0.16, 0.16) * crest * 0.5;
    waterBody = mix(waterBody, uEnvTint * 0.18, fres * 0.25);

    vec3 reflection = skyReflection;

    // Planar reflection (boat & scene) overlaid so objects still mirror in the water
    vec4 reflectPos = uReflectionMatrix * vec4(vSurfaceWorldPosition, 1.0);
    vec2 reflectUv = (reflectPos.xy / max(reflectPos.w, 0.0001)) * 0.5 + 0.5;
    float distortion = mix(0.006, 0.018, slope) * (0.52 + abs(vHeightSample) * 0.58);
    reflectUv += surfaceNormal.xz * distortion;
    vec2 clampedReflectUv = clamp(reflectUv, vec2(0.001), vec2(0.999));
    vec2 aaOffset = max(fwidth(clampedReflectUv), vec2(0.00045)) * mix(0.9, 1.6, slope);
    vec4 reflectedCenter = texture2D(uReflectionTexture, clampedReflectUv);
    vec2 aaOffsetX = vec2(aaOffset.x, 0.0);
    vec2 aaOffsetY = vec2(0.0, aaOffset.y);
    vec3 reflectedRgb = reflectedCenter.rgb * 0.45;
    reflectedRgb += texture2D(uReflectionTexture, clamp(clampedReflectUv + aaOffsetX, vec2(0.001), vec2(0.999))).rgb * 0.1375;
    reflectedRgb += texture2D(uReflectionTexture, clamp(clampedReflectUv - aaOffsetX, vec2(0.001), vec2(0.999))).rgb * 0.1375;
    reflectedRgb += texture2D(uReflectionTexture, clamp(clampedReflectUv + aaOffsetY, vec2(0.001), vec2(0.999))).rgb * 0.1375;
    reflectedRgb += texture2D(uReflectionTexture, clamp(clampedReflectUv - aaOffsetY, vec2(0.001), vec2(0.999))).rgb * 0.1375;

    vec2 edgeSoftness = vec2(0.08);
    vec2 lowerMask = smoothstep(vec2(0.0), edgeSoftness, reflectUv);
    vec2 upperMask = 1.0 - smoothstep(vec2(1.0) - edgeSoftness, vec2(1.0), reflectUv);
    float inBounds = clamp(lowerMask.x * lowerMask.y * upperMask.x * upperMask.y, 0.0, 1.0);
    float boatMirror = reflectedCenter.a * (0.3 + 0.5 * fres) * inBounds * uReflectionActive
      * clamp(uBoatReflectionIntensity, 0.0, 1.5);
    reflection = mix(reflection, reflectedRgb, boatMirror);

    // Sun glints + warm sun path along the reflected sun direction (prototype-style)
    float sunAlign = max(dot(reflectDir, lightDir), 0.0);
    float sunCore = pow(sunAlign, 320.0) * 5.0;
    float sunPath = pow(sunAlign, 18.0) * (0.4 + fres * 1.8);
    vec3 sun = uMoonColor * (sunCore + sunPath);

    // Transparent ocean: looking straight down the water clears so the caustic seabed
    // shows through; at grazing angles the warm sky takes over (Fresnel).
    float seeThrough = 1.0 - fres;
    float transparency = clamp(0.5 * seeThrough * (1.0 - uWaterTurbidity) + 0.04, 0.05, 0.5);
    float opacity = clamp(mix(0.62, 0.99, fres) + uWaterTurbidity * 0.12, 0.6, 0.99);

    csm_DiffuseColor = vec4(waterBody, opacity);
    csm_Emissive = reflection * fres + sun;
    csm_Roughness = clamp(mix(0.08, 0.02, fres) + slope * 0.04, 0.015, 0.22);
    csm_Metalness = 0.0;
    csm_Clearcoat = 1.0;
    csm_ClearcoatRoughness = clamp(mix(0.18, 0.03, fres), 0.03, 0.22);
    csm_Transmission = transparency;
    csm_Thickness = 1.2;
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

  uniform sampler2D uNormalMap;
  uniform vec2 uStateResolution;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uTime;
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

  float sampleSmoothHeight(vec2 uv) {
    return texture2D(uNormalMap, uv).a * 2.0 - 1.0;
  }

  void main() {
    vec2 texel = 1.0 / uStateResolution;
    float h = sampleSmoothHeight(vUv);
    float hL = sampleSmoothHeight(vUv - vec2(texel.x, 0.0));
    float hR = sampleSmoothHeight(vUv + vec2(texel.x, 0.0));
    float hD = sampleSmoothHeight(vUv - vec2(0.0, texel.y));
    float hU = sampleSmoothHeight(vUv + vec2(0.0, texel.y));

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
    float sharpness = clamp(uCausticsSharpness, 0.0, 1.0);
    float focus = 1.0 / (1.0 + area * mix(160.0, 520.0, sharpness));
    focus = pow(focus, mix(0.9, 2.8, sharpness));
    // Dual-layer animated caustic network (cheap: one extra sin) — more organic & lively,
    // plus a squared term that sharpens the bright veins.
    float flow = 0.84 + 0.16 * sin((projected.x * 21.0 + projected.y * 19.0) + uTime * 1.15);
    float flow2 = 0.84 + 0.16 * sin((projected.y * 27.0 - projected.x * 24.0) - uTime * 0.85);
    float network = focus * mix(flow, flow2, 0.5) + focus * focus * 0.6;

    float slope = clamp(1.0 - waterNormal.y, 0.0, 1.0);
    float waveEnergy = clamp(curvature * 6.5 + abs(h) * 0.9, 0.0, 1.6);
    float depthAbsorption = exp(-uWaterDepth * 0.16);
    float substrateLuma = dot(texture2D(uSeabedTexture, projected * uSeabedTextureScale).rgb, vec3(0.299, 0.587, 0.114));
    float substrateMask = mix(0.82, 1.18, clamp(substrateLuma, 0.0, 1.0));
    float caustics = network * (0.45 + slope * 0.95 + waveEnergy * 0.62) * uCausticsIntensity;
    caustics *= clamp(dot(waterNormal, vec3(0.0, 1.0, 0.0)), 0.25, 1.0);
    caustics *= clamp(-refracted.y * 1.2, 0.0, 1.0);
    caustics *= mix(0.65, 1.0, depthAbsorption);
    caustics *= substrateMask;

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
    baseColor = mix(baseColor, seabedTexture, 0.68);
    baseColor *= exp(-uWaterDepth * 0.11);
    // Chromatic dispersion: bright vein cores skew warm, faint edges skew cool (cheap tint)
    float causticChroma = clamp(caustics * 1.4, 0.0, 1.0);
    vec3 causticTint = mix(vec3(0.7, 0.85, 1.15), vec3(1.18, 1.0, 0.72), causticChroma);
    vec3 causticColor = uMoonColor * caustics * causticTint * 1.12;

    csm_DiffuseColor = vec4(baseColor + causticColor * 0.26, 1.0);
    csm_Emissive = causticColor * 0.1;
    csm_Roughness = clamp(0.78 - caustics * 0.18, 0.45, 0.95);
    csm_Metalness = 0.02;
  }
`;
