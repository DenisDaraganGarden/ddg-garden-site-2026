import { DEADWOOD_FORMS, makeDeadwood, makeDeadwoodGeometry } from '../plants/deadwoodModel.js';
import { makeStoneRing } from '../terrain/stoneRingModel.js';

export function makeDriftwoodAsset(kind, seed, variant = 0) {
  const index = Object.keys(DEADWOOD_FORMS).indexOf(kind);
  const model = kind === 'ring' ? null : makeDeadwood({ kind, seed: seed + index * 137 + variant * 43 });
  const near = model ? makeDeadwoodGeometry(model, 0) : makeStoneRing({ seed: seed + variant * 43 });
  const low = model ? makeDeadwoodGeometry(model, 1) : makeStoneRing({ seed: seed + variant * 43, lod: 1 });
  return { kind, model, near, low, dispose() { near.dispose(); low.dispose(); } };
}
