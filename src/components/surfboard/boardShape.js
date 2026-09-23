import * as THREE from 'three';
import { DEFAULT_SURFBOARD_SETTINGS } from './settings.js';

// The board is a handful of smooth functions of u, the station along the
// length: 0 at the tail end, 1 at the nose tip. Outline, rocker, foil and the
// cross-section are each one formula, so the mesh, the texture, the float
// points of the physics and the checks all read the same board and cannot
// drift apart. The frame is the board's own: +Z toward the nose, +Y out of the
// deck, +X to starboard; z = 0 at mid-length and y = 0 where the bottom sits
// lowest on its rocker.
//
// The default is a 5'10" groveler: pointed nose, wide point just forward of
// centre, a rounded squash. The fractions below are that board's proportions;
// every length in metres is scaled by the dimensions, so a longer or wider
// board keeps the family look.

const WIDE_POINT = 0.52; // u of the widest station
const LOW_POINT = 0.4; // u where the bottom touches y = 0
const THICK_POINT = 0.45; // u of the thickest station

// Outline. The nose side falls as 1 - t^p, which with p = 2.5 lands 12" from
// the tip at two thirds of the width. The tail side is a cubic that reaches the
// squash at half the width, straight enough that the tail keeps its drive.
const NOSE_POWER = 2.5;
const TAIL_WIDTH = 0.51; // tail end, as a fraction of the width
const TAIL_BELLY = 1.546; // f(t) = t²(c + (1 - c)t): 12" from the tail at 0.74 of the width
// The nose tip is rounded by a vanishing hyperbola: w² = line² + 2 r s e^(-s/2r)
// has exactly radius r at the tip and is the straight line a few r behind it.
const NOSE_TIP_RADIUS = 0.03; // × width: 1.5 cm on a 50 cm board
// The squash end is a superellipse cap over the last few centimetres: almost
// straight across the middle of the end, turning into the rail in a ~3 cm corner.
const TAIL_CAP = 0.1; // × width: how far the rounding reaches up the rail
const TAIL_CAP_POWER = 3.2;

// Rocker. Powers above two keep both slope and curvature continuous through
// the flat spot, so the bottom has no crease at the low point.
const NOSE_ROCKER_POWER = 2.6;
const TAIL_ROCKER_POWER = 2.2;

// Foil: the thickness left at the tips, as a fraction of the thickness.
const NOSE_FOIL = 0.35;
const TAIL_FOIL = 0.48;

// Cross-section. The half-section is two superellipse quadrants that meet at
// the rail apex with a vertical tangent: the deck above (a domed deck turning
// into a soft upper rail) and the bottom below (flat, turning up into the
// rail). The apex sits at 50% of the thickness in the nose — a soft 50/50 rail
// — and drops to about a third in the tail, where the lower quadrant also
// squares up into a tucked, harder edge.
const UPPER_POWER = 2.8;
const LOWER_POWER_TAIL = 7;
const LOWER_POWER_NOSE = 2.4;
const APEX_TAIL = 0.32;
const APEX_NOSE = 0.5;
// Concave: a single concave through the middle that splits into a double
// concave toward the fins, 3 mm at most on a 50 cm board, gone at both tips.
const CONCAVE_DEPTH = 0.006; // × width

// Texture v is arc length around the half-section, deck centre to bottom
// centre, over this many metres. Constant, so a stripe or the weave keeps its
// physical size whatever the board; wide enough for the widest board (2w + h).
export const SURFBOARD_UV_ARC = 0.8;

// Fins: an FCS thruster measured in metres from the tail end, independent of
// the board length — fin boxes are placed by the tail, not by proportion.
// Side fins: leading edge of the base 28 cm up (the FCS "11 inches"), toed in
// 3° and canted 6°, the middle of the base 2.8 cm in from the rail. The rail
// closes in by ~2 cm along the base and the toe adds half a centimetre, so
// measured at the leading edge (the FCS habit) that is ~4 cm, and the trailing
// edge keeps ~1.5 cm of flat bottom outboard of it. Centre fin: trailing edge 9 cm up.
const SIDE_FIN = Object.freeze({ base: 0.115, depth: 0.115, leadFromTail: 0.28, fromRail: 0.028, toe: 3, cant: 6 });
const CENTRE_FIN = Object.freeze({ base: 0.108, depth: 0.108, trailFromTail: 0.09 });
const FIN_THICKNESS = 0.0068; // at the base; the foil thins toward the tip
// The fin root runs this far up into the hull, so the curved bottom never shows
// a gap along the base.
const FIN_ROOT = 0.004;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (settings, key) => {
  const value = Number(settings?.[key]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SURFBOARD_SETTINGS[key];
};

export function boardDimensions(settings = {}) {
  return {
    length: pick(settings, 'surfboardLength'),
    width: pick(settings, 'surfboardWidth'),
    thickness: pick(settings, 'surfboardThickness'),
    noseRocker: pick(settings, 'surfboardNoseRocker'),
    tailRocker: pick(settings, 'surfboardTailRocker'),
  };
}

// Half the planform width at station u, metres.
export function halfWidth(dims, u) {
  if (!(u > 0 && u < 1)) return 0;
  const { length, width } = dims;
  if (u >= WIDE_POINT) {
    const line = 0.5 * width * (1 - ((u - WIDE_POINT) / (1 - WIDE_POINT)) ** NOSE_POWER);
    const s = (1 - u) * length;
    const r = NOSE_TIP_RADIUS * width;
    return Math.sqrt(line * line + 2 * r * s * Math.exp(-s / (2 * r)));
  }
  const t = (WIDE_POINT - u) / WIDE_POINT;
  const line = 0.5 * width * (1 - (1 - TAIL_WIDTH) * t * t * (TAIL_BELLY + (1 - TAIL_BELLY) * t));
  const s = u * length;
  const cap = TAIL_CAP * width;
  return s >= cap ? line : line * (1 - (1 - s / cap) ** TAIL_CAP_POWER) ** (1 / TAIL_CAP_POWER);
}

// Height of the flat of the bottom on the centreline (the rocker), metres.
export function rockerHeight(dims, u) {
  const x = clamp01(u);
  return x >= LOW_POINT
    ? dims.noseRocker * ((x - LOW_POINT) / (1 - LOW_POINT)) ** NOSE_ROCKER_POWER
    : dims.tailRocker * ((LOW_POINT - x) / LOW_POINT) ** TAIL_ROCKER_POWER;
}

// Deck-to-bottom thickness on the centreline, metres.
export function foilThickness(dims, u) {
  const x = clamp01(u);
  const nose = x >= THICK_POINT;
  const t = nose ? (x - THICK_POINT) / (1 - THICK_POINT) : (THICK_POINT - x) / THICK_POINT;
  return dims.thickness * (1 - (1 - (nose ? NOSE_FOIL : TAIL_FOIL)) * t * t);
}

// Everything the cross-section at u needs, in one place.
export function boardStation(dims, u) {
  const x = clamp01(u);
  const w = halfWidth(dims, x);
  const h = foilThickness(dims, x);
  const floor = rockerHeight(dims, x);
  const apex = floor + h * lerp(APEX_TAIL, APEX_NOSE, smooth(0.1, 0.95, x));
  return {
    u: x, w, h, floor, apex,
    top: floor + h - apex,
    bottom: apex - floor,
    lowerPower: lerp(LOWER_POWER_TAIL, LOWER_POWER_NOSE, smooth(0.15, 0.9, x)),
    concave: CONCAVE_DEPTH * dims.width * smooth(0, 0.08, x) * (1 - smooth(0.8, 0.97, x)),
    single: smooth(0.12, 0.35, x), // 1 = single concave, 0 = double
  };
}

const bump = (q) => (Math.abs(q) < 1 ? (1 - q * q) ** 2 : 0);
function concaveProfile(station, xn) {
  const single = bump(xn / 0.85);
  const double = bump((xn - 0.42) / 0.4);
  return station.concave * (station.single * single + (1 - station.single) * double);
}

// Deck and bottom heights at a fraction xn = |x| / w of the half-width.
export function upperY(station, xn) {
  const t = clamp01(xn);
  return station.apex + station.top * (1 - t ** UPPER_POWER) ** (1 / UPPER_POWER);
}
export function lowerY(station, xn) {
  const t = clamp01(xn);
  const n = station.lowerPower;
  return station.apex - station.bottom * (1 - t ** n) ** (1 / n) + concaveProfile(station, t);
}

const xnAt = (station, x) => (station.w > 0 ? Math.abs(x) / station.w : 1);
// Local deck and bottom heights over a planform point. Outside the outline they
// return the height of the rail apex at that station (the nearest edge).
export function deckHeight(dims, x, z) {
  const station = boardStation(dims, z / dims.length + 0.5);
  return upperY(station, xnAt(station, x));
}
export function bottomHeight(dims, x, z) {
  const station = boardStation(dims, z / dims.length + 0.5);
  return lowerY(station, xnAt(station, x));
}

// Dense samples in xn for one superellipse quadrant: uniform in xn for the
// flats, uniform in the quadrant's angle for the turn into the rail.
function quadrantSamples(power, count) {
  const values = [];
  for (let i = 0; i <= count; i += 1) {
    values.push(i / count, Math.cos((Math.PI / 2) * (i / count)) ** (2 / power));
  }
  values.sort((a, b) => a - b);
  return values.filter((value, index) => index === 0 || value - values[index - 1] > 1e-9);
}

// The half-section at u as a dense polyline from the deck centre, round the
// rail apex, to the bottom centre (x ≥ 0), with the arc length along it.
export function sectionCurve(dims, u, count = 72) {
  const station = boardStation(dims, u);
  const upper = quadrantSamples(UPPER_POWER, count);
  const lower = quadrantSamples(station.lowerPower, count).reverse();
  const x = [], y = [], arc = [];
  const push = (px, py) => {
    const last = x.length - 1;
    arc.push(last < 0 ? 0 : arc[last] + Math.hypot(px - x[last], py - y[last]));
    x.push(px);
    y.push(py);
  };
  upper.forEach((xn) => push(station.w * xn, upperY(station, xn)));
  const apex = x.length - 1;
  lower.slice(1).forEach((xn) => push(station.w * xn, lowerY(station, xn)));
  return { station, x, y, arc, apex };
}

// Arc length from the deck centre to the point of the half-section at |x|, on
// the deck side or the bottom side.
export function arcAtX(curve, x, side = 'deck') {
  const target = Math.min(Math.abs(x), curve.station.w);
  const from = side === 'deck' ? 0 : curve.apex;
  const to = side === 'deck' ? curve.apex : curve.x.length - 1;
  for (let i = from; i < to; i += 1) {
    const a = curve.x[i], b = curve.x[i + 1];
    if ((target - a) * (target - b) <= 0 && a !== b) {
      return lerp(curve.arc[i], curve.arc[i + 1], (target - a) / (b - a));
    }
  }
  return curve.arc[side === 'deck' ? to : from];
}

// Resamples one part of the dense section into `segments` spans, uniform in
// arc length plus a weight on turning, so the rail and the tucked edge get
// their vertices where the section bends and the flats stay sparse.
const TURN_WEIGHT = 0.05; // metres of "length" per radian of turn
function resamplePart(curve, from, to, segments, out) {
  const tau = [0];
  let heading = null;
  for (let i = from + 1; i <= to; i += 1) {
    const dx = curve.x[i] - curve.x[i - 1], dy = curve.y[i] - curve.y[i - 1];
    const ds = Math.hypot(dx, dy);
    let turn = 0;
    if (ds > 1e-9) {
      const angle = Math.atan2(dy, dx);
      if (heading !== null) turn = Math.abs(Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading)));
      heading = angle;
    }
    tau.push(tau[tau.length - 1] + ds + TURN_WEIGHT * turn);
  }
  const total = tau[tau.length - 1];
  let k = 0;
  for (let s = out.length ? 1 : 0; s <= segments; s += 1) {
    const target = (total * s) / segments;
    while (k < tau.length - 2 && tau[k + 1] < target) k += 1;
    const span = tau[k + 1] - tau[k];
    const t = span > 0 ? clamp01((target - tau[k]) / span) : 0;
    const i = from + k;
    out.push({
      x: lerp(curve.x[i], curve.x[i + 1], t),
      y: lerp(curve.y[i], curve.y[i + 1], t),
      arc: lerp(curve.arc[i], curve.arc[i + 1], t),
    });
  }
  return out;
}

export function sectionRing(dims, u, topSegments, bottomSegments) {
  const curve = sectionCurve(dims, u);
  const ring = resamplePart(curve, 0, curve.apex, topSegments, []);
  return resamplePart(curve, curve.apex, curve.x.length - 1, bottomSegments, ring);
}

// Stations along the length, dense at both tips where the outline turns.
const stationU = (i, segments) => (1 - Math.cos((Math.PI * i) / segments)) / 2;

// The hull as one closed, smooth mesh. Each ring runs from the deck centre down
// the starboard side to the bottom centre and back up the port side; the two
// centreline vertices are shared, so the halves meet without a seam. Both tips
// close because the outline reaches zero width there: the last ring is a
// vertical line on the centreline. UV: x = u, y = arc from the deck centre over
// SURFBOARD_UV_ARC, the same on both halves (the texture is mirrored).
export function buildBoardGeometry(dims, { lengthSegments = 160, aroundSegments = 56 } = {}) {
  const half = Math.max(8, Math.round(aroundSegments / 2));
  const top = Math.round(half * 0.55);
  const ringSize = 2 * half;
  const rings = lengthSegments + 1;
  const positions = new Float32Array(rings * ringSize * 3);
  const uvs = new Float32Array(rings * ringSize * 2);
  for (let i = 0; i < rings; i += 1) {
    const u = stationU(i, lengthSegments);
    const z = (u - 0.5) * dims.length;
    const ring = sectionRing(dims, u, top, half - top);
    for (let j = 0; j < ringSize; j += 1) {
      const port = j > half;
      const point = ring[port ? ringSize - j : j];
      const v = i * ringSize + j;
      positions[v * 3] = port ? -point.x : point.x;
      positions[v * 3 + 1] = point.y;
      positions[v * 3 + 2] = z;
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = point.arc / SURFBOARD_UV_ARC;
    }
  }
  const index = [];
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < ringSize; j += 1) {
      const a = i * ringSize + j;
      const b = a + ringSize;
      const c = i * ringSize + ((j + 1) % ringSize);
      const d = c + ringSize;
      index.push(a, b, c, c, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Fin outline at a fraction eta of the depth, in the fin's own frame (origin at
// the trailing edge of the base, +z toward the leading edge, -y down): a swept
// thruster with a raked, rounded tip.
function finOutline(base, eta) {
  const chord = base * (1 - 0.45 * eta) * Math.sqrt(Math.max(0, 1 - eta ** 3));
  const middle = base * (0.5 - 0.55 * eta ** 1.4);
  return { chord, lead: middle + chord / 2 };
}

// Where each fin stands and how it is turned. Pure numbers — the physics reads
// this through buildBoardHull, the model through buildFinGeometries.
// yaw = toe (rotation about +y, +z toward +x), roll = cant (about the fin's
// chord, the tip toward +x when positive), pitch follows the bottom's rocker.
export function finLayout(dims) {
  const tail = -dims.length / 2;
  const slopeAt = (x, z) => (bottomHeight(dims, x, z + 0.01) - bottomHeight(dims, x, z - 0.01)) / 0.02;
  const place = (id, side, spec, trailing) => {
    const yaw = -side * THREE.MathUtils.degToRad(spec.toe ?? 0);
    const roll = side * THREE.MathUtils.degToRad(spec.cant ?? 0);
    const pitch = -Math.atan(slopeAt(trailing.x, trailing.z + spec.base / 2));
    const position = new THREE.Vector3(trailing.x, bottomHeight(dims, trailing.x, trailing.z), trailing.z);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'XYZ'));
    // Centre of pressure: the quarter chord, weighted by chord over the depth.
    let area = 0, zMoment = 0, dMoment = 0;
    const steps = 64;
    for (let k = 0; k < steps; k += 1) {
      const eta = (k + 0.5) / steps;
      const { chord, lead } = finOutline(spec.base, eta);
      area += chord;
      zMoment += (lead - chord / 4) * chord;
      dMoment += eta * spec.depth * chord;
    }
    const pressure = new THREE.Vector3(0, -dMoment / area, zMoment / area).applyQuaternion(quaternion).add(position);
    const normal = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    return {
      id, name: `surfboard-fin-${id}`, base: spec.base, depth: spec.depth,
      area: (area / steps) * spec.depth, toe: yaw, cant: roll,
      position, quaternion, pressure, normal,
    };
  };
  const toe = THREE.MathUtils.degToRad(SIDE_FIN.toe);
  const middleZ = tail + SIDE_FIN.leadFromTail - (SIDE_FIN.base / 2) * Math.cos(toe);
  const middleX = halfWidth(dims, middleZ / dims.length + 0.5) - SIDE_FIN.fromRail;
  const sideTrailing = (side) => ({
    x: side * (middleX + (SIDE_FIN.base / 2) * Math.sin(toe)),
    z: middleZ - (SIDE_FIN.base / 2) * Math.cos(toe),
  });
  return [
    place('right', 1, SIDE_FIN, sideTrailing(1)),
    place('left', -1, SIDE_FIN, sideTrailing(-1)),
    place('centre', 0, CENTRE_FIN, { x: 0, z: tail + CENTRE_FIN.trailFromTail }),
  ];
}

// One closed foil per fin in its own frame (see finOutline); place it with the
// layout's position and quaternion. The root reaches FIN_ROOT up into the hull.
// Returns finLayout(dims) with a `geometry` on each entry.
export function buildFinGeometries(dims, { depthSegments = 12, chordSegments = 12 } = {}) {
  return finLayout(dims).map((fin) => {
    const around = 2 * chordSegments;
    const levels = [FIN_ROOT, ...Array.from({ length: depthSegments }, (_, k) => -(k / depthSegments) * fin.depth)];
    const positions = [];
    levels.forEach((y) => {
      const eta = Math.max(0, -y / fin.depth);
      const { chord, lead } = finOutline(fin.base, eta);
      const thickness = FIN_THICKNESS * (1 - 0.55 * eta);
      for (let j = 0; j < around; j += 1) {
        const p = j <= chordSegments ? j : around - j;
        const xi = (1 + Math.cos((Math.PI * p) / chordSegments)) / 2; // 1 at the trailing edge, 0 at the leading
        // NACA 4-digit half-thickness; the trailing edge is closed exactly.
        const naca = p === 0 ? 0 : 5 * thickness * (0.2969 * Math.sqrt(xi) - 0.126 * xi - 0.3516 * xi ** 2 + 0.2843 * xi ** 3 - 0.1036 * xi ** 4);
        positions.push(j <= chordSegments ? naca : -naca, y, lead - xi * chord);
      }
    });
    const rootCentre = positions.length / 3;
    const { lead: rootLead, chord: rootChord } = finOutline(fin.base, 0);
    positions.push(0, FIN_ROOT, rootLead - rootChord / 2);
    const tip = rootCentre + 1;
    positions.push(0, -fin.depth, finOutline(fin.base, 1).lead);
    const index = [];
    for (let k = 0; k < levels.length - 1; k += 1) {
      for (let j = 0; j < around; j += 1) {
        const a = k * around + j, c = k * around + ((j + 1) % around);
        const b = a + around, d = c + around;
        index.push(a, c, b, c, d, b);
      }
    }
    const last = (levels.length - 1) * around;
    for (let j = 0; j < around; j += 1) {
      const next = (j + 1) % around;
      index.push(rootCentre, next, j);
      index.push(last + j, last + next, tip);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { ...fin, geometry };
  });
}

// Section area of the whole section (both halves) between xn = a and b of the
// half-width, and its first moment in x — the integrals behind the float points.
function sectionStrip(station, a, b, steps) {
  let area = 0, moment = 0;
  const dx = (b - a) / steps;
  for (let k = 0; k < steps; k += 1) {
    const xn = a + (k + 0.5) * dx;
    const height = Math.max(0, upperY(station, xn) - lowerY(station, xn));
    area += height;
    moment += height * xn;
  }
  return { area: area * dx * station.w, moment: moment * dx * station.w * station.w };
}

const TAIL_ROW = 0.06;
const NOSE_ROW = 0.92;
const HULL_ROWS = 7;

// The hull for the physics. The planform is cut into strips — a tail cell, seven rows of centre + two rail
// cells, a nose cell — each reduced to one point on the bottom with the planform
// area and the deck-to-bottom volume of its cell. The cells tile the planform,
// so the points sum to the board.
export function buildBoardHull(dims) {
  const { length } = dims;
  const strips = [[0, TAIL_ROW, 'tail']];
  for (let r = 0; r < HULL_ROWS; r += 1) {
    strips.push([lerp(TAIL_ROW, NOSE_ROW, r / HULL_ROWS), lerp(TAIL_ROW, NOSE_ROW, (r + 1) / HULL_ROWS), 'row']);
  }
  strips.push([NOSE_ROW, 1, 'nose']);
  const points = [];
  const lengthSteps = 48, acrossSteps = 64;
  strips.forEach(([u0, u1, kind]) => {
    const cells = kind === 'row'
      ? [{ a: 0, b: 1 / 3, sides: 2, kind: 'bottom', side: 0 }, { a: 1 / 3, b: 1, sides: 1, kind: 'rail', side: 1 }, { a: 1 / 3, b: 1, sides: 1, kind: 'rail', side: -1 }]
      : [{ a: 0, b: 1, sides: 2, kind, side: 0 }];
    cells.forEach((cell) => {
      let area = 0, volume = 0, zMoment = 0, xMoment = 0;
      const du = (u1 - u0) / lengthSteps;
      for (let k = 0; k < lengthSteps; k += 1) {
        const u = u0 + (k + 0.5) * du;
        const station = boardStation(dims, u);
        const strip = sectionStrip(station, cell.a, cell.b, acrossSteps);
        const dz = du * length;
        const cellArea = station.w * (cell.b - cell.a) * cell.sides * dz;
        const cellVolume = strip.area * cell.sides * dz;
        area += cellArea;
        volume += cellVolume;
        zMoment += (u - 0.5) * length * cellVolume;
        xMoment += strip.moment * dz;
      }
      const x = cell.side ? cell.side * (xMoment / Math.max(volume, 1e-12)) : 0;
      const z = zMoment / Math.max(volume, 1e-12);
      points.push({ x, y: bottomHeight(dims, x, z), z, area, volume, height: volume / Math.max(area, 1e-12), kind: cell.kind });
    });
  });

  // The totals, integrated independently and finer, dense at the tips.
  let planformArea = 0, volume = 0;
  const steps = 1200;
  for (let k = 0; k < steps; k += 1) {
    const u0 = stationU(k, steps), u1 = stationU(k + 1, steps);
    const station = boardStation(dims, (u0 + u1) / 2);
    const dz = (u1 - u0) * length;
    planformArea += 2 * station.w * dz;
    volume += 2 * sectionStrip(station, 0, 1, 160).area * dz;
  }

  const fins = finLayout(dims).map((fin) => ({
    id: fin.id, x: fin.pressure.x, y: fin.pressure.y, z: fin.pressure.z,
    area: fin.area, depth: fin.depth, toe: fin.toe, cant: fin.cant,
    normal: { x: fin.normal.x, y: fin.normal.y, z: fin.normal.z },
  }));

  return {
    length, width: dims.width, thickness: dims.thickness,
    volume, planformArea, points, fins,
    deckY: (x, z) => deckHeight(dims, x, z),
    bottomY: (x, z) => bottomHeight(dims, x, z),
  };
}
