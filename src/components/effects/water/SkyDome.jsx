import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { skyShaderChunk } from '../shaders/skyShader';

// The visible sky: three vertices at the far plane, shaded from the same table
// the water reflects and the environment map is baked from.
//
// It is a fullscreen triangle rather than a dome because nothing needs it to be
// geometry - the image-based light comes from the table directly, not from
// rendering this mesh into a cube camera. Depth testing is on and depth writing
// is off, so it fills only the pixels no object claimed, and it can never paint
// over the boat the way the old additive sprite with depthTest disabled did.

const skyVertexShader = /* glsl */`
  uniform mat4 uInverseProjection;
  uniform mat4 uInverseView;
  varying vec3 vRay;

  void main() {
    vec4 clip = vec4(position.xy, 1.0, 1.0);
    vec4 view = uInverseProjection * clip;
    vRay = (uInverseView * vec4(view.xyz / view.w, 0.0)).xyz;
    gl_Position = clip;
  }
`;

const skyFragmentShader = /* glsl */`
  uniform float uSkyLevel;
  varying vec3 vRay;

  ${skyShaderChunk}

  #include <common>
  #include <dithering_pars_fragment>

  void main() {
    vec3 ray = normalize(vRay);
    vec3 color = skyRadiance(ray) * uSkyLevel
      + celestialBody(ray, uKeyDirection, uKeyRadiance, uKeyCosRadius, uKeyGlowPower);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

export default function SkyDome({ sky }) {
  const { camera } = useThree();
  const materialRef = useRef();

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    // One oversized triangle covering the clip cube - cheaper than a quad and
    // free of the diagonal seam a two-triangle quad puts across the sky.
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(
      [-1, -1, 0, 3, -1, 0, -1, 3, 0],
      3,
    ));
    return buffer;
  }, []);

  const uniforms = useMemo(() => ({
    uSkyLut: { value: null },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: Math.cos(THREE.MathUtils.degToRad(0.53 * 0.5)) },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 1 },
    uSkyLevel: { value: 1 },
    uInverseProjection: { value: new THREE.Matrix4() },
    uInverseView: { value: new THREE.Matrix4() },
  }), []);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uInverseView.value.copy(camera.matrixWorld);

    uniforms.uSkyLut.value = sky.texture ?? null;
    uniforms.uKeyDirection.value.fromArray(sky.keyDirection);
    uniforms.uKeyRadiance.value.fromArray(sky.keyRadiance);
    uniforms.uKeyCosRadius.value = sky.keyCosRadius;
    uniforms.uKeyGlowPower.value = sky.keyGlowPower;
    uniforms.uKeyGlowStrength.value = sky.keyGlowStrength;
    uniforms.uSkyLevel.value = sky.skyLevel;
  }, -3);

  if (!sky.texture) {
    return null;
  }

  return (
    <mesh
      name="sky-dome"
      geometry={geometry}
      frustumCulled={false}
      renderOrder={2}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        depthTest
        depthWrite={false}
        toneMapped
        dithering
      />
    </mesh>
  );
}
