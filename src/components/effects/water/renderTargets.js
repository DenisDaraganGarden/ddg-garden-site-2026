import * as THREE from 'three';
import { fullScreenVertexShader } from '../shaders/waterRuntimeShaders.js';
import { DRAWING_BUFFER_SIZE } from './constants.js';

// Render target and fullscreen-pass plumbing for the water simulation. Every pass
// in the simulation is the same shape - a quad, an ortho camera, one shader - so
// it is built once here rather than inline at each call site.

export function fitRenderTargetSize(maxDimension, aspect) {
  const limit = Math.max(1, Math.round(Number(maxDimension) || 1));
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  if (safeAspect >= 1) {
    return {
      width: limit,
      height: Math.max(1, Math.round(limit / safeAspect)),
    };
  }

  return {
    width: Math.max(1, Math.round(limit * safeAspect)),
    height: limit,
  };
}

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
  // setViewport takes CSS pixels and multiplies by the pixel ratio itself. Handing
  // it the drawing buffer - already in device pixels - made the viewport dpr times
  // too large, so the whole scene was drawn magnified by dpr from the WebGL origin
  // at the bottom-left. At dpr 1 nothing moved, which is why lowering the render
  // resolution appeared to fix the pointer.
  const cssSize = gl.getSize(DRAWING_BUFFER_SIZE);

  gl.setRenderTarget(null);
  gl.setViewport(0, 0, cssSize.x, cssSize.y);
  gl.setScissor(0, 0, cssSize.x, cssSize.y);
  gl.setScissorTest(false);
}
