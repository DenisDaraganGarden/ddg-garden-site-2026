import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { HOUSE_COLORS, HOUSE_ROLES } from './beachHouse';
import { weatherKindOf, weatherMaterial } from './weathering';

// A building from beachHouse.js as meshes, one per finish: flat colours aged
// by `weather` (streaks, peeling paint, rust — weathering.js). `clay` shows it
// as an architect's white card model instead, clean.
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

export default function BeachHouseModel({ building, colors = HOUSE_COLORS, clay = false, wireframe = false, weather = 0, seed = 0 }) {
  const shared = useMemo(() => ({ uWeather: { value: 0 }, uWeatherSeed: { value: 0 }, uDripLines: { value: new THREE.Vector4() } }), []);
  const materials = useMemo(() => Object.fromEntries(HOUSE_ROLES.map((role) => [
    role,
    weatherMaterial(new THREE.MeshStandardMaterial({ name: `house-${role}`, roughness: 0.86, metalness: 0, ...FINISH[role] }), weatherKindOf(role), shared),
  ])), [shared]);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  useEffect(() => {
    for (const role of HOUSE_ROLES) {
      const hex = clay ? (role === 'glass' || role === 'void' ? CLAY_DARK : CLAY) : (colors[role] ?? HOUSE_COLORS[role]);
      materials[role].color.set(hex);
      materials[role].wireframe = wireframe;
    }
  }, [clay, colors, materials, wireframe]);
  useEffect(() => {
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
