import * as THREE from 'three';
import { rcasShaderChunk } from './spatialUpscale.js';
import { DDG_CLOUD_SHADOW_GLSL } from './sky/painterly/cloudShadowRuntime.js';
export const FILM_NOISE_TEXTURE_SIZE = 512;

export const postVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Bloom is prepared away from the full-resolution grading pass. A soft-knee
// luminance prefilter keeps saturated skies out of the glow, then two cheap
// tent passes at quarter resolution produce a round, optical falloff instead of
// the old full-resolution cross of isolated taps.
// One non-finite pixel anywhere in the scene does not stay one pixel. The bloom
// prefilter drops it to quarter resolution, two tent passes spread it across ten
// texels there, and the composite adds the result back: a hard black 40-pixel
// square, wherever it happened, on about one frame in fifteen. Every comparison
// against NaN is false, so the test below catches it; it is written as a
// negation because the positive form is what a fast-math compiler folds away.
//
// This is a net under the shaders, not a repair of one: the pixel that went
// non-finite is still somewhere upstream, and worth finding if it ever costs
// more than the three instructions this pass spends.
const finiteColorChunk = `
  vec3 finiteColor(vec3 color) {
    if (!(dot(color, vec3(1.0)) >= 0.0)) {
      return vec3(0.0);
    }

    return color;
  }
`;

export const bloomPrefilterFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uColorTexture;
  uniform vec2 uTexelSize;
  uniform float uThreshold;

  ${finiteColorChunk}

  float bloomLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 bloomPrefilter(vec3 color) {
    float luminance = bloomLuminance(color);
    float threshold = uThreshold;
    float knee = max(0.06, threshold * 0.28);
    float soft = clamp((luminance - threshold + knee) / (2.0 * knee), 0.0, 1.0);
    soft = soft * soft * (3.0 - 2.0 * soft);
    float contribution = max(luminance - threshold, 0.0) + soft * knee;
    return color * (contribution / max(luminance, 0.0001));
  }

  void main() {
    vec2 halfTexel = uTexelSize * 0.5;
    vec3 color = texture2D(uColorTexture, vUv).rgb * 0.5;
    color += texture2D(uColorTexture, vUv + vec2(-halfTexel.x, -halfTexel.y)).rgb * 0.125;
    color += texture2D(uColorTexture, vUv + vec2( halfTexel.x, -halfTexel.y)).rgb * 0.125;
    color += texture2D(uColorTexture, vUv + vec2(-halfTexel.x,  halfTexel.y)).rgb * 0.125;
    color += texture2D(uColorTexture, vUv + vec2( halfTexel.x,  halfTexel.y)).rgb * 0.125;
    gl_FragColor = vec4(bloomPrefilter(finiteColor(color)), 1.0);
  }
`;

export const bloomBlurFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uBloomTexture;
  uniform vec2 uTexelSize;
  uniform float uOffset;

  void main() {
    vec2 offset = uTexelSize * uOffset;
    vec3 color = texture2D(uBloomTexture, vUv).rgb * 4.0;
    color += texture2D(uBloomTexture, vUv + vec2( offset.x, 0.0)).rgb * 2.0;
    color += texture2D(uBloomTexture, vUv + vec2(-offset.x, 0.0)).rgb * 2.0;
    color += texture2D(uBloomTexture, vUv + vec2(0.0,  offset.y)).rgb * 2.0;
    color += texture2D(uBloomTexture, vUv + vec2(0.0, -offset.y)).rgb * 2.0;
    color += texture2D(uBloomTexture, vUv + vec2( offset.x,  offset.y)).rgb;
    color += texture2D(uBloomTexture, vUv + vec2(-offset.x,  offset.y)).rgb;
    color += texture2D(uBloomTexture, vUv + vec2( offset.x, -offset.y)).rgb;
    color += texture2D(uBloomTexture, vUv + vec2(-offset.x, -offset.y)).rgb;
    gl_FragColor = vec4(color / 16.0, 1.0);
  }
`;

export const postFragmentShader = `
  varying vec2 vUv;

  ${finiteColorChunk}

  uniform sampler2D uColorTexture;
  uniform sampler2D uBloomTexture;
  uniform sampler2D uDepthTexture;
  uniform sampler2D uNoiseTexture;
  uniform sampler2D uFilmNoiseTexture;
  uniform vec2 uResolution;
  uniform float uFxaaEnabled;
  uniform float uUpscaleSharpness;
  uniform sampler2D uContactAoTexture;
  uniform sampler2D uContactAoDepthTexture;
  uniform vec2 uContactAoResolution;
  uniform float uContactAoEnabled;
  uniform vec2 uSunUv;
  uniform float uSunVisible;
  uniform vec3 uSunColor;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform mat4 uCameraProjectionInverse;
  uniform mat4 uCameraWorld;
  uniform vec3 uCameraWorldPosition;
  uniform float uTime;

  uniform float uGrainEnabled;
  uniform float uGrainIntensity;
  uniform float uGrainSize;
  uniform float uGrainSpeed;

  uniform float uFilmEnabled;
  uniform float uFilmStock;
  uniform float uFilmGrainAmount;
  uniform float uFilmGrainSize;
  uniform float uFilmDustAmount;
  uniform float uFilmScratchAmount;
  uniform float uFilmFlickerAmount;
  uniform float uFilmFlickerRate;
  uniform float uFilmGateWeaveAmount;
  uniform float uFilmGateWeaveRate;
  uniform float uFilmLowPower;

  uniform float uBloomEnabled;
  uniform float uBloomStrength;

  uniform float uContrast;
  uniform float uSaturation;
  uniform float uHue;
  uniform float uGamma;
  uniform float uExposure;

  uniform float uSunRaysEnabled;
  uniform float uSunRaysIntensity;
  uniform float uSunRaysDecay;
  uniform float uSunRaysDensity;
  uniform float uSunRaySampleCount;
  uniform float uSunRadius;
  uniform float uPainterlyCloudRays;
  uniform float uPainterlyCloudDay;

  uniform float uFogMode;
  uniform vec3 uFogColor;
  uniform vec3 uFogHorizonColor;
  uniform float uFogSkyTint;
  uniform float uFogDensity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogNoiseScale;
  uniform float uFogSpeed;
  uniform float uFogScattering;
  uniform float uFogSampleCount;

  uniform float uCursorLightActive;
  uniform vec2 uCursorLightUv;
  uniform float uCursorLightRadius;
  uniform float uCursorLightAspect;
  uniform float uCursorLightSoftness;
  uniform float uCursorLightFogRelief;

  #include <common>
  #include <dithering_pars_fragment>

  ${DDG_CLOUD_SHADOW_GLSL}

  ${rcasShaderChunk}
  #ifdef DDG_UPSCALE_PREPASS
    ${THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure', 'uToneMappingExposure')}
  #endif

  float getViewDistance(float depth) {
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    return max(exp2(depth * log2(uCameraFar + 1.0)) - 1.0, 0.0);
#else
    float viewZ = (uCameraNear * uCameraFar)
      / ((uCameraFar - uCameraNear) * depth - uCameraFar);
    return max(-viewZ, 0.0);
#endif
  }

  vec3 ddgPostViewRay(vec2 uv) {
    vec4 farView = uCameraProjectionInverse * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    return normalize(farView.xyz / max(farView.w, 0.00001));
  }

  vec3 ddgPostWorldRay(vec2 uv) {
    return normalize(mat3(uCameraWorld) * ddgPostViewRay(uv));
  }

  // getViewDistance is a camera-space Z distance. Convert it to distance along
  // this pixel's ray, then stop under the cloud slab and at opaque geometry.
  // An empty depth buffer is still allowed an 8 km atmospheric segment, which
  // keeps shafts visible through sky gaps when the sun is off-screen.
  float samplePainterlyCloudRays(vec2 uv, float viewDistance, float hasOpaqueDepth) {
    if (uDdgCloudShadowEnabled < 0.5 || uPainterlyCloudRays <= 0.0001 || uPainterlyCloudDay <= 0.0001) return 0.0;
    vec3 viewRay = ddgPostViewRay(uv);
    vec3 ray = normalize(mat3(uCameraWorld) * viewRay);
    float phase = pow(max(dot(ray, normalize(uDdgCloudShadowSun)), 0.0), 6.0);
    if (phase <= 0.00001 || uCameraWorldPosition.y >= uDdgCloudShadowAltitude) return 0.0;

    float rayDistance = hasOpaqueDepth > 0.5
      ? viewDistance / max(-viewRay.z, 0.0001)
      : 8000.0;
    float belowCloudDistance = 8000.0;
    if (ray.y > 0.0001) {
      belowCloudDistance = (uDdgCloudShadowAltitude - uCameraWorldPosition.y) / ray.y;
    }
    float visibleDistance = min(max(rayDistance, 0.0), max(belowCloudDistance, 0.0));
    if (visibleDistance <= 0.01) return 0.0;

    float transmission = 0.0;
    for (int index = 0; index < 4; index += 1) {
      float fraction = (float(index) + 0.5) * 0.25;
      vec3 worldPosition = uCameraWorldPosition + ray * (visibleDistance * fraction);
      transmission += ddgCloudTransmission(worldPosition);
    }
    // Shafts are only visible in participating air. This Beer term means a
    // foreground centimetre has effectively no haze while a kilometre does.
    float extinction = clamp(uFogDensity, 0.0, 1.0) * 0.00016
      * clamp(uFogScattering, 0.0, 1.0) * step(0.5, uFogMode);
    float medium = 1.0 - exp(-visibleDistance * extinction);
    return phase * (transmission * 0.25) * medium
      * clamp(uPainterlyCloudRays, 0.0, 1.0) * uPainterlyCloudDay;
  }

  float ddgLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // Namespaced adaptation of Three r183's FXAAShader. It stays in this grading
  // draw so fallback AA adds no target or draw; edge detection uses perceptual
  // luma while the sampled/result colour remains linear HDR.
  float ddgFxaaLuma(vec3 linearColor) {
    vec3 perceptual = pow(max(linearColor, vec3(0.0)), vec3(1.0 / 2.2));
    return dot(perceptual, vec3(0.3, 0.59, 0.11));
  }
  vec3 sampleAntiAliasedScene(vec2 uv) {
    vec3 center = texture2D(uColorTexture, uv).rgb;
    if (uFxaaEnabled < 0.5) return center;
    vec2 texel = 1.0 / max(uResolution, vec2(1.0));
    vec3 north = texture2D(uColorTexture, uv + vec2(0.0, texel.y)).rgb;
    vec3 south = texture2D(uColorTexture, uv - vec2(0.0, texel.y)).rgb;
    vec3 east = texture2D(uColorTexture, uv + vec2(texel.x, 0.0)).rgb;
    vec3 west = texture2D(uColorTexture, uv - vec2(texel.x, 0.0)).rgb;
    float m = ddgFxaaLuma(center), n = ddgFxaaLuma(north), s = ddgFxaaLuma(south), e = ddgFxaaLuma(east), w = ddgFxaaLuma(west);
    float ne = ddgFxaaLuma(texture2D(uColorTexture, uv + texel).rgb);
    float nw = ddgFxaaLuma(texture2D(uColorTexture, uv + vec2(-texel.x, texel.y)).rgb);
    float se = ddgFxaaLuma(texture2D(uColorTexture, uv + vec2(texel.x, -texel.y)).rgb);
    float sw = ddgFxaaLuma(texture2D(uColorTexture, uv - texel).rgb);
    float highest = max(max(max(n, e), max(s, w)), m);
    float lowest = min(min(min(n, e), min(s, w)), m);
    float contrast = highest - lowest;
    if (contrast < max(0.0312, highest * 0.063)) return center;
    float horizontal = abs(n + s - 2.0 * m) * 2.0 + abs(ne + se - 2.0 * e) + abs(nw + sw - 2.0 * w);
    float vertical = abs(e + w - 2.0 * m) * 2.0 + abs(ne + nw - 2.0 * n) + abs(se + sw - 2.0 * s);
    bool isHorizontal = horizontal >= vertical;
    float positive = isHorizontal ? n : e;
    float negative = isHorizontal ? s : w;
    float positiveGradient = abs(positive - m), negativeGradient = abs(negative - m);
    float pixelStep = isHorizontal ? texel.y : texel.x;
    float opposite = positive;
    float gradient = positiveGradient;
    if (positiveGradient < negativeGradient) { pixelStep = -pixelStep; opposite = negative; gradient = negativeGradient; }
    vec2 edgeUv = uv + (isHorizontal ? vec2(0.0, pixelStep * 0.5) : vec2(pixelStep * 0.5, 0.0));
    vec2 edgeStep = isHorizontal ? vec2(texel.x, 0.0) : vec2(0.0, texel.y);
    float edgeLuma = (m + opposite) * 0.5;
    float threshold = gradient * 0.25;
    vec2 plusUv = edgeUv + edgeStep, minusUv = edgeUv - edgeStep;
    float plusDistance = 1.0, minusDistance = 1.0;
    for (int i = 1; i < 6; i++) {
      float stepSize = i == 1 ? 1.5 : i < 5 ? 2.0 : 4.0;
      if (abs(ddgFxaaLuma(texture2D(uColorTexture, plusUv).rgb) - edgeLuma) < threshold) { plusUv += edgeStep * stepSize; plusDistance += stepSize; }
      if (abs(ddgFxaaLuma(texture2D(uColorTexture, minusUv).rgb) - edgeLuma) < threshold) { minusUv -= edgeStep * stepSize; minusDistance += stepSize; }
    }
    if (abs(ddgFxaaLuma(texture2D(uColorTexture, plusUv).rgb) - edgeLuma) < threshold) plusDistance += 8.0;
    if (abs(ddgFxaaLuma(texture2D(uColorTexture, minusUv).rgb) - edgeLuma) < threshold) minusDistance += 8.0;
    float edgeBlend = 0.5 - min(plusDistance, minusDistance) / max(plusDistance + minusDistance, 0.0001);
    float endDelta = ddgFxaaLuma(texture2D(uColorTexture, plusDistance <= minusDistance ? plusUv : minusUv).rgb) - edgeLuma;
    if ((endDelta >= 0.0) == (m - edgeLuma >= 0.0)) edgeBlend = 0.0;
    float filtered = abs((2.0 * (n + e + s + w) + ne + nw + se + sw) / 12.0 - m) / max(contrast, 0.0001);
    float subpixel = smoothstep(0.0, 1.0, clamp(filtered, 0.0, 1.0)); subpixel *= subpixel;
    float blend = max(subpixel, edgeBlend);
    vec2 resolvedUv = uv + (isHorizontal ? vec2(0.0, pixelStep * blend) : vec2(pixelStep * blend, 0.0));
    return texture2D(uColorTexture, resolvedUv).rgb;
  }

  // Eighteen steps along a ray, taken at the same fractional offsets by every
  // pixel, put every pixel's samples on the same rings around the sun. The eye
  // reads those rings as a stack of frames rather than as light. Starting each
  // pixel a random fraction of one step along its own ray scatters the rings
  // into noise, which at this sample count is what a shaft is supposed to look
  // like anyway. Interleaved gradient noise: three instructions, no texture, and
  // stable from frame to frame, so a still scene does not shimmer.
  float rayMarchDither(vec2 fragment) {
    return fract(52.9829189 * fract(dot(fragment, vec2(0.06711056, 0.00583715))));
  }

  float sampleSunRays(vec2 uv, vec2 sunUv) {
    float sampleCount = max(uSunRaySampleCount, 1.0);
    vec2 aspectScale = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 rayVector = uv - sunUv;
    vec2 stepVector = rayVector / sampleCount;
    vec2 sampleUv = uv + stepVector * rayMarchDither(gl_FragCoord.xy);
    float illumination = 1.0;
    float rays = 0.0;
    float sourceWeight = 0.0;
    float transmittance = 1.0;

    for (int index = 0; index < 18; index += 1) {
      if (float(index) >= uSunRaySampleCount) {
        break;
      }
      sampleUv -= stepVector;
      vec2 clampedSampleUv = clamp(sampleUv, 0.001, 0.999);
      vec3 sampleColor = texture2D(uColorTexture, clampedSampleUv).rgb;
      float sampleDepth = texture2D(uDepthTexture, clampedSampleUv).r;
      float skySource = smoothstep(0.997, 0.9999, sampleDepth);
      // March all the way to the actual disc. Geometry on that path attenuates
      // the source, so silhouettes cut real shafts instead of the whole bright
      // sky becoming one flat radial wash.
      transmittance *= mix(0.86, 1.0, skySource);
      float sourceDistance = length((clampedSampleUv - sunUv) * aspectScale);
      float sourceRadius = max(uSunRadius * 5.0, 0.018);
      float sourceMask = 1.0 - smoothstep(sourceRadius * 0.22, sourceRadius, sourceDistance);
      float sourceLuminance = smoothstep(0.32, 1.45, ddgLuminance(sampleColor));
      float source = sourceMask * sourceLuminance * skySource;
      rays += source * illumination * transmittance;
      sourceWeight += sourceMask * illumination;
      illumination *= clamp(uSunRaysDecay, 0.72, 0.995);
    }

    float distanceToSun = length(rayVector * aspectScale);
    float density = clamp(uSunRaysDensity / 1.5, 0.0, 1.0);
    float reach = mix(max(uSunRadius * 7.0, 0.08), 1.25, density);
    float reachMask = 1.0 - smoothstep(reach * 0.68, reach, distanceToSun);
    float screenMask = smoothstep(0.0, 0.08, sunUv.x)
      * (1.0 - smoothstep(0.92, 1.0, sunUv.x))
      * smoothstep(0.0, 0.08, sunUv.y)
      * (1.0 - smoothstep(0.92, 1.0, sunUv.y));
    return rays / max(sourceWeight, 0.025)
      * reachMask
      * screenMask
      * uSunVisible
      * 0.48;
  }

  float sampleFogNoise(vec2 uv, float distanceRatio, vec2 sunUv) {
    // The noise texture repeats, so dropping the integer part samples identically
    // while keeping the coordinate small - an unbounded uTime term loses float
    // precision over a long session and makes the fog shimmer on its own.
    vec2 drift = fract(vec2(uTime * uFogSpeed * 0.37, -uTime * uFogSpeed * 0.23));
    vec2 baseUv = uv * max(uFogNoiseScale, 0.1) + drift;
    float noiseValue = texture2D(uNoiseTexture, baseUv).r;

    if (uFogMode > 1.5) {
      float volume = 0.0;
      float weight = 0.0;
      for (int index = 0; index < 8; index += 1) {
        if (float(index) >= uFogSampleCount) break;
        float layer = (float(index) + 0.5) / max(uFogSampleCount, 1.0);
        vec2 layerUv = baseUv
          * (1.0 + layer * 0.72)
          + vec2(layer * 0.31, -layer * 0.19)
          // uSunUv is unbounded: with the key light above the frame it reaches ~4.7,
          // which turned this per-pixel, depth-driven warp into a jump of whole noise
          // tiles between neighbouring pixels. On an animated water surface that is
          // the flicker. Clamping keeps the parallax but bounds it to +/-0.14 uv.
          + (clamp(sunUv, 0.0, 1.0) - 0.5) * layer * distanceRatio * 0.28;
        float layerWeight = mix(1.0, 0.42, layer);
        volume += texture2D(uNoiseTexture, layerUv).r * layerWeight;
        weight += layerWeight;
      }
      noiseValue = volume / max(weight, 0.001);
    }

    return noiseValue;
  }

  float cursorFogMask(vec2 uv) {
    vec2 delta = uv - uCursorLightUv;
    delta.x *= max(uCursorLightAspect, 0.001);
    float radialDistance = length(delta) / max(uCursorLightRadius, 0.0001);
    // Even a hard optical spot must not cut a graphic hole into volumetric fog.
    // The authored softness still changes the roll-off, within a restrained range.
    float innerRadius = mix(0.72, 0.42, clamp(uCursorLightSoftness, 0.0, 1.0));
    return uCursorLightActive * (1.0 - smoothstep(innerRadius, 1.0, radialDistance));
  }

  vec3 rotateHue(vec3 color, float angle) {
    const mat3 rgbToYiq = mat3(
      0.299, 0.587, 0.114,
      0.596, -0.274, -0.322,
      0.211, -0.523, 0.312
    );
    const mat3 yiqToRgb = mat3(
      1.0, 0.956, 0.621,
      1.0, -0.272, -0.647,
      1.0, -1.106, 1.703
    );
    vec3 yiq = rgbToYiq * color;
    float cosine = cos(angle);
    float sine = sin(angle);
    yiq.yz = mat2(cosine, -sine, sine, cosine) * yiq.yz;
    return yiqToRgb * yiq;
  }

  float randomGrain(vec2 coordinate) {
    return fract(sin(dot(coordinate, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float filmHash(float value) {
    return fract(sin(value * 127.1 + 311.7) * 43758.5453123);
  }

  vec2 filmNoiseUv(vec2 pixelCell, float frame) {
    const float textureSize = ${FILM_NOISE_TEXTURE_SIZE.toFixed(1)};
    vec2 frameOffset = floor(
      vec2(filmHash(frame + 7.0), filmHash(frame + 23.0)) * textureSize
    );
    vec2 shiftedCell = pixelCell + frameOffset;
    vec2 tile = floor(shiftedCell / textureSize);
    vec2 localCell = mod(shiftedCell, textureSize);
    float tileSeed = frame * 173.0 + dot(tile, vec2(37.0, 91.0));

    // Every repeated source tile gets an independent orientation and phase.
    // The grain stays stable inside one film frame without revealing a digital grid.
    localCell = mix(localCell, localCell.yx, step(0.5, filmHash(tileSeed + 11.0)));
    localCell.x = mix(
      localCell.x,
      textureSize - 1.0 - localCell.x,
      step(0.5, filmHash(tileSeed + 17.0))
    );
    localCell.y = mix(
      localCell.y,
      textureSize - 1.0 - localCell.y,
      step(0.5, filmHash(tileSeed + 29.0))
    );
    vec2 tileOffset = floor(
      vec2(filmHash(tileSeed + 41.0), filmHash(tileSeed + 53.0)) * textureSize
    );
    localCell = mod(localCell + tileOffset, textureSize);
    return (localCell + 0.5) / textureSize;
  }

  // A shutter does not flutter at display refresh rate. It holds one exposure
  // for almost a whole film frame, then eases into the next one at the splice.
  float filmFlickerEv() {
    float rate = clamp(uFilmFlickerRate, 0.5, 24.0);
    float frame = floor(uTime * rate);
    float phase = fract(uTime * rate);
    float splice = smoothstep(0.80, 1.0, phase);
    float current = filmHash(frame) * 2.0 - 1.0;
    float next = filmHash(frame + 1.0) * 2.0 - 1.0;
    return mix(current, next, splice) * uFilmFlickerAmount;
  }

  vec2 filmGateOffset() {
    float rate = clamp(uFilmGateWeaveRate, 0.25, 12.0);
    float t = uTime * rate;
    float frame = floor(t);
    float phase = fract(t);
    vec2 current = vec2(filmHash(frame + 17.0), filmHash(frame + 59.0)) * 2.0 - 1.0;
    vec2 next = vec2(filmHash(frame + 18.0), filmHash(frame + 60.0)) * 2.0 - 1.0;
    // A gentle eased hand-off avoids electronic looking vibration.
    vec2 held = mix(current, next, smoothstep(0.72, 1.0, phase));
    return held * uFilmGateWeaveAmount / max(uResolution, vec2(1.0));
  }

  vec3 sampleEmulsion(vec2 pixelCell, float frame, float blend) {
    // Consecutive calls address consecutive deterministic film frames, so the
    // temporal crossfade is continuous while each large tile is decorrelated.
    vec3 a = texture2D(uFilmNoiseTexture, filmNoiseUv(pixelCell, frame)).rgb;
    vec3 b = texture2D(uFilmNoiseTexture, filmNoiseUv(pixelCell, frame + 1.0)).rgb;
    // A straight temporal mix loses variance around the half-way point. Restore
    // it so grain density stays constant through the otherwise smooth transition.
    float varianceCompensation = inversesqrt(
      (1.0 - blend) * (1.0 - blend) + blend * blend
    );
    return (mix(a, b, blend) - 0.5) * varianceCompensation;
  }

  float filmGrainCadence() {
    if (uFilmStock > 0.5 && uFilmStock < 1.5) return 24.0; // 35mm
    if (uFilmStock < 2.5) return 18.0; // 16mm
    if (uFilmStock < 3.5) return 12.0; // 8mm
    return 18.0;
  }

  vec3 applyFilmStock(vec3 color) {
    // Profiles are deliberately restrained: the authored grade remains the
    // primary look and these only supply the stock's density response.
    float luma = ddgLuminance(color);
    if (uFilmStock < 0.5) return color; // neutral
    if (uFilmStock < 1.5) { // 35mm
      return mix(vec3(luma), color, 0.93) * vec3(1.015, 1.0, 0.985);
    }
    if (uFilmStock < 2.5) { // 16mm
      vec3 tinted = color * vec3(1.035, 1.0, 0.94);
      return mix(vec3(ddgLuminance(tinted)), tinted, 0.79) + vec3(0.004, 0.003, 0.0);
    }
    if (uFilmStock < 3.5) { // 8mm
      vec3 tinted = color * vec3(1.08, 1.0, 0.84);
      return mix(vec3(ddgLuminance(tinted)), tinted, 0.68) + vec3(0.012, 0.008, 0.003);
    }
    if (uFilmStock < 4.5) { // monochrome
      return vec3(luma * 0.96 + 0.008);
    }
    if (uFilmStock < 5.5) { // sepia
      return vec3(luma * 1.08, luma * 0.91, luma * 0.62) + vec3(0.008, 0.004, 0.0);
    }
    // faded
    return mix(vec3(luma + 0.025), color, 0.58) * vec3(1.02, 1.0, 0.94);
  }

  float filmDust(vec2 uv, float bucket) {
    float result = 0.0;
    for (int index = 0; index < 4; index += 1) {
      if (uFilmLowPower > 0.5 && index > 1) break;
      float seed = bucket * 19.0 + float(index) * 13.0;
      vec2 center = vec2(filmHash(seed), filmHash(seed + 4.0));
      float radius = mix(0.00065, 0.0032, filmHash(seed + 8.0));
      float distanceToDust = length(uv - center);
      float edge = max(fwidth(distanceToDust) * 1.5, 0.00025);
      float dotMask = 1.0 - smoothstep(radius, radius + edge, distanceToDust);
      result += dotMask * mix(-0.55, 0.45, filmHash(seed + 12.0));
    }
    return result;
  }

  float filmScratches(vec2 uv, float bucket) {
    float result = 0.0;
    for (int index = 0; index < 3; index += 1) {
      if (uFilmLowPower > 0.5 && index > 0) break;
      float seed = bucket * 29.0 + float(index) * 31.0;
      float x = filmHash(seed);
      float waviness = sin(uv.y * (80.0 + filmHash(seed + 3.0) * 110.0) + seed) * 0.0012;
      float distanceToHair = abs(uv.x - x + waviness);
      float width = mix(0.00028, 0.00105, filmHash(seed + 7.0));
      float edge = max(fwidth(distanceToHair) * 1.4, 0.00018);
      float hair = 1.0 - smoothstep(width, width + edge, distanceToHair);
      float segment = smoothstep(0.04, 0.16, uv.y) * smoothstep(0.98, 0.78, uv.y);
      result += hair * segment * mix(-0.32, 0.24, filmHash(seed + 11.0));
    }
    return result;
  }

  void main() {
    vec2 gateOffset = vec2(0.0);
    if (uFilmEnabled > 0.5 && uFilmGateWeaveAmount > 0.0001) {
      gateOffset = filmGateOffset();
    }
    // Sampling the source at the inverse offset shifts every scene-derived
    // component together. DOM chrome is outside this pass and stays perfectly still.
    vec2 filmUv = vUv - gateOffset;
    vec2 filmSunUv = uSunUv + gateOffset;
    #ifdef DDG_UPSCALE_PRESENT
    vec3 color = ddgSrgbDecode(ddgRcas(uColorTexture,filmUv,uResolution,uUpscaleSharpness));
    #else
    vec3 color = finiteColor(sampleAntiAliasedScene(filmUv));
    if (uContactAoEnabled > 0.5) {
      float mainDepth = texture2D(uDepthTexture, filmUv).r;
      float mainDistance = getViewDistance(mainDepth);
      vec2 cell = filmUv * uContactAoResolution - 0.5;
      vec2 base = floor(cell);
      vec2 fraction = fract(cell);
      vec2 texel = 1.0 / max(uContactAoResolution, vec2(1.0));
      vec2 uv00 = (base + vec2(0.5)) * texel;
      vec2 uv10 = uv00 + vec2(texel.x, 0.0);
      vec2 uv01 = uv00 + vec2(0.0, texel.y);
      vec2 uv11 = uv00 + texel;
      float d00 = abs(mainDistance - getViewDistance(texture2D(uContactAoDepthTexture, uv00).r));
      float d10 = abs(mainDistance - getViewDistance(texture2D(uContactAoDepthTexture, uv10).r));
      float d01 = abs(mainDistance - getViewDistance(texture2D(uContactAoDepthTexture, uv01).r));
      float d11 = abs(mainDistance - getViewDistance(texture2D(uContactAoDepthTexture, uv11).r));
      float tolerance = max(0.035, mainDistance * 0.006);
      float w00 = (1.0 - fraction.x) * (1.0 - fraction.y) * (1.0 - smoothstep(tolerance, tolerance * 2.0, d00));
      float w10 = fraction.x * (1.0 - fraction.y) * (1.0 - smoothstep(tolerance, tolerance * 2.0, d10));
      float w01 = (1.0 - fraction.x) * fraction.y * (1.0 - smoothstep(tolerance, tolerance * 2.0, d01));
      float w11 = fraction.x * fraction.y * (1.0 - smoothstep(tolerance, tolerance * 2.0, d11));
      float weight = w00 + w10 + w01 + w11;
      float contact = (texture2D(uContactAoTexture, uv00).r * w00 + texture2D(uContactAoTexture, uv10).r * w10 + texture2D(uContactAoTexture, uv01).r * w01 + texture2D(uContactAoTexture, uv11).r * w11) / max(weight, 0.0001);
      color *= mix(1.0, contact, step(0.0001, weight));
    }

    if (uBloomEnabled > 0.5 && uBloomStrength > 0.0001) {
      color += finiteColor(texture2D(uBloomTexture, filmUv).rgb) * uBloomStrength;
    }

    float depth = texture2D(uDepthTexture, filmUv).r;
    float hasOpaqueDepth = depth < 0.999999 ? 1.0 : 0.0;
    float viewDistance = hasOpaqueDepth > 0.5 ? getViewDistance(depth) : 0.0;
    float cloudSunTransmission = ddgCloudTransmission(uCameraWorldPosition);
    float rays = 0.0;
    // uSunVisible now carries the CPU-side screen mask too. Without that test the
    // loop below ran its 18 dependent texture fetches per pixel and multiplied the
    // result by a zero mask - a guaranteed no-op paid for on every frame whenever
    // the key light sits outside the frame, which the letterboxed band makes common.
    if (uSunRaysEnabled > 0.5 && uSunRaysIntensity > 0.0001 && uSunVisible > 0.5) {
      rays = sampleSunRays(filmUv, filmSunUv) * cloudSunTransmission;
    }
    if (uSunRaysEnabled > 0.5 && uSunRaysIntensity > 0.0001) {
      // The maximum avoids double-brightening when the authored screen-space disc
      // path is available; the world-space path also covers empty sky depth.
      rays = max(rays, samplePainterlyCloudRays(filmUv, viewDistance, hasOpaqueDepth));
    }

    if (uFogMode > 0.5 && uFogDensity > 0.0001 && depth < 0.999999) {
      float distanceRatio = smoothstep(
        uFogNear,
        max(uFogFar, uFogNear + 0.001),
        viewDistance
      );
      float noiseValue = sampleFogNoise(filmUv, distanceRatio, filmSunUv);
      float densityShape = mix(0.72, 1.32, noiseValue);
      float fogAmount = 1.0 - exp(
        -distanceRatio
        * clamp(uFogDensity, 0.0, 1.0)
        * densityShape
        * mix(2.2, 3.4, step(1.5, uFogMode))
      );
      float sunHalo = pow(max(1.0 - distance(filmUv, filmSunUv), 0.0), 7.0)
        * uSunVisible * cloudSunTransmission;
      // Scaled by the ray intensity like the direct term below it. Without that
      // the slider was discontinuous at zero: with fog on, turning the rays off
      // still left them at full strength inside the fog.
      // The horizon's own colour, so a veil over the far water meets the sky.
      vec3 scatteredFog = mix(uFogColor, uFogHorizonColor, uFogSkyTint)
        + uSunColor * (rays * 0.82 + sunHalo * 0.12)
          * uFogScattering * clamp(uSunRaysIntensity, 0.0, 2.0);
      // The fog pass runs after all PBR lighting. Without a local allowance it
      // overwrites up to 94% of the flashlight's grazing highlight and leaves
      // only the DOM halo visible. Preserve part of that already-lit surface
      // inside the beam instead of adding another flat screen-space glow.
      float flashlightRelief = cursorFogMask(filmUv)
        * clamp(uCursorLightFogRelief, 0.0, 1.0);
      float relievedFogAmount = fogAmount * mix(1.0, 0.62, flashlightRelief);
      color = mix(color, scatteredFog, clamp(relievedFogAmount, 0.0, 0.94));
    }

    float fogRayCoupling = step(0.5, uFogMode)
      * clamp(uFogDensity * 4.0, 0.0, 1.0)
      * clamp(uFogScattering, 0.0, 1.0);
    color += uSunColor * rays * uSunRaysIntensity * mix(0.78, 0.34, fogRayCoupling);
    if (uFilmEnabled > 0.5 && uFilmFlickerAmount > 0.000001) {
      color *= exp2(filmFlickerEv());
    }
    color *= exp2(uExposure);
    color = (color - 0.5) * uContrast + 0.5;
    float gray = ddgLuminance(color);
    color = mix(vec3(gray), color, uSaturation);
    color = rotateHue(color, uHue);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / max(uGamma, 0.01)));
    if (uFilmEnabled > 0.5) color = applyFilmStock(color);
    #endif

    #ifdef DDG_UPSCALE_PREPASS
    // FSR consumes display-referred RGB before grain/dust. Render-target draws
    // disable Three's automatic tone map, so apply the SceneCanvas ACES curve
    // explicitly, once. The presentation pass only encodes, never tone maps.
    gl_FragColor = vec4(ddgSrgbEncode(ACESFilmicToneMapping(max(color,vec3(0.0)))),1.0);
    return;
    #endif

    if (uFilmEnabled > 0.5) {
      float imageLuma = clamp(ddgLuminance(color), 0.0, 1.0);
      if (uFilmGrainAmount > 0.0001) {
        float grainRate = filmGrainCadence();
        float grainTime = uTime * grainRate;
        float grainFrame = floor(grainTime);
        float grainBlend = smoothstep(0.16, 0.84, fract(grainTime));
        vec2 grainCell = floor(filmUv * uResolution / max(uFilmGrainSize, 0.45));
        vec3 emulsion = sampleEmulsion(grainCell, grainFrame, grainBlend);
        float mono = ddgLuminance(emulsion + 0.5) - 0.5;
        // Slightly soften chroma between neighbouring grains; silver-density
        // stays crisp, while colour never becomes digital RGB confetti.
        if (uFilmLowPower > 0.5) {
          emulsion = vec3(mono);
        } else {
          vec3 chromaNeighbour = sampleEmulsion(
            grainCell + vec2(1.0, 1.0),
            grainFrame,
            grainBlend
          );
          vec3 chroma = mix(emulsion, chromaNeighbour, 0.52);
          emulsion = mix(vec3(mono), chroma, 0.28);
        }
        float toe = smoothstep(0.012, 0.14, imageLuma);
        float shoulder = 1.0 - smoothstep(0.78, 1.18, imageLuma);
        color += emulsion * (uFilmGrainAmount * 0.105) * mix(0.38, 1.0, toe) * mix(0.72, 1.0, shoulder);
      }
      float damageBucket = floor(uTime * 0.45);
      if (uFilmDustAmount > 0.0001) {
        color += vec3(filmDust(filmUv, damageBucket) * uFilmDustAmount);
      }
      if (uFilmScratchAmount > 0.0001) {
        color += vec3(filmScratches(filmUv, damageBucket) * uFilmScratchAmount);
      }
    } else if (uGrainEnabled > 0.5 && uGrainIntensity > 0.0001) {
      vec2 grainCell = floor(vUv * uResolution / max(uGrainSize, 0.35));
      float grain = randomGrain(grainCell + floor(uTime * uGrainSpeed * 24.0)) - 0.5;
      float imageLuma = clamp(ddgLuminance(color), 0.0, 1.0);
      float shadowWeight = mix(0.72, 1.18, 1.0 - imageLuma);
      // Real film grain modulates exposed emulsion; it does not turn an
      // unexposed black frame into a grey rectangle.
      float exposureMask = smoothstep(0.008, 0.16, imageLuma);
      color += grain * uGrainIntensity * shadowWeight * exposureMask;
    }

    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    // three compiles tone mapping OUT for any render-target pass, and the whole
    // scene is rendered into a target here - so with post on there was no tone
    // map at all, and the pass could only be left off. Applying it explicitly is
    // what makes post shippable, and the order matches three's own: map, encode,
    // then dither against the final 8-bit steps.
    #ifndef DDG_UPSCALE_PRESENT
      #include <tonemapping_fragment>
    #endif
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
