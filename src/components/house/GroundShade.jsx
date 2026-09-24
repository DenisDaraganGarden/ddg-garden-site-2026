import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// The shade things leave on the sand round them: the sky they hide from the
// ground under and beside them, which the sand's own material cannot know.
// Soft dark spots laid a hair above the ground — ellipses under chairs,
// poles and boards, soft rectangles under the house and the shed. The sun's
// own shadows are the scene's; this is only the light of the sky taken away.
// Each spot: { x, z, rx, rz, yaw, strength, box }. Gone past `far` metres.
const LIFT = 0.02;

function falloff(box) {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = ((x + 0.5) / size) * 2 - 1, v = ((y + 0.5) / size) * 2 - 1;
      const edge = box ? Math.max(Math.abs(u), Math.abs(v)) ** 3 * 0.5 + Math.hypot(u, v) * 0.5 : Math.hypot(u, v);
      const a = Math.max(0, 1 - THREE.MathUtils.smoothstep(edge, box ? 0.55 : 0.1, 1));
      // alphaMap reads the green channel.
      const value = Math.round(255 * a);
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

function quads(spots) {
  const positions = [], uvs = [], alphas = [];
  for (const { x, z, rx, rz, yaw = 0, strength = 0.5 } of spots) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corner = (u, v) => [x + (u * rx) * c + (v * rz) * s, LIFT, z - (u * rx) * s + (v * rz) * c];
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [u, v] of quad) {
      positions.push(...corner(u, v));
      uvs.push((u + 1) / 2, (v + 1) / 2);
      alphas.push(strength);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(alphas.flatMap((a) => [a, a, a]), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export default function GroundShade({ spots, visible = true, far = 90 }) {
  const parts = useMemo(() => [false, true].map((box) => {
    const mine = spots.filter((spot) => Boolean(spot.box) === box);
    if (!mine.length) return null;
    const map = falloff(box);
    // The strength rides in the vertex colour: black times its alpha.
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: map, transparent: true, opacity: 1, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vColor.r;\n  diffuseColor.rgb = vec3(0.0);');
    };
    material.vertexColors = true;
    return { geometry: quads(mine), material, map };
  }), [spots]);
  useEffect(() => () => parts.forEach((part) => {
    if (!part) return;
    part.geometry.dispose();
    part.material.dispose();
    part.map.dispose();
  }), [parts]);
  const holder = useMemo(() => ({ group: null }), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const group = holder.group;
    if (!group) return;
    group.visible = visible && camera.position.distanceTo(group.getWorldPosition(point)) < far;
  });
  return (
    <group ref={(group) => { holder.group = group; }} name="ground-shade" renderOrder={1}>
      {parts.map((part, i) => (part ? <mesh key={i} geometry={part.geometry} material={part.material} renderOrder={1} /> : null))}
    </group>
  );
}
