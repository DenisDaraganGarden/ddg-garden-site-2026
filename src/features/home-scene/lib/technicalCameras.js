import { coastProfile } from '../../../terrain/terrainLandforms.js';
import { createTerrainDefinition, coastPoint, sampleTerrainHeight } from '../../../terrain/terrainModel.js';

// Technical frames: fixed inspection views for the author and for scripted
// agent checks. A frame only moves the viewport - no camera is edited.
// Terrain views are computed from the coast definition; object frames are
// resolved by scene object name at click time, so a travelling tanker is
// framed where it is right now.
const ground = (x, z, p, lift) => Math.max(sampleTerrainHeight(x, z, p), 0) + lift;

// [q, s, lift, targetQ, targetS, targetLift, fov] in coast coordinates:
// q across the shore (+ inland), s along it.
const coastView = ([q, s, y, tq, ts, ty, fov]) => (settings) => {
  const p = createTerrainDefinition(settings);
  const position = coastPoint(q, s, p);
  const target = coastPoint(tq, ts, p);
  return {
    cameraPosition: { ...position, y: ground(position.x, position.z, p, y) },
    cameraTarget: { ...target, y: ground(target.x, target.z, p, ty) },
    cameraFov: fov,
  };
};

// The strongest landslide or descent along the coast; close up for ground cover.
const landformView = (kind) => (settings) => {
  const p = createTerrainDefinition(settings);
  const span = Math.min(160, p.terrainLength * 0.25);
  let best = { s: 0, score: -1 };
  for (let s = -span; s < span; s += 0.5) {
    const f = coastProfile(s, p);
    const score = kind === 'descent' ? f.descent : f.slide;
    if (score > best.score) best = { s, score };
  }
  const f = coastProfile(best.s, p);
  const close = kind === 'cover';
  const position = coastPoint(close ? f.top + 5 : f.foot - 7, best.s + (close ? -1.8 : -13), p);
  const target = coastPoint(close ? f.top + 5 : (f.foot + f.top) * 0.5, best.s, p);
  return {
    cameraPosition: { ...position, y: Math.max(0, sampleTerrainHeight(position.x, position.z, p)) + (close ? 0.4 : 4.2) },
    cameraTarget: { ...target, y: sampleTerrainHeight(target.x, target.z, p) + (close ? 0.04 : 0.6) },
    cameraFov: close ? 48 : 57,
  };
};

export const TECHNICAL_FRAMES = Object.freeze([
  { id: 'surf', ru: 'Кромка прибоя', en: 'Surf edge', pose: coastView([2.2, -4, 1, -1.5, 30, 0.1, 50]) },
  { id: 'coast', ru: 'Вдоль берега', en: 'Along coast', pose: coastView([3, -35, 1.65, 1, 65, 1.1, 58]) },
  { id: 'sea', ru: 'К морю', en: 'Seaward', pose: coastView([7, 0, 1.65, -900, -350, 0, 52]) },
  { id: 'shells', ru: 'Ракушки', en: 'Shell close-up', pose: coastView([2, -2, 0.28, 3, 0, 0.02, 48]) },
  { id: 'overview', ru: 'Обзор', en: 'Overview', pose: coastView([-42, 95, 48, 18, -20, 3, 54]) },
  { id: 'bluff', ru: 'Обвал', en: 'Landslide', pose: landformView('bluff') },
  { id: 'descent', ru: 'Спуск', en: 'Descent', pose: landformView('descent') },
  { id: 'cover', ru: 'Покров', en: 'Ground cover', pose: landformView('cover') },
  { id: 'tanker', ru: 'Танкер', en: 'Tanker', object: 'tanker-anchor' },
  { id: 'boat', ru: 'Лодка', en: 'Boat', object: 'boat-anchor' },
  { id: 'sculpture', ru: 'Скульптура', en: 'Sculpture', object: 'sculpture-anchor' },
  { id: 'lilies', ru: 'Кувшинки сверху', en: 'Lily pads from above', object: 'surface-vegetation', options: { above: true } },
]);
