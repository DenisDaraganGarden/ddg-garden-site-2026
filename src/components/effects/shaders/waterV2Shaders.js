import { skyShaderChunk } from './skyShader';

// Water V2 optics. The wave state still comes from the existing DDG ping-pong
// simulation; the optical model follows the Fresnel/refraction approach used by
// Evan Wallace's WebGL water demo and Yong Su's Three.js adaptation.

export const waterV2VertexShader = `
  varying vec2 vUv;
  varying vec3 vSurfaceWorldPosition;
  varying vec4 vKeyShadowCoord;
  varying vec3 vWaterNormal;
  varying vec3 vViewNormal;
  varying vec4 vClipPosition;
  varying float vHeightSample;

  uniform sampler2D uState;
  uniform sampler2D uNormalMap;
  uniform mat4 uKeyShadowMatrix;
  uniform float uWaveAmplitude;
  uniform float uWaveChoppiness;

  vec3 decodeNormal(vec3 packedNormal) {
    return normalize((packedNormal * 2.0) - 1.0);
  }

  void main() {
    vUv = uv;

    float rawHeight = texture2D(uState, uv).r;
    float smoothHeight = texture2D(uNormalMap, uv).a * 2.0 - 1.0;
    float heightSample = mix(rawHeight, smoothHeight, 0.84);
    float displacement = heightSample * uWaveAmplitude;
    vec3 simulationNormal = decodeNormal(texture2D(uNormalMap, uv).rgb);
    vec3 displacedPosition = position;
    float choppiness = clamp(uWaveChoppiness, 0.0, 1.25);

    displacedPosition.x += simulationNormal.x * displacement * choppiness * 0.34;
    displacedPosition.y -= simulationNormal.z * displacement * choppiness * 0.34;
    displacedPosition.z += displacement;

    // PlaneGeometry is rotated -90 degrees around X in the scene. This maps the
    // simulation's Y-up normal to the mesh's local Z-up normal.
    vec3 localNormal = normalize(vec3(
      simulationNormal.x,
      -simulationNormal.z,
      simulationNormal.y
    ));

    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec4 viewPosition = viewMatrix * worldPosition;

    vSurfaceWorldPosition = worldPosition.xyz;
    // From the wave, not from the plane it started as.
    vKeyShadowCoord = uKeyShadowMatrix * vec4(worldPosition.xyz, 1.0);
    vWaterNormal = normalize(mat3(modelMatrix) * localNormal);
    vViewNormal = normalize(normalMatrix * localNormal);
    vHeightSample = heightSample;
    vClipPosition = projectionMatrix * viewPosition;
    gl_Position = vClipPosition;
  }
`;

export const waterV2FragmentShader = `
  ${skyShaderChunk}
  varying vec2 vUv;
  varying vec3 vSurfaceWorldPosition;
  varying vec4 vKeyShadowCoord;
  varying vec3 vWaterNormal;
  varying vec3 vViewNormal;
  varying vec4 vClipPosition;
  varying float vHeightSample;

  uniform highp sampler2DShadow uKeyShadowMap;
  uniform float uKeyShadowActive;
  uniform float uKeyShadowBias;
  uniform float uKeyDirectShare;
  uniform float uShadowIntensity;
  uniform float uWaterShadowStrength;
  uniform sampler2D uReflectionTexture;
  uniform sampler2D uRefractionTexture;
  uniform sampler2D uRefractionDepthTexture;
  uniform mat4 uReflectionMatrix;
  uniform float uReflectionActive;
  uniform float uRefractionActive;
  uniform float uRefractionDepthActive;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uWaveAmplitude;
  uniform vec3 uWaterTint;
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonColor;
  uniform float uMoonIntensity;
  uniform float uMoonSpecularStrength;
  uniform float uMoonSpecularPower;
  uniform float uReflectionIntensity;
  uniform float uEnvironmentExposure;
  uniform float uEnvironmentReflection;
  uniform vec3 uEnvironmentHorizonColor;
  uniform vec3 uEnvironmentZenithColor;
  uniform float uEnvironmentRotation;
  uniform float uWaterDepth;
  uniform float uWaterTurbidity;
  uniform vec3 uWaterScatteringColor;
  uniform float uWaterScatteringStrength;
  uniform float uWaterGlintStrength;
  uniform float uWaterGlintDensity;
  uniform float uWaterGlintSharpness;
  uniform float uTime;
  uniform int uDebugView;

  #include <common>
  #include <dithering_pars_fragment>

  float perspectiveDepthToViewZLocal(float depth, float nearPlane, float farPlane) {
    return (nearPlane * farPlane) / ((farPlane - nearPlane) * depth - farPlane);
  }

  vec3 reflectionTone() {
    vec3 tint = max(uWaterTint, vec3(0.0));
    float luminance = dot(tint, vec3(0.2126, 0.7152, 0.0722));
    vec3 chroma = luminance > 0.001
      ? clamp(tint / luminance, vec3(0.35), vec3(2.2))
      : vec3(1.0);
    // The colour picker also carries a useful value component: grey can make
    // reflections calmer/darker while white stays neutral.
    float value = mix(0.45, 1.0, sqrt(clamp(luminance, 0.0, 1.0)));
    return chroma * value;
  }

  // The sky the water reflects is now literally the sky above it - the same
  // table, the same disc function. What used to be here was a separate ramp
  // between two hand-picked hexes plus a two-lobe cosine wobble, with the sun
  // faked as two hardcoded pow() terms that no more agreed with the light
  // direction than the sprite did.
  vec3 skyColor(vec3 ray, vec3 lightDir, float discShadow) {
    // Exposure controls are perceptual in the editor, so use a square-root
    // response while preserving a true black at zero.
    float environmentLevel = sqrt(clamp(uEnvironmentExposure * uEnvironmentReflection, 0.0, 4.84));
    vec3 color = skyRadiance(ray) * environmentLevel;
    color *= mix(vec3(1.0), reflectionTone(), 0.6);
    // The sun reflected off water is not the sun seen through air: the surface
    // is rough, so its mirror image spreads into a glitter path. Reflecting the
    // disc at its true angular size drew a hard vertical column down the frame at
    // grazing angles. Widen it and drop its radiance by the same factor, which
    // conserves roughly the energy a real rough mirror returns.
    const float WATER_DISC_SPREAD = 60.0;
    float waterCosRadius = 1.0 - (1.0 - uKeyCosRadius) * WATER_DISC_SPREAD;
    color += celestialBody(
      ray,
      uKeyDirection,
      uKeyRadiance / WATER_DISC_SPREAD,
      waterCosRadius,
      uKeyGlowPower
    ) * discShadow;
    return color;
  }

  // One hardware-PCF fetch: four filtered taps for the price of one, and no
  // second shadow map. The water could never receive a shadow before - it is a
  // hand-written material, so three's lighting chunks never touched it, and the
  // boat cast nothing onto the water it floats in.
  float keyShadow() {
    if (uKeyShadowActive < 0.5) {
      return 1.0;
    }

    vec3 coord = vKeyShadowCoord.xyz / max(vKeyShadowCoord.w, 1e-5);
    if (coord.z > 1.0
      || any(lessThan(coord.xy, vec2(0.0)))
      || any(greaterThan(coord.xy, vec2(1.0)))) {
      return 1.0;
    }

    float lit = texture(uKeyShadowMap, vec3(coord.xy, coord.z + uKeyShadowBias));
    return mix(1.0, lit, clamp(uShadowIntensity, 0.0, 1.0));
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float edgeMask(vec2 uv) {
    vec2 lower = smoothstep(vec2(0.0), vec2(0.055), uv);
    vec2 upper = 1.0 - smoothstep(vec2(0.945), vec2(1.0), uv);
    return clamp(lower.x * lower.y * upper.x * upper.y, 0.0, 1.0);
  }

  void main() {
    float waveInfluence = clamp(uWaveAmplitude / 0.08, 0.0, 1.0);
    vec3 normal = normalize(mix(vec3(0.0, 1.0, 0.0), normalize(vWaterNormal), waveInfluence));
    if (!gl_FrontFacing) {
      normal = -normal;
    }

    vec3 viewDirection = normalize(cameraPosition - vSurfaceWorldPosition);
    vec3 lightDirection = normalize(uMoonDirection);
    float normalDotView = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float slope = 1.0 - clamp(normal.y, 0.0, 1.0);

    if (uDebugView == 1) {
      float height = clamp(vHeightSample * 0.5 + 0.5, 0.0, 1.0);
      gl_FragColor = vec4(vec3(height), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    if (uDebugView == 2) {
      gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    if (uDebugView == 3) {
      float preview = pow(clamp(slope * 2.0, 0.0, 1.0), 1.3);
      gl_FragColor = vec4(vec3(preview), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    if (uDebugView == 4) {
      gl_FragColor = vec4(vec3(0.025, 0.04, 0.065), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // Schlick Fresnel for an air/water boundary (IOR 1.333).
    float f0 = 0.02037;
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - normalDotView, 5.0);

    vec2 screenUv = (vClipPosition.xy / max(vClipPosition.w, 0.0001)) * 0.5 + 0.5;
    float refractionDistortion = mix(0.0035, 0.014, slope)
      * (0.7 + abs(vHeightSample) * 0.45)
      * waveInfluence;
    vec2 refractUv = screenUv + normalize(vViewNormal.xy + vec2(0.0001)) * refractionDistortion;
    refractUv = clamp(refractUv, vec2(0.002), vec2(0.998));

    // The refraction target contains linear HDR lighting. Keep it in that
    // domain until the water, absorption and reflections have been combined;
    // the final renderer tone-maps the result exactly once.
    vec3 refractedScene = max(texture2D(uRefractionTexture, refractUv).rgb, vec3(0.0));
    // Measure the actual water thickness to the first submerged surface from
    // the existing refraction depth buffer. This separates a nearby hull from
    // the deeper seabed without another render pass.
    float shadow = keyShadow();
    float turbidity = clamp(uWaterTurbidity, 0.0, 1.0);
    float analyticPath = min(
      uWaterDepth / max(normalDotView, 0.22),
      uWaterDepth * 4.0
    );
    float opticalPath = analyticPath;
    if (uRefractionDepthActive > 0.5) {
      float sceneDepth = texture2D(uRefractionDepthTexture, refractUv).x;
      if (sceneDepth > 0.000001 && sceneDepth < 0.999999) {
        vec3 surfaceViewPosition = (viewMatrix * vec4(vSurfaceWorldPosition, 1.0)).xyz;
        float sceneViewZ = perspectiveDepthToViewZLocal(sceneDepth, uCameraNear, uCameraFar);
        float viewRayCosine = max(abs(normalize(surfaceViewPosition).z), 0.08);
        float measuredPath = max(
          (abs(sceneViewZ) - abs(surfaceViewPosition.z)) / viewRayCosine,
          0.0
        );
        if (measuredPath > 0.001) {
          opticalPath = min(measuredPath, uWaterDepth * 4.0);
        }
      }
    }

    // A friendly 0..100% control over absorption + out-scattering. At zero
    // there is no artificial haze; at maximum a metre of water is visibly
    // cloudy, while nearby submerged geometry stays clearer than the bottom.
    float density = turbidity * (0.45 + 0.55 * turbidity);
    // Per metre, these coefficients only read on deep water. The published pond
    // is 0.75m, where the whole travel of the turbidity slider changed the frame
    // by a few percent - the control looked broken because at that depth it
    // effectively was. Normalising against the authored depth makes the slider
    // mean "how much this water hides its own bottom" at any depth; at the
    // default 5m it lands exactly where it used to.
    float depthScale = 5.0 / max(uWaterDepth, 0.25);
    vec3 absorptionCoefficient = (vec3(0.008, 0.003, 0.001)
      + density * vec3(0.13, 0.055, 0.018)) * depthScale;
    float scatteringCoefficient = density
      * 0.62
      * depthScale
      * clamp(uWaterScatteringStrength, 0.0, 2.0);
    vec3 extinction = absorptionCoefficient + vec3(scatteringCoefficient);
    vec3 transmittance = exp(-extinction * opticalPath);
    vec3 deepTint = mix(
      vec3(0.018, 0.052, 0.064),
      max(uWaterScatteringColor, vec3(0.001)),
      0.7
    );
    float scatterAmount = 1.0 - exp(-scatteringCoefficient * opticalPath);
    float scatterLight = mix(
      0.48,
      1.0,
      sqrt(clamp(uEnvironmentExposure * uEnvironmentReflection, 0.0, 1.0))
    );
    float forwardScatter = pow(max(dot(viewDirection, lightDirection), 0.0), 5.0);
    vec3 scatterColor = mix(deepTint, uMoonColor, forwardScatter * 0.46);
    // The fix for the worst live bug: the haze used to rise exactly as
    // refractedScene * transmittance fell, so raising turbidity ERASED the
    // boat's shadow. Occluding the in-scatter by the same shadow - and only by
    // the fraction of light that is direct - makes murky water show a STRONGER
    // shadow shaft, which is what murky water does.
    vec3 refraction = refractedScene * transmittance
      + scatterColor * scatterAmount * scatterLight
      * mix(1.0, shadow, clamp(uKeyDirectShare * uWaterShadowStrength, 0.0, 1.0))
      * (0.82 + forwardScatter * clamp(uMoonIntensity, 0.0, 4.0) * 0.2);
    // The fallback still contains normal- and environment-driven variation;
    // an unavailable offscreen target must never turn the surface into a flat
    // cyan rectangle.
    vec3 analyticRefraction = mix(
      deepTint * (0.72 + vHeightSample * 0.08),
      uEnvironmentHorizonColor * 0.34,
      clamp(slope * 1.7 + fresnel * 0.28, 0.0, 0.72)
    );
    refraction = mix(analyticRefraction, refraction, uRefractionActive);

    vec3 reflectedRay = reflect(-viewDirection, normal);
    reflectedRay.y = abs(reflectedRay.y);
    vec3 reflection = skyColor(reflectedRay, lightDirection, shadow);

    vec4 reflectedPosition = uReflectionMatrix * vec4(vSurfaceWorldPosition, 1.0);
    vec2 reflectUv = (reflectedPosition.xy / max(reflectedPosition.w, 0.0001)) * 0.5 + 0.5;
    float reflectionDistortion = mix(0.003, 0.012, slope)
      * (0.65 + abs(vHeightSample) * 0.5);
    reflectUv += normal.xz * reflectionDistortion;
    vec2 clampedReflectUv = clamp(reflectUv, vec2(0.002), vec2(0.998));
    vec2 pixel = max(fwidth(clampedReflectUv), vec2(0.0009)) * mix(1.0, 1.7, slope);
    vec2 pixelX = vec2(pixel.x, 0.0);
    vec2 pixelY = vec2(0.0, pixel.y);
    vec4 reflectedScene = texture2D(uReflectionTexture, clampedReflectUv) * 0.5;
    reflectedScene += texture2D(
      uReflectionTexture,
      clamp(clampedReflectUv + pixelX, vec2(0.002), vec2(0.998))
    ) * 0.125;
    reflectedScene += texture2D(
      uReflectionTexture,
      clamp(clampedReflectUv - pixelX, vec2(0.002), vec2(0.998))
    ) * 0.125;
    reflectedScene += texture2D(
      uReflectionTexture,
      clamp(clampedReflectUv + pixelY, vec2(0.002), vec2(0.998))
    ) * 0.125;
    reflectedScene += texture2D(
      uReflectionTexture,
      clamp(clampedReflectUv - pixelY, vec2(0.002), vec2(0.998))
    ) * 0.125;
    reflectedScene.rgb *= mix(vec3(1.0), reflectionTone(), 0.24);
    // A planar object reflection is only a supporting detail. Keeping it
    // below the HDR sky prevents dark mirrored silhouettes from reading as
    // hard shadows when the camera looks down at the water.
    float reflectionStrength = clamp(uReflectionIntensity * 0.24, 0.0, 0.48);
    float reflectionMask = edgeMask(reflectUv)
      * uReflectionActive
      * reflectionStrength
      * clamp(reflectedScene.a, 0.0, 1.0);
    reflection = mix(reflection, reflectedScene.rgb, reflectionMask);

    vec3 halfDirection = normalize(viewDirection + lightDirection);
    float moonHighlight = pow(max(dot(normal, halfDirection), 0.0), uMoonSpecularPower)
      * uMoonSpecularStrength
      * clamp(uMoonIntensity, 0.0, 4.0)
      * (0.3 + fresnel * 1.7);

    float glintDensity = clamp(uWaterGlintDensity, 0.0, 1.0);
    float glintSharpness = clamp(uWaterGlintSharpness, 0.0, 1.0);
    vec2 glintGrid = (vSurfaceWorldPosition.xz + normal.xz * 2.4)
      * mix(8.0, 24.0, glintDensity);
    vec2 glintCell = floor(glintGrid);
    vec2 glintOffset = vec2(
      hash12(glintCell + vec2(7.1, 2.7)),
      hash12(glintCell + vec2(3.4, 9.2))
    ) - 0.5;
    vec2 glintLocal = fract(glintGrid) - 0.5 - glintOffset * 0.56;
    float sparkleSeed = hash12(glintCell);
    float sparkleMask = smoothstep(
      mix(0.996, 0.84, glintDensity),
      1.0,
      sparkleSeed
    );
    float sparklePoint = 1.0 - smoothstep(
      mix(0.035, 0.07, glintDensity),
      mix(0.095, 0.16, glintDensity),
      length(glintLocal)
    );
    float sparkleTwinkle = 0.64 + 0.36 * sin(
      uTime * mix(3.2, 6.8, glintSharpness) + sparkleSeed * 24.0
    );
    float microfacet = pow(
      max(dot(normal, halfDirection), 0.0),
      mix(120.0, 720.0, glintSharpness)
    );
    float waterGlint = sparkleMask
      * sparklePoint
      * sparkleTwinkle
      * microfacet
      * clamp(uWaterGlintStrength, 0.0, 2.0)
      * (0.65 + fresnel * 2.2)
      * clamp(uMoonIntensity, 0.0, 4.0);

    vec3 color = mix(refraction, reflection, clamp(fresnel, 0.02, 0.96));
    color += uMoonColor * moonHighlight * shadow;
    color += mix(vec3(1.0), uMoonColor, 0.2) * waterGlint * 1.6 * shadow;
    // A small neutral-blue crest lift keeps ripples legible without coupling
    // the reflection colour control to the water volume.
    color += vec3(0.07, 0.11, 0.14) * max(vHeightSample, 0.0) * 0.035;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
