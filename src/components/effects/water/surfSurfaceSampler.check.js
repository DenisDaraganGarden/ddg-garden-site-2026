import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coastHeight, coastPoint, createTerrainDefinition, shorePosition } from '../../../terrain/terrainModel.js';
import { DEFAULT_TERRAIN_SETTINGS } from '../../../terrain/settings.js';
import { gerstnerWeatherAt } from './gerstnerWaves.js';
import { resolveSeaSettings } from './seaSettings.js';
import { surfFrozenTravel, surfPeelSpan, surfProfilePoint } from './surfProfile.js';
import { createSurfRibbons, recordSurfRibbons, surfRibbonBreakLine } from './surfRibbons.js';
import { RIDE_SLOPE, createSurfSurfaceSampler } from './surfSurfaceSampler.js';

// The sampler runs the loft backwards. Hold it to the loft run forwards: the
// GLSL placement ported line by line below, on real coasts and real ribbons.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const breaking = read('./BreakingWaves.jsx');
const coastFrame = read('./coastFrame.js');
// The GLSL this check ports, so an edit to the shader fails here until the
// CPU twin follows it.
for (const line of [
  'return uHeight * gerstnerWeather(at).x * smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.94, 1.0, s)) * surfBreakVisibleAt(s);',
  'return uTravel + (1.0 - uRefraction) * (uBreakMean - surfBreakAt(s)) - s * uPeelSpan * uPeel;',
  'float q = surfBreakAt(s) + travel - uTravel + uPose;',
  'SurfPoint sp = surfProfile(t, travel, surfHeightAt(s) * (1.0 - 0.65 * smoothstep(0.0, max(uRunup, 0.5), q)));',
  'return coastShore(sAlong) + surfBreakAt(s) + surfTravelAt(s) - uTravel + uPose + coastCrestWiggle(sAlong, uWidth, uMeander);',
  'float k = surfCenterU(s + h) - surfCenterU(s - h);  // du/ds, metres per metre',
  'float x = (sp.p.x + dq) * inversesqrt(1.0 + k * k);',
  'float bed = max(coastGround(vec2(u - coastShore(along), along)), 0.0);',
  'return surfSwell(xz, damp) + vec3(0.0, sp.p.y - sp.base + bed, 0.0);',
  'return smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t)) * smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.96, 1.0, s)) * surfBreakVisibleAt(s);',
  'return (1.0 - smoothstep(uRunup - 1.0, uRunup, coastLocal(w.xz).x))',
  '* (1.0 - smoothstep(uSpent - 4.0, uSpent, surfTravelAt(s)))',
  '* (1.0 - smoothstep(0.35, 0.75, max(ground, 0.0)));',
  'vAlpha = uRibbonVisible * sp.alpha * surfRunupAlpha(w, s, ground) * surfEdgeAlpha(s, t);',
  'return uSurfSmooth * smoothstep(0.1, 0.28, t) * (1.0 - smoothstep(0.74, 0.92, t));',
  'uniforms.uSpent.value = settings.surfBoreLength + 30;',
  'uniforms.uPeelSpan.value = surfPeelSpan(settings);',
  'uniforms.uSpeed.value = Math.max(settings.surfSpeed, 0.1);',
  'ribbon.uniforms.uPose.value = frozen ? Math.max(1.4, frozenTravel) : travel;',
  'if (surfRibbons) recordSurfRibbons(surfRibbons, { time, frozen, definition: coast.definition, settings }, ribbons);',
]) assert.ok(breaking.includes(line), `BreakingWaves no longer reads: ${line}`);
// Every uniform the recorder copies is one the ribbons carry.
const recorded = [...read('./surfRibbons.js').matchAll(/\.(u\w+)\.value/g)].map((match) => match[1]);
const gerstnerUniforms = read('./gerstnerWaves.js');
assert.ok(recorded.length > 20, 'the recorder copies the loft\'s uniforms');
for (const name of recorded) assert.ok(breaking.includes(`${name}: {`) || gerstnerUniforms.includes(`${name}: {`), `recordSurfRibbons reads ${name}, which BreakingWaves' ribbons no longer carry`);
assert.ok(coastFrame.includes('return (0.32 * sin(6.2831853 * sAlong / (12.7 * stretch)) + 0.16 * sin(6.2831853 * sAlong / (8.9 * stretch) + 1.7)) * width * 0.0795775 * meander;'), 'crest wander changed: update the twin in surfSurfaceSampler.js');

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const wiggle = (sAlong, width, meander) => {
  const stretch = Math.max(width, 3) / 9;
  return (0.32 * Math.sin(6.2831853 * sAlong / (12.7 * stretch)) + 0.16 * Math.sin(6.2831853 * sAlong / (8.9 * stretch) + 1.7)) * width * 0.0795775 * meander;
};
const sampleLine = (line, s) => {
  const x = Math.min(Math.max(s, 0), 1) * (line.length - 1);
  const i = Math.floor(x), f = x - i;
  return line[i] + (line[Math.min(i + 1, line.length - 1)] - line[i]) * f * f * (3 - 2 * f);
};

// The ribbons as BreakingWaves leaves them after a frame: its settings effect
// and the frame loop's per-ribbon writes, into uniforms of the same names.
const ribbonsOf = (settings, coast, poses) => poses.map(({ travel, pose = travel, visible = 1 }) => {
  const height = settings.surfHeight;
  const { line, visible: split, mean } = surfRibbonBreakLine(coast, height, settings);
  const value = (v) => ({ value: v });
  return {
    uniforms: {
      uAlong0: value(coast.along0), uCrestLength: value(coast.length), uRefraction: value(settings.surfRefraction),
      uSpent: value(settings.surfBoreLength + 30), uWidth: value(settings.surfWidth), uSteepen: value(settings.surfBreakLength),
      uLean: value(settings.surfLean), uJet: value(settings.surfJet), uLift: value(settings.surfLift), uSheet: value(settings.surfSheet),
      uPeel: value(settings.surfFreeze ? 0 : settings.surfPeel), uPeelSpan: value(surfPeelSpan(settings)), uBore: value(settings.surfBoreLength),
      uRunup: value(settings.surfRunup), uSpeed: value(Math.max(settings.surfSpeed, 0.1)), uSurfSmooth: value(settings.surfSmooth ?? 0),
      uMeander: value(settings.surfMeander ?? 1), uGerstnerGusts: value(settings.gusts),
      uBreakLine: value(line), uBreakVisible: value(split), uBreakMean: value(mean),
      uTravel: value(travel), uPose: value(pose), uHeight: value(height), uRibbonVisible: value(visible),
    },
  };
});
const holderOf = (settings, definition, poses, time) => {
  const coast = { definition, along0: definition.terrainSpitPosition - 430, length: 760 };
  const holder = createSurfRibbons();
  recordSurfRibbons(holder, { time, frozen: settings.surfFreeze, definition, settings }, ribbonsOf(settings, coast, poses));
  return holder;
};

// GLSL surfAt + surfWorld + the sheet's alpha, forwards, on the still sea:
// where the profile point (s, t) of ribbon `index` stands, and how far the
// visible sheet is lifted there.
const loft = (holder, index, s, t) => {
  const r = holder.ribbons[index];
  const { definition: def, along0, length } = holder.coast;
  const { refraction, peelSpan, runup, spent, meander, gusts } = holder.loft;
  const P = holder.profile;
  const breakAt = (x) => sampleLine(r.breakLine, x);
  const visibleAt = (x) => sampleLine(r.breakVisible, x);
  const heightAt = (x) => {
    const at = coastPoint(r.breakMean, along0 + x * length, def);
    return r.height * gerstnerWeatherAt(at.x, at.z, gusts) * smooth(0, 0.06, x) * (1 - smooth(0.94, 1, x)) * visibleAt(x);
  };
  const travelAt = (x) => r.travel + (1 - refraction) * (r.breakMean - breakAt(x)) - x * peelSpan * r.peel;
  const centerU = (x) => { const sa = along0 + x * length; return shorePosition(sa, def) + breakAt(x) + travelAt(x) - r.travel + r.pose + wiggle(sa, P.width, meander); };
  const travel = travelAt(s);
  const q = breakAt(s) + travel - r.travel + r.pose;
  const sp = surfProfilePoint(t, travel, heightAt(s) * (1 - 0.65 * smooth(0, Math.max(runup, 0.5), q)), P);
  const sAlong = along0 + s * length;
  const h = 0.5 / length;
  const k = centerU(s + h) - centerU(s - h);
  const x = sp.x / Math.sqrt(1 + k * k);
  const along = sAlong - k * x;
  const u = centerU(s) + x;
  const ground = coastHeight(u - shorePosition(along, def), along, def);
  const bed = Math.max(ground, 0);
  const edge = smooth(0, 0.08, t) * (1 - smooth(0.92, 1, t)) * smooth(0, 0.04, s) * (1 - smooth(0.96, 1, s)) * visibleAt(s);
  const runupAlpha = (1 - smooth(runup - 1, runup, u - shorePosition(along, def))) * (1 - smooth(spent - 4, spent, travel)) * (1 - smooth(0.35, 0.75, bed));
  return {
    x: def.landX * u + def.alongX * along, z: def.landZ * u + def.alongZ * along,
    lift: r.visible * edge * runupAlpha * (sp.z - sp.base + bed), sp, k, bed,
  };
};

const sampler = createSurfSurfaceSampler();
const out = {};
const T0 = 50;
// Denis's scale: a 1.8 m breaker 18 m wide at 5 m/s, and the big test sea.
const everyday = resolveSeaSettings({ seaSurfHeight: 1.8, seaSurfWidth: 18, seaSurfSpeed: 5 });
const big = resolveSeaSettings({ seaSurfHeight: 4.5, seaSurfWidth: 15.5, seaSurfSpeed: 7.4, seaSurfBreakDistance: 29, seaSurfBreakLength: 34, seaSurfLean: 0.71, seaSurfJet: 4.9, seaSurfLift: 3.15, seaSurfSheet: 0.3, seaSurfPeel: 0.35, seaSurfRefraction: 0.41, seaSurfBoreLength: 30, seaSurfRunup: 11, seaSurfMeander: 0.24 });
// The default coast breaks this wave 65-94 m out over its bending shelf; the
// steep one a few metres out, so its bores run up onto the sand.
const shelf = createTerrainDefinition(DEFAULT_TERRAIN_SETTINGS);
const steep = createTerrainDefinition({ ...DEFAULT_TERRAIN_SETTINGS, waterDepthMeters: 4.5 });

// The face's floor is its last stretch running toward the shore. Above the
// turn, curled back under a leaning crest's root while the tube is open, is
// the barrel's ceiling: water over air, which a height field cannot carry and
// the sampler leaves out with the lip. The sampler walks the face in sixths;
// a curl of a few centimetres between two steps it may take for floor, and
// over that sliver either branch is an answer.
const floorOf = (holder, s) => {
  const xs = Array.from({ length: 301 }, (_, i) => loft(holder, 0, s, 0.7 + 0.3 * i / 300).sp.x);
  let i = 300;
  while (i > 0 && xs[i - 1] < xs[i]) i -= 1;
  const ceiling = Math.max(...xs.slice(0, i + 1));
  return { t: 0.7 + 0.3 * i / 300, rootX: loft(holder, 0, s, 0.3).sp.x, ceiling, sliver: ceiling - xs[i] < 0.1 };
};

// (a) Round trip: every back and face point the loft draws, found again.
let worst = 0;
let walled = 0;
let points = 0;
let onSand = 0;
let ceiling = 0;
let tube = 0;
const phases = (settings) => [-30, -8, -2, 1, 4, 12, settings.surfBoreLength + 20];
for (const [settings, definition] of [[everyday, shelf], [everyday, steep], [big, shelf], [big, steep]]) {
  for (const travel of phases(settings)) {
    const holder = holderOf(settings, definition, [{ travel }], T0);
    for (const s of [0.03, 0.2, 0.37, 0.5, 0.66, 0.85, 0.98]) {
      const floor = floorOf(holder, s);
      // The ridden face falls no steeper than RIDE_SLOPE from anything
      // seaward of it on the face (the lip's root first): where the drawn
      // face falls faster, the sampler rides a wall above it, by design.
      const faceLine = [loft(holder, 0, s, 0.3).sp, ...Array.from({ length: 121 }, (_, j) => loft(holder, 0, s, 0.7 + 0.3 * j / 120).sp)];
      const wallOver = (sp) => Math.max(0, ...faceLine.filter((q) => q.x <= sp.x).map((q) => q.z - RIDE_SLOPE * (sp.x - q.x) - sp.z));
      for (let i = 0; i <= 40; i += 1) {
        const t = i <= 20 ? 0.29 * i / 20 : 0.7 + 0.3 * (i - 21) / 19;
        const at = loft(holder, 0, s, t);
        // The ceiling, and the floor where the barrel reaches under the crest:
        // there the height field is the crest above.
        if (t >= 0.7 && (t < floor.t + 0.002 || at.sp.x <= floor.rootX || (floor.sliver && at.sp.x <= floor.ceiling))) { ceiling += 1; continue; }
        if (t >= 0.7 && at.sp.x <= floor.ceiling) tube += 1;
        sampler.surfOffsetAt(at.x, at.z, T0, holder, out);
        const drawn = Math.max(at.lift, 0);
        const wall = t >= 0.7 ? wallOver(at.sp) : 0;
        if (wall > 0.01) {
          // Above the drawn face, never above the wall (the sampler sees the
          // face at its walk's spacing, so its wall may stand a little lower).
          assert.ok(out.offset >= drawn - 0.015 && out.offset <= drawn + wall + 0.015, `wall s=${s} t=${t.toFixed(3)} travel=${travel} H=${settings.surfHeight}: drawn ${drawn.toFixed(3)} m, wall +${wall.toFixed(3)} m, sampler ${out.offset.toFixed(3)} m`);
          walled += 1;
          continue;
        }
        const error = Math.abs(out.offset - drawn);
        worst = Math.max(worst, error);
        points += 1;
        if (at.bed > 0 && at.lift > 0.01) onSand += 1;
        assert.ok(error < 0.015, `round trip s=${s} t=${t.toFixed(3)} travel=${travel} H=${settings.surfHeight}: loft lifts ${at.lift.toFixed(4)} m, sampler ${out.offset.toFixed(4)} m`);
        if (at.lift > 0.05) assert.ok(out.ribbon === 0, 'a lifted point names its ribbon');
      }
    }
  }
}
assert.ok(onSand > 20, `the bores must be checked where they ride the sand too (${onSand} points)`);

// (a2) The ridden surface is one sheet. The 4.5 m plunging breaker once
// reached a board as a wall: crest, then a 3.5 m drop within 5 mm, then flat
// sea, sweeping past at the wave's speed and throwing the board metres up.
// Across the crest a centimetre may not lift it more than the ridden slope
// allows, and a fixed point may not jump in one physics step.
let steepest = 0;
let jump = 0;
{
  const step = 1 / 240;
  for (const travel of [-8, -2, 1, 4, 8]) {
    const holder = holderOf(big, shelf, [{ travel }], T0);
    for (const s of [0.2, 0.5, 0.8]) {
      const root = loft(holder, 0, s, 0.3);
      sampler.surfOffsetAt(root.x, root.z, T0, holder, out);
      const fx = out.fwdX, fz = out.fwdZ;
      let previous = null;
      for (let d = -4; d <= 8; d += 0.01) {
        const x = root.x + fx * d, z = root.z + fz * d;
        const now = sampler.surfOffsetAt(x, z, T0, holder, out).offset;
        if (previous !== null) steepest = Math.max(steepest, Math.abs(now - previous) / 0.01);
        previous = now;
        if (Math.round(d * 100) % 25 === 0) {
          const later = sampler.surfOffsetAt(x, z, T0 + step, holder, {}).offset;
          jump = Math.max(jump, Math.abs(later - now));
        }
      }
    }
  }
  assert.ok(steepest < 5, `across the crest the ridden surface stays a slope (steepest ${steepest.toFixed(2)})`);
  assert.ok(jump < 0.25, `a point on the water moves at most ${jump.toFixed(3)} m in one physics step`);
}

// (b) Far from every crest the sea is the surface.
{
  const holder = holderOf(everyday, shelf, [{ travel: -8 }, { travel: 20 }], T0);
  const mean = holder.ribbons[0].breakMean;
  const mid = holder.coast.along0 + 380;
  for (const [q, sAlong] of [[mean - 60, mid], [mean + 50, mid], [-2, mid], [8, mid], [mean, holder.coast.along0 - 40], [mean, holder.coast.along0 + 820]]) {
    const at = coastPoint(q, sAlong, shelf);
    sampler.surfOffsetAt(at.x, at.z, T0, holder, out);
    assert.equal(out.offset, 0, `q=${q.toFixed(1)} s=${sAlong}: no loft there`);
    assert.equal(out.ribbon, -1);
  }
  holder.count = 0;
  const on = loft(holderOf(everyday, shelf, [{ travel: -8 }], T0), 0, 0.5, 0.85);
  sampler.surfOffsetAt(on.x, on.z, T0, holder, out);
  assert.equal(out.offset, 0, 'a holder with no ribbons drawn lifts nothing');
}

// (c) The shape moves shoreward at the ribbon's speed. Before it rears up the
// section is a fixed shape, so a point carried along the crest's normal at
// the speed the sampler reports sees the same lift; the rate it reports is the
// lift's own time derivative; frozen, nothing moves.
{
  const holder = holderOf(everyday, shelf, [{ travel: -30 }], T0);
  let moved = 0;
  for (const [s, t] of [[0.3, 0.2], [0.5, 0.85], [0.62, 0.78], [0.8, 0.12]]) {
    const at = loft(holder, 0, s, t);
    sampler.surfOffsetAt(at.x, at.z, T0, holder, out);
    const { offset, speed, fwdX, fwdZ, rate } = out;
    assert.ok(offset > 0.1 && speed > 0, 'the moving point is on the wave');
    assert.ok(Math.abs(speed - 5 / Math.sqrt(1 + at.k * at.k)) < 1e-3, 'shape speed is the travel speed along the crest normal');
    const dt = 0.6;
    sampler.surfOffsetAt(at.x + fwdX * speed * dt, at.z + fwdZ * speed * dt, T0 + dt, holder, out);
    assert.ok(Math.abs(out.offset - offset) < 0.01, `carried at ${speed.toFixed(2)} m/s the lift stays ${offset.toFixed(3)} m, got ${out.offset.toFixed(3)} m`);
    sampler.surfOffsetAt(at.x, at.z, T0 + dt, holder, out);
    moved = Math.max(moved, Math.abs(out.offset - offset));
    const epsilon = 0.01;
    const later = sampler.surfOffsetAt(at.x, at.z, T0 + epsilon, holder, {}).offset;
    const earlier = sampler.surfOffsetAt(at.x, at.z, T0 - epsilon, holder, {}).offset;
    assert.ok(Math.abs((later - earlier) / (2 * epsilon) - rate) < 0.02 + 0.02 * Math.abs(rate), `rate ${rate.toFixed(3)} vs ${((later - earlier) / (2 * epsilon)).toFixed(3)} m/s`);
  }
  assert.ok(moved > 0.1, 'a point left behind sees the wave go');
  // Rearing, landing, running as a bore: the form changes as it goes, and the
  // rate carries that too.
  for (const travel of [-2, 3, 10]) {
    const live = holderOf(everyday, shelf, [{ travel }], T0);
    for (const t of [0.15, 0.8, 0.9]) {
      const at = loft(live, 0, 0.45, t);
      const { rate } = sampler.surfOffsetAt(at.x, at.z, T0, live, out);
      const epsilon = 0.005;
      const numeric = (sampler.surfOffsetAt(at.x, at.z, T0 + epsilon, live, {}).offset - sampler.surfOffsetAt(at.x, at.z, T0 - epsilon, live, {}).offset) / (2 * epsilon);
      assert.ok(Math.abs(numeric - rate) < 0.03 + 0.03 * Math.abs(rate), `travel ${travel} t ${t}: rate ${rate.toFixed(3)} vs ${numeric.toFixed(3)} m/s`);
    }
  }
  const frozenSettings = { ...everyday, surfFreeze: true, surfPhase: 0.3 };
  const frozenTravel = surfFrozenTravel(frozenSettings);
  const frozen = holderOf(frozenSettings, shelf, [{ travel: frozenTravel, pose: Math.max(1.4, frozenTravel) }, { travel: -1000, visible: 0 }], T0);
  const at = loft(frozen, 0, 0.5, 0.82);
  const still = sampler.surfOffsetAt(at.x, at.z, T0, frozen, {});
  const later = sampler.surfOffsetAt(at.x, at.z, T0 + 5, frozen, {});
  assert.ok(still.offset > 0.1 && Math.abs(still.offset - Math.max(at.lift, 0)) < 0.015, 'the frozen breaker is found where it is drawn');
  assert.equal(later.offset, still.offset, 'a frozen breaker stays put');
  assert.ok(still.speed === 0 && still.rate === 0, 'a frozen breaker has no speed');
}

// (d) slopeAlong is the lift's derivative along the crest normal.
let slopes = 0;
for (const travel of [-30, -3, 2, 8]) {
  const holder = holderOf(everyday, shelf, [{ travel }], T0);
  // Two of them on the sheet's rims, where it fades into the sea.
  for (const [s, t] of [[0.25, 0.12], [0.25, 0.26], [0.5, 0.75], [0.5, 0.86], [0.7, 0.2], [0.7, 0.9], [0.4, 0.04], [0.6, 0.95]]) {
    const at = loft(holder, 0, s, t);
    sampler.surfOffsetAt(at.x, at.z, T0, holder, out);
    if (!(out.offset > 0.02)) continue;
    const { slopeAlong, fwdX, fwdZ } = out;
    const e = 0.02;
    const ahead = sampler.surfOffsetAt(at.x + fwdX * e, at.z + fwdZ * e, T0, holder, {}).offset;
    const behind = sampler.surfOffsetAt(at.x - fwdX * e, at.z - fwdZ * e, T0, holder, {}).offset;
    const numeric = (ahead - behind) / (2 * e);
    assert.ok(Math.abs(numeric - slopeAlong) < 0.01 + 0.03 * Math.abs(numeric), `travel ${travel} s ${s} t ${t}: slope ${slopeAlong.toFixed(4)} vs ${numeric.toFixed(4)}`);
    slopes += 1;
  }
}
assert.ok(slopes >= 24, `slope checked at ${slopes} points`);

// Cost, with seven ribbons live over the shelf: one query per probe per
// physics step must stay cheap.
const busy = holderOf(everyday, shelf, [-30, -12, -3, 2, 8, 20, 35].map((travel) => ({ travel })), T0);
const probes = Array.from({ length: 2000 }, (_, i) => coastPoint(busy.ribbons[3].breakMean + ((i * 37) % 80) - 40, busy.coast.along0 + 60 + ((i * 53) % 640), shelf));
for (const p of probes) sampler.surfOffsetAt(p.x, p.z, T0, busy, out);
const started = performance.now();
for (let round = 0; round < 10; round += 1) for (const p of probes) sampler.surfOffsetAt(p.x, p.z, T0 + round * 0.01, busy, out);
const cost = (performance.now() - started) * 1000 / (10 * probes.length);

assert.ok(ceiling > 0 && ceiling < points / 5, `the barrel's ceiling is a small part of the face (${ceiling})`);
assert.ok(tube > 10, `inside an open tube the floor is found, not the ceiling (${tube} points)`);

console.log(`surfSurfaceSampler: ${points} loft points found again within ${(worst * 1000).toFixed(1)} mm and ${walled} ridden over a too-steep face, the big breaker a sheet (steepest ${steepest.toFixed(1)}, ${(jump * 100).toFixed(1)} cm per 1/240 s) (${onSand} on the sand, ${tube} on the floor of an open tube, ${ceiling} of its ceiling left out), ${slopes} slopes and the rate hold to their differences, ${cost.toFixed(1)} µs per query with seven ribbons`);
