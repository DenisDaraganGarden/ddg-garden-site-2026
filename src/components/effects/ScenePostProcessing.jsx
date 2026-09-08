import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { postVertexShader, postFragmentShader, bloomPrefilterFragmentShader, bloomBlurFragmentShader, FILM_NOISE_TEXTURE_SIZE } from './scenePostShaders';
import { getRenderTargetCapabilities } from './renderTargetCapabilities';
import { createSpatialUpscaler, getSpatialUpscaleSize, UPSCALE_SCALES } from './spatialUpscale';
import { captureContactAoDepth, contactAoFragmentShader, contactAoVertexShader, createContactAoTargets } from './contactAO';
import { useCloudScene } from './sky/painterly/CloudSceneContext.jsx';
import {
  createCloudShadowUniforms,
  updateCloudShadowUniforms,
} from './sky/painterly/cloudShadowRuntime.js';
import {
  getCursorFlashlightRuntime,
  getCursorFlashlightWorldRuntime,
} from '../../features/cursor/cursorFlashlightStore';
import { EDITOR_THUMBNAIL_REQUEST, publishEditorThumbnail } from './editorThumbnailCapture';

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
  const cloudScene = useCloudScene();
  const isLowPower = qualityProfile?.isLowPower === true;
  const capabilities = useMemo(() => getRenderTargetCapabilities(gl), [gl]);
  const upscaleRequested = settings.upscaleMode === 'fsr1';
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
  const upscaleEnabled = upscaleRequested && postProcessingSupported && settings.postProcessingEnabled && settings.debugView === 'beauty';
  // Keep the combined mobile/adaptive scale inside FSR 1's 2x spatial range.
  const renderScale = upscaleEnabled
    ? Math.max(0.5, (qualityProfile?.postRenderScale ?? 1) * (UPSCALE_SCALES[settings.upscaleQuality] ?? UPSCALE_SCALES.quality))
    : qualityProfile?.postRenderScale ?? 1;
  const upscaler = useMemo(() => upscaleEnabled ? createSpatialUpscaler() : null, [upscaleEnabled]);
  const postColorType = qualityProfile?.postColorType === 'rgba8'
    ? THREE.UnsignedByteType
    : qualityProfile?.postColorType === 'half-float'
      ? THREE.HalfFloatType
      : isLowPower
        ? THREE.UnsignedByteType
        : THREE.HalfFloatType;
  const aaPreference = settings.postAntiAliasing ?? 'auto';
  const canResolveMsaa = postColorType === THREE.HalfFloatType
    ? capabilities.post?.msaaHalfFloatResolve === true
    : capabilities.post?.msaaRgba8Resolve === true;
  const effectiveSamples = postProcessingSupported && canResolveMsaa && aaPreference !== 'fxaa' && aaPreference !== 'off'
    // The raw capability probe verifies the resolve at 4 samples. Do not claim
    // an untested 8x path merely because the context advertises it.
    ? Math.min(requestedSamples, 4, gl.capabilities.maxSamples ?? requestedSamples)
    : 0;
  const effectiveFxaa = postProcessingSupported
    && effectiveSamples === 0
    && aaPreference !== 'off';
  const contactAoEnabled = settings.contactAoEnabled === true && postProcessingSupported;
  const drawingBufferSize = useRef(new THREE.Vector2());
  const lastTargetSize = useRef(new THREE.Vector2());
  const sunPoint = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());
  const sunDirection = useMemo(() => new THREE.Vector3(), []);
  const noiseTexture = useMemo(() => createNoiseTexture(), []);
  const filmNoiseTexture = useMemo(() => createFilmNoiseTexture(), []);
  const cloudShadowUniforms = useMemo(() => createCloudShadowUniforms(), []);
  // Focus asks once per explicit camera capture. Keeping the request here means
  // the default framebuffer is sampled immediately after the final post pass,
  // without a permanent preserveDrawingBuffer or an extra render.
  const thumbnailRequest = useRef(null);
  useEffect(() => {
    const receive = (event) => {
      const key = event.detail?.key;
      if (typeof key === 'string' && key) thumbnailRequest.current = key;
    };
    window.addEventListener(EDITOR_THUMBNAIL_REQUEST, receive);
    return () => window.removeEventListener(EDITOR_THUMBNAIL_REQUEST, receive);
  }, []);
  const publishThumbnail = () => {
    const key = thumbnailRequest.current;
    if (!key) return;
    thumbnailRequest.current = null;
    try {
      const source = gl.domElement;
      const width = Math.min(320, source.width);
      const height = Math.max(1, Math.round(source.height * (width / source.width)));
      const thumbnail = document.createElement('canvas');
      thumbnail.width = width;
      thumbnail.height = height;
      const context = thumbnail.getContext('2d');
      if (!context) return;
      context.drawImage(source, 0, 0, width, height);
      publishEditorThumbnail(key, thumbnail.toDataURL('image/webp', 0.68));
    } catch {
      // A context loss or a strict canvas may decline a thumbnail; the editor
      // keeps its neutral tile and the scene render remains untouched.
    }
  };
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
    target.samples = effectiveSamples;
    return target;
  }, [effectiveSamples, postColorType, postProcessingSupported]);
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
  const contactAo = useMemo(() => createContactAoTargets(), []);
  const contactAoUniforms = useMemo(() => ({
    uDepth: { value: contactAo.depthTarget.depthTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 }, uFar: { value: 1000 },
    uRadius: { value: 0.5 }, uIntensity: { value: 0.35 }, uLogDepth: { value: 1 },
    uProjectionInverse: { value: new THREE.Matrix4() }, uProjection: { value: new THREE.Matrix4() },
  }), [contactAo]);
  const contactAoMaterial = useMemo(() => new THREE.ShaderMaterial({ uniforms: contactAoUniforms, vertexShader: contactAoVertexShader, fragmentShader: contactAoFragmentShader, depthTest: false, depthWrite: false }), [contactAoUniforms]);
  const contactAoScene = useMemo(() => { const next = new THREE.Scene(); next.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), contactAoMaterial)); return next; }, [contactAoMaterial]);
  const contactAoCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const uniforms = useMemo(() => ({
    uColorTexture: { value: renderTarget.texture },
    uBloomTexture: { value: bloomTargets[0].texture },
    uDepthTexture: { value: renderTarget.depthTexture },
    uNoiseTexture: { value: noiseTexture },
    uFilmNoiseTexture: { value: filmNoiseTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // Feature toggles update these mutable uniforms below. Keeping them out of
    // this memo is essential: rebuilding uResolution at 1x1 while the already
    // sized target stays alive makes every FXAA offset span the whole image.
    uFxaaEnabled: { value: 0 },
    uContactAoTexture: { value: contactAo.aoTarget.texture },
    uContactAoDepthTexture: { value: contactAo.depthTarget.depthTexture },
    uContactAoResolution: { value: new THREE.Vector2(1, 1) },
    uContactAoEnabled: { value: 0 },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uSunColor: { value: new THREE.Color('#ffffff') },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uCameraProjectionInverse: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uCameraWorldPosition: { value: new THREE.Vector3() },
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
    uPainterlyCloudRays: { value: 0.35 },
    uPainterlyCloudDay: { value: 1 },
    uFogMode: { value: 0 },
    uFogColor: { value: new THREE.Color('#000000') },
    uFogHorizonColor: { value: new THREE.Color('#000000') },
    uFogSkyTint: { value: 0 },
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
    ...cloudShadowUniforms,
  }), [bloomTargets, cloudShadowUniforms, contactAo, filmNoiseTexture, isLowPower, noiseTexture, renderTarget]);
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
  const upscalePasses = useMemo(() => {
    if (!upscaler) return null;
    const surface = (passUniforms, define) => {
      const material = new THREE.ShaderMaterial({
        uniforms: passUniforms, defines: { [define]: 1 }, vertexShader: postVertexShader,
        fragmentShader: postFragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
      });
      const passScene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(2, 2);
      passScene.add(new THREE.Mesh(geometry, material));
      return { scene: passScene, uniforms: passUniforms, dispose() { geometry.dispose(); material.dispose(); } };
    };
    return {
      grade: surface({ ...uniforms, uFilmGateWeaveAmount: { value: 0 }, uToneMappingExposure: { value: 1 } }, 'DDG_UPSCALE_PREPASS'),
      present: surface({ ...uniforms, uColorTexture: { value: upscaler.output.texture }, uResolution: { value: new THREE.Vector2() }, uUpscaleSharpness: { value: 0.25 } }, 'DDG_UPSCALE_PRESENT'),
    };
  }, [uniforms, upscaler]);
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
    uniforms.uFxaaEnabled.value = effectiveFxaa ? 1 : 0;
    uniforms.uContactAoEnabled.value = contactAoEnabled ? 1 : 0;
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
    uniforms.uPainterlyCloudRays.value = finiteSetting(settings.painterlyCloudRays, 0.35);
    uniforms.uPainterlyCloudDay.value = THREE.MathUtils.smoothstep(
      finiteSetting(lighting.sky?.sunElevationDeg, -90),
      -4,
      6,
    );
    uniforms.uFogMode.value = fogModes[fogMode] ?? 0;
    uniforms.uFogColor.value.set(settings.fogColor);
    uniforms.uFogHorizonColor.value.fromArray(lighting.environment.horizon.linear);
    uniforms.uFogSkyTint.value = settings.fogSkyTint;
    uniforms.uFogDensity.value = settings.fogDensity;
    uniforms.uFogNear.value = settings.fogNear;
    uniforms.uFogFar.value = settings.fogFar;
    uniforms.uFogNoiseScale.value = settings.fogNoiseScale;
    uniforms.uFogSpeed.value = settings.fogSpeed;
    uniforms.uFogScattering.value = settings.fogScattering;
    uniforms.uFogSampleCount.value = fogSampleCount;
    uniforms.uSunColor.value.fromArray(lighting.key.colorLinear);
  }, [bloomPrefilterUniforms, contactAoEnabled, effectiveFxaa, fogSampleCount, isLowPower, lighting.environment.horizon.linear, lighting.key.colorLinear, lighting.sky?.sunElevationDeg, settings, sunRaySampleCount, uniforms]);

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
  useEffect(() => () => upscaler?.dispose(), [upscaler]);
  useEffect(() => () => { upscalePasses?.grade.dispose(); upscalePasses?.present.dispose(); }, [upscalePasses]);
  useEffect(
    () => () => bloomTargets.forEach((target) => target.dispose()),
    [bloomTargets],
  );
  useEffect(() => () => noiseTexture.dispose(), [noiseTexture]);
  useEffect(() => () => filmNoiseTexture.dispose(), [filmNoiseTexture]);
  useEffect(() => () => { contactAo.depthTarget.dispose(); contactAo.aoTarget.dispose(); contactAoScene.children[0]?.geometry?.dispose(); contactAoMaterial.dispose(); }, [contactAo, contactAoMaterial, contactAoScene]);

  useEffect(() => {
    gl.domElement.dataset.ddgPostSamples = String(renderTarget.samples);
    gl.domElement.dataset.ddgEffectiveAa = renderTarget.samples > 0
      ? `msaa-${renderTarget.samples}`
      : effectiveFxaa ? 'fxaa' : 'off';
    gl.domElement.dataset.ddgContactAo = contactAoEnabled ? 'half-opaque-depth' : 'off';
    gl.domElement.dataset.ddgPostStatus = postProcessingSupported ? 'ready' : 'default-framebuffer';
    gl.domElement.dataset.ddgBloomPipeline = isLowPower ? 'quarter-tent-1' : 'quarter-tent-2';
    gl.domElement.dataset.ddgSunRays = `sun-occlusion-${sunRaySampleCount}`;
    gl.domElement.dataset.ddgFogSamples = String(fogSampleCount);
    gl.domElement.dataset.ddgCursorFlashlightFog = 'local-relief';
    return () => {
      delete gl.domElement.dataset.ddgPostSamples;
      delete gl.domElement.dataset.ddgEffectiveAa;
      delete gl.domElement.dataset.ddgContactAo;
      delete gl.domElement.dataset.ddgContactAoDimensions;
      delete gl.domElement.dataset.ddgPostDimensions;
      delete gl.domElement.dataset.ddgPostStatus;
      delete gl.domElement.dataset.ddgBloomPipeline;
      delete gl.domElement.dataset.ddgSunRays;
      delete gl.domElement.dataset.ddgFogSamples;
      delete gl.domElement.dataset.ddgCursorFlashlightFog;
    };
  }, [contactAoEnabled, effectiveFxaa, fogSampleCount, gl, isLowPower, postProcessingSupported, renderTarget.samples, sunRaySampleCount]);

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
      gl.domElement.dataset.ddgUpscale = 'off';
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      publishThumbnail();
      return;
    }

    gl.getDrawingBufferSize(drawingBufferSize.current);
    const targetSize = upscaler
      ? getSpatialUpscaleSize(drawingBufferSize.current.x, drawingBufferSize.current.y, renderScale)
      : { width: Math.max(1, Math.round(drawingBufferSize.current.x * renderScale)), height: Math.max(1, Math.round(drawingBufferSize.current.y * renderScale)) };
    const { width, height } = targetSize;
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
    // Keep diagnostics present across feature toggles; those do not resize the
    // main target and therefore must not be coupled to the resize branch.
    // Set dimensions every frame as a lifecycle guard too. A future material
    // rebuild must never inherit its 1x1 construction value while a correctly
    // sized target is retained.
    uniforms.uResolution.value.set(width, height);
    gl.domElement.dataset.ddgPostDimensions = `${width}x${height}`;

    if (contactAoEnabled) {
      const aoWidth = Math.max(1, Math.ceil(width * 0.5));
      const aoHeight = Math.max(1, Math.ceil(height * 0.5));
      if (contactAo.depthTarget.width !== aoWidth || contactAo.depthTarget.height !== aoHeight) {
        contactAo.depthTarget.setSize(aoWidth, aoHeight);
        contactAo.aoTarget.setSize(aoWidth, aoHeight);
        contactAoUniforms.uResolution.value.set(aoWidth, aoHeight);
      }
      uniforms.uContactAoResolution.value.set(aoWidth, aoHeight);
      contactAoUniforms.uResolution.value.set(aoWidth, aoHeight);
      contactAoUniforms.uNear.value = camera.near;
      contactAoUniforms.uFar.value = camera.far;
      contactAoUniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
      contactAoUniforms.uProjection.value.copy(camera.projectionMatrix);
      contactAoUniforms.uRadius.value = settings.contactAoRadius ?? 0.5;
      contactAoUniforms.uIntensity.value = settings.contactAoIntensity ?? 0.35;
      contactAoUniforms.uLogDepth.value = gl.capabilities.logarithmicDepthBuffer ? 1 : 0;
      captureContactAoDepth({ gl, scene, camera, target: contactAo.depthTarget });
      gl.setRenderTarget(contactAo.aoTarget);
      gl.clear(true, false, false);
      gl.render(contactAoScene, contactAoCamera);
      gl.domElement.dataset.ddgContactAoDimensions = `${aoWidth}x${aoHeight}`;
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
    uniforms.uSunVisible.value = (facesSun && screenMask > 0.0001)
      ? lighting.sky.sunVisibility
      : 0;
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
    uniforms.uCameraProjectionInverse.value.copy(camera.projectionMatrixInverse);
    uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    uniforms.uCameraWorldPosition.value.setFromMatrixPosition(camera.matrixWorld);
    updateCloudShadowUniforms(cloudShadowUniforms, cloudScene?.current);
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
      // The 9-tap tent only stays a tent while its taps touch. Past an offset of
      // about one texel the composed pattern opens holes and the "bloom" becomes
      // a lattice of replicas of the bright pixel. The published radius, 0.09,
      // is nowhere near the clamp; the engine default of 0.58 is well past it.
      bloomBlurUniforms.uOffset.value = Math.min(1.05, 0.8 + settings.bloomRadius * 2.7);
      gl.setRenderTarget(bloomTargets[1]);
      gl.clear(true, false, false);
      gl.render(bloomBlurScene, postCamera);

      if (isLowPower) {
        uniforms.uBloomTexture.value = bloomTargets[1].texture;
      } else {
        bloomBlurUniforms.uBloomTexture.value = bloomTargets[1].texture;
        bloomBlurUniforms.uOffset.value = Math.min(2.0, 1.4 + settings.bloomRadius * 4.6);
        gl.setRenderTarget(bloomTargets[0]);
        gl.clear(true, false, false);
        gl.render(bloomBlurScene, postCamera);
        uniforms.uBloomTexture.value = bloomTargets[0].texture;
      }
    }

    if (upscaler && upscalePasses && (width < drawingBufferSize.current.x || height < drawingBufferSize.current.y)) {
      upscaler.resize(width, height, drawingBufferSize.current.x, drawingBufferSize.current.y);
      upscalePasses.grade.uniforms.uToneMappingExposure.value = gl.toneMappingExposure;
      gl.setRenderTarget(upscaler.input);
      gl.render(upscalePasses.grade.scene, postCamera);
      gl.setRenderTarget(upscaler.output);
      gl.render(upscaler.scene, postCamera);
      upscalePasses.present.uniforms.uResolution.value.copy(drawingBufferSize.current);
      upscalePasses.present.uniforms.uUpscaleSharpness.value = settings.upscaleSharpness ?? 0.25;
      gl.setRenderTarget(null);
      gl.render(upscalePasses.present.scene, postCamera);
      gl.domElement.dataset.ddgUpscale = `fsr1:${width}x${height}->${drawingBufferSize.current.x}x${drawingBufferSize.current.y}`;
    } else {
      gl.setRenderTarget(null);
      gl.render(postScene, postCamera);
      gl.domElement.dataset.ddgUpscale = upscaler ? 'native-small-frame' : 'off';
    }
    publishThumbnail();
  }, 100);

  return null;
}
