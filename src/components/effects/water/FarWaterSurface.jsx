import { coastShader, createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { sceneDepthVertex, sceneDepthFragment } from '../shaders/sceneDepth';
import { reflectionContext } from './reflectionContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyShaderChunk } from '../shaders/skyShader';
import { farWaterBodyShader } from '../shaders/farWaterOptics';
import { buildFarWaterFieldData } from './farWaterGeometry';

const farWaterVertexShader = /* glsl */`
  ${coastShader}
  uniform float uTime;
  uniform float uShoreMode;
  varying vec3 vWorldPosition;
  varying vec4 vCoastClip;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    if (uShoreMode > 0.5) worldPosition.y += coastWave(coastLocal(worldPosition.xz), uTime);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    vCoastClip = gl_Position;
  }
`;

const farWaterFragmentShader = /* glsl */`
  ${skyShaderChunk}
  ${coastShader}
  ${farWaterBodyShader}
  uniform float uShoreMode;
  uniform sampler2D uCoastRefraction;
  uniform float uCoastRefractionActive;
  uniform sampler2D uCoastDepth;
  uniform float uCoastDepthActive;
  uniform float uCoastCameraFar;
  uniform float uCoastTurbidity;
  uniform float uCoastScattering;
  uniform vec3 uCoastKeyColor;
  uniform float uCoastKeyIntensity;
  uniform vec3 uFoamKeyRadiance;
  uniform vec3 uFoamFillRadiance;

  varying vec3 vWorldPosition;
  varying vec4 vCoastClip;

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

  vec2 distantWaveGradient(vec2 point) {
    vec2 directionA = normalize(vec2(0.86, 0.51));
    vec2 directionB = normalize(vec2(-0.36, 0.93));
    vec2 directionC = normalize(vec2(0.18, -0.98));
    float phaseA = dot(point, directionA) * 0.24 + uTime * uWaveSpeed * 0.31;
    float phaseB = dot(point, directionB) * 0.41 - uTime * uWaveSpeed * 0.22;
    float phaseC = dot(point, directionC) * 0.13 + uTime * uWaveSpeed * 0.14;

    return directionA * cos(phaseA) * 0.24
      + directionB * cos(phaseB) * 0.41 * 0.42
      + directionC * cos(phaseC) * 0.13 * 0.7;
  }

  void main() {
    vec2 qs=coastLocal(vWorldPosition.xz);
    if (max(abs(vWorldPosition.x), abs(vWorldPosition.z)) < mix(uInnerHalfExtent,uPondHalfExtent,uCoastShape.x)) {
      discard;
    }

    float ground=coastHeight(qs);
    if(uCoastShape.x>.5){
      if(coastMask(qs)>.001 && ground>vWorldPosition.y+.004)discard;
      if(uShoreMode<.5 && abs(qs.y)<uCoastDimensions.x*.5 && qs.x>-96.0 && qs.x<8.0)discard;
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
    vec2 gradient = distantWaveGradient(vWorldPosition.xz)
      * uWaveStrength
      * distanceCalm
      * pondEdgeBlend;
    vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
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
    );
#endif

    vec3 deepTint = mix(
      vec3(0.018, 0.052, 0.064),
      max(uWaterScatteringColor, vec3(0.001)),
      0.7
    );
    deepTint=coastBloomTint(deepTint,qs,uTime);
    vec3 refraction = farWaterBody(deepTint,uSurfaceColor,uEnvironmentHorizonColor,uEnvironmentExposure,normal,fresnel);

    float contactFoam=0.0;
    if(uCoastShape.x>.5 && uCoastRefractionActive>.5 && qs.x>-96.0 && qs.x<8.0){
      vec2 screenUv=vCoastClip.xy/vCoastClip.w*.5+.5;
      vec4 bed=texture2D(uCoastRefraction,screenUv+normal.xz*.001);
      float depth=max(0.0,vWorldPosition.y-ground);
      float opticalPath=min(depth/max(abs(viewDirection.y),.22),uCoastSurface.y*4.0);
      if(uCoastDepthActive>.5){
        float capturedDepth=texture2D(uCoastDepth,screenUv+normal.xz*.001).r;
        if(capturedDepth>.000001 && capturedDepth<.999999){
          float sceneZ=exp2(capturedDepth*log2(uCoastCameraFar+1.0))-1.0;
          vec3 surfaceView=(viewMatrix*vec4(vWorldPosition,1.0)).xyz;
          opticalPath=min(max(0.0,(sceneZ-abs(surfaceView.z))/max(abs(normalize(surfaceView).z),.08)),uCoastSurface.y*4.0);
        }
      }
      contactFoam=uCoastDepthActive*smoothstep(.18,.4,-ground)*exp(-opticalPath*25.0)*uCoastSurf.z*.55;
      float density=uCoastTurbidity*(.45+.55*uCoastTurbidity),depthScale=5.0/max(uCoastSurface.y,.25);
      vec3 absorption=(vec3(.008,.003,.001)+density*vec3(.13,.055,.018))*depthScale;
      float scattering=density*.62*depthScale*uCoastScattering;
      float forwardScatter=pow(max(dot(viewDirection,uKeyDirection),0.0),5.0);
      vec3 scatterColor=mix(deepTint,uCoastKeyColor,forwardScatter*.46);
      float scatterLight=mix(.48,1.0,sqrt(clamp(uEnvironmentExposure*uEnvironmentReflection,0.0,1.0)));
      vec3 shallow=bed.rgb*exp(-(absorption+vec3(scattering))*opticalPath)+scatterColor*(1.0-exp(-scattering*opticalPath))*scatterLight*(.82+forwardScatter*clamp(uCoastKeyIntensity,0.0,4.0)*.2);
      refraction=mix(refraction,shallow,bed.a*smoothstep(-96.0,-70.0,qs.x));
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
    vec3 horizonRay = normalize(vec3(-viewDirection.x, 0.035, -viewDirection.z));
    vec3 horizonLight = skyRadiance(horizonRay) * environmentLevel;
    float farBlend = smoothstep(180.0, 3200.0, cameraDistance);
    color = mix(
      color,
      mix(refraction, horizonLight, 0.28),
      farBlend * pondEdgeBlend * 0.18
    );
#endif

    if(uCoastShape.x>.5){
      float foam=max(coastFoam(qs,vWorldPosition,uTime),contactFoam*coastNoise(vWorldPosition.xz*19.0));
      vec3 foamLight=vec3(.82,.84,.78)*(uFoamFillRadiance+uFoamKeyRadiance*max(dot(normal,uKeyDirection),0.0))/3.14159265;
      color=mix(color,foamLight,foam);
    }
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export default function FarWaterSurface({ settings, lighting, sky, qualityProfile, geometryOverride, shoreMode = false }) {
  const reflectionDataRef = React.useContext(reflectionContext);
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
    uCoastDepth: { value: null }, uCoastDepthActive: { value: 0 }, uCoastCameraFar: { value: 10000 },
    uCoastTurbidity: { value: .4 },uCoastScattering: { value: .2 },
    uCoastKeyColor: { value: new THREE.Color() },uCoastKeyIntensity: { value: 1 },
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
    uSurfaceBlendWidth: { value: (geometry.userData.surfaceBlendWidth ?? .4) },
    uTime: { value: 0 },
    uSkyLut: { value: null },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: 1 },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 0.35 },
  }));

  useEffect(() => () => { if (!geometryOverride) geometry.dispose(); }, [geometry, geometryOverride]);

  useEffect(() => {
    syncCoastUniforms(uniforms, settings);
    uniforms.uShoreMode.value = shoreMode ? 1 : 0;
    uniforms.uInnerHalfExtent.value = geometry.userData.innerHalfExtent ?? settings.waterExtent / 2 - .4;
    uniforms.uPondHalfExtent.value = geometry.userData.pondHalfExtent ?? settings.waterExtent / 2;
    uniforms.uSurfaceBlendWidth.value = geometry.userData.surfaceBlendWidth ?? .4;
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
    const reflection = reflectionDataRef?.current;
    uniforms.uCoastDepth.value=reflection?.refractionDepthTexture ?? null;
    uniforms.uCoastDepthActive.value=reflection?.refractionDepthTexture?1:0;
    uniforms.uCoastCameraFar.value=reflection?.cameraFar ?? 10000;
    uniforms.uCoastRefraction.value = reflection?.refractionTexture ?? null;
    uniforms.uCoastRefractionActive.value = reflection?.refractionTexture ? 1 : 0;
    uniforms.uPlanarReflection.value = reflection?.texture ?? null;
    uniforms.uHasReflection.value = reflection?.texture ? 1 : 0;
    if (reflection) uniforms.uReflectionMatrix.value.copy(reflection.matrix);
    uniforms.uSkyLut.value = sky?.texture ?? null;
    uniforms.uTime.value = clock.elapsedTime;
  }, -2);

  if (!sky?.texture) {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      name={shoreMode ? "shore-water-strip" : "far-water-surface"}
      geometry={geometry}
      renderOrder={0.5}
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
