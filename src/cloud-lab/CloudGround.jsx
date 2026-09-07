import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cloudShadowSampling } from '../components/effects/sky/painterly/cloudShaders';

const vertex = /* glsl */`
  varying vec3 vWorld;
  void main() { vWorld = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }
`;
const fragment = /* glsl */`
  uniform vec3 uSunColor; uniform vec3 uAmbient; uniform vec3 uHorizon; uniform float uWater; uniform float uHaze;
  ${cloudShadowSampling}
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  void main() {
    vec2 p = vWorld.xz;
    float broad = sin(p.x*.0017 + sin(p.y*.0011))*.5 + .5;
    float grain = hash(floor(p*.18)) - .5;
    float ripple = sin(p.x*.026 + sin(p.y*.019))*sin(p.y*.032)*.5+.5;
    vec3 sand = mix(vec3(.30,.285,.235), vec3(.55,.51,.42), broad*.55+.35) + grain*.018;
    vec3 sea = mix(vec3(.035,.115,.14), vec3(.12,.25,.28), ripple*.45+.28);
    float transmission = cloudTransmission(vWorld);
    vec3 groundLit = sand * (uAmbient*.9 + uSunColor*(.72*transmission));
    vec3 waterLit = sea * (uAmbient*.72 + uSunColor*(.34*transmission)) + uSunColor*pow(ripple, 10.)*.018*transmission;
    vec3 color = mix(groundLit, waterLit, uWater);
    float distanceFog = 1. - exp(-length(cameraPosition.xz-p) * (.000018 + uHaze*.000025));
    color = mix(color, uHorizon, distanceFog);
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const color = (source, fallback) => new THREE.Color().fromArray(Array.isArray(source) ? source : source?.linear ?? fallback);

export default function CloudGround({ settings, lighting, shadow }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment,
    uniforms: { uCloudShadow: { value: null }, uShadowOrigin: { value: new THREE.Vector2() }, uShadowExtent: { value: 30000 }, uShadowStrength: { value: 0 }, uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uAmbient: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uWater: { value: 0 }, uHaze: { value: 0 } }, toneMapped: true,
  }), []);
  useEffect(() => {
    const sun = lighting?.key?.direction ?? [.4, .7, -.5];
    material.uniforms.uCloudShadow.value = shadow?.texture ?? null;
    material.uniforms.uShadowOrigin.value = shadow?.origin ?? material.uniforms.uShadowOrigin.value;
    material.uniforms.uShadowExtent.value = shadow?.extent ?? 30000;
    material.uniforms.uShadowStrength.value = settings.shadowStrength;
    material.uniforms.uSun.value.set(...sun).normalize();
    material.uniforms.uSunColor.value.copy(color(lighting?.key?.colorLinear, [1, .84, .63])).multiplyScalar(Math.min(1.9,lighting?.key?.sceneIntensity ?? 1));
    material.uniforms.uAmbient.value.setRGB(.11,.17,.25).multiplyScalar(Math.max(.025,Math.min(1,(lighting.sky.sunElevationDeg+5)/15)));
    material.uniforms.uHorizon.value.copy(color(lighting?.environment?.horizon, [.42, .58, .64]));
    material.uniforms.uWater.value = settings.receiverSurface === 'water' ? 1 : 0;
    material.uniforms.uHaze.value = settings.haze;
  }, [lighting, material, settings.haze, settings.receiverSurface, settings.shadowStrength, shadow]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[30000, 30000]} /><primitive object={material} attach="material" /></mesh>;
}
