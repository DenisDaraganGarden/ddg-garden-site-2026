import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitRenderTargetSize } from '../components/effects/water/renderTargets';

const WATER_VERTEX_SHADER = `
  uniform mat4 uReflectionMatrix;
  varying vec4 vReflectionCoord;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vReflectionCoord = uReflectionMatrix * worldPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATER_FRAGMENT_SHADER = `
  uniform sampler2D uReflectionTexture;
  uniform float uTime;
  uniform vec3 uWaterTint;
  varying vec4 vReflectionCoord;
  varying vec3 vWorldPosition;

  float edgeMask(vec2 uv) {
    vec2 inside = smoothstep(vec2(0.008), vec2(0.045), uv)
      * (1.0 - smoothstep(vec2(0.955), vec2(0.992), uv));
    return inside.x * inside.y;
  }

  void main() {
    vec2 reflectionUv = vReflectionCoord.xy / max(vReflectionCoord.w, 0.0001);
    reflectionUv = reflectionUv * 0.5 + 0.5;

    float rippleA = sin(vWorldPosition.x * 1.55 + uTime * 0.42);
    float rippleB = sin(vWorldPosition.z * 2.15 - uTime * 0.31);
    float rippleC = sin((vWorldPosition.x + vWorldPosition.z) * 0.83 + uTime * 0.19);
    vec2 distortion = vec2(
      rippleA + rippleC * 0.55,
      rippleB - rippleC * 0.4
    ) * 0.0028;
    vec2 sampleUv = reflectionUv + distortion;
    vec4 reflected = texture2D(uReflectionTexture, clamp(sampleUv, 0.002, 0.998));

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - clamp(abs(viewDirection.y), 0.0, 1.0), 2.2);
    float mask = edgeMask(sampleUv) * reflected.a;
    float reflectionStrength = mask * (0.24 + fresnel * 0.34);
    vec3 reflectedTone = reflected.rgb * vec3(0.72, 0.77, 0.79);
    vec3 color = mix(uWaterTint, reflectedTone, clamp(reflectionStrength, 0.0, 0.58));
    float surfaceGrain = (rippleA + rippleB + rippleC) * 0.0035;
    color += surfaceGrain;

    float alpha = 0.115 + reflectionStrength * 0.76;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.62));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const mirrorCameraPosition = new THREE.Vector3();
const mirrorCameraTarget = new THREE.Vector3();
const mirrorCameraUp = new THREE.Vector3();
const previousClearColor = new THREE.Color();
const reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const reflectionMatrix = new THREE.Matrix4();
const REFLECTION_CLIP_PLANES = [reflectionClipPlane];
const WATER_CLIP_OVERLAP = 0.012;

function shouldHideFromReflection(object) {
  if (object.userData?.ddgNoWaterReflection) return true;
  return object.userData?.ddgSeagullRoot
    && object.userData.ddgReflectInWater !== true;
}

export default function StudioWaterReflection({
  waterY = -1.14,
  width = 18,
  depth = 12,
  textureSize = 512,
  activeFps = 30,
  idleFps = 12,
}) {
  const { gl, scene, camera, size } = useThree();
  const floorRef = useRef();
  const waterRef = useRef();
  const lastRenderTime = useRef(-Infinity);
  const reflectionFrame = useRef(0);
  const lastCameraPosition = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const lastCameraQuaternion = useRef(new THREE.Quaternion());
  const targetSize = useMemo(
    () => fitRenderTargetSize(textureSize, size.width / Math.max(size.height, 1)),
    [size.height, size.width, textureSize],
  );
  const reflectionTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(targetSize.width, targetSize.height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    target.texture.name = 'asset-lab-seagull-reflection';
    return target;
  }, [targetSize.height, targetSize.width]);
  const reflectionCamera = useMemo(() => new THREE.PerspectiveCamera(), []);
  const waterMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uReflectionTexture: { value: reflectionTarget.texture },
      uReflectionMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uWaterTint: { value: new THREE.Color('#d6dede') },
    },
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  }), [reflectionTarget.texture]);

  useEffect(() => () => {
    reflectionTarget.dispose();
    waterMaterial.dispose();
  }, [reflectionTarget, waterMaterial]);

  useEffect(() => {
    const { dataset } = gl.domElement;
    dataset.ddgLabReflectionTarget = `${targetSize.width}x${targetSize.height}`;
    dataset.ddgLabReflectionFps = String(activeFps);
    return () => {
      delete dataset.ddgLabReflectionTarget;
      delete dataset.ddgLabReflectionFps;
      delete dataset.ddgLabReflectionBirds;
      delete dataset.ddgLabReflectionCalls;
      delete dataset.ddgLabReflectionTriangles;
      delete dataset.ddgLabReflectionFrame;
    };
  }, [activeFps, gl, targetSize.height, targetSize.width]);

  useFrame(({ clock }) => {
    waterMaterial.uniforms.uTime.value = clock.elapsedTime;
    if (!waterRef.current || !floorRef.current || document.hidden) return;

    let selectedBirds = 0;
    let hasDynamicBird = false;
    scene.traverse((object) => {
      if (!object.userData?.ddgSeagullRoot || !object.visible) return;
      if (object.userData.ddgReflectInWater === true) selectedBirds += 1;
      if (object.userData.ddgReflectionDynamic === true) hasDynamicBird = true;
    });
    gl.domElement.dataset.ddgLabReflectionBirds = String(selectedBirds);

    const cameraMoved = camera.position.distanceToSquared(lastCameraPosition.current) > 1e-7
      || 1 - Math.abs(camera.quaternion.dot(lastCameraQuaternion.current)) > 1e-7;
    const frameRate = hasDynamicBird || cameraMoved ? activeFps : idleFps;
    if ((clock.elapsedTime - lastRenderTime.current) < 1 / Math.max(frameRate, 1)) return;
    lastRenderTime.current = clock.elapsedTime;
    lastCameraPosition.current.copy(camera.position);
    lastCameraQuaternion.current.copy(camera.quaternion);

    reflectionCamera.fov = camera.fov;
    reflectionCamera.aspect = camera.aspect;
    reflectionCamera.near = camera.near;
    reflectionCamera.far = camera.far;
    reflectionCamera.zoom = camera.zoom;
    reflectionCamera.layers.mask = camera.layers.mask;
    reflectionCamera.updateProjectionMatrix();

    mirrorCameraPosition.copy(camera.position);
    mirrorCameraPosition.y = (waterY * 2) - mirrorCameraPosition.y;
    camera.getWorldDirection(mirrorCameraTarget).add(camera.position);
    mirrorCameraTarget.y = (waterY * 2) - mirrorCameraTarget.y;
    mirrorCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirrorCameraUp.y *= -1;
    reflectionCamera.position.copy(mirrorCameraPosition);
    reflectionCamera.up.copy(mirrorCameraUp);
    reflectionCamera.lookAt(mirrorCameraTarget);
    reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.matrixWorldInverse.copy(reflectionCamera.matrixWorld).invert();
    reflectionMatrix.copy(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
    waterMaterial.uniforms.uReflectionMatrix.value.copy(reflectionMatrix);

    const hiddenObjects = [];
    scene.traverse((object) => {
      if (!object.visible || !shouldHideFromReflection(object)) return;
      hiddenObjects.push(object);
      object.visible = false;
    });

    const previousTarget = gl.getRenderTarget();
    const previousBackground = scene.background;
    const previousClippingPlanes = gl.clippingPlanes;
    const previousLocalClipping = gl.localClippingEnabled;
    const previousShadowAutoUpdate = gl.shadowMap.autoUpdate;
    const previousClearAlpha = gl.getClearAlpha();
    gl.getClearColor(previousClearColor);
    const floorWasVisible = floorRef.current.visible;
    const waterWasVisible = waterRef.current.visible;
    floorRef.current.visible = false;
    waterRef.current.visible = false;
    scene.background = null;
    reflectionClipPlane.constant = -waterY + WATER_CLIP_OVERLAP;
    gl.localClippingEnabled = true;
    gl.clippingPlanes = REFLECTION_CLIP_PLANES;
    gl.shadowMap.autoUpdate = false;
    gl.setClearColor('#f5f4f0', 0);

    try {
      gl.setRenderTarget(reflectionTarget);
      gl.clear(true, true, true);
      gl.render(scene, reflectionCamera);
      reflectionFrame.current += 1;
      gl.domElement.dataset.ddgLabReflectionCalls = String(gl.info.render.calls);
      gl.domElement.dataset.ddgLabReflectionTriangles = String(gl.info.render.triangles);
      gl.domElement.dataset.ddgLabReflectionFrame = String(reflectionFrame.current);
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.setClearColor(previousClearColor, previousClearAlpha);
      gl.clippingPlanes = previousClippingPlanes;
      gl.localClippingEnabled = previousLocalClipping;
      gl.shadowMap.autoUpdate = previousShadowAutoUpdate;
      scene.background = previousBackground;
      floorRef.current.visible = floorWasVisible;
      waterRef.current.visible = waterWasVisible;
      for (const object of hiddenObjects) object.visible = true;
    }
  });

  return (
    <group name="asset-lab-water-reflection">
      <mesh
        ref={floorRef}
        name="asset-lab-water-bed"
        position={[0, waterY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#e9ece9" roughness={0.9} metalness={0} />
      </mesh>
      <mesh
        ref={waterRef}
        name="asset-lab-water-surface"
        position={[0, waterY + 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[width, depth, 1, 1]} />
        <primitive attach="material" object={waterMaterial} />
      </mesh>
    </group>
  );
}
