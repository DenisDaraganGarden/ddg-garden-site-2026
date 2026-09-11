import * as THREE from 'three';
import { DEFAULT_CLEAR_COLOR } from './constants.js';

// A paused editor may never take a simulation step. Derived textures must
// already encode flat water, not a black normal (-1,-1,-1) and height +1.
// Use the existing passes once; no simulation tick or per-frame work is added.
export function initializeWaterRuntimeTargets(gl, state) {
  const previousTarget = gl.getRenderTarget();
  const previousColor = gl.getClearColor(new THREE.Color());
  const previousAlpha = gl.getClearAlpha();
  try {
    gl.setClearColor(DEFAULT_CLEAR_COLOR, 1);
    for (const target of [state.read, state.write]) {
      gl.setRenderTarget(target);
      gl.clear(true, false, false);
    }
    state.normalPass.material.uniforms.uState.value = state.read.texture;
    gl.setRenderTarget(state.normal);
    gl.render(state.normalPass.scene, state.normalPass.camera);
    state.probePass.material.uniforms.uState.value = state.read.texture;
    state.probePass.material.uniforms.uNormalMap.value = state.normal.texture;
    gl.setRenderTarget(state.probe);
    gl.render(state.probePass.scene, state.probePass.camera);
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousColor, previousAlpha);
  }
}
