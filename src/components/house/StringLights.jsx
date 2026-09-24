import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { garlandBulbs } from './beachHouse';

// Festoon lights: a dark flex hanging between anchors ({a, b, sag}, as the
// house hands them over), a warm pear-shaped bulb in a socket every 30 cm and
// a halo round each. Detail by the camera's distance: within `near` metres
// the flex, sockets, bulbs and halos; out to `far` the halos alone; past it
// nothing. `power` 0…1 is how bright they burn, `night` 0…1 how dark it is —
// by day the bulbs only glint and the halos are gone.
const WARM = new THREE.Color('#ffc46e');
const HANG = 0.05; // bulb centre below the flex

// A soft round spot for the halos, made once.
function haloTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2), i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, 1 - r) ** 2.2);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

const along = ({ a, b, sag }, t) => new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t);

export default function StringLights({ spans, power = 1, night = 0, near = 24, far = 80 }) {
  const group = useRef(), bulbs = useRef(), sockets = useRef();
  const levels = useRef({ near: null, halos: null }), point = useMemo(() => new THREE.Vector3(), []);
  const built = useMemo(() => {
    const points = spans.flatMap((span) => garlandBulbs(span));
    const flexes = spans.map((span) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => along(span, k / 12))), 24, 0.004, 4, false));
    const flex = mergeGeometries(flexes, false);
    flexes.forEach((geometry) => geometry.dispose());
    const halos = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, y, z]) => [x, y - HANG, z]), 3));
    const centre = points.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
    return { points, flex, halos, centre };
  }, [spans]);
  const parts = useMemo(() => ({
    bulb: new THREE.SphereGeometry(0.028, 10, 8).scale(1, 1.3, 1),
    socket: new THREE.CylinderGeometry(0.011, 0.013, 0.035, 6),
    flexMaterial: new THREE.MeshStandardMaterial({ color: '#1c1a18', roughness: 0.7 }),
    bulbMaterial: new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: WARM, roughness: 0.25 }),
    haloMaterial: new THREE.PointsMaterial({ map: haloTexture(), color: WARM, size: 0.55, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  }), []);
  useEffect(() => () => {
    built.flex.dispose();
    built.halos.dispose();
  }, [built]);
  useEffect(() => () => {
    parts.bulb.dispose();
    parts.socket.dispose();
    parts.haloMaterial.map.dispose();
    for (const material of [parts.flexMaterial, parts.bulbMaterial, parts.haloMaterial]) material.dispose();
  }, [parts]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    built.points.forEach(([x, y, z], i) => {
      bulbs.current?.setMatrixAt(i, matrix.makeTranslation(x, y - HANG, z));
      sockets.current?.setMatrixAt(i, matrix.makeTranslation(x, y - HANG + 0.045, z));
    });
    levels.current = { near: null, halos: null };
    for (const mesh of [bulbs.current, sockets.current]) {
      if (!mesh) continue;
      mesh.count = built.points.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [built]);
  useEffect(() => {
    parts.bulbMaterial.emissiveIntensity = power * (0.4 + 3 * night);
    parts.haloMaterial.opacity = power * night * 0.85;
  }, [night, parts, power]);

  useFrame(({ camera }) => {
    if (!group.current) return;
    const distance = camera.position.distanceTo(group.current.localToWorld(point.copy(built.centre)));
    const nearLevel = distance < near, halos = distance < far && power * night > 0.01;
    if (levels.current.near === nearLevel && levels.current.halos === halos) return;
    levels.current = { near: nearLevel, halos };
    const [flex, socketMesh, bulbMesh, haloPoints] = group.current.children;
    flex.visible = socketMesh.visible = bulbMesh.visible = nearLevel;
    haloPoints.visible = halos;
  });

  const count = Math.max(1, built.points.length);
  return (
    <group ref={group}>
      <mesh geometry={built.flex} material={parts.flexMaterial} castShadow />
      <instancedMesh ref={sockets} args={[parts.socket, parts.flexMaterial, count]} key={`s${count}`} />
      <instancedMesh ref={bulbs} args={[parts.bulb, parts.bulbMaterial, count]} key={`b${count}`} />
      <points geometry={built.halos} material={parts.haloMaterial} renderOrder={2} />
    </group>
  );
}
