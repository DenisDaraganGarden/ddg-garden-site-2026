import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getCursorFlashlightRuntime,
  getCursorFlashlightWorldRuntime,
} from '../../features/cursor/cursorFlashlightStore';

const FILM_NOISE_TEXTURE_SIZE = 512;

const postVertexShader = `
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
const bloomPrefilterFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uColorTexture;
  uniform vec2 uTexelSize;
  uniform float uThreshold;

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
    gl_FragColor = vec4(bloomPrefilter(color), 1.0);
  }
`;

const bloomBlurFragmentShader = `
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

const postFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uColorTexture;
  uniform sampler2D uBloomTexture;
  uniform sampler2D uDepthTexture;
  uniform sampler2D uNoiseTexture;
  uniform sampler2D uFilmNoiseTexture;
  uniform vec2 uResolution;
  uniform vec2 uSunUv;
  uniform float uSunVisible;
  uniform vec3 uSunColor;
  uniform float uCameraNear;
  uniform float uCameraFar;
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

  uniform float uFogMode;
  uniform vec3 uFogColor;
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

  float getViewDistance(float depth) {
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    return max(exp2(depth * log2(uCameraFar + 1.0)) - 1.0, 0.0);
#else
    float viewZ = (uCameraNear * uCameraFar)
      / ((uCameraFar - uCameraNear) * depth - uCameraFar);
    return max(-viewZ, 0.0);
#endif
  }

  float ddgLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  float sampleSunRays(vec2 uv, vec2 sunUv) {
    float sampleCount = max(uSunRaySampleCount, 1.0);
    vec2 aspectScale = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 rayVector = uv - sunUv;
    vec2 stepVector = rayVector / sampleCount;
    vec2 sampleUv = uv;
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
    vec3 color = texture2D(uColorTexture, filmUv).rgb;

    if (uBloomEnabled > 0.5 && uBloomStrength > 0.0001) {
      color += texture2D(uBloomTexture, filmUv).rgb * uBloomStrength;
    }

    float rays = 0.0;
    // uSunVisible now carries the CPU-side screen mask too. Without that test the
    // loop below ran its 18 dependent texture fetches per pixel and multiplied the
    // result by a zero mask - a guaranteed no-op paid for on every frame whenever
    // the key light sits outside the frame, which the letterboxed band makes common.
    if (uSunRaysEnabled > 0.5 && uSunRaysIntensity > 0.0001 && uSunVisible > 0.5) {
      rays = sampleSunRays(filmUv, filmSunUv);
    }

    float depth = texture2D(uDepthTexture, filmUv).r;
    if (uFogMode > 0.5 && uFogDensity > 0.0001 && depth < 0.999999) {
      float viewDistance = getViewDistance(depth);
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
      float sunHalo = pow(max(1.0 - distance(filmUv, filmSunUv), 0.0), 7.0) * uSunVisible;
      // Scaled by the ray intensity like the direct term below it. Without that
      // the slider was discontinuous at zero: with fog on, turning the rays off
      // still left them at full strength inside the fog.
      vec3 scatteredFog = uFogColor
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

    if (uFilmEnabled > 0.5) {
      color = applyFilmStock(color);
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
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

function createNoiseTexture(size = 128) {
  const random = (() => {
    let state = 0x5f3759df;
    return () => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const data = new Uint8Array(size * size * 4);

  for (let index = 0; index < size * size; index += 1) {
    const value = Math.round(random() * 255);
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createFilmNoiseTexture(size = FILM_NOISE_TEXTURE_SIZE) {
  const random = (() => {
    let state = 0x9e3779b9;
    return () => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = Math.round(random() * 255);
    data[index * 4 + 1] = Math.round(random() * 255);
    data[index * 4 + 2] = Math.round(random() * 255);
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const toEnabledFloat = (value) => (value ? 1 : 0);
const filmStockIds = Object.freeze({
  neutral: 0,
  '35mm': 1,
  '16mm': 2,
  '8mm': 3,
  bw: 4,
  sepia: 5,
  faded: 6,
});
const finiteSetting = (value, fallback) => (Number.isFinite(value) ? value : fallback);

export default function ScenePostProcessing({ settings, qualityProfile, lighting }) {
  const { gl, scene, camera } = useThree();
  const isLowPower = qualityProfile?.isLowPower === true;
  const renderScale = qualityProfile?.postRenderScale ?? 1;
  const requestedSamples = qualityProfile?.postSamples ?? 0;
  const sunRaySampleCount = Math.max(
    1,
    Math.min(18, Math.round(qualityProfile?.sunRaySampleCount ?? (isLowPower ? 8 : 18))),
  );
  const fogSampleCount = Math.max(
    1,
    Math.min(8, Math.round(qualityProfile?.fogSampleCount ?? 8)),
  );
  const postProcessingSupported = qualityProfile?.postProcessingSupported !== false
    && qualityProfile?.postDepthStencilEnabled !== false;
  const postColorType = qualityProfile?.postColorType === 'rgba8'
    ? THREE.UnsignedByteType
    : qualityProfile?.postColorType === 'half-float'
      ? THREE.HalfFloatType
      : isLowPower
        ? THREE.UnsignedByteType
        : THREE.HalfFloatType;
  const drawingBufferSize = useRef(new THREE.Vector2());
  const lastTargetSize = useRef(new THREE.Vector2());
  const sunPoint = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());
  const sunDirection = useMemo(() => new THREE.Vector3(), []);
  const noiseTexture = useMemo(() => createNoiseTexture(), []);
  const filmNoiseTexture = useMemo(() => createFilmNoiseTexture(), []);
  const renderTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      // The whole scene lands here before grading. Storing it as 8-bit LINEAR
      // was the source of the banding in the night gradients: linear coding
      // spends most of its 256 steps on highlights and leaves barely a dozen
      // for the shadows this scene is almost entirely made of. Half float
      // removes the quantisation (and lets the grade work on real HDR values)
      // for two bytes per channel. Weak devices keep the cheap buffer.
      type: postColorType,
      depthBuffer: postProcessingSupported,
      stencilBuffer: postProcessingSupported,
      generateMipmaps: false,
    });
    target.texture.name = 'home-scene-post-color';
    if (postProcessingSupported) {
      target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
      target.depthTexture.format = THREE.DepthStencilFormat;
      target.depthTexture.minFilter = THREE.NearestFilter;
      target.depthTexture.magFilter = THREE.NearestFilter;
      target.depthTexture.generateMipmaps = false;
      target.depthTexture.name = 'home-scene-post-depth';
    }
    // Canvas MSAA only covers the default framebuffer. With post enabled the
    // entire scene is drawn into this target first, so vegetation's
    // alphaToCoverage needs samples here as well or its thin edges turn into
    // hard black sawteeth despite a DPR-2 canvas.
    target.samples = isLowPower || !postProcessingSupported
      ? 0
      : Math.min(requestedSamples, gl.capabilities.maxSamples ?? requestedSamples);
    return target;
  }, [gl.capabilities.maxSamples, isLowPower, postColorType, postProcessingSupported, requestedSamples]);
  const bloomTargets = useMemo(() => {
    const createTarget = (name) => {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: postColorType,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      target.texture.name = name;
      return target;
    };
    return [
      createTarget('home-scene-bloom-a'),
      createTarget('home-scene-bloom-b'),
    ];
  }, [postColorType]);
  const uniforms = useMemo(() => ({
    uColorTexture: { value: renderTarget.texture },
    uBloomTexture: { value: bloomTargets[0].texture },
    uDepthTexture: { value: renderTarget.depthTexture },
    uNoiseTexture: { value: noiseTexture },
    uFilmNoiseTexture: { value: filmNoiseTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uSunColor: { value: new THREE.Color('#ffffff') },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uTime: { value: 0 },
    uGrainEnabled: { value: 0 },
    uGrainIntensity: { value: 0 },
    uGrainSize: { value: 1 },
    uGrainSpeed: { value: 1 },
    uFilmEnabled: { value: 0 },
    uFilmStock: { value: 0 },
    uFilmGrainAmount: { value: 0 },
    uFilmGrainSize: { value: 1 },
    uFilmDustAmount: { value: 0 },
    uFilmScratchAmount: { value: 0 },
    uFilmFlickerAmount: { value: 0 },
    uFilmFlickerRate: { value: 12 },
    uFilmGateWeaveAmount: { value: 0 },
    uFilmGateWeaveRate: { value: 2 },
    uFilmLowPower: { value: isLowPower ? 1 : 0 },
    uBloomEnabled: { value: 0 },
    uBloomStrength: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uHue: { value: 0 },
    uGamma: { value: 1 },
    uExposure: { value: 0 },
    uSunRaysEnabled: { value: 0 },
    uSunRaysIntensity: { value: 0 },
    uSunRaysDecay: { value: 0.93 },
    uSunRaysDensity: { value: 0.72 },
    uSunRaySampleCount: { value: 18 },
    uSunRadius: { value: 0.01 },
    uFogMode: { value: 0 },
    uFogColor: { value: new THREE.Color('#000000') },
    uFogDensity: { value: 0 },
    uFogNear: { value: 1 },
    uFogFar: { value: 24 },
    uFogNoiseScale: { value: 1 },
    uFogSpeed: { value: 0 },
    uFogScattering: { value: 0 },
    uFogSampleCount: { value: 8 },
    uCursorLightActive: { value: 0 },
    uCursorLightUv: { value: new THREE.Vector2(0.5, 0.5) },
    uCursorLightRadius: { value: 0.1 },
    uCursorLightAspect: { value: 1 },
    uCursorLightSoftness: { value: 0.72 },
    uCursorLightFogRelief: { value: 0 },
  }), [bloomTargets, filmNoiseTexture, isLowPower, noiseTexture, renderTarget]);
  const postMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: postVertexShader,
    fragmentShader: postFragmentShader,
    depthTest: false,
    depthWrite: false,
    stencilWrite: false,
    toneMapped: true,
    dithering: true,
  }), [uniforms]);
  const postScene = useMemo(() => {
    const nextScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    quad.frustumCulled = false;
    nextScene.add(quad);
    return nextScene;
  }, [postMaterial]);
  const postCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );
  const bloomPrefilterUniforms = useMemo(() => ({
    uColorTexture: { value: renderTarget.texture },
    uTexelSize: { value: new THREE.Vector2(1, 1) },
    uThreshold: { value: 0.7 },
  }), [renderTarget.texture]);
  const bloomPrefilterMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: bloomPrefilterUniforms,
    vertexShader: postVertexShader,
    fragmentShader: bloomPrefilterFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [bloomPrefilterUniforms]);
  const bloomPrefilterScene = useMemo(() => {
    const nextScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bloomPrefilterMaterial);
    quad.frustumCulled = false;
    nextScene.add(quad);
    return nextScene;
  }, [bloomPrefilterMaterial]);
  const bloomBlurUniforms = useMemo(() => ({
    uBloomTexture: { value: bloomTargets[0].texture },
    uTexelSize: { value: new THREE.Vector2(1, 1) },
    uOffset: { value: 1 },
  }), [bloomTargets]);
  const bloomBlurMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: bloomBlurUniforms,
    vertexShader: postVertexShader,
    fragmentShader: bloomBlurFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [bloomBlurUniforms]);
  const bloomBlurScene = useMemo(() => {
    const nextScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bloomBlurMaterial);
    quad.frustumCulled = false;
    nextScene.add(quad);
    return nextScene;
  }, [bloomBlurMaterial]);

  useEffect(() => {
    const fogModes = { off: 0, cheap: 1, volumetric: 2 };
    const fogMode = isLowPower && settings.fogMode === 'volumetric'
      ? 'cheap'
      : settings.fogMode;
    uniforms.uGrainEnabled.value = toEnabledFloat(settings.filmGrainEnabled);
    uniforms.uGrainIntensity.value = finiteSetting(settings.filmGrainIntensity, 0);
    uniforms.uGrainSize.value = finiteSetting(settings.filmGrainSize, 1);
    uniforms.uGrainSpeed.value = finiteSetting(settings.filmGrainSpeed, 1);
    const filmStock = typeof settings.filmStock === 'string' ? settings.filmStock : 'neutral';
    uniforms.uFilmEnabled.value = toEnabledFloat(settings.filmEnabled);
    uniforms.uFilmStock.value = filmStockIds[filmStock] ?? filmStockIds.neutral;
    uniforms.uFilmGrainAmount.value = finiteSetting(settings.filmGrainAmount, 0);
    uniforms.uFilmGrainSize.value = finiteSetting(settings.filmGrainSize, 1);
    uniforms.uFilmDustAmount.value = finiteSetting(settings.filmDustAmount, 0);
    uniforms.uFilmScratchAmount.value = finiteSetting(settings.filmScratchAmount, 0);
    uniforms.uFilmFlickerAmount.value = finiteSetting(settings.filmFlickerAmount, 0);
    uniforms.uFilmFlickerRate.value = finiteSetting(settings.filmFlickerRate, 12);
    uniforms.uFilmGateWeaveAmount.value = finiteSetting(settings.filmGateWeaveAmount, 0);
    uniforms.uFilmGateWeaveRate.value = finiteSetting(settings.filmGateWeaveRate, 2);
    uniforms.uFilmLowPower.value = toEnabledFloat(isLowPower);
    uniforms.uBloomEnabled.value = toEnabledFloat(settings.bloomEnabled);
    uniforms.uBloomStrength.value = settings.bloomStrength;
    bloomPrefilterUniforms.uThreshold.value = settings.bloomThreshold;
    uniforms.uContrast.value = settings.colorContrast;
    uniforms.uSaturation.value = settings.colorSaturation;
    uniforms.uHue.value = THREE.MathUtils.degToRad(settings.colorHue);
    uniforms.uGamma.value = settings.colorGamma;
    uniforms.uExposure.value = settings.colorExposure;
    uniforms.uSunRaysEnabled.value = toEnabledFloat(settings.sunRaysEnabled);
    uniforms.uSunRaysIntensity.value = settings.sunRaysIntensity;
    uniforms.uSunRaysDecay.value = settings.sunRaysDecay;
    uniforms.uSunRaysDensity.value = settings.sunRaysDensity;
    uniforms.uSunRaySampleCount.value = sunRaySampleCount;
    uniforms.uFogMode.value = fogModes[fogMode] ?? 0;
    uniforms.uFogColor.value.set(settings.fogColor);
    uniforms.uFogDensity.value = settings.fogDensity;
    uniforms.uFogNear.value = settings.fogNear;
    uniforms.uFogFar.value = settings.fogFar;
    uniforms.uFogNoiseScale.value = settings.fogNoiseScale;
    uniforms.uFogSpeed.value = settings.fogSpeed;
    uniforms.uFogScattering.value = settings.fogScattering;
    uniforms.uFogSampleCount.value = fogSampleCount;
    uniforms.uSunColor.value.fromArray(lighting.key.colorLinear);
  }, [bloomPrefilterUniforms, fogSampleCount, isLowPower, lighting.key.colorLinear, settings, sunRaySampleCount, uniforms]);

  useEffect(() => () => {
    postScene.children[0]?.geometry?.dispose();
    postMaterial.dispose();
  }, [postMaterial, postScene]);

  useEffect(() => () => {
    bloomPrefilterScene.children[0]?.geometry?.dispose();
    bloomPrefilterMaterial.dispose();
  }, [bloomPrefilterMaterial, bloomPrefilterScene]);

  useEffect(() => () => {
    bloomBlurScene.children[0]?.geometry?.dispose();
    bloomBlurMaterial.dispose();
  }, [bloomBlurMaterial, bloomBlurScene]);

  useEffect(() => () => renderTarget.dispose(), [renderTarget]);
  useEffect(
    () => () => bloomTargets.forEach((target) => target.dispose()),
    [bloomTargets],
  );
  useEffect(() => () => noiseTexture.dispose(), [noiseTexture]);
  useEffect(() => () => filmNoiseTexture.dispose(), [filmNoiseTexture]);

  useEffect(() => {
    gl.domElement.dataset.ddgPostSamples = String(renderTarget.samples);
    gl.domElement.dataset.ddgPostStatus = postProcessingSupported ? 'ready' : 'default-framebuffer';
    gl.domElement.dataset.ddgBloomPipeline = isLowPower ? 'quarter-tent-1' : 'quarter-tent-2';
    gl.domElement.dataset.ddgSunRays = `sun-occlusion-${sunRaySampleCount}`;
    gl.domElement.dataset.ddgFogSamples = String(fogSampleCount);
    gl.domElement.dataset.ddgCursorFlashlightFog = 'local-relief';
    return () => {
      delete gl.domElement.dataset.ddgPostSamples;
      delete gl.domElement.dataset.ddgPostStatus;
      delete gl.domElement.dataset.ddgBloomPipeline;
      delete gl.domElement.dataset.ddgSunRays;
      delete gl.domElement.dataset.ddgFogSamples;
      delete gl.domElement.dataset.ddgCursorFlashlightFog;
    };
  }, [fogSampleCount, gl, isLowPower, postProcessingSupported, renderTarget.samples, sunRaySampleCount]);

  useEffect(() => {
    const { dataset } = gl.domElement;
    const enabled = settings.filmEnabled === true;
    dataset.ddgFilm = enabled ? 'on' : 'off';
    dataset.ddgFilmStock = enabled && typeof settings.filmStock === 'string'
      ? settings.filmStock
      : 'neutral';
    dataset.ddgFilmFlicker = String(finiteSetting(settings.filmFlickerAmount, 0));
    dataset.ddgFilmGateWeave = String(finiteSetting(settings.filmGateWeaveAmount, 0));
    dataset.ddgPostActive = settings.postProcessingEnabled ? 'on' : 'off';
    dataset.ddgBloomActive = settings.bloomEnabled ? 'on' : 'off';
    dataset.ddgFogMode = settings.fogMode;
    return () => {
      delete dataset.ddgFilm;
      delete dataset.ddgFilmStock;
      delete dataset.ddgFilmFlicker;
      delete dataset.ddgFilmGateWeave;
      delete dataset.ddgPostActive;
      delete dataset.ddgBloomActive;
      delete dataset.ddgFogMode;
    };
  }, [
    gl,
    settings.bloomEnabled,
    settings.filmEnabled,
    settings.filmFlickerAmount,
    settings.filmGateWeaveAmount,
    settings.filmStock,
    settings.fogMode,
    settings.postProcessingEnabled,
  ]);

  useFrame(({ clock }) => {
    const enabled = postProcessingSupported
      && settings.postProcessingEnabled
      && settings.debugView === 'beauty';
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    gl.getDrawingBufferSize(drawingBufferSize.current);
    const width = Math.max(1, Math.round(drawingBufferSize.current.x * renderScale));
    const height = Math.max(1, Math.round(drawingBufferSize.current.y * renderScale));
    const bloomWidth = Math.max(1, Math.ceil(width * 0.25));
    const bloomHeight = Math.max(1, Math.ceil(height * 0.25));
    // `useMemo` recreates targets when their type/MSAA capability changes. The
    // previous target's dimensions may match this viewport while the new target
    // is still its 1x1 constructor size, so inspect the targets themselves too.
    const targetNeedsResize = lastTargetSize.current.x !== width
      || lastTargetSize.current.y !== height
      || renderTarget.width !== width
      || renderTarget.height !== height
      || bloomTargets.some((target) => target.width !== bloomWidth || target.height !== bloomHeight);
    if (targetNeedsResize) {
      renderTarget.setSize(width, height);
      bloomTargets.forEach((target) => target.setSize(bloomWidth, bloomHeight));
      lastTargetSize.current.set(width, height);
      uniforms.uResolution.value.set(width, height);
      bloomPrefilterUniforms.uTexelSize.value.set(1 / width, 1 / height);
      bloomBlurUniforms.uTexelSize.value.set(1 / bloomWidth, 1 / bloomHeight);
    }

    // The direction comes from the lighting contract, not from a second copy of
    // the spherical formula. The copy that used to live here is exactly how the
    // rays ended up anchored to a different point than the visible sun.
    sunDirection.fromArray(lighting.sky.keyDirection).normalize();
    sunPoint.current.copy(camera.position).addScaledVector(sunDirection, 80).project(camera);
    camera.getWorldDirection(cameraDirection.current);
    uniforms.uSunUv.value.set(
      sunPoint.current.x * 0.5 + 0.5,
      sunPoint.current.y * 0.5 + 0.5,
    );
    // Same mask the shader applies to the ray result, evaluated once on the CPU so
    // an off-screen sun skips the whole loop instead of shading it away.
    const edgeFade = (edge0, edge1, x) => {
      const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };
    const sunU = uniforms.uSunUv.value.x;
    const sunV = uniforms.uSunUv.value.y;
    const screenMask = edgeFade(0, 0.08, sunU)
      * edgeFade(1, 0.92, sunU)
      * edgeFade(0, 0.08, sunV)
      * edgeFade(1, 0.92, sunV);
    const facesSun = cameraDirection.current.dot(sunDirection) > 0;
    uniforms.uSunVisible.value = (facesSun && screenMask > 0.0001) ? 1 : 0;
    const angularRadius = Math.acos(THREE.MathUtils.clamp(lighting.sky.keyCosRadius, -1, 1));
    const verticalHalfFov = camera.isPerspectiveCamera
      ? THREE.MathUtils.degToRad(camera.fov) * 0.5
      : Math.PI * 0.25;
    uniforms.uSunRadius.value = Math.max(
      0.002,
      Math.tan(angularRadius) / Math.max(2 * Math.tan(verticalHalfFov), 0.0001),
    );
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    uniforms.uTime.value = clock.elapsedTime;

    const cursorRuntime = getCursorFlashlightRuntime();
    const cursorWorldRuntime = getCursorFlashlightWorldRuntime();
    const canvasRect = gl.domElement.getBoundingClientRect();
    const cursorActive = cursorWorldRuntime.active
      && cursorRuntime.enabled
      && cursorRuntime.pointerInsideFrame
      && canvasRect.width > 0
      && canvasRect.height > 0;
    uniforms.uCursorLightActive.value = cursorActive ? 1 : 0;
    if (cursorActive) {
      uniforms.uCursorLightUv.value.set(
        (cursorRuntime.clientX - canvasRect.left) / canvasRect.width,
        1 - ((cursorRuntime.clientY - canvasRect.top) / canvasRect.height),
      );
      const beamPixels = 96 + ((cursorRuntime.beamDegrees - 12) / 58) * 254;
      uniforms.uCursorLightRadius.value = (beamPixels * 0.5) / canvasRect.height;
      uniforms.uCursorLightAspect.value = canvasRect.width / canvasRect.height;
      uniforms.uCursorLightSoftness.value = cursorRuntime.lightSoftness;
      uniforms.uCursorLightFogRelief.value = THREE.MathUtils.clamp(
        cursorRuntime.lightIntensity / 1.5,
        0,
        1,
      );
    }

    gl.setRenderTarget(renderTarget);
    gl.clear(true, true, true);
    gl.render(scene, camera);

    if (settings.bloomEnabled && settings.bloomStrength > 0.0001) {
      gl.setRenderTarget(bloomTargets[0]);
      gl.clear(true, false, false);
      gl.render(bloomPrefilterScene, postCamera);

      bloomBlurUniforms.uBloomTexture.value = bloomTargets[0].texture;
      bloomBlurUniforms.uOffset.value = 0.8 + settings.bloomRadius * 2.7;
      gl.setRenderTarget(bloomTargets[1]);
      gl.clear(true, false, false);
      gl.render(bloomBlurScene, postCamera);

      if (isLowPower) {
        uniforms.uBloomTexture.value = bloomTargets[1].texture;
      } else {
        bloomBlurUniforms.uBloomTexture.value = bloomTargets[1].texture;
        bloomBlurUniforms.uOffset.value = 1.4 + settings.bloomRadius * 4.6;
        gl.setRenderTarget(bloomTargets[0]);
        gl.clear(true, false, false);
        gl.render(bloomBlurScene, postCamera);
        uniforms.uBloomTexture.value = bloomTargets[0].texture;
      }
    }

    gl.setRenderTarget(null);
    gl.render(postScene, postCamera);
  }, 100);

  return null;
}
