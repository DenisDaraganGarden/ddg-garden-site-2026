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
  },
});

// Stencil ref written by the boat hull cap; the water surface skips pixels stamped with it.
