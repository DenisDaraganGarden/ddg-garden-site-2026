import * as THREE from 'three';

// Места для посадки чаек на суше — процедурно, из самой земли. Сетка точек в
// пределах территории стаи опрашивает рельеф; годится место сухое (выше уреза),
// ровное (нормаль почти вверх) и невысокое — пляж, низкий уступ, макушка валуна.
// Валуны видны через тот же опрос: attachRockCollisions кладёт их в surfaceAt
// с habitat: 'rock'. Ни одной авторской точки: в любой сцене берег сам скажет,
// где птице сесть.
//
// Порядок точек детерминирован (свой генератор от seed), чтобы при одинаковых
// настройках сайт и редактор садили птиц в одни и те же места.
const MIN_HEIGHT_ABOVE_WATER = 0.22;
const MAX_HEIGHT_ABOVE_WATER = 6;
const MIN_UP = 0.94;
const MIN_SPACING = 2.4;
const UP = new THREE.Vector3(0, 1, 0);

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export function findPerchCandidates(query, {
  centerX = 0, centerZ = 0, radius = 6, terrain = true, rocks = true, count = 12, seed = 41,
} = {}) {
  if (!query || count <= 0 || (!terrain && !rocks)) return [];
  const random = seeded(seed);
  const step = Math.max(1.2, radius / 9);
  const candidates = [];

  for (let z = -radius; z <= radius; z += step) {
    for (let x = -radius; x <= radius; x += step) {
      const px = centerX + x + (random() - 0.5) * step * 0.8;
      const pz = centerZ + z + (random() - 0.5) * step * 0.8;
      if (Math.hypot(px - centerX, pz - centerZ) > radius) continue;
      const surface = query.surfaceAt(px, pz);
      if (!surface || !Number.isFinite(surface.height)) continue;
      if (surface.height < MIN_HEIGHT_ABOVE_WATER || surface.height > MAX_HEIGHT_ABOVE_WATER) continue;
      if (surface.normal.y < MIN_UP) continue;
      const rock = surface.habitat === 'rock';
      if (rock ? !rocks : !terrain) continue;
      candidates.push({ x: px, y: surface.height, z: pz, normal: surface.normal, surface: rock ? 'rock' : 'shore' });
    }
  }

  // Разреженно: птицы не садятся плечом к плечу. Перебор в случайном порядке,
  // чтобы места не выстраивались вдоль первой строки сетки.
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (chosen.every((site) => Math.hypot(site.x - candidate.x, site.z - candidate.z) >= MIN_SPACING)) chosen.push(candidate);
  }
  return chosen;
}

export function createTerrainLandingSites(root, query, options = {}) {
  if (!root || !query) return [];
  return findPerchCandidates(query, options).map((candidate, index) => {
    const anchor = new THREE.Object3D();
    anchor.name = `seagull-landing-anchor-${candidate.surface}-${index}`;
    anchor.position.set(candidate.x, candidate.y, candidate.z);
    anchor.quaternion.setFromUnitVectors(UP, new THREE.Vector3(candidate.normal.x, candidate.normal.y, candidate.normal.z));
    root.add(anchor);
    anchor.updateMatrixWorld(true);
    return { id: `${candidate.surface}-${index}`, surface: candidate.surface, position: anchor.position.toArray(), quaternion: anchor.quaternion.clone(), object: anchor };
  });
}
