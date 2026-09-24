import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { JOINTS, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES } from './riderSkeleton.js';
import { qSlerp } from './ragdoll.js';

// The surfer's body: a scan of a stout bearded man in board shorts, skinned to
// fourteen bones named as the rider's bodies, bound in the physics rest pose
// (public/models/surfer, made by assets-source/surfer/generate_surfer_asset.py).
// So a bone is nothing but its body: its matrix is the body's pose, its
// inverse the body's rest centre, and the body goes where the physics puts
// him with no pose of its own. Four more bones are no body's: at each
// shoulder and hip, turned halfway between the two bodies the joint joins,
// about the joint — a shoulder blade that follows a raised arm half the way,
// so the skin over it bends twice at half the angle and neither folds nor
// thins.

export const RIDER_BODY_URL = '/models/surfer/surfer.glb';
// name: [the trunk's body, the limb's, the joint].
export const MID_BONES = Object.freeze({
  midShoulderL: ['chest', 'upperArmL', 'shoulderL'], midShoulderR: ['chest', 'upperArmR', 'shoulderR'],
  midHipL: ['pelvis', 'thighL', 'hipL'], midHipR: ['pelvis', 'thighR', 'hipR'],
});
const ANCHOR = Object.fromEntries(JOINTS.map((joint) => [joint.name, joint.anchor]));
// Where each bone's own frame sits in the rest pose: a body's centre, a mid
// bone's joint.
const restOrigin = (name) => (name in MID_BONES ? ANCHOR[MID_BONES[name][2]] : SEGMENT_CENTRE[name]);

// A skinned mesh on the loaded body's geometry, its bones free of any scene
// graph: nothing but updateRiderBody moves them. The material is its own, so
// the see-through look does not reach the cached glb.
export function bindRiderBody(source) {
  const names = source.skeleton.bones.map((bone) => bone.name);
  const unknown = names.filter((name) => !(name in SEGMENT) && !(name in MID_BONES));
  if (unknown.length || !SEGMENT_NAMES.every((name) => names.includes(name))) throw new Error(`surfer.glb: bones ${names.join(', ')}`);
  const bones = names.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.matrixAutoUpdate = false;
    bone.matrixWorldAutoUpdate = false;
    const [x, y, z] = restOrigin(name);
    bone.matrixWorld.makeTranslation(x, y, z);
    return bone;
  });
  const inverses = names.map((name) => {
    const [x, y, z] = restOrigin(name);
    return new THREE.Matrix4().makeTranslation(-x, -y, -z);
  });
  const mesh = new THREE.SkinnedMesh(source.geometry, source.material.clone());
  mesh.name = 'surfboard-rider-body';
  // Bone matrices in the mesh's own frame, as the bodies are.
  mesh.bindMode = THREE.DetachedBindMode;
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  // Each bone's body, or for a mid bone its two and its joint.
  mesh.userData.bodies = names.map((name) => (name in MID_BONES
    ? { trunk: SEGMENT[MID_BONES[name][0]], limb: SEGMENT[MID_BONES[name][1]], anchor: ANCHOR[MID_BONES[name][2]], centre: SEGMENT_CENTRE[MID_BONES[name][0]] }
    : SEGMENT[name]));
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Skinning 44 000 vertices on the CPU for a pointer ray is not worth it:
  // he is not an object to pick.
  mesh.raycast = () => {};
  return mesh;
}

// The look (surfboardRiderLook): «Человек и скелет» shows him see-through,
// the sticks inside; a see-through body casts no shadow of its own.
export function lookRiderBody(mesh, look) {
  const seeThrough = look === 'both';
  mesh.material.transparent = seeThrough;
  mesh.material.opacity = seeThrough ? 0.35 : 1;
  mesh.material.depthWrite = !seeThrough;
  mesh.material.needsUpdate = true;
  mesh.castShadow = !seeThrough;
}

const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const unit = new THREE.Vector3(1, 1, 1);
const none = new THREE.Vector3(1e-4, 1e-4, 1e-4);

// A mid bone's pose from its two bodies: at their joint (as the trunk's body
// carries it), turned halfway from the one to the other.
const half = [0, 0, 0, 1];
export function midBonePose(bodies, mid, outPosition, outRotation) {
  const trunk = bodies[mid.trunk], limb = bodies[mid.limb];
  qSlerp(trunk.q, limb.q, 0.5, half);
  outRotation.set(trunk.q[0], trunk.q[1], trunk.q[2], trunk.q[3]);
  outPosition.set(mid.anchor[0] - mid.centre[0], mid.anchor[1] - mid.centre[1], mid.anchor[2] - mid.centre[2])
    .applyQuaternion(outRotation).add({ x: trunk.x[0], y: trunk.x[1], z: trunk.x[2] });
  return outRotation.set(half[0], half[1], half[2], half[3]);
}

// Each bone takes its body's pose (world, as the bodies are). headless: the
// first-person camera sits in his head, among the locks of his hair — the
// head is folded to a point, the rest of him still his.
export function updateRiderBody(mesh, rider, headless = false) {
  if (!mesh || !rider) return;
  const bodies = rider.world.bodies;
  const { bones } = mesh.skeleton;
  const index = mesh.userData.bodies;
  for (let k = 0; k < bones.length; k += 1) {
    const which = index[k];
    if (typeof which === 'object') {
      midBonePose(bodies, which, position, rotation);
      bones[k].matrixWorld.compose(position, rotation, unit);
      continue;
    }
    const body = bodies[which];
    position.set(body.x[0], body.x[1], body.x[2]);
    rotation.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    bones[k].matrixWorld.compose(position, rotation, headless && which === SEGMENT.head ? none : unit);
  }
}

// Loaded once for the session, on the first play that wants him; its own
// loading manager, so it never reads as the scene loading again.
let loading = null;
const loader = new GLTFLoader(new THREE.LoadingManager());
function loadRiderBody() {
  loading ??= loader.loadAsync(RIDER_BODY_URL).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

// The body once loaded (null until then, or while not wanted).
export function useRiderBody(wanted) {
  const [mesh, setMesh] = useState(null);
  useEffect(() => {
    if (!wanted || mesh) return undefined;
    let live = true;
    loadRiderBody().then((gltf) => {
      let source = null;
      gltf.scene.traverse((object) => { if (!source && object.isSkinnedMesh) source = object; });
      if (live && source) setMesh(bindRiderBody(source));
    }, (error) => {
      if (import.meta.env.DEV) console.warn('rider body', error);
    });
    return () => { live = false; };
  }, [mesh, wanted]);
  useEffect(() => () => mesh?.material.dispose(), [mesh]);
  return mesh;
}
