import * as THREE from 'three';
import { projectLandingSites } from './seagullLandingSurfaces.js';

const worldBounds = new THREE.Box3();
const localBounds = new THREE.Box3();
const meshBounds = new THREE.Box3();
const rootInverse = new THREE.Matrix4();
const relativeMeshMatrix = new THREE.Matrix4();
const probeLocal = new THREE.Vector3();
const probeWorld = new THREE.Vector3();
const rootUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PROBE_SEARCH_OFFSETS = Object.freeze([
  [0, 0],
  [0.04, -0.12], [-0.04, -0.12],
  [0, -0.17],
  [-0.05, 0.1],
  [0.08, 0], [-0.08, 0],
  [0, 0.08], [0, -0.08],
]);

function boundsInRoot(root, collisionObject) {
  root.updateWorldMatrix(true, true);
  rootInverse.copy(root.matrixWorld).invert();
  localBounds.makeEmpty();

  collisionObject.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    relativeMeshMatrix.multiplyMatrices(rootInverse, object.matrixWorld);
    meshBounds.copy(object.geometry.boundingBox).applyMatrix4(relativeMeshMatrix);
    localBounds.union(meshBounds);
  });

  if (localBounds.isEmpty()) {
    throw new Error('Seagull landing habitat could not find collision geometry');
  }
  return localBounds;
}

function remapSpecsToWorld(root, collisionObject, specs) {
  const bounds = boundsInRoot(root, collisionObject);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  return specs.map((spec) => {
    const [x = 0, z = 0] = spec.probeBounds ?? [0, 0];
    const probePoints = PROBE_SEARCH_OFFSETS.map(([offsetX, offsetZ]) => {
      probeLocal.set(
        center.x + (size.x * 0.5 * (x + offsetX)),
        // A root tilt changes x/z if a virtual point is placed "above" it.
        // The projector itself offsets this base point along the cast axis.
        bounds.min.y,
        center.z + (size.z * 0.5 * (z + offsetZ)),
      );
      return root.localToWorld(probeWorld.copy(probeLocal)).toArray();
    });
    return {
      ...spec,
      probe: [probePoints[0][0], probePoints[0][2]],
      probePoints,
    };
  });
}

function createMarker(anchor) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.052, 20),
    new THREE.MeshBasicMaterial({ color: '#ff3a4d', depthTest: false, toneMapped: false }),
  );
  marker.name = 'seagull-landing-rigcheck-marker';
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 20;
  marker.raycast = () => {};
  anchor.add(marker);
  return marker;
}

function disposeMarker(marker) {
  marker?.geometry?.dispose();
  marker?.material?.dispose();
}

export function createLandingHabitatSites({
  root,
  collisionObject,
  specs,
  rigcheck = false,
  surfaceUp,
}) {
  if (!root || !collisionObject || !specs?.length) return [];

  root.updateWorldMatrix(true, true);
  worldBounds.setFromObject(collisionObject);
  if (worldBounds.isEmpty()) return [];

  const resolvedSurfaceUp = surfaceUp
    ?? rootUp.set(0, 1, 0).transformDirection(root.matrixWorld);
  // A user can scale or tilt either receiver until one authored point becomes
  // physically too narrow for both feet. Keep the remaining habitat alive
  // instead of taking down the whole WebGL scene; the production fixture still
  // asserts that all five published points resolve.
  const projected = remapSpecsToWorld(root, collisionObject, specs).flatMap((spec) => {
    try {
      return projectLandingSites(collisionObject, [spec], 0.82, resolvedSurfaceUp);
    } catch {
      return [];
    }
  });

  return projected.map((site) => {
    const anchor = new THREE.Object3D();
    anchor.name = `seagull-landing-anchor-${site.id}`;
    anchor.position.fromArray(site.position);
    anchor.quaternion.copy(site.quaternion);
    anchor.userData.ddgSeagullLandingAnchor = true;
    anchor.userData.ddgSurface = site.surface;
    root.attach(anchor);
    anchor.updateWorldMatrix(true, false);
    const marker = rigcheck ? createMarker(anchor) : null;

    return { ...site, object: anchor, collisionObject, marker };
  });
}

export { WORLD_UP };

export function disposeLandingHabitatSites(sites) {
  for (const site of sites) {
    disposeMarker(site.marker);
    site.object?.parent?.remove(site.object);
  }
}
