import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { bindRiderBody } from './riderBody.js';
import { JOINTS, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES } from './riderSkeleton.js';

// The surfer's body against the physics skeleton it hangs on
// (public/models/surfer/surfer.glb, assets-source/surfer/generate_surfer_asset.py):
// its bones are the fourteen bodies; in the rest pose he stands where the
// bodies stand — feet on the ground, facing +Z, left hand on +X; and posed
// wide (an arm up, one out forward, the legs apart and bent) nothing of him
// stretches into a web: every place the scan fused (the arms along the chest,
// the thighs, a fingertip on the shorts) was cut, and no bone pulls skin it
// only lay beside.

const file = new URL('../../../public/models/surfer/surfer.glb', import.meta.url);
const bytes = readFileSync(file);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
const bin = bytes.subarray(20 + jsonLength + 8);
const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const Type = TYPES[a.componentType], width = WIDTH[a.type];
  const start = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  assert.ok(!view.byteStride || view.byteStride === width * Type.BYTES_PER_ELEMENT, 'tightly packed');
  return new THREE.BufferAttribute(new Type(bin.buffer.slice(start, start + a.count * width * Type.BYTES_PER_ELEMENT)), width);
}

// What it carries.
const [skin] = gltf.skins;
const names = skin.joints.map((node) => gltf.nodes[node].name);
assert.deepEqual([...names].sort(), [...SEGMENT_NAMES].sort(), 'a bone per body, named as the bodies');
const primitive = gltf.meshes[0].primitives[0];
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', accessor(primitive.attributes.POSITION));
geometry.setAttribute('skinIndex', accessor(primitive.attributes.JOINTS_0));
geometry.setAttribute('skinWeight', accessor(primitive.attributes.WEIGHTS_0));
geometry.setIndex(accessor(primitive.indices));
const count = geometry.attributes.position.count;
const triangles = geometry.index.count / 3;
const weights = geometry.attributes.skinWeight, joints = geometry.attributes.skinIndex;
for (let i = 0; i < count; i += 1) {
  let sum = 0;
  for (let c = 0; c < 4; c += 1) {
    sum += weights.getComponent(i, c);
    assert.ok(joints.getComponent(i, c) < names.length, 'joint indices in range');
  }
  assert.ok(Math.abs(sum - 1) < 1e-3, `weights sum to one (vertex ${i}: ${sum})`);
}
assert.ok(triangles < 70000 && statSync(file).size < 4e6, `light enough to load on play (${triangles} triangles, ${statSync(file).size} bytes)`);
assert.ok(gltf.images.every((image) => image.mimeType === 'image/webp'), 'maps in WebP');

const mesh = bindRiderBody({ skeleton: { bones: names.map((name) => ({ name })) }, geometry, material: new THREE.MeshBasicMaterial() });
const bones = mesh.skeleton.bones;
const rest = geometry.attributes.position;
const skinned = new Float32Array(count * 3);
const v = new THREE.Vector3();
function skinAll() {
  for (let i = 0; i < count; i += 1) {
    mesh.applyBoneTransform(i, v.fromBufferAttribute(rest, i)).toArray(skinned, i * 3);
  }
}

// At rest the bodies stand at their centres, and so does he.
skinAll();
let restError = 0;
for (let i = 0; i < count * 3; i += 1) restError = Math.max(restError, Math.abs(skinned[i] - rest.array[i]));
assert.ok(restError < 1e-5, `bound in the physics rest pose (${restError})`);
const box = new THREE.Box3().setFromBufferAttribute(rest);
assert.ok(Math.abs(box.min.y) < 0.01 && Math.abs(box.max.y - 1.74) < 0.02, `feet on the ground, 1.74 m tall (${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)})`);
// Which way he faces: his face is the head's front, his left hand on +X.
const dominant = (i) => {
  let best = 0;
  for (let c = 1; c < 4; c += 1) if (weights.getComponent(i, c) > weights.getComponent(i, best)) best = c;
  return names[joints.getComponent(i, best)];
};
let nose = null, handL = 0, handR = 0;
for (let i = 0; i < count; i += 1) {
  const bone = dominant(i);
  if (bone === 'head' && (!nose || rest.getZ(i) > nose.z)) nose = new THREE.Vector3().fromBufferAttribute(rest, i);
  if (bone === 'forearmL') handL += rest.getX(i);
  if (bone === 'forearmR') handR += rest.getX(i);
}
assert.ok(nose.z > 0.1 && Math.abs(nose.x) < 0.08, `facing +Z (the head's front at ${nose.toArray().map((n) => n.toFixed(2))})`);
assert.ok(handL > 0 && handR < 0, 'the left hand on +X');
// Each vertex near the body it follows (the belly reaches 16 cm past its box).
const reach = new THREE.Box3();
let farthest = 0;
const SIZE = { pelvis: [0.30, 0.16, 0.20], abdomen: [0.28, 0.16, 0.18], chest: [0.34, 0.29, 0.22], head: [0.16, 0.26, 0.20] };
for (let i = 0; i < count; i += 1) {
  const bone = dominant(i);
  const half = SIZE[bone] ?? [0.1, 0.25, 0.14];
  const c = SEGMENT_CENTRE[bone];
  reach.min.set(c[0] - half[0] / 2, c[1] - half[1] / 2, c[2] - half[2] / 2);
  reach.max.set(c[0] + half[0] / 2, c[1] + half[1] / 2, c[2] + half[2] / 2);
  farthest = Math.max(farthest, reach.distanceToPoint(v.fromBufferAttribute(rest, i)));
}
assert.ok(farthest < 0.25, `every vertex beside its own body (${farthest.toFixed(3)} m at most)`);

// Posed wide, by turning each body about its joint as the physics would.
const TURN = {
  abdomen: [['x', 8]], chest: [['x', 5]], head: [['y', 30]],
  upperArmR: [['z', -80], ['x', -20]], forearmR: [['x', -45]],
  upperArmL: [['z', 100], ['x', 10]], forearmL: [['x', -20]],
  thighL: [['z', 28], ['x', -25]], shinL: [['x', 45]], footL: [['x', -15]],
  thighR: [['z', -28], ['x', 10]], shinR: [['x', 30]], footR: [['x', -10]],
};
const world = { pelvis: new THREE.Matrix4() };
const turn = new THREE.Matrix4(), step = new THREE.Matrix4();
for (const joint of JOINTS) {
  const [x, y, z] = joint.anchor;
  const m = world[joint.parent].clone().multiply(step.makeTranslation(x, y, z));
  for (const [axis, degrees] of TURN[joint.child] ?? []) {
    m.multiply(turn.makeRotationAxis(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), degrees * Math.PI / 180));
  }
  world[joint.child] = m.multiply(step.makeTranslation(-x, -y, -z));
}
bones.forEach((bone, k) => {
  const [x, y, z] = SEGMENT_CENTRE[bone.name];
  bone.matrixWorld.copy(world[SEGMENT_NAMES[mesh.userData.bodies[k]]]).multiply(step.makeTranslation(x, y, z));
});
assert.equal(SEGMENT[bones[0].name], mesh.userData.bodies[0]);
skinAll();
let longest = 0, worst = 0;
const index = geometry.index.array;
for (let t = 0; t < index.length; t += 3) {
  for (let e = 0; e < 3; e += 1) {
    const a = index[t + e], b = index[t + (e + 1) % 3];
    const posed = Math.hypot(skinned[a * 3] - skinned[b * 3], skinned[a * 3 + 1] - skinned[b * 3 + 1], skinned[a * 3 + 2] - skinned[b * 3 + 2]);
    const was = Math.hypot(rest.getX(a) - rest.getX(b), rest.getY(a) - rest.getY(b), rest.getZ(a) - rest.getZ(b));
    longest = Math.max(longest, posed);
    // Millimetre triangles where three parts meet (the crotch's front) may
    // stretch many times over and still be a few centimetres.
    if (was > 0.01) worst = Math.max(worst, posed / was);
  }
}
// An arm raised past the horizontal opens its armpit: the hinge's triangles
// stretch four times. The web the fused scan made was half a metre long.
assert.ok(longest < 0.25, `no edge stretched into a web or a strand (${(longest * 100).toFixed(1)} cm at most)`);
assert.ok(worst < 6, `no triangle torn at a joint (${worst.toFixed(1)}× at most)`);

console.log(`riderBody: ${names.length} bones named as the bodies, ${count} vertices, ${triangles} triangles, ${(statSync(file).size / 1e6).toFixed(1)} MB; bound in the physics rest pose (${restError.toExponential(1)}), feet on the ground, facing +Z, every vertex within ${(farthest * 100).toFixed(1)} cm of its body; posed wide, the longest edge ${(longest * 100).toFixed(1)} cm, the most stretched ${worst.toFixed(1)}×`);
