import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { cloudShadowSampling, screenVertex } from './cloudShaders';

// Laboratory-only atmospheric scattering.  It deliberately has no scene depth
// input: the ground-plane stop is enough to judge the relation between cloud
// gaps, sun and haze here, but a product pass must stop at the opaque depth
// buffer so shafts cannot draw across nearby solid geometry.
const lightShaftFragment = /* glsl */`
  uniform mat4 uInverseProjection;
  uniform mat4 uInverseView;
  uniform vec3 uCameraPosition;
  uniform vec3 uSunColor;
  uniform float uSunEnergy;
  uniform float uHaze;
  uniform float uRays;
  uniform float uCloudBase;
  uniform float uNear;
  uniform float uMaxDistance;
  uniform float uSteps;
  varying vec2 vUv;

  ${cloudShadowSampling}

  #include <common>

  void main() {
    vec2 clip = vUv * 2.0 - 1.0;
    vec4 view = uInverseProjection * vec4(clip, 1.0, 1.0);
    vec3 ray = normalize(mat3(uInverseView) * (view.xyz / max(view.w, 1e-5)));

    // The fog exists below the cloud base. A ray pointed up stops at that base;
    // a ray pointed down stops at the laboratory's y=0 ground plane.
    float tMax = uMaxDistance;
    if (ray.y > 0.0001) {
      float cloudHit = (uCloudBase - uCameraPosition.y) / ray.y;
      if (cloudHit > uNear) tMax = min(tMax, cloudHit);
    } else if (ray.y < -0.0001) {
      float groundHit = -uCameraPosition.y / ray.y;
      if (groundHit > uNear) tMax = min(tMax, groundHit);
    }
    tMax = max(0.0, tMax - uNear);
    if (tMax < 0.5 || uRays <= 0.0001 || uHaze <= 0.0001) discard;

    // Forward scattering keeps the shafts bound to the solar direction. The
    // transmission lookup is sampled in world space at each step, so a gap
    // follows exactly the moving cloud shadow instead of swimming in screen UV.
    float phase = pow(max(dot(ray, normalize(uSun)), 0.0), 6.0);
    float stepLength = tMax / max(uSteps, 1.0);
    float eyeTransmission = 1.0;
    vec3 accumulated = vec3(0.0);
    for (int sampleIndex = 0; sampleIndex < 10; sampleIndex += 1) {
      if (float(sampleIndex) >= uSteps) break;
      float t = uNear + (float(sampleIndex) + 0.5) * stepLength;
      vec3 p = uCameraPosition + ray * t;
      float height = max(p.y, 0.0);
      float fogDensity = uHaze * exp(-height * 0.00072);
      float segmentExtinction = fogDensity * stepLength * 0.00011;
      float cloudLight = cloudTransmission(p);
      float scattered = (1.0 - exp(-segmentExtinction)) * cloudLight;
      accumulated += eyeTransmission * uSunColor * scattered;
      eyeTransmission *= exp(-segmentExtinction * 0.72);
    }

    // Haze still reads at the horizon outside the narrow shafts, while the
    // bright direction is entirely governed by the cloud-map openings.
    float horizonLift = smoothstep(-0.06, 0.16, ray.y) * 0.16;
    vec3 color = accumulated * (phase * 1.35 + horizonLift)
      * uSunEnergy * uRays;
    gl_FragColor = vec4(color, clamp(max(max(color.r, color.g), color.b), 0.0, 0.72));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/**
 * Cheap sun shafts coupled to PainterlyClouds' top-projection transmittance.
 *
 * `shadow` is intentionally a plain, stable bridge: `{ texture, origin,
 * extent }`. The module never owns, renders, or disposes that map. Future scene
 * integration must supply opaque scene depth to replace the y=0 lab bound.
 */
export default function CloudLightShafts({ settings, lighting, shadow, onAfterRender }) {
  const { camera } = useThree();
  const materialRef = useRef();
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ], 3));
    return next;
  }, []);
  const uniforms = useMemo(() => ({
    uCloudShadow: { value: null },
    uShadowOrigin: { value: new THREE.Vector2() },
    uShadowExtent: { value: 30000 },
    uShadowStrength: { value: 1 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uInverseProjection: { value: new THREE.Matrix4() },
    uInverseView: { value: new THREE.Matrix4() },
    uCameraPosition: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunEnergy: { value: 1 },
    uHaze: { value: 0 },
    uRays: { value: 0 },
    uCloudBase: { value: 1400 },
    uNear: { value: 0.1 },
    uMaxDistance: { value: 15000 },
    uSteps: { value: 8 },
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => materialRef.current?.dispose(), []);

  useFrame(() => {
    const key = lighting?.key ?? {};
    const quality = settings?.quality;
    const steps = quality === 'low' ? 6 : quality === 'high' ? 10 : 8;
    const sun = lighting?.sky?.keyDirection ?? key.direction ?? [0, 1, 0];
    const color = key.colorLinear ?? [1, 1, 1];
    const sunEnergy = finite(key.sceneIntensity, finite(key.intensity, 1));

    uniforms.uCloudShadow.value = shadow?.texture ?? null;
    uniforms.uShadowOrigin.value.copy(shadow?.origin ?? uniforms.uShadowOrigin.value.set(0, 0));
    uniforms.uShadowExtent.value = Math.max(1, finite(shadow?.extent, 30000));
    uniforms.uSun.value.fromArray(sun).normalize();
    uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uInverseView.value.copy(camera.matrixWorld);
    uniforms.uCameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
    uniforms.uSunColor.value.fromArray(color);
    uniforms.uSunEnergy.value = clamp(sunEnergy, 0, 8);
    uniforms.uHaze.value = clamp(finite(settings?.haze, 0), 0, 1);
    uniforms.uRays.value = clamp(finite(settings?.rays, 0), 0, 1);
    uniforms.uCloudBase.value = Math.max(20, finite(settings?.altitude, 1400));
    uniforms.uNear.value = Math.max(0.01, finite(camera.near, 0.1));
    uniforms.uMaxDistance.value = Math.max(500, Math.min(20000, uniforms.uShadowExtent.value * 0.5));
    uniforms.uSteps.value = steps;
  }, -1);

  if (settings?.enabled === false || !shadow?.texture) return null;

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={20} onAfterRender={onAfterRender}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={screenVertex}
        fragmentShader={lightShaftFragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
        toneMapped
      />
    </mesh>
  );
}
