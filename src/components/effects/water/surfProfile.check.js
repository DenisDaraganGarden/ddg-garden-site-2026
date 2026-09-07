import assert from 'node:assert/strict';
import { SURF_SHAPE, surfPlungeTime, surfShape } from './surfProfile.js';

// The shoaling shape must reproduce the reference figures (Bosboom & Stive,
// Azov surf sheet): crest phase θp ≈ 0.17662 and range ≈ 2.12365.
assert.ok(Math.abs(SURF_SHAPE.thetaPeak - 0.17662) < 5e-4, `crest phase ${SURF_SHAPE.thetaPeak}`);
assert.ok(Math.abs(SURF_SHAPE.range - 2.12365) < 5e-4, `range ${SURF_SHAPE.range}`);
assert.ok(SURF_SHAPE.crest > 0.55 && SURF_SHAPE.trough < -0.4, 'crest above and trough below still water');
// Steep front, flat back: ahead of the crest the level drops faster.
assert.ok(surfShape(SURF_SHAPE.thetaPeak + 0.8) < surfShape(SURF_SHAPE.thetaPeak - 0.8));

// The lip's fall: a 1.1 m breaker's lip lands in about half a second, more
// lift keeps it up longer, no lift still lands, a fall from below is instant.
const fall = surfPlungeTime(SURF_SHAPE.crest * 1.1, -0.22, 0.6);
assert.ok(fall > 0.35 && fall < 0.6, `plunge ${fall}`);
assert.ok(surfPlungeTime(0.6, -0.2, 1.2) > surfPlungeTime(0.6, -0.2, 0.2));
assert.ok(surfPlungeTime(0.6, -0.2, 0) > 0.3);
assert.equal(surfPlungeTime(-0.2, 0.2, 0), 0);
console.log(`surfProfile: θp ${SURF_SHAPE.thetaPeak.toFixed(5)}, range ${SURF_SHAPE.range.toFixed(5)}, 1.1 m lip lands in ${fall.toFixed(2)} s`);
