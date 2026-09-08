import assert from 'node:assert/strict';
import { breakLineMean, coastBreakLine } from './coastBreakLine.js';
import { createTerrainDefinition } from '../../../terrain/terrainModel.js';

// The break line follows the coast's own depth: a bigger wave breaks farther
// out, the spit's shoal pulls the line out to sea, and a wave that finds no
// water deep enough breaks at the waterline.
const coast = createTerrainDefinition({ terrainSpitEnabled: true, terrainSpitPosition: -320, terrainSpitLength: 320, terrainSpitBend: 0.85, terrainSpitWidth: 28, terrainSpitShoal: 28, waterDepthMeters: 2.75, terrainShelfSlope: 1.6, terrainSeed: 1 });
const along0 = coast.terrainSpitPosition - 300, length = 280;
const small = coastBreakLine(coast, 0.5, along0, length, 14);
const tall = coastBreakLine(coast, 1.1, along0, length, 14);
assert.equal(small.length, 15);
small.forEach((q, i) => assert.ok(q < 0 && tall[i] <= q, `section ${i}: ${q} / ${tall[i]}`));
// The open beach breaks on one isobath; the spit's shoal is farther out.
assert.ok(Math.abs(tall[0] - tall[6]) < 0.01, 'the open beach has one break line');
assert.ok(tall[14] < tall[0] - 15, `the spit's shoal pulls the break line out: ${tall[14]} vs ${tall[0]}`);
assert.ok(breakLineMean(tall) < breakLineMean(small));
// Too shallow everywhere: the line sits at the waterline, never at sea.
const flat = createTerrainDefinition({ waterDepthMeters: 0.3 });
coastBreakLine(flat, 1.5, -100, 200, 4).forEach((q) => assert.ok(q > -2 && q <= 0, `waterline break ${q}`));
// Heights along the crest: a section the weather makes taller breaks farther out.
const varied = coastBreakLine(coast, 1.1, along0, length, 14, 0.78, (s) => (s < along0 + length * 0.5 ? 0.6 : 1.6));
assert.ok(varied[0] > tall[0] && varied[10] < tall[0], `per-section heights move the line: ${varied[0]} / ${varied[10]} vs ${tall[0]}`);
console.log(`coastFrame: 1.1 m breaks at ${tall[0].toFixed(1)} m on the beach and ${tall[14].toFixed(1)} m off the spit's shoal`);
