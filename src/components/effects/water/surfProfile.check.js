import assert from 'node:assert/strict';
import { SURF_BORE_HEIGHT_FRACTION, SURF_SHAPE, surfBoreHeightRatio, surfFoamBoreFrameQ, surfJetDown, surfPeelSpan, surfPeelTravelOffset, surfPlungeTime, surfRearingLength, surfShape, surfSheetThickness } from './surfProfile.js';

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

// Peeling is a local timing difference. The published coast is 760 m long;
// using that whole distance gave its ends 45.6 m of phase separation for a
// 31 m surf event and necessarily drew one diagonal rope across the beach.
const azov = { surfWidth: 9, surfBreakLength: 16, surfBoreLength: 14, surfPeel: 0.06 };
assert.equal(surfRearingLength(azov), 3.15, 'the visible rear-up is the final third of one wavelength');
assert.equal(surfPeelSpan(azov), 17.15, 'peel span is the local rear-up plus bore');
assert.ok(Math.abs(surfPeelTravelOffset(1, azov) + 1.029) < 1e-9, 'default end-to-end peel is 1.029 m, not 45.6 m');
assert.equal(surfPeelTravelOffset(0, azov), 0);
assert.ok(surfPeelTravelOffset(1, { ...azov, surfPeel: 0.6 }) >= -surfPeelSpan(azov), 'the UI maximum cannot exceed one local event');
for (const settings of [{}, { surfWidth: NaN, surfBreakLength: Infinity, surfBoreLength: -2, surfPeel: NaN }, { surfWidth: 3, surfBreakLength: 4, surfBoreLength: 3, surfPeel: 0.6 }]) {
  assert.ok(Number.isFinite(surfRearingLength(settings)) && surfRearingLength(settings) >= 0, 'rearing length stays finite');
  assert.ok(Number.isFinite(surfPeelSpan(settings)) && surfPeelSpan(settings) >= 1, 'peel span stays finite');
  assert.ok(Number.isFinite(surfPeelTravelOffset(0.5, settings)), 'peel phase stays finite');
}

// The landed form keeps a continuous low water body through the bore rather
// than handing straight to a sliding foam texture. Its height falls from H to
// 22% H, safely below a reared wall but above a degenerate zero-area ribbon.
assert.equal(surfBoreHeightRatio(0), 1);
assert.ok(Math.abs(surfBoreHeightRatio(1) - SURF_BORE_HEIGHT_FRACTION) < 1e-12);
assert.ok(SURF_BORE_HEIGHT_FRACTION >= 0.15 && SURF_BORE_HEIGHT_FRACTION <= 0.25);

// The sheet underside (t→.7) and the first bore vertex (t=.7) share the
// root thickness. They must meet through every spent phase; before this check
// the former ignored `spent`, leaving a dark 7.2 cm seam at H=.45, sheet=.16.
for (const height of [0.1, 0.45, 1, 1.8]) {
  for (const spent of [0, 0.05, 0.1, 0.5, 1]) {
    const undersideAtFoot = surfSheetThickness({ height, sheet: 0.16, emerge: 1, arc: 0, spent });
    const boreRoot = height * 0.16 * (1 - spent);
    assert.ok(Math.abs(undersideAtFoot - boreRoot) < 1e-12, `sheet/body seam H=${height}, spent=${spent}`);
  }
}
assert.deepEqual(surfJetDown({ jet: 0, lift: 0 }), [0, -1], 'zero jet/lift uses a finite downward fallback');
for (const elapsed of [0, 0.1, 1]) {
  const [x, z] = surfJetDown({ jet: 1.9, lift: 0.25, elapsed });
  assert.ok(Number.isFinite(x) && Number.isFinite(z) && Math.abs(Math.hypot(x, z) - 1) < 1e-12, 'jet frame remains a unit vector');
}

// A foam bore stores a mean q, but the visible crest is refracted to L(s).
// Mapping its section back into that mean frame must agree for every blend of
// the isobath and straight crest, otherwise foam peels away around the spit.
for (const refraction of [0, 0.7, 1]) {
  for (const [breakAt, breakMean, peel, wiggle, travel] of [[-4, -8, 0, 0, 3], [-38, -7, 1.029, 0.24, 5.7], [-1.5, -18, 0.4, -0.17, -2]]) {
    const crestQ = travel + (1 - refraction) * breakMean + refraction * breakAt - peel + wiggle;
    const frameQ = surfFoamBoreFrameQ({ q: crestQ, peel, wiggle, refraction, breakAt, breakMean });
    assert.ok(Math.abs(frameQ - (travel + breakMean)) < 1e-12, `foam frame follows refracted crest at r=${refraction}`);
  }
}
console.log(`surfProfile: θp ${SURF_SHAPE.thetaPeak.toFixed(5)}, range ${SURF_SHAPE.range.toFixed(5)}, 1.1 m lip lands in ${fall.toFixed(2)} s; peel span ${surfPeelSpan(azov).toFixed(2)} m`);
