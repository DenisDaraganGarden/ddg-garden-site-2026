import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coastCoordinates, coastPoint, shorePosition, sampleTerrainHeight, sampleTerrainNormal, smooth } from './terrainModel.js';
import { coastProfile } from './terrainLandforms.js';
import { makePebbleGeometry, createPebbleMaterial, PEBBLE_PALETTE } from './terrainRocks.js';

const RADIUS = 6;
const UP = new THREE.Vector3(0, 1, 0);
const SHELL_PALETTE = ['#e1d6bd', '#c6b99e', '#f1e7d2', '#8d8b7e', '#a89981', '#504e46'];

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

// Shell fragments: the same draws in the same order as before the batch was
// shared, so the beach did not change when the pebbles arrived.
const shellSample = (cq, cs, random, p) => {
  const density = p.terrainShells * smooth(.3, 1.4, cq) * (1 - smooth(4, Math.max(7, p.terrainBeachWidth * .8), cq));
  const accepted = random() < density;
  const radius = .007 + random() ** 1.5 * .026;
  const yaw = random() * Math.PI * 2, tint = Math.floor(random() * SHELL_PALETTE.length);
  if (!accepted) return null;
  return { yaw, tint, scale: [radius, radius, radius * .85], lift: .0004, minHeight: .03, minLevel: .96 };
};

// Pebbles gather where the swash sorts them, on both sides of the waterline,
// and below the bluff foot where the slope sheds them.
const pebbleSample = (cq, cs, random, p) => {
  const foot = coastProfile(cs, p).foot;
  const swash = smooth(-1.8, -.3, cq) * (1 - smooth(1.4, 4.2, cq));
  const bluff = smooth(foot - 2.6, foot - .4, cq) * (1 - smooth(foot + 1.2, foot + 4, cq));
  const density = p.terrainPebbles * (swash * .5 + bluff * .35);
  const accepted = random() < density;
  const radius = (.012 + random() ** 2 * .038) * p.terrainPebbleSize;
  const yaw = random() * Math.PI * 2, tint = Math.floor(random() * PEBBLE_PALETTE.length);
  const stretch = 1 + random() * .6, flat = .42 + random() * .3;
  if (!accepted) return null;
  return { yaw, tint, scale: [radius * stretch, radius * flat, radius], lift: radius * flat * .7, minHeight: -.6, minLevel: .55 };
};

// A camera-local instanced batch of small ground pieces that supplements the
// continuous parallax material. Integer coast cells seed every piece, so nothing
// shifts as the camera crosses a cell edge, and the batch only rebuilds when the
// camera enters another cell. Visual relief, not a navigation surface. `sample`
// decides per candidate whether a piece stands there and how it looks; it must
// draw its randoms in the same order every time.
function CoastScatter({ definition, qualityProfile, lighting, name, geometry, material, palette, capacity, shown, sample, castShadow = false }) {
  const mesh = useRef(), lastCell = useRef(''), timer = useRef(1);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const colors = useMemo(() => palette.map(color => new THREE.Color(color)), [palette]);
  useEffect(() => { lastCell.current = ''; }, [definition]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ camera }, delta) => {
    if (!mesh.current) return;
    const local = coastCoordinates(camera.position.x, camera.position.z, definition);
    const q = local.u - shorePosition(local.s, definition);
    mesh.current.visible = !qualityProfile.isLowPower && shown(definition, q, camera.position.y);
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
        for (let i = 0; i < 18 && count < capacity; i++) {
          const cq = across + random(), cs = s + random();
          const piece = sample(cq, cs, random, definition);
          if (!piece) continue;
          const point = coastPoint(cq, cs, definition);
          const y = sampleTerrainHeight(point.x, point.z, definition);
          const n = sampleTerrainNormal(point.x, point.z, definition);
          if (y < piece.minHeight || n.y < piece.minLevel || Math.abs(cs) > definition.terrainLength / 2 - 64) continue;
          transform.position.set(point.x, y + piece.lift, point.z);
          transform.quaternion.setFromUnitVectors(UP, normal.set(n.x, n.y, n.z));
          transform.rotateY(piece.yaw);
          transform.scale.set(...piece.scale);
          transform.updateMatrix();
          mesh.current.setMatrixAt(count, transform.matrix);
          mesh.current.setColorAt(count++, colors[piece.tint]);
        }
      }
    }
    mesh.current.count = count;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  });
  return <instancedMesh ref={mesh} name={name} args={[geometry, material, capacity]} count={0} receiveShadow castShadow={castShadow} />;
}

const onBeach = (p, q, cameraY, reach) => cameraY < reach && q > -RADIUS && q < p.terrainBeachWidth + RADIUS + 6;

export function CoastShells(props) {
  const geometry = useMemo(shellGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .68, side: THREE.DoubleSide }), []);
  return <CoastScatter {...props} name="coast-shell-fragments" geometry={geometry} material={material} palette={SHELL_PALETTE} capacity={2800} sample={shellSample}
    shown={(p, q, cameraY) => p.terrainShells > .01 && onBeach(p, q, cameraY, 5)} />;
}

export function CoastPebbles(props) {
  const geometry = useMemo(makePebbleGeometry, []);
  const material = useMemo(createPebbleMaterial, []);
  return <CoastScatter {...props} name="coast-pebbles" geometry={geometry} material={material} palette={PEBBLE_PALETTE} capacity={2400} sample={pebbleSample} castShadow
    shown={(p, q, cameraY) => p.terrainPebblesEnabled && p.terrainPebbles > .01 && onBeach(p, q, cameraY, 7)} />;
}
