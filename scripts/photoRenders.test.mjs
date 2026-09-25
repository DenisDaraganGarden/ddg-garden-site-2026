// Focused contract checks; fake provider only, never a paid call or user data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import * as THREE from 'three';
import { photoDimensions, photoPrompt } from '../src/photo-render/prompt.js';
import { collectPhotoContext, photoCaptureCamera } from '../src/photo-render/capture.js';

const folder = path.resolve('output/photo-render-contracts');
await fs.mkdir(folder, { recursive: true });
const isolated = await fs.mkdtemp(path.join(folder, 'run-'));
process.env.DDG_PROJECTS_DIR = isolated;
const { compositePhotoMask, startPhotoRender, readPhotoRender, listPhotoRenders, trustedPhotoRequest } = await import('./photoRenders.mjs');
try {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 1.5, 0.1, 100);
  camera.position.set(0, 2, 8); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const beforeProjection = camera.projectionMatrix.clone();
  const portrait = photoCaptureCamera(camera, 9 / 16);
  assert.equal(portrait.aspect, 9 / 16); assert.equal(portrait.fov, camera.fov);
  assert(camera.projectionMatrix.equals(beforeProjection), 'capture crop never changes the live lens');
  const testPoint = new THREE.Vector3(1, 1, 0), widePoint = testPoint.clone().project(camera), narrowPoint = testPoint.clone().project(portrait);
  assert(Math.abs(narrowPoint.x - widePoint.x * camera.aspect / portrait.aspect) < 1e-8);
  const wall = new THREE.Group(); wall.name = 'placed-visual-wall';
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 4, -3); wall.add(wallMesh); scene.add(wall);
  const library = new Map();
  for (const [id, x, z] of [['visible', 3, 0], ['behind', 0, 20], ['occluded', 0, -7]]) {
    library.set(id, { id, ru: id, height: 1, spread: 0.5 });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 1), new THREE.MeshBasicMaterial(), 1);
    mesh.name = `planting-${id}`; mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, z)); scene.add(mesh);
  }
  const settings = { placedObjects: [{ id: 'wall', kind: 'model', name: 'Wall' }], plantingMonth: 7 };
  const context = collectPhotoContext(scene, camera, { settings, library, cameraName: 'Test' }).context;
  assert.deepEqual(context.plants.map(p => p.id), ['visible'], 'behind-camera and architecture-occluded plants are excluded');
  assert.equal(context.camera.fov, 65);
  assert.equal(collectPhotoContext(scene, camera, { settings: { ...settings, plantingEnabled: false }, library }).context.plants.length, 0);
  wallMesh.material.name = 'Vegetation_Grass_Artificial';
  assert.equal(collectPhotoContext(scene, camera, { settings, library }).context.materials.length, 0, 'preview vegetation maps must not become architectural preservation references');
  scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  for (const ratio of [1 / 3, 0.5625, 0.75, 1, 1.5, 16 / 9, 3]) for (const edge of [1024, 2048, 3840]) {
    const [w, h] = photoDimensions(1000 * ratio, 1000, edge);
    assert.equal(w % 16, 0); assert.equal(h % 16, 0);
    assert(w * h >= 655360 && w * h <= 8294400 && Math.max(w, h) <= 3840);
    assert(w / h <= 3 && h / w <= 3);
    assert(Math.abs(w / h - ratio) / ratio < 0.025);
  }
  assert.throws(() => photoDimensions(4000, 500));
  const source = await sharp({ create: { width: 64, height: 48, channels: 4, background: '#345678' } }).png().toBuffer();
  const generated = await sharp({ create: { width: 128, height: 96, channels: 4, background: '#efbead' } }).png().toBuffer();
  const maskPixels = Buffer.alloc(64 * 48 * 4, 255);
  for (let y = 12; y < 30; y++) for (let x = 10; x < 35; x++) maskPixels[(y * 64 + x) * 4 + 3] = 0;
  const mask = await sharp(maskPixels, { raw: { width: 64, height: 48, channels: 4 } }).png().toBuffer();
  const result = await compositePhotoMask(source, generated, mask);
  const basePixels = await sharp(source).raw().toBuffer(), output = await sharp(result).raw().toBuffer();
  for (let i = 0; i < maskPixels.length; i += 4) {
    if (maskPixels[i + 3] === 255) assert.deepEqual(output.subarray(i, i + 4), basePixels.subarray(i, i + 4));
    else assert.deepEqual([...output.subarray(i, i + 3)], [239, 190, 173]);
  }
  const data = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;
  const body = { requestId: randomUUID(), image: data(source), context: { camera: { name: 'Test', fov: 53 }, month: 7, plants: [{ name: 'Buxus', count: 2, height: 1, positions: '10%, 20%' }] } };
  let release, calls = 0;
  const generate = async (request) => { calls++; assert.equal(request.images.length, 1); assert.equal(request.n, 1); assert.match(request.prompt, /Buxus/); await new Promise((resolve) => { release = resolve; }); return [generated]; };
  const job = await startPhotoRender(body, { generate });
  assert.equal(job.status, 'running');
  assert.equal((await startPhotoRender(body, { generate })).id, job.id);
  assert.equal(calls, 1, 'repeat request id never calls provider again');
  await assert.rejects(startPhotoRender({ ...body, requestId: randomUUID() }, { generate }), /Предыдущий/);
  release();
  for (let i = 0; i < 50 && (await readPhotoRender(job.id)).status === 'running'; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await readPhotoRender(job.id)).status, 'done');
  assert.equal((await listPhotoRenders('site')).length, 1);
  assert.equal((await listPhotoRenders('other')).length, 0);
  await assert.rejects(startPhotoRender({ ...body, requestId: randomUUID(), mode: 'edit', description: 'bench', mask: data(source) }, { generate }), /Закрасьте/);
  await assert.rejects(startPhotoRender({ ...body, requestId: randomUUID(), mode: 'edit', description: 'bench', mask: data(generated) }, { generate }), /одного размера/);
  await assert.rejects(startPhotoRender({ ...body, requestId: '../bad' }, { generate }), /идентификатора/);
  const failure = await startPhotoRender({ ...body, requestId: randomUUID() }, { generate: async () => { throw new Error('Provider unavailable'); } });
  for (let i = 0; i < 50 && (await readPhotoRender(failure.id)).status === 'running'; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await readPhotoRender(failure.id)).status, 'failed');
  const referenced = await startPhotoRender({ ...body, requestId: randomUUID(),
    references: [{ name: 'Vegetation_Grass_Artificial', image: data(source) }, { name: 'Stone', image: data(source) }], foliageReference: data(generated),
  }, { generate: async (request) => {
    assert.equal(request.images.length, 3, 'source, one architectural map, then the real foliage photograph');
    assert.match(request.prompt, /Image 2 is the actual architectural surface texture "Stone"/);
    assert.match(request.prompt, /Image 3 is a real garden photograph/);
    assert(!request.prompt.includes('Grass_Artificial'));
    assert.deepEqual(await sharp(request.images[2]).raw().toBuffer(), await sharp(generated).raw().toBuffer());
    return [generated];
  } });
  for (let i = 0; i < 50 && (await readPhotoRender(referenced.id)).status === 'running'; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  const savedReference = await readPhotoRender(referenced.id);
  assert.equal(savedReference.status, 'done');
  assert.equal(savedReference.foliageReference, `/__photo-renders/${referenced.id}/foliage-reference.png`);
  assert.deepEqual(await sharp(path.join(isolated, 'library/renders', referenced.id, 'foliage-reference.png')).raw().toBuffer(), await sharp(generated).raw().toBuffer());
  const local = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:41241', origin: 'http://localhost:41241', 'content-type': 'application/json' } };
  assert(trustedPhotoRequest(local));
  assert(!trustedPhotoRequest({ ...local, headers: { ...local.headers, origin: 'https://example.com' } }));
  assert(!trustedPhotoRequest({ ...local, headers: { ...local.headers, host: 'evil.example' } }));
  assert(!trustedPhotoRequest({ ...local, socket: { remoteAddress: '192.168.1.25' } }));
  assert(!trustedPhotoRequest({ ...local, headers: { ...local.headers, 'content-type': 'text/plain' } }));
  assert.match(photoPrompt({ mode: 'edit', preset: 'golden', description: 'bench' }), /ONLY the transparent/);
  assert(!photoPrompt({ mode: 'edit', preset: 'golden' }).includes('late-afternoon'));
  console.log('Photo render: dimensions, mask pixels, request deduplication, concurrency, errors, project history and loopback access passed.');
} finally { await fs.rm(isolated, { recursive: true, force: true }); }
