import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  FISH_CATALOG,
  FISH_SPECIES_ORDER,
} from '../src/features/home-scene/creatures/fish/fishCatalog.js';
import {
  createFishGeometry,
  createFishContactShadowBatch,
  createFishMaterial,
} from '../src/features/home-scene/creatures/fish/fishRendering.js';
import {
  resolveFishContactShadow,
  sampleFishShadowSeabedRelief,
} from '../src/features/home-scene/creatures/fish/fishContactShadows.js';

const reports = [];
for (const species of FISH_SPECIES_ORDER) {
  const catalog = FISH_CATALOG[species];
  const file = path.resolve(process.cwd(), 'public', catalog.glb.split('?')[0].replace(/^\//, ''));
  const buffer = await fs.readFile(file);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
  const geometry = createFishGeometry(gltf.scene, 12);
  assert.equal(geometry.getAttribute('position').count, catalog.vertices);
  assert.ok(geometry.getAttribute('skinIndex'), `${species}: missing rig joint indices`);
  assert.ok(geometry.getAttribute('skinWeight'), `${species}: missing rig weights`);
  assert.equal(geometry.getAttribute('aFishPhase').count, 12);
  assert.equal(geometry.getAttribute('aFishFlex').count, 12);
  assert.ok(geometry.getAttribute('aFishPhase').isInstancedBufferAttribute);

  const textures = {
    albedo: new THREE.Texture(),
    normal: new THREE.Texture(),
    orm: new THREE.Texture(),
    specular: new THREE.Texture(),
  };
  const material = createFishMaterial(catalog, textures);
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
  };
  material.onBeforeCompile(shader);

  assert.ok(shader.vertexShader.includes('attribute float aFishPhase;'));
  assert.ok(shader.vertexShader.includes('ddgFishBoneWeight'));
  assert.ok(shader.vertexShader.includes('transformed.z += sin(ddgPhase)'));
  assert.ok(shader.vertexShader.includes('objectNormal.xz = mat2'));
  assert.ok(shader.uniforms.uFishPectoralBones.value.equals(
    new THREE.Vector2(...catalog.pectoralBones),
  ));
  assert.equal(material.customProgramCacheKey(), `ddg-instanced-fish-rig-v1:${species}`);

  reports.push({
    species,
    vertices: geometry.getAttribute('position').count,
    instances: 12,
    pectoralBones: catalog.pectoralBones,
  });
  geometry.dispose();
  material.dispose();
  Object.values(textures).forEach((texture) => texture.dispose());
}

const relief = sampleFishShadowSeabedRelief({
  x: 2.1,
  z: -3.7,
  waterExtent: 24,
  reliefStrength: 0.6,
  reliefScale: 1.8,
});
assert.ok(
  Math.abs(relief - (-0.11154820726304165)) < 1e-12,
  'fish-contact relief must preserve the seabed plane V axis (world -Z)',
);
assert.notEqual(
  relief,
  sampleFishShadowSeabedRelief({
    x: 2.1,
    z: 3.7,
    waterExtent: 24,
    reliefStrength: 0.6,
    reliefScale: 1.8,
  }),
  'the asymmetric seabed noise must not mirror the Z axis',
);

const shadow = resolveFishContactShadow({
  position: { x: 0.4, y: -0.35, z: -0.2 },
  forward: { x: 0, z: 1 },
  catalog: FISH_CATALOG.pike,
  lightDirection: { x: 0.45, y: 0.8, z: 0.2 },
  waterExtent: 24,
  waterDepthMeters: 1.25,
  seabedReliefStrength: 0.6,
  seabedReliefScale: 1.8,
});
assert.ok(shadow.height > 0 && shadow.opacity > 0, 'fish contact shadow must resolve above the relief');
assert.ok(shadow.x < 0.4 && shadow.z < -0.2, 'key-light direction must project the shadow across the bed');
assert.ok(shadow.length > shadow.width, 'fish contact shadow must retain the body silhouette');

const contactBatch = createFishContactShadowBatch(12);
assert.ok(contactBatch.mesh.isInstancedMesh, 'fish contact shadows must be one instanced layer');
assert.equal(contactBatch.mesh.count, 12);
assert.equal(contactBatch.mesh.castShadow, false);
assert.equal(contactBatch.mesh.receiveShadow, false);
assert.equal(contactBatch.mesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
assert.equal(contactBatch.material.depthWrite, false);
assert.match(contactBatch.material.vertexShader, /0\.5 - \(worldXZ\.y/,
  'GPU shadow relief must use the seabed plane V axis');
assert.match(contactBatch.material.vertexShader, /instanceMatrix/,
  'contact shadows must retain per-fish instancing');
contactBatch.geometry.dispose();
contactBatch.material.dispose();

const emptyContactBatch = createFishContactShadowBatch(0);
assert.equal(emptyContactBatch.mesh.count, 0, 'empty schools must not submit a transparent shadow draw');
emptyContactBatch.geometry.dispose();
emptyContactBatch.material.dispose();

console.log(JSON.stringify({
  shader: 'instanced procedural spine plus pectoral fins',
  reports,
}, null, 2));
