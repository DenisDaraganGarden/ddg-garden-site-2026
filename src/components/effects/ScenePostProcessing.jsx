import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const postVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uColorTexture;
  uniform sampler2D uDepthTexture;
  uniform sampler2D uNoiseTexture;
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

  uniform float uBloomEnabled;
  uniform float uBloomStrength;
  uniform float uBloomThreshold;
  uniform float uBloomRadius;
  uniform float uBloomTapCount;

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

  uniform float uFogMode;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogNoiseScale;
  uniform float uFogSpeed;
  uniform float uFogScattering;

  #include <common>
  #include <dithering_pars_fragment>

  float getViewDistance(float depth) {
    float viewZ = (uCameraNear * uCameraFar)
      / ((uCameraFar - uCameraNear) * depth - uCameraFar);
    return max(-viewZ, 0.0);
  }

  float ddgLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 brightPass(vec3 color) {
    float brightness = max(max(color.r, color.g), color.b);
    float contribution = smoothstep(
      max(uBloomThreshold - 0.12, 0.0),
      uBloomThreshold + 0.16,
      brightness
    );
    return color * contribution;
  }

  vec3 sampleBloom(vec2 uv) {
    vec2 pixel = 1.0 / max(uResolution, vec2(1.0));
    vec2 radius = pixel * mix(1.5, 11.0, clamp(uBloomRadius, 0.0, 1.0));
    vec3 bloom = brightPass(texture2D(uColorTexture, uv).rgb) * 0.16;
    bloom += brightPass(texture2D(uColorTexture, uv + vec2(radius.x, 0.0)).rgb) * 0.105;
    bloom += brightPass(texture2D(uColorTexture, uv - vec2(radius.x, 0.0)).rgb) * 0.105;
    bloom += brightPass(texture2D(uColorTexture, uv + vec2(0.0, radius.y)).rgb) * 0.105;
    bloom += brightPass(texture2D(uColorTexture, uv - vec2(0.0, radius.y)).rgb) * 0.105;
    bloom += brightPass(texture2D(uColorTexture, uv + radius).rgb) * 0.07;
    bloom += brightPass(texture2D(uColorTexture, uv - radius).rgb) * 0.07;
    bloom += brightPass(texture2D(uColorTexture, uv + vec2(radius.x, -radius.y)).rgb) * 0.07;
    bloom += brightPass(texture2D(uColorTexture, uv + vec2(-radius.x, radius.y)).rgb) * 0.07;
    // The wide tail is a modest visual gain for desktop but four additional
    // texture fetches per pixel. Low-power profiles stop at the 9-tap core.
    if (uBloomTapCount > 9.0) {
      vec2 wide = radius * 2.35;
      bloom += brightPass(texture2D(uColorTexture, uv + vec2(wide.x, 0.0)).rgb) * 0.035;
      bloom += brightPass(texture2D(uColorTexture, uv - vec2(wide.x, 0.0)).rgb) * 0.035;
      bloom += brightPass(texture2D(uColorTexture, uv + vec2(0.0, wide.y)).rgb) * 0.035;
      bloom += brightPass(texture2D(uColorTexture, uv - vec2(0.0, wide.y)).rgb) * 0.035;
    }
    return bloom;
  }

  float sampleSunRays(vec2 uv) {
    vec2 stepVector = (uv - uSunUv)
      * clamp(uSunRaysDensity, 0.0, 1.5)
      / max(uSunRaySampleCount, 1.0);
    vec2 sampleUv = uv;
    float illumination = 1.0;
    float rays = 0.0;

    for (int index = 0; index < 18; index += 1) {
      if (float(index) >= uSunRaySampleCount) {
        break;
      }
      sampleUv -= stepVector;
      vec3 sampleColor = texture2D(uColorTexture, clamp(sampleUv, 0.001, 0.999)).rgb;
      float source = smoothstep(0.48, 1.08, ddgLuminance(sampleColor));
      rays += source * illumination;
      illumination *= clamp(uSunRaysDecay, 0.72, 0.995);
    }

    float screenMask = smoothstep(0.0, 0.08, uSunUv.x)
      * smoothstep(1.0, 0.92, uSunUv.x)
      * smoothstep(0.0, 0.08, uSunUv.y)
      * smoothstep(1.0, 0.92, uSunUv.y);
    return rays / max(uSunRaySampleCount, 1.0) * screenMask * uSunVisible;
  }

  float sampleFogNoise(vec2 uv, float distanceRatio) {
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
        float layer = (float(index) + 0.5) / 8.0;
        vec2 layerUv = baseUv
          * (1.0 + layer * 0.72)
          + vec2(layer * 0.31, -layer * 0.19)
          // uSunUv is unbounded: with the key light above the frame it reaches ~4.7,
          // which turned this per-pixel, depth-driven warp into a jump of whole noise
          // tiles between neighbouring pixels. On an animated water surface that is
          // the flicker. Clamping keeps the parallax but bounds it to +/-0.14 uv.
          + (clamp(uSunUv, 0.0, 1.0) - 0.5) * layer * distanceRatio * 0.28;
        float layerWeight = mix(1.0, 0.42, layer);
        volume += texture2D(uNoiseTexture, layerUv).r * layerWeight;
        weight += layerWeight;
      }
      noiseValue = volume / max(weight, 0.001);
    }

    return noiseValue;
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

  void main() {
    vec3 color = texture2D(uColorTexture, vUv).rgb;

    if (uBloomEnabled > 0.5 && uBloomStrength > 0.0001) {
      color += sampleBloom(vUv) * uBloomStrength;
    }

    float rays = 0.0;
    // uSunVisible now carries the CPU-side screen mask too. Without that test the
    // loop below ran its 18 dependent texture fetches per pixel and multiplied the
    // result by a zero mask - a guaranteed no-op paid for on every frame whenever
    // the key light sits outside the frame, which the letterboxed band makes common.
    if (uSunRaysEnabled > 0.5 && uSunRaysIntensity > 0.0001 && uSunVisible > 0.5) {
      rays = sampleSunRays(vUv);
    }

    float depth = texture2D(uDepthTexture, vUv).r;
    if (uFogMode > 0.5 && uFogDensity > 0.0001 && depth < 0.999999) {
      float viewDistance = getViewDistance(depth);
      float distanceRatio = smoothstep(
        uFogNear,
        max(uFogFar, uFogNear + 0.001),
        viewDistance
      );
      float noiseValue = sampleFogNoise(vUv, distanceRatio);
      float densityShape = mix(0.72, 1.32, noiseValue);
      float fogAmount = 1.0 - exp(
        -distanceRatio
        * clamp(uFogDensity, 0.0, 1.0)
        * densityShape
        * mix(2.2, 3.4, step(1.5, uFogMode))
      );
      float sunHalo = pow(max(1.0 - distance(vUv, uSunUv), 0.0), 7.0) * uSunVisible;
      // Scaled by the ray intensity like the direct term below it. Without that
      // the slider was discontinuous at zero: with fog on, turning the rays off
      // still left them at full strength inside the fog.
      vec3 scatteredFog = uFogColor
        + uSunColor * (rays * 1.6 + sunHalo * 0.18)
          * uFogScattering * clamp(uSunRaysIntensity, 0.0, 2.0);
      color = mix(color, scatteredFog, clamp(fogAmount, 0.0, 0.94));
    }

    color += uSunColor * rays * uSunRaysIntensity * (0.68 + uFogScattering * 0.52);
    color *= exp2(uExposure);
    color = (color - 0.5) * uContrast + 0.5;
    float gray = ddgLuminance(color);
    color = mix(vec3(gray), color, uSaturation);
    color = rotateHue(color, uHue);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / max(uGamma, 0.01)));

    if (uGrainEnabled > 0.5 && uGrainIntensity > 0.0001) {
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

const toEnabledFloat = (value) => (value ? 1 : 0);

export default function ScenePostProcessing({ settings, qualityProfile, lighting }) {
  const { gl, scene, camera } = useThree();
  const isLowPower = qualityProfile?.isLowPower === true;
  const renderScale = qualityProfile?.postRenderScale ?? 1;
  const drawingBufferSize = useRef(new THREE.Vector2());
  const lastTargetSize = useRef(new THREE.Vector2());
  const sunPoint = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());
  const sunDirection = useMemo(() => new THREE.Vector3(), []);
  const noiseTexture = useMemo(() => createNoiseTexture(), []);
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
      type: isLowPower ? THREE.UnsignedByteType : THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true,
      generateMipmaps: false,
    });
    target.texture.name = 'home-scene-post-color';
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
    target.depthTexture.format = THREE.DepthStencilFormat;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
    target.depthTexture.generateMipmaps = false;
    target.depthTexture.name = 'home-scene-post-depth';
    return target;
  }, [isLowPower]);
  const uniforms = useMemo(() => ({
    uColorTexture: { value: renderTarget.texture },
    uDepthTexture: { value: renderTarget.depthTexture },
    uNoiseTexture: { value: noiseTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uSunColor: { value: new THREE.Color(settings.moonColor) },
    uCameraNear: { value: camera.near },
    uCameraFar: { value: camera.far },
    uTime: { value: 0 },
    uGrainEnabled: { value: 0 },
    uGrainIntensity: { value: 0 },
    uGrainSize: { value: 1 },
    uGrainSpeed: { value: 1 },
    uBloomEnabled: { value: 0 },
    uBloomStrength: { value: 0 },
    uBloomThreshold: { value: 0.7 },
    uBloomRadius: { value: 0.5 },
    uBloomTapCount: { value: 13 },
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
    uFogMode: { value: 0 },
    uFogColor: { value: new THREE.Color(settings.fogColor) },
    uFogDensity: { value: 0 },
    uFogNear: { value: 1 },
    uFogFar: { value: 24 },
    uFogNoiseScale: { value: 1 },
    uFogSpeed: { value: 0 },
    uFogScattering: { value: 0 },
  }), [camera.far, camera.near, noiseTexture, renderTarget, settings.fogColor, settings.moonColor]);
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

  useEffect(() => {
    const fogModes = { off: 0, cheap: 1, volumetric: 2 };
    const fogMode = isLowPower && settings.fogMode === 'volumetric'
      ? 'cheap'
      : settings.fogMode;
    uniforms.uGrainEnabled.value = toEnabledFloat(settings.filmGrainEnabled);
    uniforms.uGrainIntensity.value = settings.filmGrainIntensity;
    uniforms.uGrainSize.value = settings.filmGrainSize;
    uniforms.uGrainSpeed.value = settings.filmGrainSpeed;
    uniforms.uBloomEnabled.value = toEnabledFloat(!isLowPower && settings.bloomEnabled);
    uniforms.uBloomStrength.value = settings.bloomStrength;
    uniforms.uBloomThreshold.value = settings.bloomThreshold;
    uniforms.uBloomRadius.value = settings.bloomRadius;
    uniforms.uBloomTapCount.value = isLowPower ? 9 : 13;
    uniforms.uContrast.value = settings.colorContrast;
    uniforms.uSaturation.value = settings.colorSaturation;
    uniforms.uHue.value = THREE.MathUtils.degToRad(settings.colorHue);
    uniforms.uGamma.value = settings.colorGamma;
    uniforms.uExposure.value = settings.colorExposure;
    uniforms.uSunRaysEnabled.value = toEnabledFloat(!isLowPower && settings.sunRaysEnabled);
    uniforms.uSunRaysIntensity.value = settings.sunRaysIntensity;
    uniforms.uSunRaysDecay.value = settings.sunRaysDecay;
    uniforms.uSunRaysDensity.value = settings.sunRaysDensity;
    uniforms.uSunRaySampleCount.value = isLowPower ? 8 : 18;
    uniforms.uFogMode.value = fogModes[fogMode] ?? 0;
    uniforms.uFogColor.value.set(settings.fogColor);
    uniforms.uFogDensity.value = settings.fogDensity;
    uniforms.uFogNear.value = settings.fogNear;
    uniforms.uFogFar.value = settings.fogFar;
    uniforms.uFogNoiseScale.value = settings.fogNoiseScale;
    uniforms.uFogSpeed.value = settings.fogSpeed;
    uniforms.uFogScattering.value = settings.fogScattering;
    uniforms.uSunColor.value.set(settings.moonColor);
  }, [isLowPower, settings, uniforms]);

  useEffect(() => () => {
    const quad = postScene.children[0];
    quad?.geometry?.dispose();
    postMaterial.dispose();
    renderTarget.dispose();
    noiseTexture.dispose();
  }, [noiseTexture, postMaterial, postScene, renderTarget]);

  useFrame(({ clock }) => {
    const enabled = settings.postProcessingEnabled && settings.debugView === 'beauty';
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    gl.getDrawingBufferSize(drawingBufferSize.current);
    const width = Math.max(1, Math.round(drawingBufferSize.current.x * renderScale));
    const height = Math.max(1, Math.round(drawingBufferSize.current.y * renderScale));
    if (lastTargetSize.current.x !== width || lastTargetSize.current.y !== height) {
      renderTarget.setSize(width, height);
      lastTargetSize.current.set(width, height);
      uniforms.uResolution.value.set(width, height);
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
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    uniforms.uTime.value = clock.elapsedTime;

    gl.setRenderTarget(renderTarget);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(postScene, postCamera);
  }, 100);

  return null;
}
