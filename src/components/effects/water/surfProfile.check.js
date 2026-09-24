import assert from 'node:assert/strict';
import { SURF_BORE_HEIGHT_FRACTION, SURF_SHAPE, foamBoreDeposit, surfBoreHeightRatio, surfFoamBore, surfFoamBoreFrameQ, surfFrozenTravel as frozenTravelOf, surfProfileParams as paramsOf, surfProfilePoint as pointOf, surfJetDown, surfPeelSpan, surfPeelTravelOffset, surfPlungeTime, surfProfileShader, surfRearingLength, surfShape, surfSheetThickness } from './surfProfile.js';

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
// The break length acts over the slider's whole range, 4..40 m. At its default
// 16 m the rear-up is the third of the width the old cap gave (which left the
// range doing nothing); every metre either side changes it, and the frozen
// inspection still starts before the face begins to rear.
for (const surfWidth of [3, 4, 9, 17.5, 40]) {
  const third = Math.max(0.75, surfWidth * 0.35);
  assert.equal(surfRearingLength({ surfWidth, surfBreakLength: 16 }), third, `the default break length keeps the rear-up at width ${surfWidth}`);
  for (let length = 5; length <= 40; length += 1) {
    const rear = surfRearingLength({ surfWidth, surfBreakLength: length });
    assert.ok(rear > surfRearingLength({ surfWidth, surfBreakLength: length - 1 }), `break length ${length} m acts at width ${surfWidth}`);
    assert.ok(rear <= length + 3, `the frozen phase 0 (dn = -${length} - 3) is still unreared at width ${surfWidth}`);
  }
  const P = (surfBreakLength) => paramsOf({ surfWidth, surfBreakLength, surfLean: 0.29, surfJet: 1.9, surfLift: 0.25, surfSheet: 0.16, surfBoreLength: 14, surfSpeed: 4.5 });
  const crestAt = (surfBreakLength) => pointOf(0.29, -0.9 * third, 1, P(surfBreakLength)).x;
  assert.notEqual(crestAt(4), crestAt(40), `the face stands differently for a short and a long break at width ${surfWidth}`);
}
assert.ok(surfProfileShader.includes('float rearLength = max(0.75, uWidth * 0.35) * uSteepen / 16.0;'), 'the GLSL rear-up is its CPU twin');
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
// The CPU twin: the loft's edges lie on its base level, the four pieces join
// without a gap, and a lip that has not left yet has no length.
{
  const { surfProfilePoint, surfProfileParams, surfFrozenTravel } = await import('./surfProfile.js');
  const settings = { surfWidth: 18, surfBreakLength: 37, surfLean: 0.23, surfJet: 4, surfLift: 2, surfSheet: 0.34, surfBoreLength: 27, surfSpeed: 3.5, surfHeight: 2.05, surfPhase: 0.52 };
  const P = surfProfileParams(settings);
  for (const dn of [-20, -1, 0.5, 2, 6, 20, 60]) {
    const at = (t) => surfProfilePoint(t, dn, 2.05, P);
    const base = at(0).base;
    assert.ok(Math.abs(at(0).z - base) < 1e-9 && Math.abs(at(1).z - base) < 1e-9, `edges on the base level at dn ${dn}`);
    for (const joint of [0.3, 0.7]) {
      const a = at(joint - 1e-7), b = at(joint + 1e-7);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-4, `profile joins at t ${joint}, dn ${dn}`);
    }
  }
  const unborn = surfProfilePoint(0.5, -5, 2.05, P), root = surfProfilePoint(0.3, -5, 2.05, P);
  assert.ok(Math.hypot(unborn.x - root.x, unborn.z - root.z) < 1e-9, 'before the break the lip has no length');
  assert.ok(Number.isFinite(surfFrozenTravel(settings)), 'the frozen phase has a travel');
}

// The foam the breaker leaves on the water starts where the foam on its face
// ends, at every stage after landing: at the impact the foot of the face,
// later the roller's edge. It used to run up to 1.5 m ahead of the roller.
{
  const settings = { surfWidth: 18, surfBreakLength: 37, surfLean: 0.23, surfJet: 4, surfLift: 2, surfSheet: 0.34, surfBoreLength: 27, surfSpeed: 3.5, surfHeight: 2.05, surfPeel: 0.37 };
  const P = paramsOf(settings);
  for (const phase of [0.62, 0.66, 0.7, 0.75, 0.85]) {
    const travel = frozenTravelOf(settings, phase);
    const face = Array.from({ length: 301 }, (_, i) => pointOf(0.7 + 0.3 * Math.min(i / 300, 0.9999), travel, settings.surfHeight, P));
    const peak = Math.max(...face.map((p) => p.foam));
    const faceEdge = face.filter((p) => p.foam >= 0.5 * peak).pop().x;
    const bore = surfFoamBore(settings, travel, settings.surfHeight, true);
    const water = Array.from({ length: 1101 }, (_, i) => -40 + i * 0.05);
    const top = Math.max(...water.map((x) => foamBoreDeposit(travel + x, bore)));
    const waterEdge = water.filter((x) => foamBoreDeposit(travel + x, bore) >= 0.5 * top).pop();
    assert.ok(Math.abs(waterEdge - faceEdge) < 0.5, `phase ${phase}: foam on the water ends at ${waterEdge.toFixed(2)} m, the face's at ${faceEdge.toFixed(2)} m`);
  }
}

// The face runs down from under the lip: it never climbs back toward the
// crest first. Started at the crest it made a knee at the lip's root, and
// under a thick lip a loop — the surface folded over itself.
for (const settings of [
  { surfWidth: 36, surfBreakLength: 37, surfLean: 0.2, surfJet: 5.25, surfLift: 3.4, surfSheet: 0.52, surfBoreLength: 40, surfSpeed: 8.4, surfHeight: 5.1 },
  { surfWidth: 18, surfBreakLength: 37, surfLean: 0.23, surfJet: 4, surfLift: 2, surfSheet: 0.34, surfBoreLength: 27, surfSpeed: 3.5, surfHeight: 2.05 },
]) {
  const P = paramsOf(settings);
  for (const dn of [-4, 0, 2, 5, 9, 14, 25]) {
    const face = Array.from({ length: 91 }, (_, i) => pointOf(0.7 + 0.3 * (i / 300), dn, settings.surfHeight, P));
    const rise = Math.max(...face.map((p) => p.z - face[0].z));
    assert.ok(rise < 0.01, `W${settings.surfWidth} dn ${dn}: the face climbs ${rise.toFixed(3)} m above the lip's root before it falls`);
  }
}

console.log(`surfProfile: θp ${SURF_SHAPE.thetaPeak.toFixed(5)}, range ${SURF_SHAPE.range.toFixed(5)}, 1.1 m lip lands in ${fall.toFixed(2)} s; peel span ${surfPeelSpan(azov).toFixed(2)} m; a 9 m breaker rears over ${surfRearingLength({ ...azov, surfBreakLength: 4 }).toFixed(2)}..${surfRearingLength({ ...azov, surfBreakLength: 40 }).toFixed(2)} m across the break length's 4..40 m`);
