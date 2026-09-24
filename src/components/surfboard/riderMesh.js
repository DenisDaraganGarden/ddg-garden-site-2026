import * as THREE from 'three';
import { JOINTS, JOINT_BLOCK, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES, STICKS } from './riderSkeleton.js';
import { LEASH_LENGTH, leashEnds } from './riderController.js';

// The rider's sticks and joint blocks as instances of one box, and how the
// bodies write them each frame (RiderModel draws them).

const WOOD = new THREE.Color('#dcc6a0');
const JOINT_WOOD = new THREE.Color('#9e7f58');

// Every stick and block as [segment index, local matrix (in the segment's
// frame, about its centre), colour].
function buildParts() {
  const parts = [];
  const m = new THREE.Matrix4();
  SEGMENT_NAMES.forEach((name, i) => {
    const centre = SEGMENT_CENTRE[name];
    for (const [c, size] of STICKS[name] ?? []) {
      m.compose(new THREE.Vector3(c[0] - centre[0], c[1] - centre[1], c[2] - centre[2]), new THREE.Quaternion(), new THREE.Vector3(size[0], size[1], size[2]));
      parts.push([i, m.clone(), WOOD]);
    }
  });
  for (const joint of JOINTS) {
    const child = SEGMENT[joint.child];
    const centre = SEGMENT_CENTRE[joint.child];
    const a = joint.anchor;
    m.compose(new THREE.Vector3(a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]), new THREE.Quaternion(), new THREE.Vector3(JOINT_BLOCK, JOINT_BLOCK, JOINT_BLOCK));
    parts.push([child, m.clone(), JOINT_WOOD]);
  }
  return parts;
}
export const RIDER_PARTS = buildParts();
const PARTS = RIDER_PARTS;

const segmentMatrix = new THREE.Matrix4();
const partMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const unit = new THREE.Vector3(1, 1, 1);

// Write the mesh from the rider's bodies (world poses).
export function updateRiderModel(mesh, rider) {
  if (!mesh || !rider) return;
  const bodies = rider.world.bodies;
  for (let k = 0; k < PARTS.length; k += 1) {
    const [i, local] = PARTS[k];
    const body = bodies[i];
    position.set(body.x[0], body.x[1], body.x[2]);
    rotation.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    segmentMatrix.compose(position, rotation, unit);
    partMatrix.multiplyMatrices(segmentMatrix, local);
    mesh.setMatrixAt(k, partMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}


// The leash: a cord from his back ankle to the plug in the tail, hanging in a
// curve while it is slack (as long as its own length), straight once taut;
// gone when it is off his ankle.
const CORD_POINTS = 16;
const cordFrom = [0, 0, 0], cordTo = [0, 0, 0];
export function createLeashCord() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CORD_POINTS * 3), 3));
  const cord = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#1c1d20' }));
  cord.name = 'surfboard-leash-cord';
  // It moves every frame; a bounding sphere would be stale by the next one.
  cord.frustumCulled = false;
  return cord;
}
export function updateLeashCord(cord, rider, board, visible = true) {
  if (!cord) return;
  cord.visible = visible && leashEnds(rider, board, cordFrom, cordTo);
  if (!cord.visible) return;
  const d = Math.hypot(cordTo[0] - cordFrom[0], cordTo[1] - cordFrom[1], cordTo[2] - cordFrom[2]);
  // A shallow parabola as long as the cord: 8·sag²/(3·d) longer than the chord.
  const sag = d < LEASH_LENGTH ? Math.sqrt(0.375 * d * (LEASH_LENGTH - d)) : 0;
  const points = cord.geometry.attributes.position.array;
  for (let i = 0; i < CORD_POINTS; i += 1) {
    const u = i / (CORD_POINTS - 1);
    points[i * 3] = cordFrom[0] + (cordTo[0] - cordFrom[0]) * u;
    points[i * 3 + 1] = cordFrom[1] + (cordTo[1] - cordFrom[1]) * u - 4 * sag * u * (1 - u);
    points[i * 3 + 2] = cordFrom[2] + (cordTo[2] - cordFrom[2]) * u;
  }
  cord.geometry.attributes.position.needsUpdate = true;
}
