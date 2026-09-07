import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSequence } from '../plants/oleasterModel.js';
import { makeRockGeometry, makePebbleGeometry, createPebbleMaterial, PEBBLE_PALETTE } from './terrainRocks.js';

// Human-sized, incomplete by intention: one loose row laid by hand, with
// irregular gaps and bedding angles. The stones are the coast's actual slabs.
export function makeStoneRing({ seed = 17, diameter = 1.9, stones = 14, irregularity = .55 } = {}) {
  const rand = randomSequence(seed), source = makeRockGeometry(), pebble = makePebbleGeometry(), pieces = [], layout = [];
  const rounded = pebble.toNonIndexed().scale(.5, .5, .5);
  pebble.dispose(); rounded.deleteAttribute('uv');
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
    const geometry = (i % 3 === 0 ? rounded : source).clone();
    const vertices = geometry.attributes.position, phase = rand() * 6.28;
    for (let j = 0; j < vertices.count; j++) {
      point.fromBufferAttribute(vertices, j);
      point.x *= 1 + Math.sin(point.y * 5 + phase) * .19;
      point.y *= .84 + Math.sin(point.z * 4 + phase) * .13;
      vertices.setXYZ(j, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals(); geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    const position = new THREE.Vector3(Math.cos(angle) * distance, -geometry.boundingBox.min.y - scale.y * .14, Math.sin(angle) * distance);
    geometry.translate(position.x, position.y, position.z);
    color.set(PEBBLE_PALETTE[Math.floor(rand() * PEBBLE_PALETTE.length)]);
    if (i % 4 === 1) color.lerp(new THREE.Color('#9c7551'), .55);
    const colors = [];
    for (let j = 0; j < geometry.attributes.position.count; j++) {
      point.fromBufferAttribute(geometry.attributes.position, j);
      const tone = .9 + Math.sin(point.x * 31 + point.z * 17) * .07;
      colors.push(color.r * tone, color.g * tone, color.b * tone);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pieces.push(geometry); layout.push({ position: position.toArray(), scale: scale.toArray(), rotation: quaternion.toArray() });
  }
  source.dispose(); rounded.dispose();
  const geometry = mergeGeometries(pieces); pieces.forEach((p) => p.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = 'shore-stone-ring';
  return { geometry, layout, bounds: geometry.boundingBox.clone(), triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3,
    dispose() { geometry.dispose(); } };
}

export function createStoneRingMaterial() {
  const material = createPebbleMaterial();
  material.vertexColors = true; material.roughness = .96;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRingPoint;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRingPoint=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRingPoint;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      float grain=sin(vRingPoint.x*217.0+sin(vRingPoint.y*171.0))*sin(vRingPoint.z*249.0);
      float aa=1.0-smoothstep(.002,.012,length(fwidth(vRingPoint)));
      diffuseColor.rgb*=.94+grain*.13*aa;
    `);
  };
  material.customProgramCacheKey = () => 'ddg-stone-ring-1';
  return material;
}
