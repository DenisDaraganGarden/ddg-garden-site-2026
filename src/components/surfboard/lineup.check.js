import assert from 'node:assert/strict';
import { coastCoordinates, coastHeight, createTerrainDefinition, shorePosition } from '../../terrain/terrainModel.js';
import { DEFAULT_TERRAIN_SETTINGS } from '../../terrain/settings.js';
import { resolveEffectiveSeaSettings, resolveSeaSettings } from '../effects/water/seaSettings.js';
import { createSurfRibbons, surfRibbonBreakLine } from '../effects/water/surfRibbons.js';
import { surfAlongAt, surfLineup } from './lineup.js';

// The automatic checkpoint waits a few metres seaward of the break, in deeper
// water than the break itself, inside the crest, with the nose to the shore.
for (const bearing of [0, 90, 215]) {
  const definition = createTerrainDefinition({ ...DEFAULT_TERRAIN_SETTINGS, terrainBearing: bearing });
  const settings = resolveEffectiveSeaSettings(resolveSeaSettings({ seaSurfHeight: 1.8, seaSurfBreakDistance: 0 }));
  const holder = createSurfRibbons();
  assert.equal(surfLineup(holder, 0), null, 'no surf, no lineup');
  Object.assign(holder, { count: 1, settings });
  Object.assign(holder.coast, { definition, along0: definition.terrainSpitPosition - 430, length: 760 });
  const { line, mean } = surfRibbonBreakLine(holder.coast, settings.surfHeight, settings);
  // The middle of the crest is sample 24 of 48: the crest stands there.
  const middle = holder.coast.along0 + 380;
  const crest = holder.loft.refraction * line[24] + (1 - holder.loft.refraction) * mean;
  const spot = surfLineup(holder, middle);
  const { u, s } = coastCoordinates(spot.x, spot.z, definition);
  assert.ok(Math.abs(s - middle) < 1e-6 && Math.abs(u - shorePosition(s, definition) - spot.q) < 1e-6, 'the spot stands on its own coast section');
  assert.ok(spot.q < crest - 3 && spot.q > crest - 8, `a few metres seaward of the break: q ${spot.q} vs ${crest}`);
  assert.ok(coastHeight(spot.q, s, definition) < coastHeight(crest, s, definition), 'deeper than where it breaks');
  assert.ok(Math.sin(spot.yaw) * definition.landX + Math.cos(spot.yaw) * definition.landZ > 0.9, 'nose to the shore');
  assert.ok(Math.abs(surfAlongAt(holder, spot.x, spot.z) - middle) < 1e-6, 'the view point maps back to its s');
  const end = surfLineup(holder, holder.coast.along0 - 500);
  assert.ok(Math.abs(end.s - (holder.coast.along0 + 76)) < 1e-6, 'a view past the crest waits inside it');
}
console.log('lineup: seaward of the break, inside the crest, nose to the shore — ok');
