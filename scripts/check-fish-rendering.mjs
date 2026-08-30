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
  createFishMaterial,
} from '../src/features/home-scene/creatures/fish/fishRendering.js';

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

console.log(JSON.stringify({
  shader: 'instanced procedural spine plus pectoral fins',
  reports,
}, null, 2));
