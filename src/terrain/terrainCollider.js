import * as THREE from 'three';

// Adapts the LOD-independent terrain query to the existing creature raycaster.
// The slab interval prevents horizon rays from marching empty kilometres.
export function createTerrainCollider(query) {
  const object = new THREE.Object3D();
  object.name = 'coast-collision';
  const p = query.definition;
  const extra = p.terrainCurve * 1.5 + p.terrainCapeDepth;
  const bounds = new THREE.Box3();
  for (const u of [p.terrainOffset - extra - 96, p.terrainOffset + extra + p.terrainLandWidth]) {
    for (const s of [-p.terrainLength / 2, p.terrainLength / 2]) {
      bounds.expandByPoint(new THREE.Vector3(u * p.landX + s * p.alongX, -p.waterDepth - .5, u * p.landZ + s * p.alongZ));
      bounds.expandByPoint(new THREE.Vector3(u * p.landX + s * p.alongX, p.terrainCliffHeight + p.terrainBeachWidth * .035 + 6, u * p.landZ + s * p.alongZ));
    }
  }
  object.raycast = (raycaster, hits) => {
    const { origin, direction } = raycaster.ray;
    let near = Math.max(0, raycaster.near), far = Math.min(10000, raycaster.far);
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(direction[axis]) < 1e-10) {
        if (origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis]) return;
      } else {
        const a = (bounds.min[axis] - origin[axis]) / direction[axis];
        const b = (bounds.max[axis] - origin[axis]) / direction[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near >= far) return;
      }
    }
    const start = raycaster.ray.at(near, new THREE.Vector3());
    const hit = query.raycast(start, direction, far - near);
    if (!hit) return;
    hits.push({
      distance: hit.distance + near,
      point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      object,
      face: { normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) },
    });
  };
  return object;
}
