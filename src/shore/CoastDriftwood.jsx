import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { createDeadwoodMaterials } from '../plants/deadwoodMaterial.js';
import { createStoneRingMaterial, SHORE_STONE_MAPS } from '../terrain/stoneRingModel.js';
import { makeDriftwoodAsset } from './driftwoodAssets.js';
import { createShorePlacement, shorePlacementMatrix } from './shorePlacement.js';
import { normalizeShoreSettings, shoreMaterialSettings } from './settings.js';

const MAPS = ['/textures/plants/bark/oleaster-albedo.webp', '/textures/plants/bark/oleaster-normal.webp', ...SHORE_STONE_MAPS];
function Population({ asset, placements, matrices, materials, stone, distance, lowPower, query }) {
  const refs = useRef([]), states = useRef([]), timer = useRef(1), lastCamera = useRef(new THREE.Vector3(Infinity, 0, 0));
  const parts = asset.kind === 'ring' ? ['geometry'] : ['wood', 'endGrain'];
  const materialFor = (part) => part === 'geometry' ? stone : materials[part];
  useEffect(() => {
    refs.current.forEach((mesh) => { if (mesh) mesh.count = 0; });
    states.current = []; timer.current = 1; lastCamera.current.set(Infinity, 0, 0);
    // Collision meshes never render and never change with the visible LOD.
    const collider = new THREE.Object3D(); collider.name = `shore-collision-${asset.kind}`;
    const proxyMaterial = new THREE.MeshBasicMaterial();
    const proxies = parts.map((part) => {
      const mesh = new THREE.InstancedMesh(asset.low[part], proxyMaterial, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); return mesh;
    });
    collider.raycast = (raycaster, hits) => proxies.forEach((mesh) => mesh.raycast(raycaster, hits));
    query.collisionObject?.add(collider);
    return () => { collider.removeFromParent(); proxyMaterial.dispose(); proxies.forEach((mesh) => mesh.dispose()); };
  }, [asset, matrices, query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { timer.current = 1; lastCamera.current.set(Infinity, 0, 0); }, [distance, lowPower]);
  useFrame(({ camera }, delta) => {
    timer.current += delta;
    if (timer.current < .2 || lastCamera.current.distanceToSquared(camera.position) < .04) return;
    timer.current = 0; lastCamera.current.copy(camera.position);
    const counts = [0, 0], point = new THREE.Vector3();
    const near = asset.kind === 'branch' ? 10 : asset.kind === 'ring' ? 18 : 24;
    matrices.forEach((matrix, i) => {
      point.setFromMatrixPosition(matrix);
      const d = camera.position.distanceTo(point), previous = states.current[i] ?? 1;
      const lod = d > distance ? -1 : d < near * (previous === 0 ? 1.18 : .88) * (lowPower ? .65 : 1) ? 0 : 1;
      states.current[i] = lod;
      if (lod < 0) return;
      const slot = counts[lod]++;
      parts.forEach((_, j) => refs.current[lod * parts.length + j]?.setMatrixAt(slot, matrix));
    });
    for (let lod = 0; lod < 2; lod++) parts.forEach((_, j) => {
      const mesh = refs.current[lod * parts.length + j];
      if (!mesh) return;
      mesh.count = counts[lod]; mesh.visible = counts[lod] > 0; mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    });
  });
  return <group name={`shore-${asset.kind}`} userData={{ shoreCount: placements.length }}>
    {[asset.near, asset.low].flatMap((geometry, lod) => parts.map((part, j) => <instancedMesh key={`${lod}-${part}`} ref={(mesh) => { refs.current[lod * parts.length + j] = mesh; }}
      args={[geometry[part], materialFor(part), placements.length]} castShadow receiveShadow dispose={null}
      userData={{ ddgOpticsGeometry: asset.low[part], ddgOpticsBaseGeometry: geometry[part] }} />))}
  </group>;
}

export default function CoastDriftwood({ query, definition, settings, qualityProfile, envMapIntensity = 1 }) {
  const key = JSON.stringify(normalizeShoreSettings(settings)), s = useMemo(() => JSON.parse(key), [key]);
  const placementKey = JSON.stringify([s.shoreEnabled, s.shoreSeed, s.shoreCount, s.shoreLength, s.shoreAlong, s.shoreSize, s.shoreBackBeach, s.shoreLogs, s.shoreStakes, s.shoreRings]);
  const items = useMemo(() => createShorePlacement(query, definition, s), [query, definition, placementKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const assets = useMemo(() => {
    const result = new Map();
    for (const item of items) { const id = `${item.kind}-${item.variant}`; if (!result.has(id)) result.set(id, makeDriftwoodAsset(item.kind, s.shoreSeed, item.variant)); }
    return result;
  }, [items, s.shoreSeed]);
  useEffect(() => () => assets.forEach((asset) => asset.dispose()), [assets]);
  const batches = useMemo(() => [...assets].map(([id, asset]) => {
    const placements = items.filter((item) => `${item.kind}-${item.variant}` === id);
    return { id, asset, placements, matrices: placements.map((item) => shorePlacementMatrix(item, asset, query, s.shoreBurial)) };
  }), [assets, items, query, s.shoreBurial]);
  const loaded = useLoader(THREE.TextureLoader, MAPS);
  const maps = useMemo(() => loaded.map((original, i) => {
    const map = original.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = i === 0 || i === 2 ? THREE.SRGBColorSpace : THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true; return map;
  }), [loaded]);
  const materials = useMemo(() => createDeadwoodMaterials(maps.slice(0, 2)), [maps]), stone = useMemo(() => createStoneRingMaterial(maps.slice(2)), [maps]);
  useEffect(() => () => { materials.dispose(); stone.dispose(); maps.forEach((map) => map.dispose()); }, [materials, stone, maps]);
  useEffect(() => {
    materials.update(shoreMaterialSettings(s));
    stone.color.setScalar(.72 * (1 - s.shoreWetness * .35)); stone.roughness = 1 - s.shoreWetness * .42;
    for (const material of [materials.wood, materials.endGrain, stone]) material.envMapIntensity = envMapIntensity;
  }, [materials, stone, s, envMapIntensity]);
  const lowPower = qualityProfile.isLowPower || qualityProfile.isMobileDevice;
  return <group name="coastal-shore-finds" userData={{ shoreCount: items.length }}>
    {batches.map((batch) => <Population key={batch.id} {...batch} materials={materials} stone={stone} query={query} lowPower={lowPower} distance={Math.min(s.shoreRenderDistance, lowPower ? 160 : 600)} />)}
  </group>;
}
