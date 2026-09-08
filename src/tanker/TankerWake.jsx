import { sceneDepthVertex, sceneDepthFragment } from '../components/effects/shaders/sceneDepth.js';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // MSAA may evaluate a covered sample at a pixel centre just outside this
    // transparent plane. Its interpolated UV can therefore leave 0..1; that
    // used to make the centre-line denominator zero or negative and turn
    // exp(-lateral² / depth) into an Inf/NaN wake pixel.
    float behind = clamp(vUv.x, 0.0, 1.0);
    float lateral = abs(vUv.y - 0.5) * 2.0;
    float width = 0.055 + behind * 0.78;
    // GLSL pow is undefined for a negative base, even when the exponent happens
    // to be two. This exact multiplication is defined on both sides of the wake.
    float edgeDistance = (lateral - width) * 27.0;
    float edge = exp(-edgeDistance * edgeDistance);
    float center = exp(-lateral * lateral / max(0.006 + behind * 0.1, 0.006));
    float grain = 0.6 + 0.22 * sin(behind * 141.0 - uTime * 3.0)
      * sin(lateral * 88.0 + uTime * 0.8);
    float fade = smoothstep(0.0, 0.04, behind) * (1.0 - smoothstep(0.16, 1.0, behind));
    float alpha = clamp((edge * 0.38 + center * 0.18) * grain * fade * uSpeed, 0.0, 1.0);
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function TankerWake({ uniforms }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms, vertexShader: sceneDepthVertex(vertexShader), fragmentShader: sceneDepthFragment(fragmentShader), transparent: true,
    depthWrite: false, side: THREE.DoubleSide,
  }), [uniforms]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[-172, 0.08, 0]} rotation={[-Math.PI / 2, 0, Math.PI]} renderOrder={3} userData={{ ddgNoWaterReflection: true }}>
      <planeGeometry args={[230, 110]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
