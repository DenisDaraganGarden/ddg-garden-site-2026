import { coastProfile } from '../../../terrain/terrainLandforms.js';
import { buildCoastRocks } from '../../../terrain/terrainRocks.js';
import { createTerrainDefinition, coastPoint, sampleTerrainHeight, sampleCoastWaveGain } from '../../../terrain/terrainModel.js';

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

// The grass niches at eye level: the steppe on the plateau behind the bluff,
// the dune grass on the back beach, the reed where the wave is calmest.
// A boulder in front of the lens is no frame: the along-shore position is
// taken where no scattered rock stands within four metres of the camera.
const clearOfRocks = (p, q, from, to, score = () => 0, cameraAt = (s) => coastPoint(q, s, p)) => {
  const rocks = buildCoastRocks(p).filter((rock) => !rock.debris);
  let best = null;
  for (let s = from; s <= to; s += 2) {
    const eye = cameraAt(s);
    const near = rocks.some((rock) => Math.hypot(rock.x - eye.x, rock.z - eye.z) < 5);
    if (near) continue;
    const value = score(s);
    if (!best || value > best.value) best = { s, value };
  }
  return best?.s ?? from;
};
// The steppe behind the grove: fifty metres past the bluff edge, looking along it.
const steppeView = (settings) => {
  const p = createTerrainDefinition(settings);
  const f = coastProfile(20, p);
  const position = coastPoint(f.top + 48, 20, p);
  const target = coastPoint(f.top + 44, 70, p);
  return { cameraPosition: { ...position, y: ground(position.x, position.z, p, .5) }, cameraTarget: { ...target, y: ground(target.x, target.z, p, .4) }, cameraFov: 52 };
};
const duneView = (settings) => {
  const p = createTerrainDefinition(settings);
  const q = p.terrainBeachWidth * .55;
  const s = clearOfRocks(p, q, -60, 60, () => 0, (at) => coastPoint(q, at - 6, p));
  const position = coastPoint(q, s - 6, p);
  const target = coastPoint(q + 4, s + 24, p);
  return { cameraPosition: { ...position, y: ground(position.x, position.z, p, .65) }, cameraTarget: { ...target, y: ground(target.x, target.z, p, .4) }, cameraFov: 50 };
};
// The reed stands where the wave is calmest; the camera on the beach behind it.
const reedView = (settings) => {
  const p = createTerrainDefinition(settings);
  const height = Math.max(.02, p.terrainWaveHeight);
  const span = Math.min(200, p.terrainLength * .3);
  const s = clearOfRocks(p, 4, -span, span, (at) => 1 - sampleCoastWaveGain(-2, at, 0, p) / height, (at) => coastPoint(5, at - 10, p));
  const position = coastPoint(5, s - 10, p);
  const target = coastPoint(-2, s, p);
  return { cameraPosition: { ...position, y: ground(position.x, position.z, p, 1.4) }, cameraTarget: { ...target, y: .9 }, cameraFov: 48 };
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
  { id: 'steppe', ru: 'Степь', en: 'Steppe', pose: steppeView },
  { id: 'dune', ru: 'Дюна', en: 'Dune grass', pose: duneView },
  { id: 'reed', ru: 'Камыш', en: 'Reed', pose: reedView },
  { id: 'tanker', ru: 'Танкер', en: 'Tanker', object: 'tanker-anchor' },
  { id: 'boat', ru: 'Лодка', en: 'Boat', object: 'boat-anchor' },
  { id: 'sculpture', ru: 'Скульптура', en: 'Sculpture', object: 'sculpture-anchor' },
  { id: 'lilies', ru: 'Кувшинки сверху', en: 'Lily pads from above', object: 'surface-vegetation', options: { above: true } },
]);
