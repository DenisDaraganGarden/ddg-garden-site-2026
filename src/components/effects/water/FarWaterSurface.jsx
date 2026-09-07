import { coastShader, createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { sceneDepthVertex, sceneDepthFragment } from '../shaders/sceneDepth';
import { reflectionContext } from './reflectionContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyShaderChunk } from '../shaders/skyShader';
import { farWaterBodyShader, farWaterSwellShader } from '../shaders/farWaterOptics';
import { buildFarWaterFieldData } from './farWaterGeometry';
import { DDG_CLOUD_SHADOW_GLSL, createCloudShadowUniforms, updateCloudShadowUniforms } from '../sky/painterly/cloudShadowRuntime.js';
import { useCloudScene } from '../sky/painterly/CloudSceneContext.jsx';

const farWaterVertexShader = /* glsl */`
  ${coastShader}
  uniform float uTime;
  uniform float uShoreMode;
  uniform mat4 uKeyShadowMatrix;
  uniform mat4 uKeyShadowMatrixFar;
  varying vec3 vWorldPosition;
  varying vec4 vKeyShadowCoord;
  varying vec4 vKeyShadowCoordFar;
  varying float vKeyShadowViewDepth;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    if (uShoreMode > 0.5) worldPosition.y += coastWave(coastLocal(worldPosition.xz), uTime);
    vWorldPosition = worldPosition.xyz;
    vKeyShadowCoord = uKeyShadowMatrix * worldPosition;
    vKeyShadowCoordFar = uKeyShadowMatrixFar * worldPosition;
    vec4 viewPosition = viewMatrix * worldPosition;
    vKeyShadowViewDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const farWaterFragmentShader = /* glsl */`
  ${skyShaderChunk}
  ${DDG_CLOUD_SHADOW_GLSL}
  ${coastShader}
  ${farWaterBodyShader}
  ${farWaterSwellShader}
  uniform float uShoreMode;
  uniform sampler2D uCoastRefraction;
  uniform float uCoastRefractionActive;
  uniform sampler2D uCoastDepth;
  uniform float uCoastDepthActive;
  uniform mat4 uCoastRefractionMatrix;
  uniform mat4 uCoastRefractionViewMatrix;
  uniform vec2 uCoastRefractionCameraRange;
  uniform float uCoastTurbidity;
  uniform float uCoastScattering;
  uniform vec3 uCoastKeyColor;
  uniform float uCoastKeyIntensity;
  uniform highp sampler2DShadow uKeyShadowMap;
  uniform highp sampler2DShadow uKeyShadowMapFar;
  uniform mat4 uKeyShadowMatrix;
  uniform float uKeyShadowFarActive;
  uniform float uKeyShadowFarBias;
  uniform vec2 uKeyShadowFarTexelSize;
  uniform float uKeyShadowFarRadius;
  uniform float uKeyShadowSplit;
  uniform float uKeyShadowActive;
  uniform float uKeyShadowBias;
  uniform vec2 uKeyShadowTexelSize;
  uniform float uKeyShadowRadius;
  uniform float uKeyDirectShare;
  uniform float uShadowIntensity;
  uniform float uWaterShadowStrength;
  uniform vec3 uFoamKeyRadiance;
  uniform vec3 uFoamFillRadiance;

  varying vec3 vWorldPosition;
  varying vec4 vKeyShadowCoord;
  varying vec4 vKeyShadowCoordFar;
  varying float vKeyShadowViewDepth;

  uniform sampler2D uPlanarReflection;
  uniform mat4 uReflectionMatrix;
  uniform float uHasReflection;
  uniform float uObjectReflection;
  uniform vec3 uSurfaceColor;
  uniform vec3 uWaterTint;
  uniform vec3 uWaterScatteringColor;
  uniform vec3 uEnvironmentHorizonColor;
  uniform float uEnvironmentExposure;
  uniform float uEnvironmentReflection;
  uniform float uWaveStrength;
  uniform float uWaveSpeed;
  uniform float uInnerHalfExtent;
  uniform float uPondHalfExtent;
  uniform float uSurfaceBlendWidth;
  uniform float uTime;

  #include <common>
  #include <dithering_pars_fragment>

  vec3 reflectionTone() {
    vec3 tint = max(uWaterTint, vec3(0.0));
    float luminance = dot(tint, vec3(0.2126, 0.7152, 0.0722));
    vec3 chroma = luminance > 0.001
      ? clamp(tint / luminance, vec3(0.35), vec3(2.2))
      : vec3(1.0);
    float value = mix(0.45, 1.0, sqrt(clamp(luminance, 0.0, 1.0)));
    return chroma * value;
  }

  float sampleKeyShadow(sampler2DShadow shadowMap, vec4 shadowCoord, float isActive, float bias, vec2 texelSize, float radius) {
    if (isActive < 0.5) return 1.0;
    vec3 coord = shadowCoord.xyz / max(shadowCoord.w, 1e-5);
    if (coord.z > 1.0 || any(lessThan(coord.xy, vec2(0.0))) || any(greaterThan(coord.xy, vec2(1.0)))) return 1.0;
    float depth = coord.z + bias;
    vec2 stepSize = texelSize * max(0.5, radius);
    float lit = texture(shadowMap, vec3(coord.xy, depth)) * .28;
    lit += texture(shadowMap, vec3(coord.xy + vec2(stepSize.x, 0.0), depth)) * .18;
    lit += texture(shadowMap, vec3(coord.xy - vec2(stepSize.x, 0.0), depth)) * .18;
    lit += texture(shadowMap, vec3(coord.xy + vec2(0.0, stepSize.y), depth)) * .18;
    lit += texture(shadowMap, vec3(coord.xy - vec2(0.0, stepSize.y), depth)) * .18;
    return mix(1.0, lit, clamp(uShadowIntensity, 0.0, 1.0));
  }
  float keyShadow() {
    float nearShadow = sampleKeyShadow(uKeyShadowMap, vKeyShadowCoord, uKeyShadowActive, uKeyShadowBias, uKeyShadowTexelSize, uKeyShadowRadius);
    float farShadow = sampleKeyShadow(uKeyShadowMapFar, vKeyShadowCoordFar, uKeyShadowFarActive, uKeyShadowFarBias, uKeyShadowFarTexelSize, uKeyShadowFarRadius);
    float cascadeBlend = smoothstep(uKeyShadowSplit - 2.0, uKeyShadowSplit + 2.0, vKeyShadowViewDepth) * step(0.5, uKeyShadowFarActive);
    return mix(nearShadow, farShadow, cascadeBlend);
  }

  float coastDepthToViewZ(float depth) {
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    return 1.0 - exp2(depth * log2(uCoastRefractionCameraRange.y + 1.0));
#else
    float nearPlane = uCoastRefractionCameraRange.x;
    float farPlane = uCoastRefractionCameraRange.y;
    return (nearPlane * farPlane) / ((farPlane - nearPlane) * depth - farPlane);
#endif
  }

  void main() {
    vec2 qs=coastLocal(vWorldPosition.xz);
    if (max(abs(vWorldPosition.x), abs(vWorldPosition.z)) < mix(uInnerHalfExtent,uPondHalfExtent,uCoastShape.x)) {
      discard;
    }

    float ground=coastHeight(qs);
    if(uCoastShape.x>.5){
      if(coastMask(qs)>.001 && ground>vWorldPosition.y+.004)discard;
      // Half a metre past the strip edge: the cut is the analytic q of a 40 km
      // quad's interpolated position, which jitters by millimetres, and a cut
      // exactly on the edge left a dotted line of uncovered pixels along the
      // coast. The strip dips a centimetre under this band (waterV2Shaders.js).
      if(uShoreMode<.5 && abs(qs.y)<uCoastDimensions.x*.5 && qs.x>-coastOffshore()+.5 && qs.x<8.0)discard;
    }
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float cameraDistance = distance(cameraPosition.xz, vWorldPosition.xz);
#if FAR_WATER_LOW_POWER == 1
    vec3 normal = vec3(0.0, 1.0, 0.0);
#else
    float distanceCalm = mix(1.0, 0.18, smoothstep(90.0, 2400.0, cameraDistance));
    float distanceOutsidePond = max(abs(vWorldPosition.x), abs(vWorldPosition.z))
      - uPondHalfExtent;
    float pondEdgeBlend = smoothstep(0.0, uSurfaceBlendWidth, distanceOutsidePond);
    float swellStrength = uWaveStrength * mix(1.0, uCoastSwell.z, uCoastShape.x);
    vec2 gradient = farWaterSwellGradient(vWorldPosition.xz, uTime, uWaveSpeed)
      * swellStrength
      * distanceCalm
      * pondEdgeBlend;
    vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
    // Whitecaps: a crest steeper than the swell's own scale breaks. Only wind
    // and storm make them; the surf foam slider says how much.
    float crestSlope = length(gradient) * 2.0 / max(swellStrength * distanceCalm * pondEdgeBlend, 1e-4);
    float whitecap = smoothstep(0.42, 0.9, crestSlope)
      * smoothstep(0.12, 0.7, uCoastSwell.w) * uCoastSurf.z
      * smoothstep(0.35, 0.8, coastNoise(vWorldPosition.xz * 0.11 + vec2(uTime * 0.07, -uTime * 0.05)))
      * distanceCalm * pondEdgeBlend;
#endif
#if FAR_WATER_LOW_POWER == 1
    float whitecap = 0.0;
#endif
    if(uShoreMode>.5){
      float e=.08,h=coastWave(qs,uTime);
      float dx=(coastWave(coastLocal(vWorldPosition.xz+vec2(e,0)),uTime)-h)/e;
      float dz=(coastWave(coastLocal(vWorldPosition.xz+vec2(0,e)),uTime)-h)/e;
      normal=normalize(normal+vec3(-dx,0,-dz));
    }
    if (!gl_FrontFacing) {
      normal = -normal;
    }
    float keyVisibility = keyShadow() * ddgCloudTransmission(vWorldPosition);

    float normalDotView = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.02037 + 0.97963 * pow(1.0 - normalDotView, 5.0);
    float environmentLevel = sqrt(clamp(
      uEnvironmentExposure * uEnvironmentReflection,
      0.0,
      4.84
    ));

    vec3 reflectedRay = reflect(-viewDirection, normal);
    reflectedRay.y = abs(reflectedRay.y);
    vec3 reflection = skyRadiance(reflectedRay) * environmentLevel;
    reflection *= mix(vec3(1.0), reflectionTone(), 0.6);

#if FAR_WATER_LOW_POWER == 0
    const float DISTANT_DISC_SPREAD = 60.0;
    float distantDiscRadius = 1.0 - (1.0 - uKeyCosRadius) * DISTANT_DISC_SPREAD;
    reflection += celestialBody(
      reflectedRay,
      uKeyDirection,
      uKeyRadiance / DISTANT_DISC_SPREAD,
      distantDiscRadius,
      uKeyGlowPower
    ) * ddgCloudTransmission(vWorldPosition);
#endif

    vec3 deepTint = mix(
      vec3(0.018, 0.052, 0.064),
      max(uWaterScatteringColor, vec3(0.001)),
      0.7
    );
    deepTint=coastBloomTint(deepTint,qs,uTime);
    vec3 refraction = farWaterBody(deepTint,uSurfaceColor,uEnvironmentHorizonColor,uEnvironmentExposure,normal,fresnel);

    float contactFoam=0.0;
    if(uCoastShape.x>.5 && uCoastRefractionActive>.5 && qs.x>-coastOffshore() && qs.x<8.0){
      // The colour and depth target belong to the capture camera, which can be
      // one frame behind the display camera during a fast orbit. Projecting
      // through the display matrix made the finite target turn into a screen
      // aligned wedge at the ends of the shoreline.
      vec4 capturedPosition=uCoastRefractionMatrix*vec4(vWorldPosition,1.0);
      vec2 screenUv=capturedPosition.xy/max(capturedPosition.w,.0001)*.5+.5;
      vec3 captureNormal=normalize(mat3(uCoastRefractionViewMatrix)*normal);
      vec2 refractUv=screenUv+captureNormal.xy*.001;
      float captureCoverage=step(.002,refractUv.x)*step(.002,refractUv.y)
        *step(refractUv.x,.998)*step(refractUv.y,.998)*step(.0001,capturedPosition.w);
      refractUv=clamp(refractUv,vec2(.002),vec2(.998));
      vec4 bed=texture2D(uCoastRefraction,refractUv);
      float depth=max(0.0,vWorldPosition.y-ground);
      float opticalPath=min(depth/max(abs(viewDirection.y),.22),uCoastSurface.y*4.0);
      if(uCoastDepthActive>.5 && captureCoverage>.5){
        float capturedDepth=texture2D(uCoastDepth,refractUv).r;
        if(capturedDepth>.000001 && capturedDepth<.999999){
          float sceneZ=coastDepthToViewZ(capturedDepth);
          vec3 surfaceView=(uCoastRefractionViewMatrix*vec4(vWorldPosition,1.0)).xyz;
          opticalPath=min(max(0.0,(abs(sceneZ)-abs(surfaceView.z))/max(abs(normalize(surfaceView).z),.08)),uCoastSurface.y*4.0);
        }
      }
      contactFoam=uCoastDepthActive*captureCoverage*smoothstep(.18,.4,-ground)*exp(-opticalPath*25.0)*uCoastSurf.z*.55;
      float density=uCoastTurbidity*(.45+.55*uCoastTurbidity),depthScale=5.0/max(uCoastSurface.y,.25);
      vec3 absorption=(vec3(.008,.003,.001)+density*vec3(.13,.055,.018))*depthScale;
      float scattering=density*.62*depthScale*uCoastScattering;
      float forwardScatter=pow(max(dot(viewDirection,uKeyDirection),0.0),5.0);
      vec3 scatterColor=mix(deepTint,uCoastKeyColor,forwardScatter*.46);
      float scatterLight=mix(.48,1.0,sqrt(clamp(uEnvironmentExposure*uEnvironmentReflection,0.0,1.0)));
      float shadowedDirect = mix(1.0, keyVisibility, clamp(uKeyDirectShare * uWaterShadowStrength, 0.0, 1.0));
      vec3 shallow=bed.rgb*exp(-(absorption+vec3(scattering))*opticalPath)+scatterColor*(1.0-exp(-scattering*opticalPath))*scatterLight*shadowedDirect*(.82+forwardScatter*clamp(uCoastKeyIntensity,0.0,4.0)*.2);
      refraction=mix(refraction,shallow,bed.a*captureCoverage*smoothstep(-coastOffshore(),-coastOffshore()+26.0,qs.x));
    }
    vec4 projected = uReflectionMatrix * vec4(vWorldPosition, 1.0);
    vec2 reflectionUv = projected.xy / max(projected.w, 0.0001) * .5 + .5;
    if (uHasReflection > 0.5 && projected.w > 0.0 && all(greaterThan(reflectionUv, vec2(0.002))) && all(lessThan(reflectionUv, vec2(0.998)))) {
      vec4 reflectedWorld = texture2D(uPlanarReflection, reflectionUv + normal.xz * 0.002);
      reflectedWorld.rgb*=mix(vec3(1.0),reflectionTone(),.24);
      reflection = mix(reflection, reflectedWorld.rgb, reflectedWorld.a*clamp(uObjectReflection*.24,0.0,.48));
    }
    float reflectionWeight = clamp(fresnel, 0.02, 0.96);
    vec3 color = mix(refraction, reflection, reflectionWeight);
#if FAR_WATER_LOW_POWER == 0
    // Nine bicubic taps for a term smoothstep has already clamped to zero
    // everywhere nearer than 180 units - which is the whole pond. farBlend
    // carries the edge feather too, so the guard is exact rather than an
    // approximation of the old expression.
    float farBlend = smoothstep(180.0, 3200.0, cameraDistance) * pondEdgeBlend;
    if (farBlend > 0.0) {
      vec3 horizonRay = normalize(vec3(-viewDirection.x, 0.035, -viewDirection.z));
      vec3 horizonLight = skyRadiance(horizonRay) * environmentLevel;
      color = mix(color, mix(refraction, horizonLight, 0.28), farBlend * 0.18);
    }
#endif

    if(uCoastShape.x>.5){
      float foam=max(max(coastFoam(qs,vWorldPosition,uTime),contactFoam*coastNoise(vWorldPosition.xz*19.0)),whitecap);
      vec3 foamLight=vec3(.82,.84,.78)*(uFoamFillRadiance+uFoamKeyRadiance*max(dot(normal,uKeyDirection),0.0)*keyVisibility)/3.14159265;
      color=mix(color,foamLight,foam);
    }
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export default function FarWaterSurface({ settings, lighting, sky, cloudSceneRef = null, qualityProfile, geometryOverride, shoreMode = false }) {
  const contextCloudScene = useCloudScene();
  const cloudScene = cloudSceneRef ?? contextCloudScene;
  const reflectionDataRef = React.useContext(reflectionContext);
  const [emptyShadow] = useState(() => {
    const texture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    texture.compareFunction = THREE.LessEqualCompare;
    texture.needsUpdate = true;
    return texture;
  });
  const meshRef = useRef();
  const materialRef = useRef();
  const geometry = useMemo(() => {
    if (geometryOverride) return geometryOverride;
    const data = buildFarWaterFieldData(settings.waterExtent);
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    next.setIndex(new THREE.BufferAttribute(data.indices, 1));
    next.userData.innerHalfExtent = data.innerHalfExtent;
    next.userData.pondHalfExtent = data.pondHalfExtent;
    next.userData.surfaceBlendWidth = data.surfaceBlendWidth;
    return next;
  }, [settings.waterExtent, geometryOverride]);
  const materialDefines = useMemo(() => ({
    FAR_WATER_LOW_POWER: qualityProfile?.isLowPower ? 1 : 0,
  }), [qualityProfile?.isLowPower]);
  const [uniforms] = useState(() => ({
    uPlanarReflection: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uHasReflection: { value: 0 },
    uObjectReflection: { value: 1 },
    ...createCoastUniforms(),
    uShoreMode: { value: shoreMode ? 1 : 0 },
    uCoastRefraction: { value: null },
    uCoastRefractionActive: { value: 0 },
    uCoastDepth: { value: null },
    uCoastDepthActive: { value: 0 },
    uCoastRefractionMatrix: { value: new THREE.Matrix4() },
    uCoastRefractionViewMatrix: { value: new THREE.Matrix4() },
    uCoastRefractionCameraRange: { value: new THREE.Vector2(0.1, 1000) },
    uCoastTurbidity: { value: .4 },uCoastScattering: { value: .2 },
    uCoastKeyColor: { value: new THREE.Color() },uCoastKeyIntensity: { value: 1 },
    uKeyShadowMap: { value: emptyShadow },
    uKeyShadowMapFar: { value: emptyShadow },
    uKeyShadowMatrix: { value: new THREE.Matrix4() },
    uKeyShadowMatrixFar: { value: new THREE.Matrix4() },
    uKeyShadowActive: { value: 0 },
    uKeyShadowBias: { value: lighting.shadow.waterBias },
    uKeyShadowTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uKeyShadowRadius: { value: lighting.shadow.radius },
    uKeyShadowFarActive: { value: 0 },
    uKeyShadowFarBias: { value: lighting.shadow.waterBias },
    uKeyShadowFarTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uKeyShadowFarRadius: { value: lighting.shadow.radius },
    uKeyShadowSplit: { value: 25 },
    uKeyDirectShare: { value: 0 },
    uShadowIntensity: { value: lighting.shadow.intensity },
    uWaterShadowStrength: { value: lighting.shadow.waterStrength },
    uFoamKeyRadiance: { value: new THREE.Vector3() },uFoamFillRadiance: { value: new THREE.Vector3() },
    uSurfaceColor: { value: new THREE.Color('#70716d') },
    uWaterTint: { value: new THREE.Color(1, 1, 1) },
    uWaterScatteringColor: { value: new THREE.Color(0.05, 0.08, 0.09) },
    uEnvironmentHorizonColor: { value: new THREE.Color(0.2, 0.25, 0.3) },
    uEnvironmentExposure: { value: 1 },
    uEnvironmentReflection: { value: 1 },
    uWaveStrength: { value: 0.04 },
    uWaveSpeed: { value: 1 },
    uInnerHalfExtent: { value: (geometry.userData.innerHalfExtent ?? settings.waterExtent / 2 - .4) },
    uPondHalfExtent: { value: (geometry.userData.pondHalfExtent ?? settings.waterExtent / 2) },
    // The same hand-over width the pond fades over on its side of the edge.
    uSurfaceBlendWidth: { value: settings.farWaterBlendWidth },
    uTime: { value: 0 },
    uSkyLut: { value: null },
    uSkyLutTexel: { value: new THREE.Vector2(1 / 256, 1 / 128) },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: 1 },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 0.35 },
    ...createCloudShadowUniforms(),
  }));

  useEffect(() => () => { if (!geometryOverride) geometry.dispose(); }, [geometry, geometryOverride]);
  useEffect(() => () => emptyShadow.dispose(), [emptyShadow]);

  useEffect(() => {
    syncCoastUniforms(uniforms, settings);
    uniforms.uShoreMode.value = shoreMode ? 1 : 0;
    uniforms.uInnerHalfExtent.value = geometry.userData.innerHalfExtent ?? settings.waterExtent / 2 - .4;
    uniforms.uPondHalfExtent.value = geometry.userData.pondHalfExtent ?? settings.waterExtent / 2;
    uniforms.uObjectReflection.value=settings.boatReflectionIntensity;
    uniforms.uCoastTurbidity.value=settings.waterTurbidity;
    uniforms.uCoastScattering.value=settings.waterScatteringStrength;
    uniforms.uCoastKeyColor.value.fromArray(lighting.key.colorLinear);
    uniforms.uCoastKeyIntensity.value=lighting.key.intensity;
    uniforms.uFoamKeyRadiance.value.fromArray(lighting.key.sceneRadiance);
    uniforms.uFoamFillRadiance.value.fromArray(lighting.fill.irradiance);
    uniforms.uSurfaceColor.value.fromArray(lighting.surface.color.linear);
    uniforms.uWaterTint.value.fromArray(lighting.water.tint.linear);
    uniforms.uWaterScatteringColor.value.fromArray(lighting.water.scatteringColor);
    uniforms.uEnvironmentHorizonColor.value.fromArray(lighting.environment.horizon.linear);
    uniforms.uEnvironmentExposure.value = lighting.environment.exposure;
    uniforms.uEnvironmentReflection.value = lighting.environment.reflection;
    uniforms.uWaveStrength.value = THREE.MathUtils.clamp(
      settings.waveAmplitude * 0.72 + settings.ambientWaveIntensity * 0.028,
      0.018,
      0.12,
    );
    uniforms.uWaveSpeed.value = Math.max(settings.ambientWaveSpeed, 0.05);
    // The same hand-over width the pond fades over on its side of the edge.
    uniforms.uSurfaceBlendWidth.value = settings.farWaterBlendWidth;
    uniforms.uKeyDirection.value.fromArray(lighting.sky.keyDirection);
    uniforms.uKeyRadiance.value.fromArray(lighting.sky.discRadiance);
    uniforms.uKeyCosRadius.value = lighting.sky.keyCosRadius;
    uniforms.uKeyGlowPower.value = lighting.sky.keyGlowPower;
    uniforms.uKeyGlowStrength.value = lighting.sky.keyGlowStrength;
  }, [geometry, lighting, settings, shoreMode, uniforms]);

  useFrame(({ camera, clock }) => {
    if (meshRef.current && !shoreMode) {
      meshRef.current.position.x = camera.position.x;
      meshRef.current.position.z = camera.position.z;
    }
    const cloudDescriptor = cloudScene?.current;
    updateCloudShadowUniforms(uniforms, cloudDescriptor);
    uniforms.uSkyLut.value = cloudDescriptor?.enabled && cloudDescriptor?.skyTexture ? cloudDescriptor.skyTexture : sky?.texture ?? null;
    // The bicubic tap pattern needs the table's own size; read it off the
    // texture so nothing has to thread the resolution through props.
    const activeSkyTexture = uniforms.uSkyLut.value;
    if (activeSkyTexture?.image) {
      uniforms.uSkyLutTexel.value.set(
        cloudDescriptor?.enabled && cloudDescriptor?.skyTexel ? cloudDescriptor.skyTexel.x : 1 / activeSkyTexture.image.width,
        cloudDescriptor?.enabled && cloudDescriptor?.skyTexel ? cloudDescriptor.skyTexel.y : 1 / activeSkyTexture.image.height,
      );
    }
    uniforms.uTime.value = clock.elapsedTime;
    const shadowMap = reflectionDataRef.current.keyShadowMap ?? null;
    const shadowMatrix = reflectionDataRef.current.keyShadowMatrix ?? null;
    uniforms.uKeyShadowMap.value = shadowMap ?? emptyShadow;
    uniforms.uKeyShadowActive.value = shadowMap && shadowMatrix ? 1 : 0;
    if (shadowMatrix) uniforms.uKeyShadowMatrix.value.copy(shadowMatrix);
    if (reflectionDataRef.current.keyShadowTexelSize) uniforms.uKeyShadowTexelSize.value.copy(reflectionDataRef.current.keyShadowTexelSize);
    uniforms.uKeyShadowBias.value = reflectionDataRef.current.keyShadowBias ?? lighting.shadow.waterBias;
    uniforms.uKeyShadowRadius.value = reflectionDataRef.current.keyShadowRadius ?? lighting.shadow.radius;
    const farCascade = reflectionDataRef.current.keyShadowCascades?.[1] ?? null;
    uniforms.uKeyShadowMapFar.value = farCascade?.map ?? emptyShadow;
    uniforms.uKeyShadowFarActive.value = farCascade?.map && farCascade?.matrix ? 1 : 0;
    if (farCascade?.matrix) uniforms.uKeyShadowMatrixFar.value.copy(farCascade.matrix);
    if (farCascade?.mapSize) uniforms.uKeyShadowFarTexelSize.value.set(1 / farCascade.mapSize.x, 1 / farCascade.mapSize.y);
    uniforms.uKeyShadowFarBias.value = farCascade?.waterBias ?? uniforms.uKeyShadowBias.value;
    uniforms.uKeyShadowFarRadius.value = farCascade?.radius ?? uniforms.uKeyShadowRadius.value;
    uniforms.uKeyShadowSplit.value = reflectionDataRef.current.keyShadowSplit ?? 25;
    uniforms.uKeyDirectShare.value = reflectionDataRef.current.keyDirectShare ?? 0;
  }, -2);

  const bindCapture = () => {
    const reflection = reflectionDataRef?.current;
    uniforms.uCoastDepth.value=reflection?.refractionDepthTexture ?? null;
    uniforms.uCoastDepthActive.value=reflection?.refractionDepthTexture?1:0;
    uniforms.uCoastRefraction.value = reflection?.refractionTexture ?? null;
    uniforms.uCoastRefractionActive.value = reflection?.refractionTexture ? 1 : 0;
    uniforms.uCoastRefractionMatrix.value = reflection?.refractionMatrix ?? uniforms.uCoastRefractionMatrix.value;
    uniforms.uCoastRefractionViewMatrix.value = reflection?.refractionViewMatrix ?? uniforms.uCoastRefractionViewMatrix.value;
    uniforms.uCoastRefractionCameraRange.value = reflection?.refractionCameraRange ?? uniforms.uCoastRefractionCameraRange.value;
    uniforms.uPlanarReflection.value = reflection?.texture ?? null;
    uniforms.uHasReflection.value = reflection?.texture ? 1 : 0;
    if (reflection) uniforms.uReflectionMatrix.value = reflection.matrix;
  };

  if (!sky?.texture) {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      name={shoreMode ? "shore-water-strip" : "far-water-surface"}
      geometry={geometry}
      renderOrder={0.5}
      onBeforeRender={bindCapture}
      frustumCulled={shoreMode}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={sceneDepthVertex(farWaterVertexShader)}
        fragmentShader={sceneDepthFragment(farWaterFragmentShader)}
        uniforms={uniforms}
        defines={materialDefines}
        transparent={false}
        depthWrite
        depthTest
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        side={THREE.DoubleSide}
        toneMapped
        dithering
      />
    </mesh>
  );
}
