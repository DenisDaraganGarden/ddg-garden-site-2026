import * as THREE from 'three';
import { configureMaps, createTextureTint } from './pbrMaterial';

// The rowing boat as one asset. The home scene (FloatingBoat) and the
// laboratory (boat-lab) load the same GLB and maps and build the same two
// materials here, so the look cannot drift between the two.
export const BOAT_MODEL_URL = '/models/boat/OBJ_boat2.0.glb';
export const BOAT_TEXTURE_URLS = Object.freeze([
  '/models/boat/boat_basecolor.webp',
  '/models/boat/boat_roughness.webp',
  '/models/boat/boat_bump.webp',
]);
export const BOAT_OPTICS_LOD_URL = 'models/boat/boat-optics.rlod';
// Black metal in the GLB: oar fittings / brackets. Everything else is wood.
export const BOAT_METAL_MATERIAL_NAME = 'OBJ_wire_metall';
// The supplied base-colour map is very dark charcoal (peak 0.29 in sRGB); this
// lift restores the authored wood values. The picker multiplies on top of it.
export const BOAT_MAP_LIFT = 7.5;

export function createBoatMaterials(gl, boatTextures, look, envReflection) {
  const [baseColorMap, roughnessMap, bumpMap] = boatTextures;

  configureMaps(gl, { color: [baseColorMap], data: [roughnessMap, bumpMap] });
  // The planks are unwrapped with tiling coordinates (u runs to 5.9, v to 4.4),
  // so the maps must repeat. TextureLoader clamps by default, and a clamped map
  // smears every plank past the first tile into streaks that read as grain
  // running the wrong way.
  boatTextures.forEach((texture) => {
    if (texture.wrapS === THREE.RepeatWrapping) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
  });

  // Wood hull/oars: PBR maps authored in 3ds Max (no more flat-graphite override).
  const woodMaterial = new THREE.MeshPhysicalMaterial({
    map: baseColorMap,
    color: createTextureTint(look.color, BOAT_MAP_LIFT),
    roughnessMap,
    roughness: look.roughness,
    metalness: THREE.MathUtils.clamp(look.metalness, 0, 0.3),
    bumpMap,
    bumpScale: 0.4,
    clearcoat: look.clearcoat,
    clearcoatRoughness: look.clearcoatRoughness,
    envMapIntensity: envReflection,
    side: THREE.DoubleSide,
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0b0b0d'),
    metalness: 0.85,
    roughness: 0.42,
    envMapIntensity: envReflection,
    side: THREE.DoubleSide,
  });

  return { woodMaterial, metalMaterial };
}

// Dresses a fresh clone of the GLB scene. Keeps the model's own (custom)
// normals — never recompute them.
export function dressBoat(clone, { woodMaterial, metalMaterial }, scale) {
  const pickMaterial = (material) => (
    material && material.name === BOAT_METAL_MATERIAL_NAME ? metalMaterial : woodMaterial
  );
  clone.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.material = Array.isArray(child.material)
      ? child.material.map(pickMaterial)
      : pickMaterial(child.material);
    child.castShadow = true;
    child.receiveShadow = true;
  });
  clone.scale.setScalar(scale);
  clone.rotateY(Math.PI); // bow orientation — fine-tune via boatYaw if needed
  return clone;
}
