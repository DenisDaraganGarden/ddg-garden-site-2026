import * as THREE from 'three';
import { fullScreenVertexShader } from '../shaders/waterRuntimeShaders';
import { DRAWING_BUFFER_SIZE } from './constants';

// Render target and fullscreen-pass plumbing for the water simulation. Every pass
// in the simulation is the same shape - a quad, an ortho camera, one shader - so
// it is built once here rather than inline at each call site.

export function createTarget(width, height, options) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    ...options,
  });

  target.texture.wrapS = THREE.ClampToEdgeWrapping;
  target.texture.wrapT = THREE.ClampToEdgeWrapping;
  return target;
}

export function createPass(fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: fullScreenVertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);

  scene.add(quad);
  return { material, scene, camera, quad };
}

export function disposePass(pass) {
  pass.quad.geometry.dispose();
  pass.material.dispose();
}

export function restoreDefaultFramebuffer(gl) {
  const drawingBufferSize = gl.getDrawingBufferSize(DRAWING_BUFFER_SIZE);

  gl.setRenderTarget(null);
  gl.setViewport(0, 0, drawingBufferSize.x, drawingBufferSize.y);
  gl.setScissor(0, 0, drawingBufferSize.x, drawingBufferSize.y);
  gl.setScissorTest(false);
}
