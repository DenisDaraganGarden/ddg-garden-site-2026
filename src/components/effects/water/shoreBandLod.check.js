import assert from 'node:assert/strict';
import { radialCellFactor } from './radialWaterGeometry.js';
import { resolveEffectiveSeaSettings, resolveSeaSettings, waterMeshDensityFactor } from './seaSettings.js';
import { SHORE_CHUNK, SHORE_ROW_STEPS, shoreBandChunks, shoreChunkDistance, shoreChunkRows, shoreRowLevel } from './shoreBandLod.js';

// The shore band's chunks tile the crest end to end, every level's rows start
// and end on the chunk's ends (so neighbours share their border row), a level
// never has rows wider than the water's own cells there, a camera parked on a
// threshold does not flip it, and a crest seen from its middle is drawn with a
// fraction of the even grid's triangles.

{
  const chunks = shoreBandChunks(-437, 431);
  assert.equal(chunks[0][0], -437);
  assert.equal(chunks.at(-1)[1], 431);
  for (let i = 1; i < chunks.length; i += 1) assert.equal(chunks[i][0], chunks[i - 1][1], 'chunks meet end to end');
  assert.ok(chunks.every(([a, b]) => b - a <= SHORE_CHUNK + 1e-9 && b > a), 'none longer than a chunk, none empty');
}

for (const length of [SHORE_CHUNK, 20, 7, 0.4]) {
  for (let level = 0; level < SHORE_ROW_STEPS.length; level += 1) {
    const rows = shoreChunkRows(length, level);
    assert.ok(Number.isInteger(rows) && rows >= 1, 'whole rows, at least one');
    if (length === SHORE_CHUNK) assert.equal(rows * SHORE_ROW_STEPS[level], SHORE_CHUNK, 'a full chunk splits evenly at every level');
  }
}

{
  const factor = radialCellFactor();
  for (let d = 0; d < 400; d += 0.5) {
    const cell = d * factor, level = shoreRowLevel(cell);
    assert.ok(SHORE_ROW_STEPS[level] <= Math.max(cell, 1), `rows no wider than the water's cells (${d} m)`);
  }
  // Parked just past a threshold, the level holds; well past it, it moves.
  assert.equal(shoreRowLevel(2.05, 0), 0, 'a hair past two metres keeps the finer rows');
  assert.equal(shoreRowLevel(2.4, 0), 1, 'well past, it coarsens');
  assert.equal(shoreRowLevel(1.95, 1), 1, 'a hair back keeps the coarser rows');
  assert.equal(shoreRowLevel(1.6, 1), 0, 'well back, it refines');

  // A 868 m crest seen from its middle, 20 m off the band.
  const chunks = shoreBandChunks(-437, 431);
  let rows = 0;
  for (const [s0, s1] of chunks) rows += shoreChunkRows(s1 - s0, shoreRowLevel(shoreChunkDistance(0, -30, s0, s1, -10, 12) * factor));
  const even = 868;
  assert.ok(rows < even / 4, `a fraction of the even grid's rows (${rows} of ${even})`);

  // The water mesh density (waterMeshDensity) scales every water mesh by one
  // factor: at its default 288 the open sea keeps its authored rings and
  // segments and the band its half-metre columns and metre rows; elsewhere
  // both follow, and the band's rows stay no wider than the sea's cells.
  const sea = (flat) => resolveEffectiveSeaSettings(resolveSeaSettings(flat));
  assert.equal(waterMeshDensityFactor(288), 1);
  assert.deepEqual([sea({}).meshRings, sea({}).meshSegments], [152, 104], 'no density setting: the sliders as authored');
  assert.deepEqual([sea({ waterMeshDensity: 288, seaMeshRings: 168, seaMeshSegments: 168 }).meshRings, sea({ waterMeshDensity: 288, seaMeshRings: 168, seaMeshSegments: 168 }).meshSegments], [168, 168], 'the default density keeps the authored mesh');
  const counts = [96, 168, 272, 288, 384].map((density) => sea({ waterMeshDensity: density, seaMeshRings: 168, seaMeshSegments: 168 }).meshSegments);
  counts.slice(1).forEach((count, i) => assert.ok(count > counts[i], `denser at ${[168, 272, 288, 384][i]} than below (${counts.join(', ')})`));
  for (const density of [96, 168, 384].map(waterMeshDensityFactor)) {
    const dense = sea({ waterMeshDensity: density * 288 });
    const denseFactor = radialCellFactor({ rings: dense.meshRings, segments: dense.meshSegments });
    assert.equal(shoreChunkRows(SHORE_CHUNK, 0, density), Math.round(SHORE_CHUNK * density), 'the finest rows scale with the density');
    for (let d = 0; d < 400; d += 0.5) {
      const cell = d * denseFactor, level = shoreRowLevel(cell * density);
      assert.ok(SHORE_ROW_STEPS[level] / density <= Math.max(cell, 1 / density), `rows no wider than the water's cells at density ${density.toFixed(2)} (${d} m)`);
    }
  }
  assert.equal(shoreChunkRows(SHORE_CHUNK, 0), shoreChunkRows(SHORE_CHUNK, 0, 1), 'density 1 is the band as it was');
  console.log(`shoreBandLod: chunks tile the crest, rows land on chunk ends, never wider than the water's cells, thresholds hold, a crest from its middle in ${rows} rows instead of ${even}; the density slider takes the open sea from ${counts[0]} to ${counts.at(-1)} segments and the band's finest rows from ${(1 / waterMeshDensityFactor(96)).toFixed(1)} to ${(1 / waterMeshDensityFactor(384)).toFixed(2)} m`);
}
