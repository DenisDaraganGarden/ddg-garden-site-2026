import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COAST_ROCK_TYPES, makeRockGeometry } from './terrainRocks.js';
import { ROCK_MAP_NAMES, rockMapUrl, createRockTextureSet } from './rocks/rockTextures.js';
import { createCoastalRockMaterial, updateCoastalRockMaterial } from './rocks/rockMaterial.js';

export function useCoastRockMaterials(lowPower, lighting) {
  const { gl } = useThree();
  const loaded = useLoader(THREE.TextureLoader, ROCK_MAP_NAMES.map(name => rockMapUrl(name, lowPower)));
  const textures = useMemo(() => createRockTextureSet(loaded, Math.min(lowPower ? 4 : 8, gl.capabilities.getMaxAnisotropy())), [loaded, lowPower, gl]);
  const materials = useMemo(() => ({
    limestone: createCoastalRockMaterial(textures.maps.limestone, { fractureMaps: textures.maps.fracture }),
    coquina: createCoastalRockMaterial(textures.maps.coquina, { type: 'coquina', fractureMaps: textures.maps.fracture }),
    worn: createCoastalRockMaterial(textures.maps.limestone, { type: 'worn', fractureMaps: textures.maps.fracture }),
    pebble: createCoastalRockMaterial(textures.maps.limestone, { pebble: true }),
  }), [textures]);
  useEffect(() => () => { Object.values(materials).forEach(m => m.dispose()); textures.dispose(); }, [materials, textures]);
  useLayoutEffect(() => {
    Object.values(materials).forEach(material => updateCoastalRockMaterial(material, {
      relief: 1, damage: .8, blend: .85, wetness: .92, waterline: .12,
      algae: .16, environmentIntensity: lighting.environment.reflection, wireframe: false,
    }));
  }, [materials, lighting]);
  useFrame(() => { Object.values(materials).forEach(material => { material.envMapIntensity = lighting.environment.reflection; }); }, -3);
  return materials;
}

function RockBatch({ rocks, geometry, material, name }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    rocks.forEach((rock, i) => {
      transform.position.set(rock.x, rock.y, rock.z); transform.rotation.set(...rock.rotation);
      transform.scale.set(...rock.scale); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }, [rocks, geometry, material]);
  useEffect(() => {
    const mesh = ref.current;
    return () => { if (mesh) THREE.InstancedMesh.prototype.dispose.call(mesh); };
  }, [geometry, material, rocks.length]);
  return <instancedMesh ref={ref} name={name} args={[geometry, material, Math.max(1, rocks.length)]} count={rocks.length} castShadow receiveShadow dispose={null} />;
}

export default function CoastRocksPBR({ rocks, materials, lowPower }) {
  const batches = useMemo(() => {
    const groups = [];
    for (const debris of [false, true]) for (let variant = 0; variant < COAST_ROCK_TYPES.length; variant++) {
      const items = rocks.filter(rock => !!rock.debris === debris && (rock.variant ?? 0) === variant);
      if (!items.length) continue;
      groups.push({ items, type: COAST_ROCK_TYPES[variant], name: `coast-${debris ? 'debris' : 'rocks'}-${variant}`, geometry: makeRockGeometry({ variant, detail: debris || lowPower ? 4 : 8 }) });
    }
    return groups;
  }, [rocks, lowPower]);
  useEffect(() => () => batches.forEach(batch => batch.geometry.dispose()), [batches]);
  return <>{batches.map(batch => <RockBatch key={batch.name} name={batch.name} rocks={batch.items} geometry={batch.geometry} material={materials[batch.type]} />)}</>;
}
