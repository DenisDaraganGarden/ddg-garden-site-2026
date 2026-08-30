import * as THREE from 'three';
import { getCursorFlashlightWorldRuntime } from '../../../features/cursor/cursorFlashlightStore';

export const createCursorFlashlightUniforms = () => ({
  uCursorLightActive: { value: 0 },
  uCursorLightPosition: { value: new THREE.Vector3() },
  uCursorLightDirection: { value: new THREE.Vector3(0, -1, 0) },
  uCursorLightColor: { value: new THREE.Color('#fff0d8') },
  uCursorLightIntensity: { value: 0 },
  uCursorLightRange: { value: 1 },
  uCursorLightInnerCos: { value: 1 },
  uCursorLightOuterCos: { value: 1 },
});

export const syncCursorFlashlightUniforms = (uniforms) => {
  const light = getCursorFlashlightWorldRuntime();
  uniforms.uCursorLightActive.value = light.active ? 1 : 0;

  if (!light.active) {
    return;
  }

  uniforms.uCursorLightPosition.value.set(light.sourceX, light.sourceY, light.sourceZ);
  uniforms.uCursorLightDirection.value.set(
    light.directionX,
    light.directionY,
    light.directionZ,
  );
  uniforms.uCursorLightIntensity.value = light.intensity;
  uniforms.uCursorLightRange.value = light.range;
  uniforms.uCursorLightInnerCos.value = light.innerCos;
  uniforms.uCursorLightOuterCos.value = light.outerCos;
};

// The stock Three.js spotlight lights the ordinary PBR meshes. These uniforms
// give the same cone to the custom water and plant materials, which do not
// consume Three's lighting chunks. Radiance stays linear and inverse-square,
// matching the real light closely enough that the two pipelines read as one.
export const cursorFlashlightShaderChunk = `
  uniform float uCursorLightActive;
  uniform vec3 uCursorLightPosition;
  uniform vec3 uCursorLightDirection;
  uniform vec3 uCursorLightColor;
  uniform float uCursorLightIntensity;
  uniform float uCursorLightRange;
  uniform float uCursorLightInnerCos;
  uniform float uCursorLightOuterCos;

  struct CursorLightSample {
    vec3 radiance;
    vec3 directionToLight;
    float cone;
  };

  CursorLightSample sampleCursorFlashlight(vec3 worldPosition) {
    CursorLightSample sampleValue;
    vec3 fromLight = worldPosition - uCursorLightPosition;
    float lightDistance = max(length(fromLight), 0.0001);
    vec3 lightToFragment = fromLight / lightDistance;
    float coneAlignment = dot(lightToFragment, normalize(uCursorLightDirection));
    float cone = smoothstep(
      uCursorLightOuterCos,
      max(uCursorLightInnerCos, uCursorLightOuterCos + 0.00001),
      coneAlignment
    );
    float rangeStart = max(uCursorLightRange * 0.78, 0.001);
    float rangeFade = 1.0 - smoothstep(rangeStart, uCursorLightRange, lightDistance);
    float inverseSquare = uCursorLightIntensity / max(lightDistance * lightDistance, 1.0);
    float energy = uCursorLightActive
      * cone
      * rangeFade
      * min(inverseSquare, 0.85);

    sampleValue.radiance = uCursorLightColor * energy;
    sampleValue.directionToLight = -lightToFragment;
    sampleValue.cone = cone * rangeFade;
    return sampleValue;
  }
`;
