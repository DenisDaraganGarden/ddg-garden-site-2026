import * as THREE from 'three';
import { randomSequence } from '../plants/oleasterModel.js';
import { coastPoint } from '../terrain/terrainModel.js';
import { coastProfile } from '../terrain/terrainLandforms.js';
import { normalizeShoreSettings } from './settings.js';

// Stable coast-space identities. The current mesh LOD, light and wood colour
// never enter this distribution; there is no frame-time randomisation.
export function createShorePlacement(query, definition, input = {}) {
  const s = normalizeShoreSettings(input), items = [];
  if (!query || !s.shoreEnabled) return items;
  const rand = randomSequence(s.shoreSeed * 71 + 509), margin = Math.min(30, definition.terrainLength * .1);
  const length = Math.min(s.shoreLength, definition.terrainLength - margin * 2);
  const along = THREE.MathUtils.clamp(s.shoreAlong, -definition.terrainLength / 2 + margin + length / 2, definition.terrainLength / 2 - margin - length / 2);
  const yaw = Math.atan2(-definition.alongZ, definition.alongX);
  for (const ring of [false, true]) {
    const target = ring ? s.shoreRings : s.shoreCount;
    let count = 0;
    for (let attempt = 0; attempt < target * 100 && count < target; attempt++) {
      const sc = along + (rand() - .5) * length, profile = coastProfile(sc, definition);
      const r = rand();
      const kind = ring ? 'ring' : r < s.shoreStakes * .5 ? (rand() < .6 ? 'stake' : 'stump') : r < s.shoreStakes * .5 + s.shoreLogs * .65 ? (rand() < .7 ? 'log' : 'root') : 'branch';
      const back = ring || kind !== 'branch' || rand() < s.shoreBackBeach;
      const lo = back ? Math.max(3.5, profile.foot * .56) : 3;
      const hi = back ? profile.foot - 1.2 : Math.max(3.5, profile.foot * .55);
      if (hi <= lo) continue;
      const q = THREE.MathUtils.lerp(lo, hi, rand()), point = coastPoint(q, sc, definition);
      const surface = query.surfaceAt(point.x, point.z, 0);
      if (surface.height < .08 || surface.slope > (ring ? .16 : .28) || surface.path > .15 || surface.habitat === 'rock') continue;
      const scale = (.76 + rand() * .42) * s.shoreSize;
      const radius = ({ branch: 1, log: 2.5, root: 2.5, stake: 1.4, stump: 1.25, ring: 1.3 })[kind] * scale;
      if (items.some((p) => Math.hypot(p.x - point.x, p.z - point.z) < p.radius + radius + (ring ? 4 : .6))) continue;
      // The whole footprint must remain dry and clear of rocks/access paths.
      const probes = [[radius, 0], [-radius, 0], [0, radius * .4], [0, -radius * .4]];
      if (probes.some(([a, b]) => {
        const x = point.x + definition.alongX * a + definition.landX * b, z = point.z + definition.alongZ * a + definition.landZ * b;
        const p = query.surfaceAt(x, z, 0);
        return p.height < .02 || p.path > .25 || p.habitat === 'rock' || p.slope > .35;
      })) continue;
      items.push({ id: `${kind}-${count}-${Math.round(sc * 100)}`, kind, variant: Math.floor(rand() * 3), x: point.x, y: surface.height, z: point.z,
        q, s: sc, scale, radius, normal: surface.normal, yaw: yaw + (rand() - .5) * .65 + (rand() < .5 ? Math.PI : 0) });
      count++;
    }
  }
  return items;
}

// Fit a rigid asset against the continuous ground, then embed its lowest
// supports. A living terrain display mesh is never used for contact.
export function shorePlacementMatrix(item, asset, query, burial) {
  const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(item.normal.x, item.normal.y, item.normal.z);
  const rotation = new THREE.Quaternion().setFromUnitVectors(up, normal.normalize())
    .multiply(new THREE.Quaternion().setFromAxisAngle(up, item.yaw))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), asset.model?.restAngle ?? 0));
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(item.x, 0, item.z), rotation, new THREE.Vector3().setScalar(item.scale));
  const geometries = asset.low.geometry ? [asset.low.geometry] : [asset.low.wood, asset.low.endGrain];
  let support = -Infinity;
  const p = new THREE.Vector3();
  for (const geometry of geometries) {
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      p.fromBufferAttribute(vertices, i).applyMatrix4(matrix);
      support = Math.max(support, query.heightAt(p.x, p.z) - p.y);
    }
  }
  matrix.elements[13] = support - (asset.model ? asset.model.radius * 2 : .16) * burial * item.scale;
  return matrix;
}
