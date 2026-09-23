import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader, useThree } from '@react-three/fiber';
import { HOUSE_COLORS, HOUSE_ROLES } from './beachHouse';
import { houseMapUrls, houseMaps, houseMaterial } from './houseMaterial';

// A building from beachHouse.js as meshes, one per finish, in its textured
// material (houseMaterial.js) aged by `weather`. `clay` shows it as an
// architect's white card model instead: no maps, no age. Suspends while the
// maps load.
const FINISH = {
  glass: { roughness: 0.08 },
  metal: { roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide },
  trim: { roughness: 0.7 },
  awning: { roughness: 0.62 },
  unit: { roughness: 0.55 },
  void: { roughness: 1 },
};
const CLAY = '#e8e3d9';
const CLAY_DARK = '#9ca2a6';

export default function BeachHouseModel({ building, colors = HOUSE_COLORS, clay = false, wireframe = false, weather = 0, seed = 0, lowPower = false }) {
  const { gl } = useThree();
  const textures = useLoader(THREE.TextureLoader, houseMapUrls(lowPower));
  const maps = useMemo(() => houseMaps(textures, gl), [gl, textures]);
  const shared = useMemo(() => ({ uTextured: { value: 1 }, uWeather: { value: 0 }, uWeatherSeed: { value: 0 }, uDripLines: { value: new THREE.Vector4() } }), []);
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
  }, [building, clay, seed, shared, weather]);

  return (
    <group>
      {[...building.parts].map(([role, geometry]) => (
        <mesh key={role} name={`house-${role}`} geometry={geometry} material={materials[role]} castShadow receiveShadow />
      ))}
    </group>
  );
}
