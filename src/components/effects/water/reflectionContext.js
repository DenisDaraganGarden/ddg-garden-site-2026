import React from 'react';
import * as THREE from 'three';

// The reflection pass publishes its textures here and the water surface reads
// them. It lives in its own module so neither side has to import the other.

export const reflectionContext = React.createContext({
  current: {
    texture: null,
    refractionTexture: null,
    refractionDepthTexture: null,
    cameraNear: 0.1,
    cameraFar: 1000,
    matrix: new THREE.Matrix4(),
    refractionMatrix: new THREE.Matrix4(),
    refractionViewMatrix: new THREE.Matrix4(),
    refractionCameraRange: new THREE.Vector2(0.1, 1000),
    keyShadowTexelSize: new THREE.Vector2(1 / 1024, 1 / 1024),
  },
});

// Stencil ref written by the boat hull cap; the water surface skips pixels stamped with it.
