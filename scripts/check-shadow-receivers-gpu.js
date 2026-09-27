import * as THREE from 'three';
import { createCsmAdapter } from '../src/components/effects/csmAdapter.js';
import { installReceiverPlaneShadows } from '../src/components/effects/shadowFiltering.js';

// Browser-only regression: an empty planar receiver must match the same frame
// with shadows disabled, while an added box must still cast a real shadow.
// No project, camera snapshot or editor storage is read or written.
export function runShadowReceiversGpuCheck() {
  installReceiverPlaneShadows();
  const size = 256;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const target = new THREE.WebGLRenderTarget(size, size);
  const camera = new THREE.PerspectiveCamera(90, 1, .1, 1000);
  camera.position.set(-6, 5, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('black');
  scene.add(new THREE.AmbientLight('white', .15));
  const material = new THREE.MeshStandardMaterial({ color: '#999999', roughness: 1, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  plane.rotation.x = -Math.PI / 2;
  plane.castShadow = plane.receiveShadow = true;
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), material);
  box.position.y = 1.5; box.castShadow = box.receiveShadow = true;
  scene.add(plane, box);
  const adapter = createCsmAdapter({ scene, camera, cascades: 2, maxFar: 500, nearDistance: 100,
    shadowMapSize: 1024, lightDirection: new THREE.Vector3(-.6, -.55, -.4).normalize(),
    lightColor: new THREE.Color('white'), lightIntensity: 2, shadowRadius: 1.5,
    shadowIntensity: 1, contactOffsetMeters: 0, legacyBias: 0 });
  function draw(intensity) {
    adapter.configure({ shadowIntensity: intensity }); adapter.update();
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    return pixels;
  }
  const comparisons = [];
  try {
    for (const low of [false, true]) {
      adapter.configure({ lightDirection: new THREE.Vector3(-.6, low ? -.12 : -.55, -.4).normalize() });
      for (const radius of [0, 1.5, 8]) {
        adapter.configure({ shadowRadius: radius });
        box.visible = false;
        const lit = draw(0), shadowed = draw(1);
        let falseShadowPixels = 0, receiverPixels = 0, maximumError = 0;
        for (let i = 0; i < lit.length; i += 4) {
          if (lit[i] <= 1) continue;
          receiverPixels++;
          const error = Math.abs(lit[i] - shadowed[i]);
          maximumError = Math.max(maximumError, error);
          if (error > 2) falseShadowPixels++;
        }
        box.visible = true;
        const withBoxLit = draw(0), withBoxShadow = draw(1);
        let castPixels = 0;
        for (let i = 0; i < withBoxLit.length; i += 4) if (withBoxLit[i] - withBoxShadow[i] > 4) castPixels++;
        comparisons.push({ low, radius, receiverPixels, falseShadowPixels, maximumError, castPixels,
          pass: receiverPixels > 10000 && falseShadowPixels / receiverPixels < .001 && castPixels > 50 });
      }
    }
    return { pass: comparisons.every((result) => result.pass), comparisons };
  } finally {
    adapter.dispose(); plane.geometry.dispose(); box.geometry.dispose(); material.dispose(); target.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
}
