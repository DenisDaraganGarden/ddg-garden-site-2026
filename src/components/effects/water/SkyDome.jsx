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
  uniform vec3 uLowerSurfaceColor;
  varying vec3 vRay;

  ${skyShaderChunk}

  #include <common>
  #include <dithering_pars_fragment>

  void main() {
    vec3 ray = normalize(vRay);
    vec3 color = skyRadiance(ray) * uSkyLevel
      + celestialBody(ray, uKeyDirection, uKeyRadiance, uKeyCosRadius, uKeyGlowPower);

    // The full-screen sky also owns rays below the horizon. Treat those pixels
    // as the distant continuation of the water instead of exposing the renderer
    // clear colour when the finite pond or its far shell leaves the frame.
    // Above the horizon the mask is exactly zero, so the second sky sample and
    // its nine taps are multiplied away. The sun disc stays outside the branch:
    // celestialBody antialiases its edge with fwidth, and a real derivative
    // inside divergent flow would ripple that edge along the horizon line.
    float lowerMask = 1.0 - smoothstep(-0.025, 0.025, ray.y);
    if (lowerMask > 0.0) {
      float lowerDepth = smoothstep(0.0, 0.82, -ray.y);
      vec3 horizonRay = normalize(vec3(ray.x, 0.035, ray.z));
      vec3 horizonColor = skyRadiance(horizonRay) * uSkyLevel;
      vec3 lowerBase = max(uLowerSurfaceColor, vec3(0.001))
        * (0.78 + clamp(uSkyLevel, 0.0, 2.0) * 0.08);
      vec3 lowerSurface = mix(
        mix(horizonColor, lowerBase, 0.58),
        lowerBase * 0.74,
        lowerDepth
      );
      color = mix(color, lowerSurface, lowerMask * 0.94);
    }

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
    uSkyLutTexel: { value: new THREE.Vector2(1 / 256, 1 / 128) },
    uKeyDirection: { value: new THREE.Vector3(0, 0.3, 1) },
    uKeyRadiance: { value: new THREE.Color(1, 1, 1) },
    uKeyCosRadius: { value: Math.cos(THREE.MathUtils.degToRad(0.53 * 0.5)) },
    uKeyGlowPower: { value: 2000 },
    uKeyGlowStrength: { value: 1 },
    uSkyLevel: { value: 1 },
    uLowerSurfaceColor: { value: new THREE.Color('#70716d') },
    uInverseProjection: { value: new THREE.Matrix4() },
    uInverseView: { value: new THREE.Matrix4() },
  }), []);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.uInverseView.value.copy(camera.matrixWorld);

    uniforms.uSkyLut.value = sky.texture ?? null;
    // The bicubic tap pattern needs the table's own size; read it off the
    // texture so nothing has to thread the resolution through props.
    if (sky.texture?.image) {
      uniforms.uSkyLutTexel.value.set(
        1 / sky.texture.image.width,
        1 / sky.texture.image.height,
      );
    }
    uniforms.uKeyDirection.value.fromArray(sky.keyDirection);
    uniforms.uKeyRadiance.value.fromArray(sky.keyRadiance);
    uniforms.uKeyCosRadius.value = sky.keyCosRadius;
    uniforms.uKeyGlowPower.value = sky.keyGlowPower;
    uniforms.uKeyGlowStrength.value = sky.keyGlowStrength;
    uniforms.uSkyLevel.value = sky.skyLevel;
    uniforms.uLowerSurfaceColor.value.fromArray(sky.lowerSurfaceColor);
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
