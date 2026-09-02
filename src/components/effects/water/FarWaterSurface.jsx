import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyShaderChunk } from '../shaders/skyShader';
import { buildFarWaterFieldData } from './farWaterGeometry';

const farWaterVertexShader = /* glsl */`
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const farWaterFragmentShader = /* glsl */`
  ${skyShaderChunk}

  varying vec3 vWorldPosition;

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
    if (max(abs(vWorldPosition.x), abs(vWorldPosition.z)) < uInnerHalfExtent) {
      discard;
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
    vec3 distantBody = mix(
      deepTint,
      max(uSurfaceColor, vec3(0.001)),
      0.76
    ) * (0.54 + sqrt(clamp(uEnvironmentExposure, 0.0, 2.2)) * 0.28);
    float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
    vec3 refraction = mix(
      distantBody * 0.94,
      uEnvironmentHorizonColor * 0.26 + distantBody * 0.24,
      clamp(slope * 1.7 + fresnel * 0.28, 0.0, 0.72)
    );

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

    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export default function FarWaterSurface({ settings, lighting, sky, qualityProfile }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const geometry = useMemo(() => {
    const data = buildFarWaterFieldData(settings.waterExtent);
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    next.setIndex(new THREE.BufferAttribute(data.indices, 1));
    next.userData.innerHalfExtent = data.innerHalfExtent;
    next.userData.pondHalfExtent = data.pondHalfExtent;
    next.userData.surfaceBlendWidth = data.surfaceBlendWidth;
    return next;
  }, [settings.waterExtent]);
  const materialDefines = useMemo(() => ({
    FAR_WATER_LOW_POWER: qualityProfile?.isLowPower ? 1 : 0,
  }), [qualityProfile?.isLowPower]);
  const uniforms = useMemo(() => ({
    uSurfaceColor: { value: new THREE.Color('#70716d') },
    uWaterTint: { value: new THREE.Color(1, 1, 1) },
    uWaterScatteringColor: { value: new THREE.Color(0.05, 0.08, 0.09) },
    uEnvironmentHorizonColor: { value: new THREE.Color(0.2, 0.25, 0.3) },
    uEnvironmentExposure: { value: 1 },
    uEnvironmentReflection: { value: 1 },
    uWaveStrength: { value: 0.04 },
    uWaveSpeed: { value: 1 },
    uInnerHalfExtent: { value: geometry.userData.innerHalfExtent },
    uPondHalfExtent: { value: geometry.userData.pondHalfExtent },
    uSurfaceBlendWidth: { value: 2.5 },
    uTime: { value: 0 },
    uSkyLut: { value: null },
    uSkyLutTexel: { value: new THREE.Vector2(1 / 256, 1 / 128) },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: 1 },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 0.35 },
  }), [geometry]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
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
  }, [lighting, settings, uniforms]);

  useFrame(({ camera, clock }) => {
    if (meshRef.current) {
      meshRef.current.position.x = camera.position.x;
      meshRef.current.position.z = camera.position.z;
    }
    uniforms.uSkyLut.value = sky?.texture ?? null;
    // The bicubic tap pattern needs the table's own size; read it off the
    // texture so nothing has to thread the resolution through props.
    if (sky?.texture?.image) {
      uniforms.uSkyLutTexel.value.set(
        1 / sky?.texture.image.width,
        1 / sky?.texture.image.height,
      );
    }
    uniforms.uTime.value = clock.elapsedTime;
  }, -2);

  if (!sky?.texture) {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      name="far-water-surface"
      geometry={geometry}
      renderOrder={0.5}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={farWaterVertexShader}
        fragmentShader={farWaterFragmentShader}
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
