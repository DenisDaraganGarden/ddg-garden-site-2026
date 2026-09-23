import * as THREE from 'three';
import { JOINTS, JOINT_BLOCK, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES, STICKS } from './riderSkeleton.js';

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

