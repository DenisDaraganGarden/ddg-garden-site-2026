import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSequence } from '../plants/oleasterModel.js';
export { createStoneRingMaterial, SHORE_STONE_MAPS } from './shoreStoneMaterial.js';

const TINTS = ['#f4eee1', '#d8d6d0', '#ece5d8', '#fff8ee', '#c6bbab', '#e2c2a0', '#cdd0cc'];

// Human-sized, incomplete by intention: one loose row laid by hand, with
// irregular gaps and bedding angles. Worn edges and the large-scale fractures
// belong to geometry; metre-scale triplanar PBR supplies the mineral detail.
export function makeStoneRing({ seed = 17, diameter = 1.9, stones = 14, irregularity = .55, lod = 0 } = {}) {
  const rand = randomSequence(seed), pieces = [], layout = [];
  const sphere = new THREE.IcosahedronGeometry(1, lod ? 2 : 6);
  sphere.deleteAttribute('uv'); sphere.deleteAttribute('normal');
  const source = mergeVertices(sphere); sphere.dispose();
  const count = THREE.MathUtils.clamp(Math.round(stones), 7, 24);
  const radius = THREE.MathUtils.clamp(diameter, .9, 3.8) * .5;
  const point = new THREE.Vector3(), color = new THREE.Color(), matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2 + (rand() - .5) * .13 * irregularity;
    const distance = radius * (1 + (rand() - .5) * .2 * irregularity);
    const length = radius * Math.PI * 2 / count * (.72 + rand() * .26);
    const scale = new THREE.Vector3(length, length * (.46 + rand() * .3), length * (.62 + rand() * .24));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * .55, -angle + Math.PI / 2, (rand() - .5) * .35));
    matrix.compose(new THREE.Vector3(), quaternion, scale);
    const geometry = source.clone();
    const vertices = geometry.attributes.position, phase = rand() * 6.28;
    const power = (i % 3 === 0 ? 2.05 : 2.6) + rand() * .55;
    for (let j = 0; j < vertices.count; j++) {
      point.fromBufferAttribute(vertices, j).normalize();
      const superRadius = .5 / Math.pow(Math.abs(point.x) ** power + Math.abs(point.y) ** power + Math.abs(point.z) ** power, 1 / power);
      const wear = 1 + .12 * Math.sin(point.x * 3.4 + phase) * Math.sin(point.z * 2.8 - phase)
        + .065 * Math.sin(point.y * 4.7 + point.z * 2.2 + phase)
        + .03 * Math.sin(point.x * 9 + point.y * 6 - phase) * Math.cos(point.z * 7 + phase);
      point.multiplyScalar(superRadius * wear);
      point.y += .05 * Math.sin(point.x * 4 + phase) * Math.cos(point.z * 3 - phase);
      vertices.setXYZ(j, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals(); geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    const position = new THREE.Vector3(Math.cos(angle) * distance, -geometry.boundingBox.min.y - scale.y * .14, Math.sin(angle) * distance);
    geometry.translate(position.x, position.y, position.z);
    color.set(TINTS[Math.floor(rand() * TINTS.length)]);
    const colors = [], offsets = [], textureOffset = [rand() * 3.8, rand() * 3.8, rand() * 3.8];
    for (let j = 0; j < geometry.attributes.position.count; j++) {
      point.fromBufferAttribute(geometry.attributes.position, j);
      const tone = .97 + Math.sin(point.x * 8 + point.z * 5 + phase) * .025;
      colors.push(color.r * tone, color.g * tone, color.b * tone);
      offsets.push(...textureOffset);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('stoneOffset', new THREE.Float32BufferAttribute(offsets, 3));
    pieces.push(geometry); layout.push({ position: position.toArray(), scale: scale.toArray(), rotation: quaternion.toArray() });
  }
  source.dispose();
  const geometry = mergeGeometries(pieces); pieces.forEach((p) => p.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = 'shore-stone-ring';
  return { geometry, layout, bounds: geometry.boundingBox.clone(), triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3,
    dispose() { geometry.dispose(); } };
}
