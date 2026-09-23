import { coastHeight, shorePosition } from '../../../terrain/terrainModel.js';
import { gerstnerWeatherAt } from './gerstnerWaves.js';
import { surfProfilePoint } from './surfProfile.js';

// CPU twin of where the breaking-wave loft stands (BreakingWaves.jsx
// loftShader), for bodies that ride it. Every loft point sits on the SAME
// undisplaced sea parameter p as the open water, lifted by
//   Δ(p) = profile.z - profile.base + max(ground(p), 0),
// so the breaker is the sea surface at p plus a height, and the whole question
// is which section s and which profile point t of which ribbon stands over p.
// The forward map (s, t) → p is: the crest's centre line in the coast frame
// (the refracted break line, the travel, the peel and the wander), the profile
// swept along the crest's own normal. Here it runs backwards: p → (s, x across
// the crest) by a fixed point on the sweep, then x → t on the back and on the
// face's floor, each monotonic in x. What overhangs is left out: the lip, a
// sheet in the air a board falls through, and while the tube is open the
// face's curl back under it, the barrel's ceiling. The gap under the lip is
// bridged straight from its root to the floor.
//
// Answers in the sea's parameter space: the caller inverts the sea's own
// horizontal displacement first (gerstnerSurfaceSampler's parameterX/Z).

const smooth = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
// d smooth / dx.
const smoothRate = (edge0, edge1, x) => {
  const t = (x - edge0) / (edge1 - edge0);
  return t <= 0 || t >= 1 ? 0 : 6 * t * (1 - t) / (edge1 - edge0);
};

// coastCrestWiggle (coastFrame.js). coastFrame's own JS copy sits in a module
// that loads React, which a node check cannot import; the check holds the two
// to the same constants.
const crestWiggle = (sAlong, width, meander) => {
  const stretch = Math.max(width, 3) / 9;
  return (0.32 * Math.sin((2 * Math.PI * sAlong) / (12.7 * stretch)) + 0.16 * Math.sin((2 * Math.PI * sAlong) / (8.9 * stretch) + 1.7)) * width * 0.0795775 * meander;
};

// surfBreakAt / surfBreakVisibleAt: the samples joined by a smoothstep.
const lineAt = (line, s) => {
  const last = line.length - 1;
  const x = Math.min(Math.max(s, 0), 1) * last;
  const i = Math.floor(x);
  const f = x - i;
  const a = line[i];
  return a + (line[Math.min(i + 1, last)] - a) * f * f * (3 - 2 * f);
};

const BACK_END = 0.3 - 1e-7;
// Tight enough that the lift differenced over a millisecond of travel is
// the shape's motion, not the solver's rounding.
const X_TOLERANCE = 1e-7;
const T_STEP = 1e-3;
const RATE_STEP = 1e-3;
const BEACH_STEP = 0.02;
// The steepest the ridden surface falls from the lip's root (about 50°), and
// the height of the toe where that wall bends into the sea. Measured on the
// 4.5 m plunging breaker of «Тесты» with the real board: at 1.5 the empty
// board moored in the break zone still left the water by more than a metre in
// half the phases, at 1.2 with a 0.3 m toe in one or two of twenty.
export const RIDE_SLOPE = 1.2;
const WALL_TOE = 0.3;
// Where the walk down the face looks: t from the face's top by twentieths.
const FACE_PROBES = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export function createSurfSurfaceSampler() {
  // The ribbon being evaluated; reused, nothing allocates per query beyond
  // the profile points themselves.
  const ribbon = { line: null, visible: null, mean: 0, peel: 0, pose: 0, travel: 0, dn: 0, height: 0, x: 0 };
  // One ribbon's answer at p.
  const cut = { offset: 0, slope: 0, foam: 0, damp: 0, fwdX: 0, fwdZ: 0, speed: 0 };
  let holder = null;
  let solved = null;
  // The face as the walk down it saw it, at FACE_PROBES.
  const probeX = new Float64Array(6);
  const probeZ = new Float64Array(6);
  const probeFoam = new Float64Array(6);
  const keepProbe = (k, point) => {
    probeX[k] = point.x;
    probeZ[k] = point.z;
    probeFoam[k] = point.foam;
  };

  // surfTravelAt(s) - uTravel: how far a section lags the mean by refraction
  // and by the peel.
  const lag = (s) => (1 - holder.loft.refraction) * (ribbon.mean - lineAt(ribbon.line, s)) - s * holder.loft.peelSpan * ribbon.peel;
  // surfCenterU: the crest's centre line, coast land coordinate.
  const centerU = (s) => {
    const { definition, along0, length } = holder.coast;
    const sAlong = along0 + s * length;
    return shorePosition(sAlong, definition) + lineAt(ribbon.line, s) + lag(s) + ribbon.pose
      + crestWiggle(sAlong, holder.profile.width, holder.loft.meander);
  };
  const profileAt = (t) => surfProfilePoint(t, ribbon.dn, ribbon.height, holder.profile);
  // x → t on one monotonic piece of the profile: Illinois regula falsi, a few
  // evaluations where plain bisection takes a dozen.
  const solve = (lo, hi, flo, fhi) => {
    let side = 0;
    for (let i = 0; i < 40; i += 1) {
      const t = fhi - flo > 1e-12 ? (lo * fhi - hi * flo) / (fhi - flo) : 0.5 * (lo + hi);
      solved = profileAt(t);
      const f = solved.x - ribbon.x;
      if (Math.abs(f) < X_TOLERANCE || hi - lo < 1e-9) return t;
      if (f < 0) { lo = t; flo = f; if (side < 0) fhi *= 0.5; side = -1; } else { hi = t; fhi = f; if (side > 0) flo *= 0.5; side = 1; }
    }
    return 0.5 * (lo + hi);
  };
  // Where the face turns toward the shore: golden-section search for the
  // least x on [lo, hi], where x falls and then rises.
  const seawardmost = (lo, hi) => {
    const r = 0.6180339887;
    let a = hi - r * (hi - lo);
    let b = lo + r * (hi - lo);
    let fa = profileAt(a).x;
    let fb = profileAt(b).x;
    while (hi - lo > 2e-4) {
      if (fa < fb) { hi = b; b = a; fb = fa; a = hi - r * (hi - lo); fa = profileAt(a).x; } else { lo = a; a = b; fa = fb; b = lo + r * (hi - lo); fb = profileAt(b).x; }
    }
    return 0.5 * (lo + hi);
  };
  // dz/dx of the profile around t, inside its own piece; leaves dt/dx in
  // tPerX for the masks that fade along t.
  let tPerX = 0;
  const slopeAt = (t, lo, hi) => {
    const ta = Math.max(lo, t - T_STEP);
    const tb = Math.min(hi, t + T_STEP);
    const a = profileAt(ta);
    const b = profileAt(tb);
    const dx = b.x - a.x;
    tPerX = Math.abs(dx) > 1e-9 ? (tb - ta) / dx : 0;
    return Math.abs(dx) > 1e-9 ? (b.z - a.z) / dx : 0;
  };
  // A curl's top at x, from the lip's root up to the turn: straight from the
  // root to the face under the lip (the probe at t 0.7), then the face, found
  // between the two probes that bracket x. Needs the probes up to `turned`;
  // leaves its t, foam, slope (on the straight part) and bracket behind.
  let topT = 0;
  let topFoam = 0;
  let topSlope = 0;
  let topLo = 0;
  let topHi = 0;
  const topAt = (root, x, turned) => {
    if (x <= probeX[0]) {
      const span = Math.max(probeX[0] - root.x, 1e-9);
      const w = Math.min(Math.max((x - root.x) / span, 0), 1);
      topT = 0.5;
      topSlope = (probeZ[0] - root.z) / span;
      topFoam = root.foam + (probeFoam[0] - root.foam) * w;
      return root.z + (probeZ[0] - root.z) * w;
    }
    let k = 1;
    while (k < turned && probeX[k] < x) k += 1;
    topLo = FACE_PROBES[k - 1];
    topHi = FACE_PROBES[k];
    topT = solve(topLo, topHi, probeX[k - 1] - x, probeX[k] - x);
    topFoam = solved.foam;
    return solved.z;
  };

  // One ribbon at the sea parameter (pu, pa) in the coast frame; qp and ground
  // are p's own. Fills cut; false where this ribbon has no loft over p.
  const ribbonAt = (record, travel, pose, pu, pa, qp, ground, seaHeight) => {
    const { definition, along0, length } = holder.coast;
    const { runup, spent } = holder.loft;
    const P = holder.profile;
    ribbon.line = record.breakLine;
    ribbon.visible = record.breakVisible;
    ribbon.mean = record.breakMean;
    ribbon.peel = record.peel;
    ribbon.pose = pose;
    ribbon.travel = travel;
    // The sweep: along = sAlong(s) - k·x', u = centerU(s) + x', with x' the
    // profile x shortened by the crest's slope k = du/dsAlong. Solved for s by
    // a fixed point; it converges while the crest's curvature times the
    // section's half width stays under one (about a quarter at the widest
    // meander, so three or four steps).
    let s = (pa - along0) / length;
    if (s < -0.02 || s > 1.02) return false;
    const h = 0.5 / length;
    let k = 0;
    let x = 0;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      k = centerU(s + h) - centerU(s - h);
      x = pu - centerU(s);
      // Cheap rejection before the profile: nowhere near this crest.
      if (iteration === 0 && Math.abs(x) > (0.5 * P.width + (P.lean * 1.5 + 1 / RIDE_SLOPE) * record.height) * (1 + k * k) + 2) return false;
      const next = (pa + k * x - along0) / length;
      const converged = Math.abs(next - s) * length < 1e-4;
      if (converged) break;
      s = next;
    }
    if (!(s > 0 && s < 1)) return false;
    const visibleS = lineAt(ribbon.visible, s);
    if (!(visibleS > 0)) return false;
    // surfTravelAt(s): the section's own break phase.
    ribbon.dn = travel + lag(s);
    // surfRunupAlpha, on p: past the waterline the swell has faded to nothing,
    // so p is the visible point there.
    const runupAlpha = (1 - smooth(runup - 1, runup, qp)) * (1 - smooth(spent - 4, spent, ribbon.dn))
      * (1 - smooth(0.35, 0.75, Math.max(ground, 0)));
    if (!(runupAlpha > 0)) return false;
    // surfHeightAt with surfAt's run-up thinning: the swell's weather at the
    // break point, the end taper, the split mask.
    const sAlong = along0 + s * length;
    const end = smooth(0, 0.06, s) * (1 - smooth(0.94, 1, s)) * visibleS;
    const breakU = shorePosition(sAlong, definition) + ribbon.mean;
    const weather = gerstnerWeatherAt(breakU * definition.landX + sAlong * definition.alongX, breakU * definition.landZ + sAlong * definition.alongZ, holder.loft.gusts);
    const q = lineAt(ribbon.line, s) + ribbon.dn - travel + pose;
    ribbon.height = record.height * weather * end * (1 - 0.65 * smooth(0, Math.max(runup, 0.5), q));
    if (!(ribbon.height > 1e-5)) return false;
    const stretch = Math.sqrt(1 + k * k);
    ribbon.x = x * stretch;
    if (ribbon.x < -0.5 * P.width || ribbon.x > 0.5 * P.width + (P.lean + 1 / RIDE_SLOPE) * ribbon.height + 1) return false;

    let t;
    let z;
    let slope;
    let foam;
    let wall = -Infinity;
    const root = profileAt(0.3);
    if (ribbon.x <= root.x) {
      const start = profileAt(0);
      if (ribbon.x < start.x) return false;
      t = solve(0, BACK_END, start.x - ribbon.x, root.x - ribbon.x);
      z = solved.z;
      foam = solved.foam;
      slope = slopeAt(t, 0, BACK_END);
    } else {
      // The face a board rides is its floor: its last stretch running toward
      // the shore, from where it turns down to the foot. While the tube is
      // open under a leaning crest the face above that turn curls back under
      // itself — the barrel's ceiling, water over air — and over the floor it
      // is left out like the lip. Walked back from the foot in steps of a
      // sixth of the face; the turn is refined where x stops falling.
      // ponytail: a curl narrower than one step (a few centimetres under the
      // lip's root) is taken as floor; a finer walk costs a profile per step.
      const foot = profileAt(1);
      let floorT = 0.7;
      let floor = null;
      let shoreward = foot.x;
      let turned = -1;
      for (let k = 5; k >= 0; k -= 1) {
        const point = profileAt(FACE_PROBES[k]);
        keepProbe(k, point);
        if (point.x >= shoreward) {
          floorT = seawardmost(FACE_PROBES[k], Math.min(1, FACE_PROBES[k] + 0.1));
          floor = profileAt(floorT);
          turned = k;
          break;
        }
        shoreward = point.x;
        floor = point;
      }
      // Seaward of the turn stands the curl's top: the gap under the lip
      // bridged straight from its root to the face, then that face up to where
      // it curls back. It is ridden there, and over the barrel's mouth it is
      // the lid a body drops from onto the floor. Taking it from the moment a
      // curl shows keeps the surface whole as the curl opens: the face the
      // walk saw a frame earlier is the same water. Where the barrel reaches
      // behind the root there is no mouth, only the root.
      const lidded = turned >= 0 && floor.x > root.x;
      if (lidded) for (let k = 0; k < turned; k += 1) keepProbe(k, profileAt(FACE_PROBES[k]));
      // Nothing a body rides falls steeper than RIDE_SLOPE from anything
      // seaward of it on that ridden line — the root, the curl's top, the
      // floor, the foot: a straight wall down from the highest, wherever the
      // face beneath falls away faster (a rearing face goes vertical), a lid
      // hangs over the floor or the barrel has curled back behind the root.
      // The drawn face is kept wherever it is gentler. Taken only once a curl
      // shows, the wall would appear in one frame; taken always, the surface
      // is one continuous sheet in space and in time.
      // ponytail: the face is seen at the walk's spacing, so a drop shorter
      // than one step keeps a little of its own steepness.
      let reach = root.z + RIDE_SLOPE * root.x;
      for (let k = lidded || turned < 0 ? 0 : turned; k < 6; k += 1) {
        const on = FACE_PROBES[k] >= floorT || probeX[k] < floor.x;
        if (on && probeX[k] <= ribbon.x) reach = Math.max(reach, probeZ[k] + RIDE_SLOPE * probeX[k]);
      }
      if (floor.x <= ribbon.x) reach = Math.max(reach, floor.z + RIDE_SLOPE * floor.x);
      if (foot.x <= ribbon.x) reach = Math.max(reach, foot.z + RIDE_SLOPE * foot.x);
      if (lidded && floor.x <= ribbon.x) reach = Math.max(reach, topAt(root, floor.x, turned) + RIDE_SLOPE * floor.x);
      if (ribbon.x < floor.x) {
        z = topAt(root, ribbon.x, turned);
        t = topT;
        foam = topFoam;
        slope = topT === 0.5 ? topSlope : slopeAt(t, topLo, topHi);
        if (topT === 0.5) tPerX = 0;
      } else if (ribbon.x <= foot.x) {
        t = solve(floorT, 1, floor.x - ribbon.x, foot.x - ribbon.x);
        z = solved.z;
        foam = solved.foam;
        slope = slopeAt(t, floorT, 1);
      } else {
        // Past the foot, where the barrel reaches under the crest and the
        // floor lies behind the root: the wall alone, down to where its lift
        // over the sea runs out (an offset at or under zero is the sea).
        z = -Infinity;
        foam = root.foam;
      }
      wall = reach - RIDE_SLOPE * ribbon.x;
    }
    // surfEdgeAlpha × surfRunupAlpha × uRibbonVisible: how much of the loft is
    // there; the sheet over the sea is the sea plus that share of the lift.
    const rim = record.visible * runupAlpha * visibleS * smooth(0, 0.04, s) * (1 - smooth(0.96, 1, s));
    const bed = Math.max(ground, 0);
    cut.offset = -Infinity;
    if (z > -Infinity) {
      const edge = smooth(0, 0.08, t) * (1 - smooth(0.92, 1, t));
      const edgeRate = smoothRate(0, 0.08, t) * (1 - smooth(0.92, 1, t)) - smooth(0, 0.08, t) * smoothRate(0.92, 1, t);
      const mask = rim * edge;
      // surfCrestDamp: with surfSmooth the crest sets itself on the still
      // level instead of the swell under it. Only the height is followed here;
      // its horizontal shift toward p is left out (a few decimetres at most,
      // where the break zone has already cut the swell to a third).
      const band = smooth(0.1, 0.28, t) * (1 - smooth(0.74, 0.92, t));
      const bandRate = smoothRate(0.1, 0.28, t) * (1 - smooth(0.74, 0.92, t)) - smooth(0.1, 0.28, t) * smoothRate(0.74, 0.92, t);
      const damp = holder.loft.smooth * band;
      const lift = z - root.base + bed - damp * seaHeight;
      cut.offset = mask * lift;
      // Across the crest: the profile's own slope, the sheet fading in at its
      // rims and the crest's damping changing along it.
      cut.slope = rim * (edge * (slope - seaHeight * holder.loft.smooth * bandRate * tPerX) + edgeRate * tPerX * lift);
      cut.foam = Math.min(Math.max(foam * end, 0), 1) * mask;
      cut.damp = mask * damp;
    }
    // The wall stands where it lifts more than the drawn line under it. It
    // meets the sea in a toe WALL_TOE high that bends it in from level: a
    // wedge ending at the full RIDE_SLOPE would hand the sea's still water
    // under a board a rise of the whole c·RIDE_SLOPE in one step.
    if (wall > -Infinity) {
      const rise = wall - root.base;
      const toe = smooth(0, WALL_TOE, rise);
      const lift = rise + bed - holder.loft.smooth * seaHeight;
      const offset = rim * toe * lift;
      if (offset > cut.offset) {
        cut.offset = offset;
        cut.slope = -RIDE_SLOPE * rim * (toe + smoothRate(0, WALL_TOE, rise) * lift);
        cut.foam = Math.min(Math.max(foam * end, 0), 1) * rim * toe;
        cut.damp = rim * toe * holder.loft.smooth;
      }
    }
    if (!(cut.offset > -Infinity)) return false;
    // The crest's normal toward the shore (spray.js uses the same frame). The
    // centre line moves toward the land at the travel speed, so along its own
    // normal the shape moves at that speed over the stretch.
    cut.fwdX = (definition.landX - definition.alongX * k) / stretch;
    cut.fwdZ = (definition.landZ - definition.alongZ * k) / stretch;
    cut.speed = holder.frozen ? 0 : holder.speed / stretch;
    return true;
  };

  // px, pz: the undisplaced sea parameter p (world metres). time: scene
  // seconds; the ribbons' travel is carried from the holder's write time at
  // their speed. seaHeight: the sea's height at p, only read where surfSmooth
  // lays the crest on the still level. out:
  //   offset      metres the visible surface stands above the sea at p (≥ 0)
  //   ribbon      the ribbon that stands there, -1 for the open sea
  //   slopeAlong  d offset / d metre along fwd
  //   fwdX, fwdZ  unit crest normal toward the shore
  //   whitewater  the profile's foam there, 0..1
  //   speed       the shape's speed along fwd, m/s; 0 when frozen
  //   rate        d offset / dt at this fixed p, m/s: the shape's travel and
  //               its change of form together
  //   damp        the share of the sea's own motion the crest ignores (surfSmooth)
  const surfOffsetAt = (px, pz, time, ribbons, out = {}, seaHeight = 0) => {
    out.offset = 0;
    out.ribbon = -1;
    out.slopeAlong = 0;
    out.fwdX = 0;
    out.fwdZ = 0;
    out.whitewater = 0;
    out.speed = 0;
    out.rate = 0;
    out.damp = 0;
    const definition = ribbons?.coast?.definition;
    if (!ribbons?.count || !definition?.terrainEnabled) return out;
    holder = ribbons;
    const pu = px * definition.landX + pz * definition.landZ;
    const pa = px * definition.alongX + pz * definition.alongZ;
    const qp = pu - shorePosition(pa, definition);
    const ground = coastHeight(qp, pa, definition);
    const drift = holder.frozen ? 0 : holder.speed * (time - holder.time);
    for (let index = 0; index < holder.count; index += 1) {
      const record = holder.ribbons[index];
      if (!(record.visible > 0)) continue;
      if (!ribbonAt(record, record.travel + drift, record.pose + drift, pu, pa, qp, ground, seaHeight)) continue;
      // The visible top is the highest sheet, and never below the sea.
      if (!(cut.offset > out.offset)) continue;
      out.offset = cut.offset;
      out.ribbon = index;
      out.slopeAlong = cut.slope;
      out.fwdX = cut.fwdX;
      out.fwdZ = cut.fwdZ;
      out.whitewater = cut.foam;
      out.speed = cut.speed;
      out.damp = cut.damp;
    }
    if (out.ribbon < 0) return out;
    if (!holder.frozen) {
      const record = holder.ribbons[out.ribbon];
      const step = holder.speed * RATE_STEP;
      const later = ribbonAt(record, record.travel + drift + step, record.pose + drift + step, pu, pa, qp, ground, seaHeight) ? Math.max(cut.offset, 0) : 0;
      const earlier = ribbonAt(record, record.travel + drift - step, record.pose + drift - step, pu, pa, qp, ground, seaHeight) ? Math.max(cut.offset, 0) : 0;
      out.rate = (later - earlier) / (2 * RATE_STEP);
    }
    // On the beach the sheet rides the sand and thins out at the top of its
    // run-up, both changing across the crest: there the slope is the lift
    // itself differenced along fwd. At sea the profile's own slope is exact.
    if (ground > 0 || qp > holder.loft.runup - 1) {
      const record = holder.ribbons[out.ribbon];
      const liftAt = (sign) => {
        const x = px + out.fwdX * BEACH_STEP * sign;
        const z = pz + out.fwdZ * BEACH_STEP * sign;
        const u = x * definition.landX + z * definition.landZ;
        const a = x * definition.alongX + z * definition.alongZ;
        const q = u - shorePosition(a, definition);
        return ribbonAt(record, record.travel + drift, record.pose + drift, u, a, q, coastHeight(q, a, definition), seaHeight) ? Math.max(cut.offset, 0) : 0;
      };
      out.slopeAlong = (liftAt(1) - liftAt(-1)) / (2 * BEACH_STEP);
    }
    return out;
  };

  return { surfOffsetAt };
}
