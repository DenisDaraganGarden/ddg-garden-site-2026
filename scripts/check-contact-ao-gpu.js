import * as THREE from 'three';
import {
  captureContactAoDepth,
  contactAoFragmentShader,
  contactAoVertexShader,
  createContactAoTargets,
} from '../src/components/effects/contactAO.js';

// Browser-only harness for the actual production capture and AO shader. It is
// intentionally not an npm check and has no import-time side effects: a
// running editor can call it through CDP with a dynamic import.

const SIZE = 128;

function averagePatch(pixels, width, height, center, radius = 10) {
  let total = 0;
  let minimum = 255;
  let count = 0;
  const x0 = Math.max(0, Math.floor(center.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(center.x + radius));
  const y0 = Math.max(0, Math.floor(center.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(center.y + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x - center.x) ** 2 + (y - center.y) ** 2 > radius ** 2) continue;
      const value = pixels[(y * width + x) * 4];
      total += value;
      minimum = Math.min(minimum, value);
      count += 1;
    }
  }
  return { mean: count ? total / count : 255, min: minimum, samples: count };
}

function worldToTargetPixel(world, camera, width, height) {
  const screen = world.clone().project(camera);
  return new THREE.Vector2(
    THREE.MathUtils.clamp((screen.x * 0.5 + 0.5) * width, 0, width - 1),
    THREE.MathUtils.clamp((screen.y * 0.5 + 0.5) * height, 0, height - 1),
  );
}

function renderAo(renderer, scene, camera, resources, logarithmicDepth) {
  const { targets, aoMaterial, aoScene, aoCamera } = resources;
  const { depthTarget, aoTarget } = targets;
  const width = aoTarget.width;
  const height = aoTarget.height;
  aoMaterial.uniforms.uResolution.value.set(width, height);
  aoMaterial.uniforms.uNear.value = camera.near;
  aoMaterial.uniforms.uFar.value = camera.far;
  aoMaterial.uniforms.uRadius.value = 0.8;
  aoMaterial.uniforms.uIntensity.value = 1;
  aoMaterial.uniforms.uLogDepth.value = logarithmicDepth ? 1 : 0;
  aoMaterial.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
  aoMaterial.uniforms.uProjection.value.copy(camera.projectionMatrix);
  captureContactAoDepth({ gl: renderer, scene, camera, target: depthTarget });
  renderer.setRenderTarget(aoTarget);
  renderer.clear(true, false, false);
  renderer.render(aoScene, aoCamera);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(aoTarget, 0, 0, width, height, pixels);
  return pixels;
}

function makeResources() {
  const targets = createContactAoTargets();
  targets.depthTarget.setSize(SIZE, SIZE);
  targets.aoTarget.setSize(SIZE, SIZE);
  const uniforms = {
    uDepth: { value: targets.depthTarget.depthTexture },
    uResolution: { value: new THREE.Vector2(SIZE, SIZE) },
    uNear: { value: 0.1 }, uFar: { value: 20 },
    uRadius: { value: 0.8 }, uIntensity: { value: 1 }, uLogDepth: { value: 0 },
    uProjectionInverse: { value: new THREE.Matrix4() }, uProjection: { value: new THREE.Matrix4() },
  };
  const aoMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: contactAoVertexShader,
    fragmentShader: contactAoFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const aoScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aoMaterial);
  aoScene.add(quad);
  return {
    targets,
    aoMaterial,
    aoScene,
    aoCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    quad,
  };
}

function disposeResources(resources) {
  resources.quad.geometry.dispose();
  resources.aoMaterial.dispose();
  resources.targets.depthTarget.dispose();
  resources.targets.aoTarget.dispose();
}

function runEncoding(logarithmicDepth) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    logarithmicDepthBuffer: logarithmicDepth,
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);

  const scene = new THREE.Scene();
  const planeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), planeMaterial);
  plane.rotation.x = -Math.PI * 0.5;
  scene.add(plane);
  const boxMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), boxMaterial);
  box.position.y = 0.325;
  scene.add(box);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 20);
  camera.position.set(1.5, 1.65, 3.2);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const contactPixel = worldToTargetPixel(new THREE.Vector3(0, 0, 0), camera, SIZE, SIZE);
  const resources = makeResources();

  try {
    // A plane has no hemisphere occluder. This catches depth decode, normal
    // reconstruction and the sign of the occlusion test together.
    box.visible = false;
    const flat = averagePatch(renderAo(renderer, scene, camera, resources, logarithmicDepth), SIZE, SIZE, contactPixel);

    box.visible = true;
    const occluded = averagePatch(renderAo(renderer, scene, camera, resources, logarithmicDepth), SIZE, SIZE, contactPixel);

    // The capture must exclude the named water surface and restore its visible
    // state afterwards. This uses the same name check as the real scene.
    box.name = 'water-surface';
    const excluded = averagePatch(renderAo(renderer, scene, camera, resources, logarithmicDepth), SIZE, SIZE, contactPixel);
    const restoredVisibility = box.visible;

    const assertions = {
      flatPlaneWhite: flat.min >= 250 && flat.mean >= 253,
      contactDarkens: occluded.mean < flat.mean - 1 && occluded.min < flat.min - 2,
      waterExcluded: excluded.min >= 250 && Math.abs(excluded.mean - flat.mean) <= 1,
      captureRestoresVisibility: restoredVisibility,
    };
    return {
      encoding: logarithmicDepth ? 'logarithmic' : 'perspective',
      pass: Object.values(assertions).every(Boolean),
      assertions,
      samples: { flat, occluded, excluded, contactPixel: { x: Math.round(contactPixel.x), y: Math.round(contactPixel.y) } },
    };
  } finally {
    disposeResources(resources);
    plane.geometry.dispose();
    planeMaterial.dispose();
    box.geometry.dispose();
    boxMaterial.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/**
 * Runs no work until explicitly called in a browser with WebGL. Returns compact
 * scalar evidence for both depth encodings; it never returns image buffers.
 */
export function runContactAoGpuCheck() {
  const encodings = [runEncoding(false), runEncoding(true)];
  return {
    pass: encodings.every((result) => result.pass),
    encodings,
  };
}
