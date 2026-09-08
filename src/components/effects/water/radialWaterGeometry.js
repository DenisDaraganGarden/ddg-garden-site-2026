import * as THREE from 'three';

// One water mesh from the camera to the horizon: concentric rings whose radius
// grows geometrically, so the cell size stays roughly constant on screen. The
// mesh follows the camera; waves are evaluated in world space, so vertices
// sliding under a fixed wave field is invisible at this density.

// Metres of vertex spacing per metre of distance from the camera: the larger of
// the radial growth and the angular step. Every water surface fades the trains
// it cannot resolve by this one number (waterCell in gerstnerWaves.js), so two
// surfaces meeting at a seam compute the same swell there and there is no step.
export function radialCellFactor({ innerRadius = 1, outerRadius = 3000, rings = 112, segments = 144 } = {}) {
  const ringCount = Math.max(Math.round(Number(rings) || 112), 2);
  const segmentCount = Math.max(Math.round(Number(segments) || 144), 3);
  return Math.max((outerRadius / innerRadius) ** (1 / (ringCount - 1)) - 1, (Math.PI * 2) / segmentCount);
}

export function buildRadialWaterGeometry({ innerRadius = 1, outerRadius = 3000, rings = 112, segments = 144 } = {}) {
  const ringCount = Math.max(Math.round(rings), 2);
  const segmentCount = Math.max(Math.round(segments), 3);
  const growth = (outerRadius / innerRadius) ** (1 / (ringCount - 1));
  const positions = new Float32Array((ringCount * segmentCount + 1) * 3);
  let cursor = 3; // vertex 0 is the centre
  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = innerRadius * growth ** ring;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * Math.PI * 2;
      positions[cursor] = Math.cos(angle) * radius;
      positions[cursor + 2] = Math.sin(angle) * radius;
      cursor += 3;
    }
  }
  const indices = [];
  const ringVertex = (ring, segment) => 1 + ring * segmentCount + (segment % segmentCount);
  // Counter-clockwise seen from +Y: angle increases toward +Z, so the next
  // segment comes before the current one.
  for (let segment = 0; segment < segmentCount; segment += 1) {
    indices.push(0, ringVertex(0, segment + 1), ringVertex(0, segment));
  }
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const a = ringVertex(ring, segment), b = ringVertex(ring, segment + 1);
      const c = ringVertex(ring + 1, segment), d = ringVertex(ring + 1, segment + 1);
      indices.push(a, d, c, a, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outerRadius);
  geometry.userData.triangles = indices.length / 3;
  geometry.userData.cellFactor = radialCellFactor({ innerRadius, outerRadius, rings, segments });
  return geometry;
}
