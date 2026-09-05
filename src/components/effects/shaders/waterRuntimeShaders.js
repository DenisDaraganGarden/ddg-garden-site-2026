import { coastShader } from '../../../terrain/terrainShader.js';
export const POND_SEAM_EDGE_DAMPING = 0.68;
export const fullScreenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const simulationFragmentShader = `
  ${coastShader}
  uniform float uWaterExtent;
  uniform float uBoundaryBlendUv;
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

    // Do not saturate ordinary crests toward a shared height: that creates the
    // visible "invisible plateau". Excess energy gets a gradual restoring force,
    // while the distant clamp only protects the float target from runaway values.
    float excessHeight = max(abs(height) - 0.72, 0.0);
    velocity -= sign(height) * excessHeight * 0.055 * frameScale;
    float excessVelocity = max(abs(velocity) - 0.85, 0.0);
    velocity /= 1.0 + excessVelocity * 0.12 * frameScale;
    height = clamp(height, -2.4, 2.4);
    velocity = clamp(velocity, -2.2, 2.2);

    if(uCoastShape.x>.5){
      vec2 worldXZ=vec2(vUv.x-.5,.5-vUv.y)*uWaterExtent;
      float wet=smoothstep(0.0,.35,-coastHeight(coastLocal(worldXZ)))*coastPondWeight(coastLocal(worldXZ));
      height*=wet;velocity*=wet;
    }
    // The render target clamps at its finite border. A shared sponge removes
    // outgoing cursor-wave energy before it can reflect from that invisible
    // square, while WaterSurface/FarWater crossfade over the same width.
    float edgeDistance=min(min(vUv.x,vUv.y),min(1.0-vUv.x,1.0-vUv.y));
    float edgeFade=smoothstep(0.0,uBoundaryBlendUv,edgeDistance);
    velocity*=pow(mix(${POND_SEAM_EDGE_DAMPING.toFixed(2)},1.0,edgeFade),frameScale);
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

    float rawHeight = texture2D(uState, probeUv).r;
    vec4 normalSample = texture2D(uNormalMap, probeUv);
    float smoothHeight = normalSample.a * 2.0 - 1.0;
    // Match the visible surface vertex displacement exactly. This prevents
    // the boat from leading or exaggerating the wave underneath it.
    float height = mix(rawHeight, smoothHeight, 0.84);
    vec3 normal = normalSample.rgb * 2.0 - 1.0;

    gl_FragColor = vec4(
      clamp((height * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.x * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.z * 0.5) + 0.5, 0.0, 1.0),
      clamp((normal.y * 0.5) + 0.5, 0.0, 1.0)
    );
  }
`;



export const seabedVertexShader = `
  uniform float uWaterExtent;
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
    csm_Normal = normalize(vec3(-dx / (e * uWaterExtent), -dy / (e * uWaterExtent), 1.0));

    vRelief = relief;
    vSeabedWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
  }
`;

export const seabedFragmentShader = `
  ${coastShader}
  varying vec2 vUv;
  varying vec3 vSeabedWorldPosition;
  varying float vRelief;

  uniform sampler2D uNormalMap;
  uniform vec2 uStateResolution;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonIntensity;
  uniform float uTime;
  uniform float uWaterDepth;
  uniform float uWaterTurbidity;
  uniform vec3 uWaterScatteringColor;
  uniform float uWaterScatteringStrength;
  uniform vec3 uEnvironmentAmbientColor;
  uniform float uEnvironmentDiffuse;
  uniform float uCausticsIntensity;
  uniform float uCausticsScale;
  uniform float uCausticsSharpness;
  uniform sampler2D uSeabedTexture;
  uniform float uSeabedTextureScale;
  uniform float uSeabedSaturation;
  uniform float uSeabedBrightness;
  uniform float uSeabedVariation;
  uniform float uSeabedAoStrength;
  uniform float uReliefStrength;
  uniform int uWaterEngine;
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
    // Inside the coast band the terrain's own shelf is the bed. This plane
    // steps aside there in every view: a debug mode that drew it painted a
    // black plate over the shelf the mode was meant to measure.
    vec2 qs=coastLocal(vSeabedWorldPosition.xz);
    if(uCoastShape.x>.5 && abs(qs.y)<uCoastDimensions.x*.5 && qs.x>-96.0 && qs.x<uCoastDimensions.y)discard;
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
    float turbidity = clamp(uWaterTurbidity, 0.0, 1.0);
    float scatteringDensity = turbidity * (0.45 + 0.55 * turbidity);
    float depthAbsorption = exp(-uWaterDepth * (0.015 + scatteringDensity * 0.55));
    float substrateLuma = dot(texture2D(uSeabedTexture, projected * uSeabedTextureScale).rgb, vec3(0.299, 0.587, 0.114));
    float substrateMask = mix(0.82, 1.18, clamp(substrateLuma, 0.0, 1.0));
    float legacyCaustics = network * (0.45 + slope * 0.95 + waveEnergy * 0.62) * uCausticsIntensity;

    // Water V2 follows the differential-area idea used by the reference water
    // demo: a refracted patch becomes bright only where rays truly converge.
    // The old shader treated almost the entire floor as focused light, which
    // washed out shadows and made the caustics look like a soft overlay.
    float flatArea = max(texel.x * texel.y, 0.00000001);
    float compression = clamp(flatArea / max(area, flatArea * 0.12), 0.0, 7.0);
    float focusThreshold = mix(1.02, 1.34, sharpness);
    float focusedVeins = smoothstep(focusThreshold, focusThreshold + mix(0.5, 0.16, sharpness), compression);
    float causticsV2 = (focusedVeins * 0.72 + max(compression - 1.0, 0.0) * 0.16)
      * (0.5 + waveEnergy * 0.72)
      * uCausticsIntensity;
    causticsV2 *= 0.86 + 0.14 * mix(flow, flow2, 0.5);

    float caustics = uWaterEngine == 1 ? causticsV2 : legacyCaustics;
    caustics *= clamp(dot(waterNormal, vec3(0.0, 1.0, 0.0)), 0.25, 1.0);
    caustics *= clamp(-refracted.y * 1.2, 0.0, 1.0);
    caustics *= depthAbsorption;
    caustics *= clamp(uMoonIntensity, 0.0, 4.0);
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

    vec2 seabedUv = vUv * uSeabedTextureScale;
    vec3 primaryTexture = texture2D(uSeabedTexture, seabedUv).rgb;
    mat2 detailRotation = mat2(0.819, -0.574, 0.574, 0.819);
    vec3 broadTexture = texture2D(
      uSeabedTexture,
      detailRotation * seabedUv * 0.37 + vec2(0.173, 0.619)
    ).rgb;
    float broadLuma = dot(broadTexture, vec3(0.299, 0.587, 0.114));
    vec3 variedTexture = primaryTexture
      * mix(vec3(0.72), broadTexture * 1.42, 0.58)
      * mix(0.82, 1.18, broadLuma);
    vec3 seabedTexture = mix(
      primaryTexture,
      variedTexture,
      clamp(uSeabedVariation, 0.0, 1.0)
    );
    seabedTexture = applySaturation(seabedTexture, uSeabedSaturation);
    seabedTexture *= uSeabedBrightness;

    vec3 baseColor = mix(vec3(0.06, 0.08, 0.1), vec3(0.1, 0.12, 0.15), clamp(vRelief + 0.5, 0.0, 1.0));
    baseColor = mix(baseColor, seabedTexture, 0.68);
    float reliefRange = max(abs(uReliefStrength), 0.001);
    float normalizedRelief = clamp(vRelief / reliefRange + 0.5, 0.0, 1.0);
    float reliefCavity = 1.0 - smoothstep(0.14, 0.58, normalizedRelief);
    float textureCavity = 1.0 - smoothstep(0.16, 0.54, broadLuma);
    float contactAo = clamp(
      1.0 - clamp(uSeabedAoStrength, 0.0, 1.0)
        * (reliefCavity * 0.46 + textureCavity * 0.2),
      0.48,
      1.0
    );
    float ambientLuma = max(
      dot(uEnvironmentAmbientColor, vec3(0.2126, 0.7152, 0.0722)),
      0.001
    );
    vec3 ambientChroma = clamp(
      uEnvironmentAmbientColor / ambientLuma,
      vec3(0.58),
      vec3(1.55)
    );
    baseColor *= mix(
      vec3(1.0),
      ambientChroma,
      clamp(uEnvironmentDiffuse, 0.0, 2.2) * 0.16
    );
    baseColor *= contactAo;
    float bottomScatter = (
      1.0 - exp(
        -uWaterDepth
        * turbidity
        * clamp(uWaterScatteringStrength, 0.0, 1.5)
        * 0.11
      )
    ) * 0.34;
    baseColor = mix(
      baseColor,
      max(uWaterScatteringColor, vec3(0.002)) * 0.42,
      clamp(bottomScatter, 0.0, 0.34)
    );
    // Water V2 applies the single view-path absorption pass while compositing
    // refraction. Darkening the floor here as well caused the old double haze.
    // Chromatic dispersion: bright vein cores skew warm, faint edges skew cool (cheap tint)
    float causticChroma = clamp(caustics * 1.4, 0.0, 1.0);
    vec3 causticTint = mix(vec3(0.7, 0.85, 1.15), vec3(1.18, 1.0, 0.72), causticChroma);
    vec3 causticColor = uMoonColor * caustics * causticTint * 1.12;

    if (uWaterEngine == 1) {
      // Keep the caustic contribution inside the regular lit material so the
      // boat and sculpture shadows remain dark. Emissive light would bypass
      // those shadows and recreate the milky look of the legacy water.
      vec3 causticLight = clamp(causticColor * 0.68, vec3(0.0), vec3(2.2));
      csm_DiffuseColor = vec4(baseColor * (vec3(1.0) + causticLight), 1.0);
      csm_Emissive = vec3(0.0);
      csm_Roughness = clamp(0.84 - caustics * 0.08, 0.58, 0.94);
    } else {
      csm_DiffuseColor = vec4(baseColor + causticColor * 0.26, 1.0);
      csm_Emissive = causticColor * 0.1;
      csm_Roughness = clamp(0.78 - caustics * 0.18, 0.45, 0.95);
    }
    csm_Metalness = 0.02;
  }
`;
