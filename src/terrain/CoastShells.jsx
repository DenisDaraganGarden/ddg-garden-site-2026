import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coastCoordinates, coastPoint, shorePosition, sampleTerrainHeight, sampleTerrainNormal, smooth } from './terrainModel.js';

const CAPACITY = 2800;
const RADIUS = 6;
const UP = new THREE.Vector3(0, 1, 0);
const PALETTE = ['#e1d6bd', '#c6b99e', '#f1e7d2', '#8d8b7e', '#a89981', '#504e46'];

function shellGeometry() {
  const positions = [], indices = [];
  const rings = 4, segments = 12;
  for (let r = 0; r <= rings; r++) {
    const radius = Math.max(.008, r / rings);
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments - .5) * Math.PI * .85;
      const rib = s % 2 ? .055 : 0;
      positions.push(
        Math.sin(angle) * radius,
        Math.sin(radius * Math.PI) * .3 + rib * radius,
        Math.cos(angle) * radius - .45,
      );
    }
  }
  const width = segments + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) {
    const a = r * width + s, b = a + width;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A camera-local batch supplements the continuous parallax material. Integer
// cells preserve every fragment's position as the camera crosses a cell edge.
// This is visual millimetre relief, not a separate navigation surface.
export default function CoastShells({ definition, qualityProfile, lighting }) {
  const mesh = useRef(), lastCell = useRef(''), timer = useRef(1);
  const geometry = useMemo(shellGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: .68, side: THREE.DoubleSide,
  }), []);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const palette = useMemo(() => PALETTE.map(color => new THREE.Color(color)), []);
  useEffect(() => { lastCell.current = ''; }, [definition]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ camera }, delta) => {
    if (!mesh.current) return;
    const local = coastCoordinates(camera.position.x, camera.position.z, definition);
    const q = local.u - shorePosition(local.s, definition);
    mesh.current.visible = !qualityProfile.isLowPower && definition.terrainShells > .01
      && camera.position.y < 5 && q > -RADIUS && q < definition.terrainBeachWidth + RADIUS;
    if (!mesh.current.visible) return;
    material.envMapIntensity = lighting.environment.reflection;
    timer.current += delta;
    if (timer.current < .3) return;
    timer.current = 0;
    const cellQ = Math.floor(q), cellS = Math.floor(local.s);
    const cell = `${cellQ}:${cellS}`;
    if (cell === lastCell.current) return;
    lastCell.current = cell;
    let count = 0;
    for (let s = cellS - RADIUS; s <= cellS + RADIUS; s++) {
      for (let across = cellQ - RADIUS; across <= cellQ + RADIUS; across++) {
        let seed = (Math.imul(s, 73856093) ^ Math.imul(across, 19349663) ^ definition.terrainSeed) >>> 0;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 18 && count < CAPACITY; i++) {
          const cq = across + random(), cs = s + random();
          const density = definition.terrainShells * smooth(.3, 1.4, cq)
            * (1 - smooth(4, Math.max(7, definition.terrainBeachWidth * .8), cq));
          const accepted = random() < density;
          const radius = .007 + random() ** 1.5 * .026;
          const yaw = random() * Math.PI * 2, tint = Math.floor(random() * palette.length);
          if (!accepted) continue;
          const point = coastPoint(cq, cs, definition);
          const y = sampleTerrainHeight(point.x, point.z, definition);
          const n = sampleTerrainNormal(point.x, point.z, definition);
          if (y < .03 || n.y < .96 || Math.abs(cs) > definition.terrainLength / 2 - 64) continue;
          transform.position.set(point.x, y + .0004, point.z);
          transform.quaternion.setFromUnitVectors(UP, normal.set(n.x, n.y, n.z));
          transform.rotateY(yaw);
          transform.scale.set(radius, radius, radius * .85);
          transform.updateMatrix();
          mesh.current.setMatrixAt(count, transform.matrix);
          mesh.current.setColorAt(count++, palette[tint]);
        }
      }
    }
    mesh.current.count = count;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  });
  return <instancedMesh ref={mesh} name="coast-shell-fragments" args={[geometry, material, CAPACITY]} count={0} receiveShadow />;
}
