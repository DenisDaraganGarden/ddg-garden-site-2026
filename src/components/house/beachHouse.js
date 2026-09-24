import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSequence } from '../../plants/oleasterModel.js';
import { HOUSE_COLORS, HOUSE_DEFAULTS, HOUSE_RANGES } from './settings.js';

// A weathered beach house on stilts and the painted shed beside it, after the
// diorama Denis brought (Sketchfab, «DAE Diorama — By the ocean»). Boards and
// cut panels, every measure a real one for the surfer (1.74 m,
// riderSkeleton.js) who is going to walk here: 18 cm steps on a 28 cm run, a
// 2.05 m door, a 95 cm rail, 2.4 m under the porch beam. Each piece carries
// metric UVs with the grain along it and a surface (which board, which
// layout) for its material (houseMaterial.js).
//
// Age is procedural. `damage` takes boards away, snaps them, leaves them
// hanging from a nail, opens gaps in the walls and holes in the roofs, breaks
// panes, swings a door ajar and drops planks on the sand; `sag` settles the
// house towards a corner, leans it, swaybacks the ridge and droops the porch
// between its posts. Every piece draws its fate from a stream of its own, the
// same draws at any damage, so more damage only adds wounds to those already
// there. Streaks, peeling paint and rust belong to the material (houseMaterial.js).
//
// Each building is boxes and flat panels merged into one geometry per finish
// (siding, trim, roof…): a dozen draw calls. The house faces +Z — the gable
// with the porch and the green shutters — with its centre on the origin and
// y = 0 on the sand; the shed's door faces +X. Placing them is the caller's.

// The builder's defaults, ranges and palette live with the scene settings
// (settings.js), which the editor server reads without loading all this.
export { HOUSE_COLORS, HOUSE_DEFAULTS, HOUSE_RANGES };
export const HOUSE_ROLES = Object.freeze(Object.keys(HOUSE_COLORS));

export function normalizeHouse(input = {}) {
  const out = { seed: Number.isFinite(input.seed) ? Math.round(input.seed) : HOUSE_DEFAULTS.seed };
  for (const [key, [min, max]] of Object.entries(HOUSE_RANGES)) {
    const value = Number(input[key]);
    out[key] = Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : HOUSE_DEFAULTS[key];
  }
  return out;
}

const Y = new THREE.Vector3(0, 1, 0);
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const WORLD = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

// A plane's frame: origin o, in-plane axes u and v, w = u × v out of the plane.
function frame(o, u, v) {
  return new THREE.Matrix4().makeBasis(u, v, new THREE.Vector3().crossVectors(u, v)).setPosition(o);
}
// A wall as one sees it from outside: u to the right, v up, w out of the wall;
// (nx, nz) is its outward normal, the origin on its outer face.
function wallFrame(x, y, z, nx, nz) {
  return frame(vec(x, y, z), new THREE.Vector3().crossVectors(Y, vec(nx, 0, nz)), Y);
}
// A roof plane through o falling at `pitch` towards the horizontal (dx, dz):
// v runs down the slope, w out of the roof. `plan` puts a point of the plan
// (x, z) on the slope as (u, v), so a roof is drawn by its outline seen from above.
function roofPlane(o, dx, dz, pitch) {
  const d = vec(dx, 0, dz);
  const u = new THREE.Vector3().crossVectors(d, Y);
  const v = d.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(Y, -Math.sin(pitch));
  return {
    m: frame(o, u, v),
    plan: ([x, z]) => [(x - o.x) * u.x + (z - o.z) * u.z, ((x - o.x) * dx + (z - o.z) * dz) / Math.cos(pitch)],
  };
}
// Where the line v = const crosses a convex outline: [u min, u max].
function spanAt(points, v) {
  let lo = Infinity, hi = -Infinity;
  points.forEach(([u0, v0], i) => {
    const [u1, v1] = points[(i + 1) % points.length];
    if (v0 === v1 || (v0 - v) * (v1 - v) > 0) return;
    const u = u0 + ((u1 - u0) * (v - v0)) / (v1 - v0);
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  });
  return [lo, hi];
}
const spread = (a, b, maxGap) => {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / maxGap));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
};

// Cut the triangles that touch `bends` (a test on a vertex) down to edges of
// `maxEdge` or less — the longest edge first, always at its midpoint, so two
// faces sharing an edge cut it alike and stay closed when the house bends.
// Elsewhere the bend is affine, and an uncut edge stays straight and shut.
function tessellate(geometry, maxEdge, bends) {
  const names = Object.keys(geometry.attributes), sources = names.map((name) => geometry.attributes[name]);
  const limit = maxEdge * maxEdge, outputs = names.map(() => []);
  // A vertex is all its attributes in a row, position first.
  const vertex = (i) => sources.flatMap((source) => Array.from(source.array.subarray(i * source.itemSize, (i + 1) * source.itemSize)));
  const emit = (point) => {
    let offset = 0;
    sources.forEach((source, k) => {
      for (let c = 0; c < source.itemSize; c += 1) outputs[k].push(point[offset + c]);
      offset += source.itemSize;
    });
  };
  const middle = (a, b) => a.map((value, k) => (value + b[k]) / 2);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const split = (a, b, c) => {
    const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), longest = Math.max(ab, bc, ca);
    if (longest <= limit) {
      emit(a);
      emit(b);
      emit(c);
    } else if (longest === ab) {
      const m = middle(a, b);
      split(a, m, c);
      split(m, b, c);
    } else if (longest === bc) {
      const m = middle(b, c);
      split(a, b, m);
      split(a, m, c);
    } else {
      const m = middle(c, a);
      split(a, b, m);
      split(m, b, c);
    }
  };
  for (let i = 0; i < sources[0].count; i += 3) {
    const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
    if ([a, b, c].some((point) => bends(point[0], point[1], point[2]))) split(a, b, c);
    else [a, b, c].forEach(emit);
  }
  const out = new THREE.BufferGeometry();
  names.forEach((name, k) => out.setAttribute(name, new THREE.Float32BufferAttribute(outputs[k], sources[k].itemSize)));
  return out;
}

// Metric UVs on a box before it is placed: u along its longest side — the
// grain — and v across; the end faces take the two short sides. A `wall` box
// keeps v up (local y) and u along each face, for boards that run across it.
function boxUvs(geometry, size, mode) {
  const { position, normal, uv } = geometry.attributes;
  const long = size.indexOf(Math.max(...size));
  for (let i = 0; i < position.count; i += 1) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const n = [normal.getX(i), normal.getY(i), normal.getZ(i)].map(Math.abs);
    const axis = n.indexOf(Math.max(...n)), plane = [0, 1, 2].filter((k) => k !== axis);
    let a, b;
    if (mode === 'pane') [a, b] = [0, 1];
    else if (mode === 'wall') [a, b] = axis === 1 ? [0, 2] : [plane.find((k) => k !== 1), 1];
    else [a, b] = plane.includes(long) ? [long, plane.find((k) => k !== long)] : plane;
    // A pane counts from its centre, where its room is centred.
    const origin = mode === 'pane' ? 0 : 0.5;
    uv.setXY(i, p[a] + size[a] * origin, p[b] + size[b] * origin);
  }
}

// How each finish lays its texture by default (houseMaterial.js): 0 a board,
// 1 clapboard, 2 shakes, 3 upright boards, 4 asphalt shingles, 5 iron,
// 6 plain, 7 rope, 8 wood shingles, 9 a pane with a room behind it.
const LAYOUT = { roof: 4, shedRoof: 8, metal: 5, glass: 6, unit: 6, void: 6, rope: 7, lamp: 6 };
// A room behind a pane reads its scale: blinds (1) × 10000, the pane's half
// width (cm) × 10, plus the height of its centre above the room's floor (m).
export const encodeRoom = (halfWidth, above, blinds = 0) => blinds * 10000 + Math.round(halfWidth * 100) * 10 + above;
export const decodeRoom = (scale) => {
  const rest = scale % 10000;
  return { blinds: Math.floor(scale / 10000), halfWidth: Math.floor(rest / 10) / 100, above: rest % 10 };
};

// Festoon bulbs along a hanging span {a, b, sag}: a parabola through both
// anchors, dropping `sag` at its middle; a bulb every `spacing` metres.
export function garlandBulbs({ a, b, sag }, spacing = 0.3) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), count = Math.max(1, Math.round(length / spacing));
  return Array.from({ length: count }, (_, k) => {
    const t = (k + 0.5) / count;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  });
}

// The pieces, collected per finish and merged at the end — twice: all of
// them for near, and for far the ones that still show from far off, with
// a few plain stand-ins (a rail as one board, a lattice as one sheet) in
// place of what is dropped. One set of pieces, one set of draws: the far
// house is the near one, settled the same, only barer.
function createKit(seed, damage = 0) {
  const parts = new Map(), farParts = new Map();
  let reach = 'both';
  const only = (level, draw) => {
    const was = reach;
    reach = level;
    draw();
    reach = was;
  };
  const rand = randomSequence(seed);
  const fate = randomSequence(seed * 31 + 17);
  const jitter = (amount) => (rand() - 0.5) * 2 * amount;
  // A piece is hurt when its first draw falls under damage × weight. Three
  // draws every time, hurt or not: the pattern holds while the slider moves,
  // and more damage only adds to the wounds already there. Nothing inside a
  // wound may draw again, from either stream.
  const wound = (weight) => {
    const chance = fate(), kind = fate(), amount = fate();
    return chance < damage * weight ? { kind, amount } : null;
  };
  const turn = new THREE.Matrix4(), euler = new THREE.Euler();
  // A piece's `surface`: its layout (LAYOUT) and a scale the layout reads — a
  // roof's course, a wall's first course, a board wall's first joint. Which
  // patch of texture and which shade it gets comes from where it is, so the
  // same board keeps them whatever the damage does to the others.
  const add = (role, geometry, { layout = LAYOUT[role] ?? 0, scale = 0 } = {}) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.computeBoundingBox();
    const c = flat.boundingBox.getCenter(new THREE.Vector3());
    const seed = Math.sin(c.x * 12.9898 + c.y * 78.233 + c.z * 37.719) * 43758.5453;
    const surface = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < surface.length; i += 3) [surface[i], surface[i + 1], surface[i + 2]] = [seed - Math.floor(seed), layout, scale];
    flat.setAttribute('aSurface', new THREE.BufferAttribute(surface, 3));
    const put = (set, geometry) => {
      if (!set.has(role)) set.set(role, []);
      set.get(role).push(geometry);
    };
    if (reach !== 'far') put(parts, flat);
    if (reach !== 'near') put(farParts, reach === 'both' ? flat.clone() : flat);
  };
  // A box in a frame: centre and size in (u, v, w), turned about its centre
  // (radians; about w first, then v, then u).
  const box = (role, m, [cu, cv, cw], [su, sv, sw], [ru = 0, rv = 0, rw = 0] = [], surface = {}) => {
    const geometry = new THREE.BoxGeometry(su, sv, sw);
    boxUvs(geometry, [su, sv, sw], surface.uv);
    if (ru || rv || rw) geometry.applyMatrix4(turn.makeRotationFromEuler(euler.set(ru, rv, rw)));
    add(role, geometry.translate(cu, cv, cw).applyMatrix4(m), surface);
  };
  // A flat piece cut to an outline in (u, v), `thickness` deep from w0 along w;
  // its UVs are the outline's metres. A roof counts its courses up from the
  // eave: `fromEave` is the v of the first course there.
  const panel = (role, m, points, thickness, w0 = 0, surface = {}) => {
    const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    if (surface.fromEave !== undefined) {
      const { uv } = geometry.attributes;
      for (let i = 0; i < uv.count; i += 1) uv.setY(i, surface.fromEave - uv.getY(i));
    }
    add(role, geometry.translate(0, 0, w0).applyMatrix4(m), surface);
  };
  // A stick between two world points, `width` across and `height` up.
  const beam = (role, a, b, width, height) => {
    const length = a.distanceTo(b), geometry = new THREE.BoxGeometry(width, height, length);
    boxUvs(geometry, [width, height, length]);
    add(role, geometry.applyMatrix4(new THREE.Matrix4().lookAt(a, b, Y).setPosition(a.clone().lerp(b, 0.5))));
  };
  // A board between two world points that damage may take away, snap short or
  // leave hanging from its nail at one end — no lower than `floor`.
  const stick = (role, a, b, width, height, weight = 0.3, floor = 0.02) => {
    const hit = wound(weight);
    if (!hit) {
      beam(role, a, b, width, height);
      return;
    }
    if (hit.kind < 0.35) return;
    const [fixed, free] = hit.amount < 0.5 ? [a, b] : [b, a];
    const run = free.clone().sub(fixed), length = run.length();
    let end;
    if (hit.kind < 0.7) {
      const flat = Math.hypot(run.x, run.z) || 1e-6;
      // The board's edge, not its middle, stops at the floor.
      const lowest = -Math.asin(clamp((fixed.y - floor - height / 2) / length, 0, 1));
      const slope = Math.max(Math.atan2(run.y, flat) - 0.5 - hit.amount, lowest);
      end = fixed.clone().add(vec((run.x / flat) * Math.cos(slope) * length, Math.sin(slope) * length, (run.z / flat) * Math.cos(slope) * length));
    } else {
      end = fixed.clone().addScaledVector(run, 0.3 + 0.45 * hit.amount);
      end.y -= 0.02 + 0.05 * hit.amount;
    }
    beam(role, fixed, end, width, height);
  };
  // A rope hanging between two world points.
  const rope = (role, a, b, radius = 0.016) => {
    const sag = 0.04 + 0.025 * a.distanceTo(b);
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(vec(0, -2 * sag, 0)), b);
    const geometry = new THREE.TubeGeometry(curve, 16, radius, 5, false), { uv } = geometry.attributes, length = curve.getLength();
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * length);
    add(role, geometry);
  };
  // Corrugated iron: a sheet su × sv in a frame, the ribs running along v. A
  // lifted sheet pivots on its upper edge, its lower edge off the roof.
  const corrugated = (role, m, [cu, cv], [su, sv], w0, spin = 0, lift = 0) => {
    const ribs = Math.max(2, Math.round(su / 0.12));
    const geometry = new THREE.PlaneGeometry(su, sv, ribs * 6, 1);
    const position = geometry.attributes.position;
    const { uv } = geometry.attributes;
    for (let i = 0; i < position.count; i += 1) {
      position.setZ(i, 0.018 * Math.sin((position.getX(i) / su) * ribs * Math.PI * 2));
      uv.setXY(i, position.getX(i) + su / 2, position.getY(i) + sv / 2);
    }
    geometry.computeVertexNormals();
    if (lift) geometry.translate(0, sv / 2, 0).rotateX(lift).translate(0, -sv / 2, 0);
    if (spin) geometry.rotateZ(spin);
    add(role, geometry.translate(cu, cv, w0).applyMatrix4(m), { layout: 5, scale: su / ribs });
  };
  // A roof slab cut to its outline, with a shingle course every `course` up
  // from the eave.
  const roof = (role, plane, outline, thickness, course = 0.3) => {
    const vs = outline.map(([, v]) => v);
    panel(role, plane.m, outline, thickness, 0, { scale: course, fromEave: Math.max(...vs) - 0.05 });
    const top = Math.min(...vs);
    only('near', () => {
      for (let v = Math.max(...vs) - 0.05; v > top + 0.12; v -= course) {
        const [a, b] = spanAt(outline, v);
        if (b - a > 0.15) box(role, plane.m, [(a + b) / 2, v + jitter(0.012), thickness + 0.012], [b - a - 0.04, 0.05, 0.024]);
      }
    });
  };
  // Openings in a wall, per wall frame: [u0, u1, v0, v1] its courses keep off.
  const holes = new Map();
  const hole = (m, u0, u1, v0, v1) => {
    if (!holes.has(m)) holes.set(m, []);
    holes.get(m).push([u0, u1, v0, v1]);
  };
  // Horizontal courses on a wall: `span(v)` gives the wall's [u0, u1] at a
  // height. Clapboard is one shadow line per course; shakes break into
  // shingles of uneven width. They wait for the wall's windows and doors and
  // are laid round them when the building is built.
  const deferred = [];
  const courses = (...args) => deferred.push(args);
  const layCourses = (role, m, span, from, to, step, broken = false) => {
    const cut = holes.get(m) ?? [];
    for (let v = from; v < to - 0.04; v += step) {
      const [u0, u1] = span(v), runs = [];
      let start = u0;
      for (const [a, b] of cut.filter(([, , low, high]) => v > low - 0.04 && v < high + 0.04).sort((p, q) => p[0] - q[0])) {
        if (a > start) runs.push([start, Math.min(a, u1)]);
        start = Math.max(start, b);
      }
      if (start < u1) runs.push([start, u1]);
      for (const [a, b] of runs) {
        if (!broken) {
          if (b - a > 0.1) box(role, m, [(a + b) / 2, v, 0.012], [b - a, 0.035, 0.024]);
          continue;
        }
        for (let u = a; u < b - 0.06;) {
          const width = Math.min(b - u, 0.1 + rand() * 0.25);
          box(role, m, [u + width / 2, v + jitter(0.012), 0.014 + jitter(0.006)], [width - 0.012, 0.05, 0.028]);
          u += width;
        }
      }
    }
  };
  // Boards gone from a wall: dark gaps a course or three high, the odd board
  // still hanging from a nail at the gap's corner. Where a gap would open is
  // drawn whether it opens or not.
  const gaps = (m, u0, u1, v0, v1, count, role) => {
    for (let i = 0; i < count; i += 1) {
      const pu = fate(), pv = fate(), size = fate(), hit = wound(0.9);
      const w = Math.min(u1 - u0 - 0.1, 0.45 + size * 1.1), h = 0.22 * (1 + Math.floor(size * 2.99));
      if (!hit || w < 0.3) continue;
      const u = u0 + w / 2 + pu * (u1 - u0 - w), v = v0 + h / 2 + pv * Math.max(0, v1 - v0 - h);
      box('void', m, [u, v, 0.0135], [w, h, 0.027]);
      if (hit.kind < 0.6) {
        const swing = 0.3 + 0.6 * hit.amount, length = w * 0.85;
        box(role, m, [u - w / 2 + (length / 2) * Math.cos(swing), v + h / 2 - 0.1 - (length / 2) * Math.sin(swing), 0.04], [length, 0.2, 0.02], [0, 0, -swing]);
      }
    }
  };
  // Shingles blown off in patches; the worst are holes with the rafters across.
  const roofWounds = (plane, outline, thickness, count) => {
    const vs = outline.map(([, v]) => v), top = Math.min(...vs), bottom = Math.max(...vs);
    for (let i = 0; i < count; i += 1) {
      const pu = fate(), pv = fate(), size = fate(), hit = wound(0.8);
      const w = 0.5 + size * 1.1, h = 0.35 + size * 0.5;
      const v = top + 0.3 + h / 2 + pv * Math.max(0, bottom - top - 0.6 - h);
      const spans = [v - h / 2, v, v + h / 2].map((at) => spanAt(outline, at));
      const lo = Math.max(...spans.map(([a]) => a)) + 0.15, hi = Math.min(...spans.map(([, b]) => b)) - 0.15;
      if (!hit || hi - lo < w) continue;
      const u = lo + w / 2 + pu * (hi - lo - w), hole = hit.kind < damage * 0.7;
      box(hole ? 'void' : 'wood', plane.m, [u, v, thickness + 0.016], [w, h, 0.034]);
      if (hole) for (const k of [-1, 1]) box('wood', plane.m, [u + (k * w) / 4, v, thickness + 0.04], [0.07, h + 0.24, 0.05]);
    }
  };
  // Planks fallen on the sand.
  const litter = (count, x0, x1, z0, z1) => only('near', () => {
    for (let i = 0; i < count; i += 1) {
      const px = fate(), pz = fate(), yaw = fate(), size = fate(), hit = wound(0.9);
      if (!hit) continue;
      const length = 0.7 + size * 1.5, tilt = (hit.amount - 0.5) * 0.06;
      const role = ['wood', 'deck', 'siding', 'trim'][Math.floor(hit.kind * 3.999)];
      box(role, WORLD, [x0 + px * (x1 - x0), 0.017 + (Math.abs(tilt) * length) / 2, z0 + pz * (z1 - z0)], [length, 0.03, 0.12 + 0.1 * size], [0, yaw * Math.PI, tilt]);
    }
  });
  // Merge per finish, near and far; a sagging building is cut short where
  // it bends (`bends`, a test on a vertex) and bent by `warp`.
  const build = (warp = null, bends = null, maxEdge = 1.5) => {
    only('near', () => deferred.splice(0).forEach((args) => layCourses(...args)));
    return { parts: merge(parts, warp, bends, maxEdge), far: merge(farParts, warp, bends, maxEdge * 2) };
  };
  const merge = (set, warp, bends, maxEdge) => new Map([...set].map(([role, list]) => {
    let merged = mergeGeometries(list, false);
    list.forEach((geometry) => geometry.dispose());
    if (warp) {
      const cut = tessellate(merged, maxEdge, bends);
      merged.dispose();
      merged = cut;
      const position = merged.attributes.position, point = new THREE.Vector3();
      for (let i = 0; i < position.count; i += 1) {
        warp(point.fromBufferAttribute(position, i));
        position.setXYZ(i, point.x, point.y, point.z);
      }
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return [role, merged];
  }));
  return { box, panel, beam, stick, rope, corrugated, roof, courses, hole, gaps, roofWounds, litter, jitter, wound, chance: fate, only, build };
}

// Openings, built as a carpenter builds them. A window: a sill with a nose,
// tipped to shed rain, on an apron; side casings; a head casing under a drip
// cap; and set back inside them two sashes, the lower proud of the upper so
// their meeting rails overlap, each with its glazing bars; the glass — a room
// behind it — sits back in the shade of it all. What the diorama hangs in
// them: blinds half down (inside, in the room's light), boards nailed across,
// a louvred Bahama shutter propped open over the glass; an attic vent has
// louvres instead of glass. Damage cracks a pane (a shard left in its
// corner), boards a window up, lets a shutter hang from one hinge, swings a
// door ajar. Each opening keeps the wall's courses off it, tucked 2 cm under
// its casing. `floors`: the storeys' floor heights in the wall's v.
const CASING = 0.1, CASING_PROUD = 0.065;
function openings(kit, floors = [0]) {
  const { box, beam, panel, jitter, wound } = kit;
  // Side casings up to a head casing, a drip cap over it; for a window a
  // nosed sill (`sill`) on an apron. Returns the head's top.
  const casing = (m, u, v0, w, h, sill = true) => {
    const outer = w / 2 + CASING;
    for (const s of [-1, 1]) box('trim', m, [u + s * (w / 2 + CASING / 2), v0 + h / 2 + 0.01, CASING_PROUD / 2], [CASING, h + 0.02, CASING_PROUD]);
    box('trim', m, [u, v0 + h + 0.08, CASING_PROUD / 2], [2 * outer + 0.04, 0.14, CASING_PROUD]);
    kit.only('near', () => box('trim', m, [u, v0 + h + 0.162, CASING_PROUD / 2 + 0.012], [2 * outer + 0.08, 0.024, CASING_PROUD + 0.024]));
    if (sill) {
      box('trim', m, [u, v0 - 0.022, 0.065], [2 * outer + 0.1, 0.044, 0.13], [0.07, 0, 0]);
      kit.only('near', () => box('trim', m, [u, v0 - 0.11, 0.018], [2 * outer - 0.04, 0.1, 0.036]));
    }
    kit.hole(m, u - outer + 0.02, u + outer - 0.02, sill ? v0 - 0.14 : 0, v0 + h + 0.15);
    return v0 + h + 0.174;
  };
  // A sash: stiles, a top and a bottom rail, glazing bars `cols` × `rows`.
  const sashFrame = (...args) => kit.only('near', () => sashBars(...args));
  const sashBars = (m, u, bottom, w, h, depth, [cols, rows], bottomRail, topRail) => {
    const stile = 0.045, t = 0.022, inner = w - 2 * stile, clear = h - topRail - bottomRail;
    for (const s of [-1, 1]) box('trim', m, [u + s * (w / 2 - stile / 2), bottom + h / 2, depth], [stile, h, t]);
    box('trim', m, [u, bottom + h - topRail / 2, depth], [inner, topRail, t]);
    box('trim', m, [u, bottom + bottomRail / 2, depth], [inner, bottomRail, t]);
    for (let c = 1; c < cols; c += 1) box('trim', m, [u - inner / 2 + (inner * c) / cols, bottom + bottomRail + clear / 2, depth - 0.002], [0.018, clear, 0.016]);
    for (let r = 1; r < rows; r += 1) box('trim', m, [u, bottom + bottomRail + (clear * r) / rows, depth - 0.002], [inner, 0.018, 0.016]);
  };
  const shutter = (m, u, v0, w, h) => {
    const loose = wound(0.45);
    const tilt = loose ? 0.22 : 0.6, spin = loose ? -(0.25 + 0.4 * loose.amount) : 0;
    const width = w + 0.16, height = h + 0.12, hingeU = u - width / 2, hingeV = v0 + h + 0.13;
    // A point of the panel, `x` across from its left hinge and `s` down it.
    const at = (x, s, out = 0) => {
      const du = x * Math.cos(spin) + s * Math.sin(spin), below = s * Math.cos(spin) - x * Math.sin(spin);
      return [hingeU + du, hingeV - below * Math.cos(tilt) + out * Math.sin(tilt), 0.095 + below * Math.sin(tilt) + out * Math.cos(tilt)];
    };
    box('awning', m, at(width / 2, height / 2), [width, height, 0.04], [-tilt, 0, spin]);
    kit.only('near', () => {
      for (let k = 0; k < 6; k += 1) box('awning', m, at(width / 2, (height * (k + 0.5)) / 6, 0.03), [width - 0.06, 0.05, 0.028], [-tilt - 0.4, 0, spin]);
    });
    if (loose) return;
    for (const [x, s] of [[0.1, -1], [width - 0.1, 1]]) {
      beam('trim', vec(...at(x, height - 0.05)).applyMatrix4(m), vec(u + s * (w / 2 + 0.06), v0 + 0.1, CASING_PROUD).applyMatrix4(m), 0.025, 0.025);
    }
  };
  const sash = (m, u, v0, w, h, look = 'plain') => {
    casing(m, u, v0, w, h);
    const hit = wound(0.4), nudge = [jitter(0.04), jitter(0.04), jitter(0.04)];
    if (look === 'attic') {
      // Louvres, dark glass behind them (no room: it is the attic).
      box('glass', m, [u, v0 + h / 2, 0.006], [w, h, 0.012]);
      kit.only('near', () => {
        for (let k = 0; k < 6; k += 1) box('trim', m, [u, v0 + (h * (k + 0.5)) / 6, 0.03], [w, 0.07, 0.012], [-0.7, 0, 0]);
      });
      return;
    }
    const broken = Boolean(hit) && hit.kind < 0.55, boarded = look === 'boarded' || (Boolean(hit) && !broken);
    // A room behind the glass, its floor the storey's below the pane.
    const floor = floors.filter((level) => level <= v0).at(-1) ?? 0;
    const room = { layout: 9, uv: 'pane', scale: encodeRoom(w / 2, v0 + h / 2 - floor, look === 'blinds' ? 1 : 0) };
    if (broken) {
      box('void', m, [u, v0 + h / 2, 0.006], [w, h, 0.008]);
      const a = 0.3 + 0.4 * hit.amount;
      panel('glass', m, [[u - w / 2, v0 + h], [u - w / 2 + w * a, v0 + h], [u - w / 2, v0 + h * (1 - a)]], 0.004, 0.008);
    } else box('glass', m, [u, v0 + h / 2, 0.006], [w, h, 0.008], [], room);
    // Double-hung: the upper sash at the back, the lower one proud of it.
    const bars = w < 0.6 ? [2, 2] : [2, 1], half = h / 2;
    sashFrame(m, u, v0 + half - 0.02, w, half + 0.02, 0.024, bars, 0.035, 0.045);
    sashFrame(m, u, v0, w, half + 0.02, 0.047, bars, 0.07, 0.035);
    if (boarded) {
      [[0.22, 0.1], [0.5, -0.07], [0.8, 0.13]].forEach(([at, tilt], i) => {
        box('door', m, [u + nudge[i], v0 + h * at, 0.095], [w + 0.3, 0.15, 0.03], [0, 0, tilt]);
      });
    }
    if (look === 'shutter') shutter(m, u, v0, w, h);
  };
  // A door hung on its left edge, in the same casing and a threshold under
  // it; damage swings it out on the hinge and shows the dark behind. Returns
  // the leaf's frame (on the hinge, u across the leaf) for battens and the like.
  const door = (m, u, w, h, role = 'door', casingRole = 'trim', weight = 0.2) => {
    if (casingRole === 'trim') {
      casing(m, u, 0, w, h, false);
      box('trim', m, [u, 0.012, 0.05], [w + 0.04, 0.024, 0.1]);
    } else {
      box(casingRole, m, [u, h + 0.05, 0.03], [w + 0.22, 0.1, 0.06]);
      for (const s of [-1, 1]) box(casingRole, m, [u + s * (w / 2 + 0.05), h / 2, 0.03], [0.1, h, 0.06]);
      kit.hole(m, u - w / 2 - 0.08, u + w / 2 + 0.08, 0, h + 0.08);
    }
    const hit = wound(weight), swing = hit ? 0.35 + 0.6 * hit.amount : 0;
    if (hit) box('void', m, [u, h / 2, 0.0135], [w, h, 0.027]);
    const leaf = m.clone().multiply(new THREE.Matrix4().makeTranslation(u - w / 2, 0, 0.025)).multiply(new THREE.Matrix4().makeRotationY(-swing));
    box(role, leaf, [w / 2, h / 2, 0], [w, h, 0.05], [], { layout: 3, uv: 'wall' });
    box('unit', leaf, [w - 0.1, 1.0, 0.045], [0.04, 0.14, 0.05]);
    return leaf;
  };
  // A doorway left open, its door swung in out of sight: the threshold, the
  // casing and the room beyond. It draws its fate as a door would, so the
  // rest of the building's damage stays where it was.
  const doorway = (m, u, w, h) => {
    casing(m, u, 0, w, h, false);
    box('trim', m, [u, 0.012, 0.05], [w + 0.04, 0.024, 0.1]);
    wound(0.2);
    box('void', m, [u, h / 2, 0.006], [w, h, 0.008], [], { layout: 9, uv: 'pane', scale: encodeRoom(w / 2, h / 2, 0) });
  };
  return { sash, door, doorway };
}

const WALL = 0.16; // wall thickness
const SECOND = 2.75; // the upper floor above the ground floor
const EAVES = 5.05; // top of the side walls above the floor
const POST = 0.12, POST_HEIGHT = 2.4, HEADER = 0.18; // porch posts and the beam on them
const RAIL = 0.95; // top of the rail above the boards
const MAX_RISE = 0.19, RUN = 0.28, STAIR_WIDTH = 1.1;
const STILT = 0.18, STILT_SPACING = 2.2;
const RIM = 0.26; // the band board round a floor
const DECK = 0.035; // board thickness
const ROOF = 0.16, EAVE_OUT = 0.45, RAKE_OUT = 0.35;
const PORCH_ROOF = 0.12, PORCH_PITCH = THREE.MathUtils.degToRad(16), UPPER_SILL = SECOND + 0.85;

export function buildBeachHouse(input = {}) {
  const p = normalizeHouse(input);
  const { houseWidth: W, houseLength: L, floorHeight: F, porchDepth: P } = p;
  const pitch = THREE.MathUtils.degToRad(p.roofPitch);
  const kit = createKit(p.seed, p.damage);
  const { box, panel, beam, stick, jitter, wound } = kit;
  const open = openings(kit, [0, SECOND, EAVES]);
  // A rail to lean on: a bottom rail on blocks clear of the boards, three
  // slats of a few widths, none quite level, a sub-rail and over it a wide
  // flat cap — room for elbows and a bottle.
  const railLow = 0.12, railSub = RAIL - 0.09;
  // The rail in section, for what leans on it: [from, to, half its depth]
  // above the boards, the post line at 0.
  const railSection = [[0, railLow + 0.035, 0.025], [railLow + 0.035, railSub - 0.035, 0.0125], [railSub - 0.035, railSub + 0.035, 0.03], [RAIL - 0.036, RAIL, 0.08]];
  const rail = (a, b, postAtA = true, postAtB = true) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const start = postAtA ? POST / 2 : 0, end = length - (postAtB ? POST / 2 : 0);
    if (end - start < 0.25) return;
    const at = (s, y) => vec(a[0] + (dx / length) * s, y, a[1] + (dz / length) * s);
    kit.only('far', () => beam('trim', at(start, F + (railLow + railSub) / 2), at(end, F + (railLow + railSub) / 2), 0.03, railSub - railLow + 0.07));
    kit.only('near', () => railBars(at, start, end));
    stick('trim', at(start, F + RAIL - 0.018), at(end, F + RAIL - 0.018), 0.16, 0.036, 0.04, F + 0.05);
  };
  const railBars = (at, start, end) => {
    stick('trim', at(start, F + railLow), at(end, F + railLow), 0.05, 0.07, 0.1, F + 0.05);
    for (let s = start + 0.25; s < end - 0.15; s += 0.6) box('trim', WORLD, at(s, F + 0.043).toArray(), [0.05, 0.086, 0.05]);
    stick('trim', at(start, F + railSub), at(end, F + railSub), 0.06, 0.07, 0.08, F + 0.05);
    const widths = [0.1 + jitter(0.025), 0.1 + jitter(0.025), 0.1 + jitter(0.025)];
    const top = railSub - 0.035, bottom = railLow + 0.035, gap = (top - bottom - widths.reduce((sum, w) => sum + w, 0)) / 4;
    let y = bottom + gap;
    for (const width of widths) {
      const lift = jitter(0.008), tilt = jitter(0.008);
      stick('trim', at(start, F + y + width / 2 + lift - tilt), at(end, F + y + width / 2 + lift + tilt), 0.025, width, 0.3, F + 0.05);
      y += width + gap;
    }
  };

  // Where things are. The side porch wraps round the right corner; the lean-to
  // sits on the left wall towards the back; the stairs leave the porch's left
  // end and run down towards −X.
  const wrapBack = L / 2 - Math.min(3.2, L * 0.4);
  const annex = { x0: -W / 2 - 2.6, x1: -W / 2, z0: -L / 2 + 0.7, z1: -L / 2 + 3.7 };
  const frontPostZ = L / 2 + P - POST / 2, sidePostX = W / 2 + P - POST / 2;
  const stairZ1 = frontPostZ + 0.025, stairZ0 = stairZ1 - STAIR_WIDTH;
  const risers = Math.ceil(F / MAX_RISE - 1e-9), rise = F / risers, treads = risers - 1;
  const stairTop = -W / 2, stairFoot = stairTop - treads * RUN;

  // Under the floors: stilts on a grid, outer faces flush with the edge; a
  // band board round each floor; planks across the stilts below it.
  const stilts = (x0, x1, z0, z1) => {
    const top = F - DECK - 0.02;
    for (const x of spread(x0 + STILT / 2, x1 - STILT / 2, STILT_SPACING)) {
      for (const z of spread(z0 + STILT / 2, z1 - STILT / 2, STILT_SPACING)) {
        const jx = jitter(0.02), jz = jitter(0.02), rx = jitter(0.01), rz = jitter(0.01), hit = wound(0.5);
        const lean = hit ? [(hit.kind - 0.5) * 0.12, (hit.amount - 0.5) * 0.12] : [0, 0];
        box('wood', WORLD, [x + jx, top / 2, z + jz], [STILT, top, STILT], [rx + lean[0], 0, rz + lean[1]]);
      }
    }
  };
  const band = (x0, x1, z0, z1) => {
    const y = F - DECK - RIM / 2;
    box('wood', WORLD, [(x0 + x1) / 2, y, z1 - 0.025], [x1 - x0, RIM, 0.05]);
    box('wood', WORLD, [(x0 + x1) / 2, y, z0 + 0.025], [x1 - x0, RIM, 0.05]);
    box('wood', WORLD, [x1 - 0.025, y, (z0 + z1) / 2], [0.05, RIM, z1 - z0]);
    box('wood', WORLD, [x0 + 0.025, y, (z0 + z1) / 2], [0.05, RIM, z1 - z0]);
  };
  const skirtRows = [];
  for (let y = 0.28; y < F - DECK - RIM - 0.18; y += 0.34) skirtRows.push(y);
  const skirt = (a, b, [nx, nz]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), ex = (dx / length) * 0.02, ez = (dz / length) * 0.02;
    for (const y of skirtRows) {
      const lift = jitter(0.02), tilt = jitter(0.012) * length;
      const from = vec(a[0] + nx * 0.02 - ex, y + lift, a[1] + nz * 0.02 - ez), to = vec(b[0] + nx * 0.02 + ex, y + lift + tilt, b[1] + nz * 0.02 + ez);
      stick('wood', from, to, 0.03, 0.2, 0.3);
    }
  };
  // The porch's outer face in section, for what leans on it from the sand:
  // [from, to, how far proud of the band] — the skirt boards, the band, the
  // nosing of the boards, the rail back on the post line.
  const porchFace = [
    ...skirtRows.map((y) => [y - 0.12, y + 0.12, 0.035]), [F - DECK - RIM, F - DECK, 0], [F - DECK, F, 0.03],
    ...railSection.map(([a, b, d]) => [F + a, F + b, d - POST / 2]),
  ];
  // A white lattice between the stilts, `length` wide, on a frame at the sand.
  const lattice = (m, length) => {
    const bottom = 0.08, top = F - DECK - RIM - 0.02, half = length / 2, step = 0.3;
    if (top - bottom < 0.2) return;
    kit.only('far', () => box('trim', m, [0, (bottom + top) / 2, 0.018], [length, top - bottom, 0.012]));
    kit.only('near', () => latticeStrips(m, half, bottom, top, step));
    for (const v of [bottom, top]) box('trim', m, [0, v, 0.03], [length, 0.07, 0.03]);
  };
  const latticeStrips = (m, half, bottom, top, step) => {
    for (const dir of [1, -1]) {
      for (let c = -half - (top - bottom); c < half + (top - bottom); c += step) {
        // The line u = c + dir·(v − bottom), clipped to the rectangle.
        const v0 = Math.max(bottom, bottom + (dir > 0 ? -half - c : c - half));
        const v1 = Math.min(top, bottom + (dir > 0 ? half - c : c + half));
        if (v1 - v0 < 0.04 || wound(0.28)) continue;
        const u0 = c + dir * (v0 - bottom), u1 = c + dir * (v1 - bottom);
        box('trim', m, [(u0 + u1) / 2, (v0 + v1) / 2, 0.01 + (dir > 0 ? 0 : 0.016)], [Math.hypot(u1 - u0, v1 - v0), 0.045, 0.014], [0, 0, (dir * Math.PI) / 4]);
      }
    }
  };

  // The house's floor and the porch's. The porch's inner edge rests on the
  // house's own stilts.
  box('wood', WORLD, [0, F - RIM / 2, 0], [W, RIM, L]);
  stilts(-W / 2, W / 2, -L / 2, L / 2);
  stilts(-W / 2, W / 2 + P, L / 2 + 0.9, L / 2 + P);
  stilts(W / 2 + 0.9, W / 2 + P, wrapBack, L / 2);
  band(-W / 2, W / 2 + P, L / 2, L / 2 + P);
  band(W / 2, W / 2 + P, wrapBack, L / 2);
  // Porch boards run out from the wall a finger's gap apart, of a few widths,
  // none quite alike, their ends nosed 3 cm over the band.
  const boards = (x0, x1, z0, z1, alongZ) => {
    kit.only('far', () => box('deck', WORLD, [(x0 + x1 + (alongZ ? 0 : 0.03)) / 2, F - DECK / 2, (z0 + z1 + (alongZ ? 0.03 : 0)) / 2], [x1 - x0 + (alongZ ? 0 : 0.03), DECK, z1 - z0 + (alongZ ? 0.03 : 0)]));
    kit.only('near', () => deckBoards(x0, x1, z0, z1, alongZ));
  };
  const deckBoards = (x0, x1, z0, z1, alongZ) => {
    const first = alongZ ? x0 : z0, last = alongZ ? x1 : z1;
    for (let c = first; c < last - 0.04;) {
      const width = Math.min(last - c, 0.13 + jitter(0.03)), y = F - DECK / 2 + jitter(0.004), short = Math.abs(jitter(0.03)) / 2, mid = c + width / 2;
      const from = alongZ ? vec(mid, y, z0 + short) : vec(x0 + short, y, mid), to = alongZ ? vec(mid, y, z1 + 0.03 - short) : vec(x1 + 0.03 - short, y, mid);
      stick('deck', from, to, width - 0.01, DECK, 0.3);
      c += width;
    }
  };
  boards(-W / 2, W / 2 + P, L / 2, L / 2 + P, true);
  boards(W / 2, W / 2 + P, wrapBack, L / 2, false);
  skirt([-W / 2, -L / 2], [W / 2, -L / 2], [0, -1]);
  skirt([W / 2, -L / 2], [W / 2, wrapBack], [1, 0]);
  skirt([W / 2, wrapBack], [W / 2 + P, wrapBack], [0, -1]);
  skirt([W / 2 + P, wrapBack], [W / 2 + P, L / 2 + P], [1, 0]);
  skirt([W / 2 + P, L / 2 + P], [-W / 2, L / 2 + P], [0, 1]);
  skirt([-W / 2, stairZ0 - 0.05], [-W / 2, annex.z1], [-1, 0]);
  skirt([-W / 2, annex.z0], [-W / 2, -L / 2], [-1, 0]);

  // Walls: gable ends front and back, the long walls under the eaves, a shadow
  // line every clapboard, white corner boards, the band at the upper floor.
  const front = wallFrame(0, F, L / 2, 0, 1);
  const back = wallFrame(0, F, -L / 2, 0, -1);
  const right = wallFrame(W / 2, F, 0, 1, 0); // u runs to the back
  const left = wallFrame(-W / 2, F, 0, -1, 0); // u runs to the front
  const tan = Math.tan(pitch), apex = EAVES + (W / 2) * tan;
  const gable = [[-W / 2, 0], [W / 2, 0], [W / 2, EAVES], [0, apex], [-W / 2, EAVES]];
  const gableSpan = (v) => {
    const half = (v <= EAVES ? W / 2 : W / 2 - (v - EAVES) / tan) - 0.08;
    return [-half, half];
  };
  for (const m of [front, back]) {
    panel('siding', m, gable, WALL, -WALL, { layout: 1 });
    kit.courses('siding', m, gableSpan, 0.22, apex - 0.1, 0.22);
  }
  for (const m of [right, left]) {
    box('siding', m, [0, EAVES / 2, -WALL / 2], [L, EAVES, WALL], [], { layout: 1, uv: 'wall' });
    kit.courses('siding', m, () => [-L / 2 + 0.08, L / 2 - 0.08], 0.22, EAVES, 0.22);
  }
  for (const [m, half] of [[front, W / 2], [back, W / 2], [right, L / 2], [left, L / 2]]) {
    for (const s of [-1, 1]) box('trim', m, [s * (half - 0.04), EAVES / 2, 0.02], [0.16, EAVES + 0.02, 0.04]);
    box('trim', m, [0, SECOND, 0.022], [2 * half, 0.16, 0.044]);
    box('trim', m, [0, 0.07, 0.022], [2 * half, 0.14, 0.044]);
    kit.gaps(m, -half + 0.2, half - 0.2, 0.25, EAVES - 0.25, half > 3.5 ? 4 : 3, 'siding');
  }

  // Doors and windows, wall by wall.
  // The front door stands open; a curtain hangs in it (surfCamp.js).
  const doorU = -W / 2 + 1.25;
  open.doorway(front, doorU, 0.9, 2.05);
  // A lantern on the wall beside the door: bracket, glass, cap.
  const lanternU = doorU + 0.72;
  box('wood', front, [lanternU, 1.84, 0.07], [0.05, 0.05, 0.14]);
  box('lamp', front, [lanternU, 1.78, 0.17], [0.13, 0.2, 0.13]);
  box('roof', front, [lanternU, 1.9, 0.17], [0.17, 0.04, 0.17]);
  const lamps = [vec(lanternU, 1.78, 0.17).applyMatrix4(front)];
  open.sash(front, W / 2 - 1.45, 0.9, 1.0, 1.25, 'blinds');
  for (const s of [-1, 1]) open.sash(front, s * W * 0.19, UPPER_SILL, 0.8, 1.15, 'shutter');
  const vent = (m) => {
    const v0 = EAVES + 0.3, h = 0.5;
    if (W / 2 - (v0 + h + 0.15 - EAVES) / tan > 0.45) open.sash(m, 0, v0, 0.5, h, 'attic');
  };
  vent(front);
  vent(back);
  open.sash(back, 0.9, 0.9, 1.0, 1.25, 'blinds');
  open.sash(back, -1.4, 1.2, 0.6, 0.9);
  open.sash(back, 0, UPPER_SILL, 0.8, 1.15);
  // Right wall: u = −z; the side porch covers u < −wrapBack.
  open.sash(right, -(L / 2 + wrapBack) / 2, 0.9, 1.0, 1.25, 'blinds');
  open.sash(right, -wrapBack + 1.4, 0.9, 1.0, 1.25, 'blinds');
  open.sash(right, L / 2 - 1.3, 0.9, 1.0, 1.25, 'boarded');
  open.sash(right, -L / 2 + 1.6, UPPER_SILL, 0.8, 1.15);
  open.sash(right, 0.9, UPPER_SILL, 0.8, 1.15, 'blinds');
  // Left wall: u = z; the lean-to covers annex.z0…z1 downstairs.
  open.sash(left, (annex.z1 + L / 2) / 2, 0.9, 1.0, 1.25);
  open.sash(left, -L / 2 + 1.5, UPPER_SILL, 0.8, 1.15);
  open.sash(left, L / 2 - 1.6, UPPER_SILL, 0.8, 1.15, 'blinds');
  // The air conditioner high on the right wall, the meter by the lean-to.
  const acU = L / 2 - 0.9, acV = EAVES - 0.95;
  box('unit', right, [acU, acV, 0.19], [0.85, 0.62, 0.34]);
  panel('glass', right, Array.from({ length: 16 }, (_, i) => [acU + 0.14 + 0.2 * Math.cos((i / 16) * Math.PI * 2), acV + 0.2 * Math.sin((i / 16) * Math.PI * 2)]), 0.01, 0.36);
  for (const s of [-1, 1]) box('trim', right, [acU + s * 0.32, acV - 0.34, 0.2], [0.04, 0.05, 0.4]);
  box('unit', left, [annex.z1 + 0.45, 1.3, 0.08], [0.32, 0.46, 0.16]);

  // The main roof: two slabs on the gable walls' slopes, a cap on the ridge,
  // white boards along the eaves and the rakes.
  const cos = Math.cos(pitch), ridgeY = F + apex;
  for (const s of [1, -1]) {
    const plane = roofPlane(vec(0, ridgeY, 0), s, 0, pitch);
    const outline = [[0, -L / 2 - RAKE_OUT], [s * (W / 2 + EAVE_OUT), -L / 2 - RAKE_OUT], [s * (W / 2 + EAVE_OUT), L / 2 + RAKE_OUT], [0, L / 2 + RAKE_OUT]].map(plane.plan);
    kit.roof('roof', plane, outline, ROOF, 0.32);
    kit.roofWounds(plane, outline, ROOF, 3);
    const slopeLength = (W / 2 + EAVE_OUT) / cos;
    for (const e of [-1, 1]) box('trim', plane.m, [e * (L / 2 + RAKE_OUT + 0.02), slopeLength / 2, ROOF - 0.1], [0.04, slopeLength + 0.02, 0.24]);
    box('trim', plane.m, [0, slopeLength + 0.02, ROOF - 0.1], [L + 2 * RAKE_OUT + 0.08, 0.04, 0.24]);
  }
  box('roof', WORLD, [0, ridgeY + ROOF / cos + 0.02, 0], [0.34, 0.08, L + 2 * RAKE_OUT]);

  // The porch: posts on the outer edge, a beam on them, a lean-to roof that
  // turns the corner with a hip, rails with three white slats.
  const frontPosts = spread(-W / 2 + POST / 2, sidePostX, 2.6).map((x) => [x, frontPostZ]);
  const sidePosts = spread(frontPostZ, wrapBack + POST / 2, 2.6).slice(1).map((z) => [sidePostX, z]);
  // Each post on a plinth, a band under the beam; knee braces from the posts
  // up to the beam along it, wherever there is beam to reach.
  for (const [x, z] of [...frontPosts, ...sidePosts]) {
    const hit = wound(0.6);
    box('trim', WORLD, [x, F + POST_HEIGHT / 2, z], [POST, POST_HEIGHT, POST], hit ? [(hit.kind - 0.5) * 0.08, 0, (hit.amount - 0.5) * 0.08] : []);
    box('trim', WORLD, [x, F + 0.07, z], [POST + 0.05, 0.14, POST + 0.05]);
    box('trim', WORLD, [x, F + POST_HEIGHT - 0.09, z], [POST + 0.04, 0.05, POST + 0.04]);
  }
  const brace = ([x, z], dx, dz) => kit.only('near', () => stick('trim', vec(x + (dx * POST) / 2, F + POST_HEIGHT - 0.5, z + (dz * POST) / 2), vec(x + dx * 0.45, F + POST_HEIGHT - 0.01, z + dz * 0.45), 0.06, 0.07, 0.15, F + 0.05));
  frontPosts.forEach((post, i) => {
    if (i > 0) brace(post, -1, 0);
    if (i < frontPosts.length - 1) brace(post, 1, 0);
  });
  [frontPosts.at(-1), ...sidePosts].forEach((post, j, list) => {
    if (j > 0) brace(post, 0, 1);
    if (j < list.length - 1) brace(post, 0, -1);
  });
  const headerY = F + POST_HEIGHT + HEADER / 2;
  box('trim', WORLD, [(-W / 2 + W / 2 + P) / 2, headerY, frontPostZ], [W + P, HEADER, POST + 0.02]);
  box('trim', WORLD, [sidePostX, headerY, (wrapBack + L / 2 + P) / 2], [POST + 0.02, HEADER, L / 2 + P - wrapBack]);
  frontPosts.slice(1).forEach((post, i) => rail(frontPosts[i], post));
  sidePosts.forEach((post, i) => rail(i ? sidePosts[i - 1] : frontPosts.at(-1), post));
  rail(sidePosts.at(-1) ?? frontPosts.at(-1), [W / 2 + 0.02, wrapBack + POST / 2], true, false);
  const newel = [-W / 2 + POST / 2, stairZ0 + 0.025];
  box('trim', WORLD, [newel[0], F + (RAIL + 0.1) / 2, newel[1]], [POST, RAIL + 0.1, POST]);
  rail(newel, [-W / 2 + POST / 2, L / 2 + 0.02], true, false);
  // The roof meets the wall below the upper sills: a deep porch flattens it.
  const postLine = P - POST / 2;
  const porchPitch = Math.min(PORCH_PITCH, Math.atan((UPPER_SILL - 0.4 - POST_HEIGHT - HEADER) / postLine));
  const porchTan = Math.tan(porchPitch), porchHigh = F + POST_HEIGHT + HEADER + postLine * porchTan;
  const reach = P + 0.3;
  const frontRoof = roofPlane(vec(0, porchHigh, L / 2), 0, 1, porchPitch);
  const frontOutline = [[-W / 2 - 0.35, L / 2], [W / 2, L / 2], [W / 2 + reach, L / 2 + reach], [-W / 2 - 0.35, L / 2 + reach]].map(frontRoof.plan);
  kit.roof('roof', frontRoof, frontOutline, PORCH_ROOF, 0.3);
  kit.roofWounds(frontRoof, frontOutline, PORCH_ROOF, 2);
  const sideRoof = roofPlane(vec(W / 2, porchHigh, 0), 1, 0, porchPitch);
  const sideOutline = [[W / 2, L / 2], [W / 2 + reach, L / 2 + reach], [W / 2 + reach, wrapBack - 0.3], [W / 2, wrapBack - 0.3]].map(sideRoof.plan);
  kit.roof('roof', sideRoof, sideOutline, PORCH_ROOF, 0.3);
  kit.roofWounds(sideRoof, sideOutline, PORCH_ROOF, 1);
  // Festoon lights under the porch roof: a zig-zag from a post, up to the wall
  // under the roof, down to the next post, round the corner and along the
  // side; nowhere lower than 2.2 m over the boards.
  const hung = POST_HEIGHT - 0.06, underRoof = porchHigh - F - 0.1, garlands = [];
  const zigzag = (posts, wall) => posts.slice(1).forEach(([x1, z1], i) => {
    const [x0, z0] = posts[i], mid = wall(x0, z0, x1, z1);
    garlands.push({ a: [x0, F + hung, z0], b: [mid[0], F + underRoof, mid[1]], sag: 0.07 }, { a: [mid[0], F + underRoof, mid[1]], b: [x1, F + hung, z1], sag: 0.07 });
  });
  zigzag(frontPosts, (x0, z0, x1) => [(x0 + x1) / 2, L / 2 + 0.08]);
  zigzag([frontPosts.at(-1), ...sidePosts], (x0, z0, x1, z1) => [W / 2 + 0.08, (z0 + z1) / 2]);
  // And swags on the porch's outer face, post to post, to be seen from the yard.
  const swags = (posts, out) => posts.slice(1).forEach((post, i) => garlands.push({ a: out(posts[i]), b: out(post), sag: 0.1 }));
  swags(frontPosts, ([x, z]) => [x, F + POST_HEIGHT - 0.04, z + POST / 2 + 0.02]);
  swags([frontPosts.at(-1), ...sidePosts], ([x, z]) => [x + POST / 2 + 0.02, F + POST_HEIGHT - 0.04, z]);
  // Where a strand leaves the porch for the yard: the post at the stairs.
  const yardAnchor = vec(-W / 2, F + hung - 0.1, frontPostZ);
  const lip = PORCH_ROOF / Math.cos(porchPitch) + 0.02;
  beam('roof', vec(W / 2, porchHigh + lip, L / 2), vec(W / 2 + reach, porchHigh - reach * porchTan + lip, L / 2 + reach), 0.16, 0.06);
  const porchEave = reach / Math.cos(porchPitch);
  for (const [plane, outline] of [[frontRoof, frontOutline], [sideRoof, sideOutline]]) {
    const [a, b] = spanAt(outline, porchEave - 1e-6);
    box('trim', plane.m, [(a + b) / 2, porchEave + 0.02, PORCH_ROOF - 0.07], [b - a, 0.04, 0.18]);
  }

  // The stairs: closed white stringers, open risers, a rail each side from a
  // newel on the sand to the porch.
  const slope = rise / RUN, climb = Math.atan(slope), zc = (stairZ0 + stairZ1) / 2;
  for (let k = 1; k <= treads; k += 1) {
    const hit = wound(0.2);
    if (hit && hit.kind < 0.45) continue;
    box('trim', WORLD, [stairTop - (k - 0.5) * RUN - 0.015, F - k * rise - 0.02, zc], [RUN + 0.03, 0.04, STAIR_WIDTH - 0.1], hit ? [(hit.amount - 0.5) * 0.3, 0, 0] : []);
  }
  const depth = 0.3 / Math.cos(climb);
  for (const z of [stairZ0 + 0.025, stairZ1 - 0.025]) {
    const side = frame(vec(stairTop, 0, z), vec(-1, 0, 0), Y);
    const top = F - 0.02, lower = Math.max(0.05, top - depth);
    panel('trim', side, [[0, top], [top / slope, 0], [lower / slope, 0], [0, lower]], 0.05, -0.025);
    const footU = treads * RUN + 0.05, footRail = F - footU * slope;
    box('trim', WORLD, [stairTop - footU, (footRail + RAIL + 0.1) / 2, z], [0.1, footRail + RAIL + 0.1, 0.1]);
    for (const [h, size, weight] of [[RAIL - 0.03, [0.13, 0.06], 0.1], [0.62, [0.025, 0.1], 0.3], [0.33, [0.025, 0.1], 0.3]]) {
      stick('trim', vec(stairTop - footU, footRail + h, z), vec(stairTop, F + h, z), size[0], size[1], weight);
    }
  }

  // The lean-to: shakes on three walls, a corrugated roof falling away from
  // the house, a white lattice between its stilts.
  const aw = annex.x1 - annex.x0, ad = annex.z1 - annex.z0, ax = (annex.x0 + annex.x1) / 2, az = (annex.z0 + annex.z1) / 2;
  const leanTo = THREE.MathUtils.degToRad(11), low = 2.5, high = low + aw * Math.tan(leanTo);
  box('wood', WORLD, [ax, F - RIM / 2, az], [aw, RIM, ad]);
  stilts(annex.x0, annex.x1 - 0.9, annex.z0, annex.z1);
  const aFront = wallFrame(ax, F, annex.z1, 0, 1); // u = +x, the house at +aw/2
  const aBack = wallFrame(ax, F, annex.z0, 0, -1); // u = −x, the house at −aw/2
  const aSide = wallFrame(annex.x0, F, az, -1, 0); // u = +z
  const shakeWall = { layout: 2, scale: 0.2 };
  panel('shakes', aFront, [[-aw / 2, 0], [aw / 2, 0], [aw / 2, high], [-aw / 2, low]], WALL, -WALL, shakeWall);
  panel('shakes', aBack, [[-aw / 2, 0], [aw / 2, 0], [aw / 2, low], [-aw / 2, high]], WALL, -WALL, shakeWall);
  box('shakes', aSide, [0, low / 2, -WALL / 2], [ad, low, WALL], [], { ...shakeWall, uv: 'wall' });
  const rise11 = Math.tan(leanTo);
  kit.courses('shakes', aFront, (v) => [v <= low ? -aw / 2 : -aw / 2 + (v - low) / rise11, aw / 2 - 0.02], 0.2, high, 0.17, true);
  kit.courses('shakes', aBack, (v) => [-aw / 2 + 0.02, v <= low ? aw / 2 : aw / 2 - (v - low) / rise11], 0.2, high, 0.17, true);
  kit.courses('shakes', aSide, () => [-ad / 2, ad / 2], 0.2, low, 0.17, true);
  for (const [m, u] of [[aFront, -aw / 2], [aBack, aw / 2], [aSide, -ad / 2], [aSide, ad / 2]]) {
    box('trim', m, [u + (u < 0 ? 0.05 : -0.05), low / 2, 0.02], [0.12, low, 0.04]);
  }
  open.sash(aSide, 0, 0.95, 0.8, 1.0);
  open.sash(aFront, -0.35, 1.0, 0.65, 0.85);
  kit.gaps(aSide, -ad / 2 + 0.2, ad / 2 - 0.2, 0.2, low - 0.2, 2, 'shakes');
  const aRoof = roofPlane(vec(annex.x1, F + high, az), -1, 0, leanTo);
  const [ua, va] = aRoof.plan([annex.x1, annex.z1 + 0.25]);
  const [ub, vb] = aRoof.plan([annex.x0 - 0.35, annex.z0 - 0.25]);
  const [u0, u1] = [Math.min(ua, ub), Math.max(ua, ub)], sheets = Math.ceil((u1 - u0) / 0.95);
  for (let i = 0; i < sheets; i += 1) {
    const width = (u1 - u0) / sheets, du = jitter(0.02), dv = jitter(0.04), spin = jitter(0.015), hit = wound(0.5);
    if (hit && hit.kind < 0.3) continue;
    kit.corrugated('metal', aRoof.m, [u0 + (i + 0.5) * width + du, (va + vb) / 2 + dv], [width + 0.06, vb - va], 0.03 + (i % 2) * 0.012, spin, hit ? 0.06 + 0.14 * hit.amount : 0);
  }
  for (const [m, length] of [[wallFrame(ax, 0, annex.z1, 0, 1), aw], [wallFrame(annex.x0, 0, az, -1, 0), ad], [wallFrame(ax, 0, annex.z0, 0, -1), aw]]) lattice(m, length);

  kit.litter(16, -W / 2 - 2.2, W / 2 + P + 1.8, -L / 2 - 1.8, L / 2 + P + 2.2);

  // Settling, a smooth field over every vertex (long pieces are cut short
  // first so that they bend): the floor sinks towards one corner and the house
  // leans that way, the ridge swaybacks, the porch droops between its posts,
  // most at its outer edge. Nothing moves on the sand line.
  const sink = [kit.chance() < 0.5 ? -1 : 1, kit.chance() < 0.5 ? -1 : 1];
  const porchPosts = [...frontPosts, ...sidePosts], postGap = Math.max(1, frontPosts[1][0] - frontPosts[0][0]);
  const eaveY = F + EAVES, s = p.sag;
  const warp = s > 0 ? (v) => {
    const corner = clamp(((sink[0] * v.x) / (W / 2 + P) + (sink[1] * v.z) / (L / 2 + P) + 2) / 4, 0, 1);
    let drop = 0.22 * clamp(v.y / F, 0, 1) * corner;
    const along = v.z / (L / 2 + RAKE_OUT);
    drop += 0.3 * clamp((v.y - eaveY) / (ridgeY - eaveY), 0, 1) * Math.max(0, 1 - along * along);
    const out = clamp(Math.max(v.z - L / 2, v.x - W / 2) / P, 0, 1);
    if (out > 0) {
      let near = Infinity;
      for (const [x, z] of porchPosts) near = Math.min(near, Math.hypot(v.x - x, v.z - z));
      drop += 0.1 * out * Math.sin((Math.PI / 2) * clamp(near / (postGap / 2), 0, 1)) * clamp((v.y - F + 0.8) / 0.5, 0, 1) * clamp(v.y / F, 0, 1);
    }
    v.x += 0.014 * sink[0] * v.y * s;
    v.y -= s * drop;
  } : null;
  // Only the roof above the eaves and the porch bend; the rest, the walls'
  // own boards and casings too, settles flat.
  const bends = (x, y, z) => y > eaveY + 0.05 || (y > F - 0.85 && (z > L / 2 + 0.12 || x > W / 2 + 0.12));

  const { parts, far } = kit.build(warp, bends);
  const bounds = new THREE.Box3();
  parts.forEach((geometry) => bounds.union(geometry.boundingBox));
  // Points that hang on the house bend with it.
  const bent = (point) => {
    const v = Array.isArray(point) ? vec(...point) : point.clone();
    if (warp) warp(v);
    return v.toArray();
  };
  return {
    parts,
    far,
    bounds,
    plan: {
      ...p,
      lamps: lamps.map(bent),
      garlands: garlands.map(({ a, b, sag }) => ({ a: bent(a), b: bent(b), sag })),
      yardAnchor: bent(yardAnchor),
      floor: F,
      eaves: F + EAVES,
      ridge: bounds.max.y,
      upperSill: F + UPPER_SILL,
      door: { width: 0.9, height: 2.05, rod: bent([doorU, F + 2.02, L / 2 + 0.03]) },
      rail: RAIL,
      porch: {
        depth: P, underBeam: POST_HEIGHT, roofAtWall: porchHigh + PORCH_ROOF / Math.cos(porchPitch), pitch: THREE.MathUtils.radToDeg(porchPitch),
        // Where things lean and hang (surfCamp.js): the posts, the faces in
        // section, the wall between the lantern and the window.
        posts: { front: frontPosts, side: sidePosts, size: POST }, wrapBack, face: porchFace, railSection,
        wall: { z: L / 2 + 0.024, from: lanternU + 0.1, to: W / 2 - 2.07 },
        // The front roof's underside, falling from the wall; the side wall's
        // window under the porch (z of its casing's ends).
        roof: { wall: L / 2, high: porchHigh, fall: porchTan },
        sideWindow: [(L / 2 + wrapBack) / 2 - 0.66, (L / 2 + wrapBack) / 2 + 0.66],
      },
      // A point as the settled house carries it.
      bend: bent,
      stairs: { risers, rise, run: RUN, width: STAIR_WIDTH, top: [stairTop, F, zc], foot: [stairFoot, 0, zc] },
      annex,
      // Where rain runs off and streaks the walls below: the eaves, the band
      // at the upper floor, the upper and the lower sills (houseMaterial.js).
      dripLines: [F + EAVES, F + SECOND - 0.08, F + UPPER_SILL - 0.06, F + 0.84],
    },
  };
}

// The shed: a turquoise board hut on a low deck, a hipped shingle roof that
// runs on over the deck on two posts, rope rails either side of the steps and
// a sheet of corrugated iron thrown on the roof. Its door faces +X.
export function buildBeachShed(input = {}) {
  const { seed, damage, sag } = normalizeHouse(input);
  const kit = createKit(seed + 101, damage);
  const { box, panel, beam, stick, jitter, wound } = kit;
  const open = openings(kit);
  const H = 0.45; // the deck above the sand: three 15 cm steps
  const X0 = -1.75, X1 = 1.75, Z0 = -1.3, Z1 = 1.3; // the deck
  const FRONT = 0.45, WALLS = 2.25; // the hut's front wall; its height above the deck
  const pitch = THREE.MathUtils.degToRad(32), tan = Math.tan(pitch), cos = Math.cos(pitch), T = 0.1;
  const RX0 = X0 - 0.3, RX1 = X1 + 0.3, RZ0 = Z0 - 0.3, RZ1 = Z1 + 0.3; // the roof in plan
  const hip = (RZ1 - RZ0) / 2, ridgeHalf = (RX1 - RX0) / 2 - hip, ridgeY = H + WALLS + Z1 * tan;
  const roofAt = (x, z) => ridgeY - tan * Math.max(Math.abs(z), Math.abs(x) - ridgeHalf, 0);

  // Deck: stubby posts, a band, boards running front to back.
  for (const x of [X0 + 0.08, 0, X1 - 0.08]) for (const z of [Z0 + 0.08, 0, Z1 - 0.08]) box('wood', WORLD, [x, (H - 0.05) / 2, z], [0.14, H - 0.05, 0.14]);
  box('wood', WORLD, [0, H - 0.125, Z1 - 0.02], [X1 - X0, 0.18, 0.04]);
  box('wood', WORLD, [0, H - 0.125, Z0 + 0.02], [X1 - X0, 0.18, 0.04]);
  box('wood', WORLD, [X1 - 0.02, H - 0.125, 0], [0.04, 0.18, Z1 - Z0]);
  box('wood', WORLD, [X0 + 0.02, H - 0.125, 0], [0.04, 0.18, Z1 - Z0]);
  const n = Math.round((Z1 - Z0) / 0.15);
  for (let i = 0; i < n; i += 1) {
    const x = jitter(0.02), y = H - DECK / 2 + jitter(0.004), short = Math.abs(jitter(0.04)) / 2, z = Z0 + ((i + 0.5) * (Z1 - Z0)) / n;
    stick('deck', vec(X0 + short + x, y, z), vec(X1 - short + x, y, z), (Z1 - Z0) / n - 0.012, DECK, 0.3);
  }

  // The hut: a painted box in vertical boards, dark corner posts, the gable
  // over the door closed in. A board gone leaves a dark slot.
  const depth = FRONT - X0, bx = (X0 + FRONT) / 2;
  box('shedWall', WORLD, [bx, H + WALLS / 2, 0], [depth, WALLS, Z1 - Z0], [], { layout: 3, uv: 'wall', scale: 0.1 });
  const faces = [
    [wallFrame(FRONT, H, 0, 1, 0), Z1 - Z0],
    [wallFrame(X0, H, 0, -1, 0), Z1 - Z0],
    [wallFrame(bx, H, Z1, 0, 1), depth],
    [wallFrame(bx, H, Z0, 0, -1), depth],
  ];
  for (const [m, width] of faces) {
    for (let u = -width / 2 + 0.1; u < width / 2 - 0.08; u += 0.15) {
      const nudge = jitter(0.01), hit = wound(0.22);
      kit.only('near', () => box('shedWall', m, [u + nudge, WALLS / 2, 0.01], [0.03, WALLS, 0.02]));
      if (hit && u < width / 2 - 0.2) {
        const tall = WALLS * (0.35 + 0.5 * hit.amount);
        box('void', m, [u + 0.075, tall / 2, 0.012], [0.11, tall, 0.024]);
      }
    }
  }
  for (const x of [X0, FRONT]) for (const z of [Z0, Z1]) box('wood', WORLD, [x, H + WALLS / 2 + 0.01, z], [0.1, WALLS + 0.02, 0.1]);
  panel('shedWall', faces[0][0], [[-Z1, WALLS], [Z1, WALLS], [0, roofAt(FRONT, 0) - H]], 0.1, -0.1, { layout: 3 });
  const stepZ = 0.25;
  // The door (u = −z on the front face): painted boards, a white Z-brace; the
  // years leave it ajar.
  const leaf = open.door(faces[0][0], -stepZ, 0.82, 1.9, 'shedWall', 'wood', 0.6);
  for (const v of [0.3, 1.6]) box('trim', leaf, [0.41, v, 0.031], [0.72, 0.1, 0.024]);
  box('trim', leaf, [0.41, 0.95, 0.031], [Math.hypot(0.62, 1.3), 0.1, 0.022], [0, 0, Math.atan2(1.3, 0.62)]);
  open.sash(faces[2][0], -0.1, 1.15, 0.55, 0.5);

  // The roof: hipped, four slabs, caps on the ridge and the hips; posts and a
  // beam carry it over the deck.
  const panels = [
    [[0, ridgeY, 0], [0, 1], [[RX0, RZ1], [RX1, RZ1], [ridgeHalf, 0], [-ridgeHalf, 0]]],
    [[0, ridgeY, 0], [0, -1], [[RX1, RZ0], [RX0, RZ0], [-ridgeHalf, 0], [ridgeHalf, 0]]],
    [[ridgeHalf, ridgeY, 0], [1, 0], [[RX1, RZ0], [RX1, RZ1], [ridgeHalf, 0]]],
    [[-ridgeHalf, ridgeY, 0], [-1, 0], [[RX0, RZ1], [RX0, RZ0], [-ridgeHalf, 0]]],
  ];
  let rightSlope = null;
  for (const [o, [dx, dz], outline] of panels) {
    const plane = roofPlane(vec(...o), dx, dz, pitch), cut = outline.map(plane.plan);
    kit.roof('shedRoof', plane, cut, T, 0.26);
    kit.roofWounds(plane, cut, T, dz ? 1 : 0);
    if (dz === 1) rightSlope = plane;
  }
  const lip = T / cos + 0.02, eaveY = ridgeY - hip * tan;
  beam('shedRoof', vec(-ridgeHalf, ridgeY + lip, 0), vec(ridgeHalf, ridgeY + lip, 0), 0.16, 0.06);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam('shedRoof', vec(sx * ridgeHalf, ridgeY + lip, 0), vec(sx * RX1, eaveY + lip, sz * RZ1), 0.16, 0.06);
  }
  // Iron thrown on the roof, a little askew; a gale lifts it or takes it.
  const iron = wound(0.5);
  if (!iron || iron.kind >= 0.3) kit.corrugated('metal', rightSlope.m, rightSlope.plan([0, 0.95]), [1.1, 0.9], T + 0.045, 0.12, iron ? 0.1 + 0.25 * iron.amount : 0);

  const postX = X1 - 0.07, headerTop = roofAt(postX, Z1 - 0.07) - 0.03;
  for (const z of [Z0 + 0.07, Z1 - 0.07]) {
    box('wood', WORLD, [postX, (H + headerTop - 0.18) / 2, z], [0.12, headerTop - 0.18 - H, 0.12]);
    box('wood', WORLD, [(FRONT + postX) / 2, headerTop - 0.09, z], [postX - FRONT, 0.18, 0.1]);
  }
  box('wood', WORLD, [postX, headerTop - 0.09, 0], [0.12, 0.18, Z1 - Z0]);
  // A bare bulb on a flex under the beam, over the steps.
  const bulb = vec((FRONT + postX) / 2, headerTop - 0.5, stepZ);
  beam('rope', bulb.clone().setY(headerTop - 0.18), bulb.clone().setY(bulb.y + 0.06), 0.012, 0.012);
  box('lamp', WORLD, bulb.toArray(), [0.07, 0.1, 0.07]);

  // Steps to the door, and rope rails: stubby posts beside the steps, two
  // ropes to the corner posts and along both sides of the deck. A rope that
  // has given way hangs from one post to the boards.
  box('deck', WORLD, [X1 + 0.14, 0.15, stepZ], [0.28, 0.3, 1.0]);
  box('deck', WORLD, [X1 + 0.42, 0.075, stepZ], [0.28, 0.15, 1.0]);
  const stubs = [stepZ - 0.6, stepZ + 0.6];
  for (const z of stubs) box('wood', WORLD, [postX, H + 0.45, z], [0.09, 0.9, 0.09]);
  for (const h of [0.45, 0.82]) {
    const y = H + h;
    const spans = [
      [vec(postX, y, Z0 + 0.07), vec(postX, y, stubs[0])],
      [vec(postX, y, stubs[1]), vec(postX, y, Z1 - 0.07)],
      ...[Z0 + 0.07, Z1 - 0.07].map((z) => [vec(postX, y, z), vec(FRONT + 0.06, y, z)]),
    ];
    for (const [a, b] of spans) {
      const snapped = wound(0.35);
      kit.only('near', () => {
        if (!snapped) kit.rope('rope', a, b);
        else kit.rope('rope', a, a.clone().lerp(b, 0.5 + 0.3 * snapped.amount).setY(H + 0.03));
      });
    }
  }

  kit.litter(5, X0 - 1, X1 + 1.2, Z0 - 1.2, Z1 + 1.2);

  // Settling: the deck end sinks, the hut leans aside, the ridge droops.
  const warp = sag > 0 ? (v) => {
    const up = clamp((v.y - H - WALLS) / (ridgeY - H - WALLS), 0, 1);
    v.y -= sag * (0.12 * clamp(v.y / H, 0, 1) * clamp((v.x - X0) / (X1 - X0), 0, 1) + 0.12 * up * Math.max(0, 1 - (v.x / RX1) ** 2));
    v.z += sag * 0.02 * v.y;
  } : null;

  const { parts, far } = kit.build(warp, (x, y) => y > H + WALLS + 0.05, 1);
  const bounds = new THREE.Box3();
  parts.forEach((geometry) => bounds.union(geometry.boundingBox));
  const bent = (v) => {
    if (warp) warp(v);
    return v.toArray();
  };
  return {
    parts,
    far,
    bounds,
    plan: {
      lamps: [bent(bulb.clone())],
      // The garland from the house ties on at the post nearer the house (−z).
      yardAnchor: bent(vec(postX, headerTop - 0.3, Z0 + 0.02)),
      seed,
      hut: { front: FRONT, back: X0, z0: Z0, z1: Z1, walls: WALLS, door: stepZ, posts: postX, header: headerTop - 0.18, stubs },
      bend: (point) => bent(vec(...point)),
      deck: H, steps: 3, stepRise: H / 3, door: { width: 0.82, height: 1.9 }, eaves: eaveY, ridge: bounds.max.y, dripLines: [H + WALLS, H + 1.1, H + 0.02, 0.3] },
  };
}

export function disposeBuilding(building) {
  building?.parts.forEach((geometry) => geometry.dispose());
  building?.far?.forEach((geometry) => geometry.dispose());
}
