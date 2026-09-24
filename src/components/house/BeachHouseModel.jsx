import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { HOUSE_COLORS, HOUSE_ROLES } from './beachHouse';
import { houseMapUrls, houseMaps, houseMaterial } from './houseMaterial';

// A building from beachHouse.js as meshes, one per finish, in its textured
// material (houseMaterial.js) aged by `weather`. `lamps` 0…1 lights the rooms
// behind the windows and the lanterns, more as `night` (0…1) falls; each
// lantern also lights what is round it. `clay` shows it as an architect's
// white card model instead: no maps, no age, no light. Suspends while the
// maps load. Past `near` metres it shows its far build (the same house,
// barer: beachHouse.js), in the same materials.
const FINISH = {
  glass: { roughness: 0.08 },
  metal: { roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide },
  trim: { roughness: 0.7 },
  awning: { roughness: 0.62 },
  unit: { roughness: 0.55 },
  void: { roughness: 1 },
  lamp: { roughness: 0.25, emissive: '#ffb45a' },
};
const CLAY = '#e8e3d9';
const CLAY_DARK = '#9ca2a6';

export default function BeachHouseModel({ building, colors = HOUSE_COLORS, clay = false, wireframe = false, weather = 0, seed = 0, lamps = 0, night = 0, lowPower = false, near = 60 }) {
  const { gl } = useThree();
  const textures = useLoader(THREE.TextureLoader, houseMapUrls(lowPower));
  const maps = useMemo(() => houseMaps(textures, gl), [gl, textures]);
  const shared = useMemo(() => ({
    uTextured: { value: 1 }, uWeather: { value: 0 }, uWeatherSeed: { value: 0 }, uDripLines: { value: new THREE.Vector4() }, uLampPower: { value: 0 }, uInteriorDay: { value: 1 },
    uCovers: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uCoverHeights: { value: new Float32Array(8) }, uCoverCount: { value: 0 }, uCoverStrength: { value: 0.9 },
  }), []);
  const materials = useMemo(() => Object.fromEntries(HOUSE_ROLES.map((role) => [role, houseMaterial(role, maps, shared, FINISH[role])])), [maps, shared]);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  useEffect(() => {
    for (const role of HOUSE_ROLES) {
      const hex = clay ? (role === 'glass' || role === 'void' ? CLAY_DARK : CLAY) : (colors[role] ?? HOUSE_COLORS[role]);
      materials[role].color.set(hex);
      materials[role].wireframe = wireframe;
    }
  }, [clay, colors, materials, wireframe]);
  useEffect(() => {
    shared.uTextured.value = clay ? 0 : 1;
    shared.uWeather.value = clay ? 0 : weather;
    shared.uWeatherSeed.value = (seed * 7.31) % 97;
    shared.uDripLines.value.fromArray(building.plan.dripLines);
    const covers = (building.plan.covers ?? []).slice(0, 8);
    covers.forEach(([x0, z0, x1, z1, y], i) => {
      shared.uCovers.value[i].set(x0, z0, x1, z1);
      shared.uCoverHeights.value[i] = y;
    });
    shared.uCoverCount.value = covers.length;
  }, [building, clay, seed, shared, weather]);
  // Lamps are on day and night; by day the rooms are lit mostly through the
  // windows and the lamps hardly show.
  const lampLight = clay ? 0 : lamps * (0.12 + 0.88 * night);
  useEffect(() => {
    shared.uLampPower.value = lampLight;
    shared.uInteriorDay.value = clay ? 0 : 0.15 + 0.85 * (1 - night);
    materials.lamp.emissiveIntensity = clay ? 0 : lamps * (0.3 + 2.7 * night);
  }, [clay, lampLight, lamps, materials, night, shared]);

  const detail = useRef(), bare = useRef(), centre = useMemo(() => building.bounds.getCenter(new THREE.Vector3()), [building]), point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!detail.current || !bare.current) return;
    const close = camera.position.distanceTo(detail.current.localToWorld(point.copy(centre))) < near;
    detail.current.visible = close;
    bare.current.visible = !close;
  });

  return (
    <group>
      <group ref={detail}>
        {[...building.parts].map(([role, geometry]) => (
          <mesh key={role} name={`house-${role}`} geometry={geometry} material={materials[role]} castShadow receiveShadow />
        ))}
      </group>
      <group ref={bare} visible={false}>
        {[...(building.far ?? [])].map(([role, geometry]) => (
          <mesh key={role} name={`house-far-${role}`} geometry={geometry} material={materials[role]} castShadow receiveShadow />
        ))}
      </group>
      {building.plan.lamps.map((position, i) => (
        <pointLight key={i} position={position} color="#ffbe78" intensity={clay ? 0 : lamps * night * 6} distance={9} decay={2} />
      ))}
    </group>
  );
}
