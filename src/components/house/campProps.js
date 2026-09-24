import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIFE_RING, VENDING } from './surfCamp.js';

// The camp's small things as geometry, built once (SurfCampModel.jsx draws
// and moves them): the life ring in its parts, a red Adirondack chair, the
// Bikini Point sign's two plates, what dries on the line, and the cloth of a
// flag and of the curtain in the door as grids moved by the wind each frame.
// Metres; every part's own frame is said where it is built.

const Y = new THREE.Vector3(0, 1, 0);

// A box from `a` to `b` (its length), `width` across and `height` up, the
// width kept level unless `up` says otherwise.
function beam(a, b, width, height, up = Y) {
  const along = new THREE.Vector3().subVectors(b, a), length = along.length();
  along.normalize();
  const across = new THREE.Vector3().crossVectors(up, along);
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  across.normalize();
  const top = new THREE.Vector3().crossVectors(along, across);
  const geometry = new THREE.BoxGeometry(width, height, length);
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(across, top, along).setPosition(a.clone().add(b).multiplyScalar(0.5)));
  return geometry;
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const merge = (parts) => {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false);
  parts.forEach((part) => part.dispose());
  return merged;
};

// The life ring in three parts for three instanced meshes that share the
// poses: its body and its bands (each coloured per ring) and the grab line.
// Eight sectors by turns, a band's middle under each of the four straps.
export function lifeRingParts() {
  const { radius, tube, depth } = LIFE_RING, squash = depth / (2 * tube), out = radius + tube;
  const body = new THREE.TorusGeometry(radius, tube, 10, 32).scale(1, 1, squash).toNonIndexed();
  const split = [[], []], position = body.attributes.position;
  for (let i = 0; i < position.count; i += 3) {
    const x = position.getX(i) + position.getX(i + 1) + position.getX(i + 2), y = position.getY(i) + position.getY(i + 1) + position.getY(i + 2);
    split[Math.floor(Math.atan2(y, x) / (Math.PI / 4) + 8.5) % 2 ? 0 : 1].push(i);
  }
  const pick = (starts) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(body.attributes)) {
      const size = attribute.itemSize, array = new Float32Array(starts.length * 3 * size);
      starts.forEach((start, k) => array.set(attribute.array.subarray(start * size, (start + 3) * size), k * 3 * size));
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    return geometry;
  };
  const [base, bands] = split.map(pick);
  body.dispose();
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2, r = out + 0.006 + 0.035 * Math.abs(Math.sin(2 * a));
    return v(r * Math.cos(a), r * Math.sin(a), 0);
  }), true);
  const straps = [0, 1, 2, 3].map((k) => {
    const a = (k * Math.PI) / 2, cos = Math.cos(a), sin = Math.sin(a);
    const strap = new THREE.TorusGeometry(tube + 0.004, 0.009, 4, 14).scale(1, squash, 1);
    return strap.applyMatrix4(new THREE.Matrix4().makeBasis(v(cos, sin, 0), v(0, 0, 1), v(sin, -cos, 0)).setPosition(radius * cos, radius * sin, 0));
  });
  return { base, bands, line: merge([new THREE.TubeGeometry(path, 96, 0.0065, 5, true), ...straps]) };
}

// A red Adirondack chair facing +z, its feet on y = 0: runners sloping to
// the back, a slatted seat, a fan of back slats, wide flat arms.
export function adirondackGeometry() {
  const parts = [];
  const seatAt = (z) => 0.4 - (0.26 - z) * 0.3; // the runners' top, falling to the back
  for (const s of [-1, 1]) {
    parts.push(beam(v(s * 0.3, 0.03, -0.5), v(s * 0.3, seatAt(0.3) - 0.03, 0.3), 0.035, 0.09));
    parts.push(beam(v(s * 0.325, 0, 0.2), v(s * 0.325, 0.6, 0.2), 0.04, 0.085, v(0, 0, 1)));
    parts.push(beam(v(s * 0.36, 0.615, 0.33), v(s * 0.36, 0.63, -0.45), 0.14, 0.022));
    parts.push(beam(v(s * 0.31, 0.44, -0.4), v(s * 0.34, 0.6, -0.42), 0.04, 0.05));
  }
  for (let k = 0; k < 6; k += 1) {
    const z = 0.27 - k * 0.085, y = seatAt(z) + 0.012;
    parts.push(beam(v(-0.33, y, z), v(0.33, y, z), 0.07, 0.02, v(0, 1, 0.3).normalize()));
  }
  // The back: slats fanning out from the seat's back edge, the middle ones
  // longest, on two rails behind them.
  const foot = (x) => v(x * 0.9, seatAt(-0.2) + 0.02, -0.22);
  for (let k = -3; k <= 3; k += 1) {
    const x = k * 0.075, length = 0.72 + 0.18 * Math.cos((k / 3.4) * (Math.PI / 2));
    const lean = v(x * 0.35, 0.93, -0.36).normalize();
    parts.push(beam(foot(x), foot(x).addScaledVector(lean, length), 0.068, 0.018, v(0, 0, 1)));
  }
  for (const [y, z, w] of [[0.62, -0.35, 0.54], [0.92, -0.47, 0.62]]) parts.push(beam(v(-w / 2, y, z - 0.02), v(w / 2, y, z - 0.02), 0.05, 0.022, v(0, 0.36, 0.93).normalize()));
  return merge(parts);
}

// The Bikini Point sign's plates, cut like the two halves of a bikini, their
// fronts facing +z: `bikini` the top, hung by its two straps (the straps'
// tops at y = 0 on the arm), `point` the briefs, fixed by its top right
// corner (at the origin) to the post. Each with its plate and its face (the
// shape again, a millimetre proud, lettered by a texture in the shape's own
// metres: uv = (x, y)), front and back.
const BRA = new THREE.Shape()
  .moveTo(-0.38, 0).lineTo(0.38, 0).lineTo(0.36, 0.1)
  .quadraticCurveTo(0.33, 0.27, 0.17, 0.28).quadraticCurveTo(0.04, 0.27, 0, 0.19)
  .quadraticCurveTo(-0.04, 0.27, -0.17, 0.28).quadraticCurveTo(-0.33, 0.27, -0.36, 0.1)
  .closePath();
const BRIEFS = new THREE.Shape()
  .moveTo(-0.35, 0).lineTo(0.35, 0).lineTo(0.35, -0.08)
  .quadraticCurveTo(0.12, -0.12, 0.06, -0.28).lineTo(-0.06, -0.28)
  .quadraticCurveTo(-0.12, -0.12, -0.35, -0.08)
  .closePath();
export const SIGN_PLATES = Object.freeze({
  bikini: { shape: BRA, text: 'BIKINI', bounds: [-0.38, 0, 0.38, 0.28], textY: 0.1, drop: 0.24 },
  point: { shape: BRIEFS, text: 'POINT', bounds: [-0.35, -0.28, 0.35, 0], textY: -0.075, drop: 0 },
});
// A sheet-metal plate cut to `shape`, `thickness` thick about z = 0: its edge,
// its front face (a hair proud, uv = the shape's metres) and its back face
// turned round, so what is painted on it reads from behind.
export function plate(shape, thickness = 0.006, segments = 8) {
  const edge = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: segments }).translate(0, 0, -thickness / 2);
  const front = new THREE.ShapeGeometry(shape, segments).translate(0, 0, thickness / 2 + 0.001);
  const back = new THREE.ShapeGeometry(shape, segments).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).translate(0, 0, -thickness / 2 - 0.001);
  return { edge, front, back };
}
export function signPlate(name) {
  const { shape, drop } = SIGN_PLATES[name];
  const { edge, front, back } = plate(shape);
  // `bikini` hangs below its straps; `point` reaches left of the post.
  const place = new THREE.Matrix4().makeTranslation(name === 'bikini' ? 0 : -0.37, -drop - (name === 'bikini' ? 0.28 : 0), 0);
  return { plate: edge.applyMatrix4(place), faces: merge([front, back]).applyMatrix4(place) };
}
// Road signs: a diamond with its corners eased, a disc.
export const DIAMOND = (() => {
  const r = 0.42, ease = 0.04, shape = new THREE.Shape(), corners = [[0, r], [r, 0], [0, -r], [-r, 0]];
  corners.forEach(([x, y], i) => {
    const [px, py] = corners[(i + 3) % 4], [nx, ny] = corners[(i + 1) % 4];
    const inX = x + (px - x) * (ease / r), inY = y + (py - y) * (ease / r), outX = x + (nx - x) * (ease / r), outY = y + (ny - y) * (ease / r);
    if (i) shape.lineTo(inX, inY);
    else shape.moveTo(inX, inY);
    shape.quadraticCurveTo(x, y, outX, outY);
  });
  shape.closePath();
  return shape;
})();
export const DISC = new THREE.Shape().absarc(0, 0, 0.3, 0, Math.PI * 2, false);

// A painted board hung by two chains from a beam: the chains from y = 0 to
// its top corners, the board `width` × `height` below them, 3 cm thick, its
// painted face +z (group 4 of the box: the others are bare wood).
export function hangingBoard(width, height, chain) {
  const board = new THREE.BoxGeometry(width, height, 0.03).translate(0, -chain - height / 2, 0);
  const links = merge([-1, 1].map((s) => beam(v(s * (width / 2 - 0.08), 0, 0), v(s * (width / 2 - 0.06), -chain - 0.02, 0), 0.012, 0.012, v(0, 0, 1))));
  return { board, links };
}

// A hammock slung between two points `span` apart along +x (from the
// origin), both at y = 0: a rope down to where the cloth is gathered, a fan
// of strings to its end, the cloth sagging `sag` between and curling up at
// its edges, `width` across at the middle. Swings about the x axis.
export function hammockGeometry(span, { sag = 0.5, width = 1.1, reach = 0.55, drop = 0.3 } = {}) {
  const columns = 28, rows = 10, bed = new THREE.PlaneGeometry(1, 1, columns, rows), position = bed.attributes.position;
  const at = (s, t) => {
    const bell = Math.sin(Math.PI * s), w = width * bell ** 0.55;
    return v(reach + s * (span - 2 * reach), -drop - sag * bell + 0.28 * t * t * bell ** 0.8, (t * w) / 2);
  };
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      const p = at(i / columns, (j / rows) * 2 - 1);
      position.setXYZ(j * (columns + 1) + i, p.x, p.y, p.z);
    }
  }
  bed.computeVertexNormals();
  const strings = [];
  for (const end of [0, 1]) {
    const anchor = v(end * span, 0, 0), gather = v(end ? span - reach * 0.8 : reach * 0.8, -drop * 0.8, 0);
    strings.push(new THREE.TubeGeometry(new THREE.LineCurve3(anchor, gather), 1, 0.011, 5));
    for (const t of [-1, -0.5, 0, 0.5, 1]) strings.push(new THREE.TubeGeometry(new THREE.LineCurve3(gather, at(end ? 0.97 : 0.03, t)), 1, 0.004, 4));
  }
  return { bed, ropes: merge(strings) };
}

// The drinks machine (VENDING's size) standing on y = 0, its front +z (box
// group 4, painted), on a low plinth.
export function vendingGeometry() {
  const { width, depth, height } = VENDING;
  return { body: new THREE.BoxGeometry(width, height - 0.05, depth).translate(0, height / 2 + 0.025, 0), plinth: new THREE.BoxGeometry(width - 0.06, 0.05, depth - 0.06).translate(0, 0.025, 0) };
}

// What dries on the line, each hanging from the line at y = 0, in the plane
// z = 0, pegged where its `pegs` say: a lime bikini bottom, a yellow bra on
// its straps, a blue triangle top with long ties, a striped towel, a tee.
const shapeOf = (points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
export const CLOTHES = Object.freeze({
  bottom: { pegs: [-0.13, 0.13], colour: '#b8d23c' },
  bra: { pegs: [-0.1, 0.1], colour: '#e9e14e' },
  top: { pegs: [-0.14, 0.14], colour: '#2d62b8' },
  towel: { pegs: [-0.22, 0.22], colour: '#e8663e', stripe: '#f3ead6' },
  tee: { pegs: [-0.2, 0.2], colour: '#f2efe8' },
});
export function clothGeometry(kind) {
  const strip = (x0, x1, y0, y1) => new THREE.ShapeGeometry(shapeOf([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]));
  if (kind === 'bottom') return new THREE.ShapeGeometry(shapeOf([[-0.15, 0], [0.15, 0], [0.12, -0.07], [0.04, -0.2], [-0.04, -0.2], [-0.12, -0.07]]));
  if (kind === 'bra') {
    const cup = (x) => new THREE.ShapeGeometry(shapeOf([[x, -0.2], [x + 0.08, -0.34], [x, -0.37], [x - 0.08, -0.34]]));
    return merge([cup(-0.085), cup(0.085), strip(-0.105, -0.095, -0.2, 0), strip(0.095, 0.105, -0.2, 0), strip(-0.2, 0.2, -0.375, -0.36)]);
  }
  if (kind === 'top') {
    const tri = (x) => new THREE.ShapeGeometry(shapeOf([[x - 0.075, 0], [x + 0.075, 0], [x, -0.15]]));
    return merge([tri(-0.09), tri(0.09), strip(-0.17, -0.162, -0.55, 0), strip(0.162, 0.17, -0.5, 0), strip(-0.005, 0.005, -0.42, -0.01)]);
  }
  if (kind === 'towel') {
    // Stripes as vertex colour: a strip each.
    const parts = [];
    for (let k = 0; k < 7; k += 1) {
      const part = strip(-0.25, 0.25, -0.1 * (k + 1), -0.1 * k);
      const colour = new THREE.Color(k % 2 ? CLOTHES.towel.stripe : CLOTHES.towel.colour);
      part.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: part.attributes.position.count }, () => [colour.r, colour.g, colour.b]).flat(), 3));
      parts.push(part);
    }
    return merge(parts);
  }
  return new THREE.ShapeGeometry(shapeOf([[-0.22, 0], [0.22, 0], [0.24, -0.2], [0.17, -0.22], [0.17, -0.68], [-0.17, -0.68], [-0.17, -0.22], [-0.24, -0.2]]));
}

// A cloth as a grid, `columns` × `rows` quads, uv across it; `shape(u, v)`
// its rest place (u, v in 0…1). The grid's positions are rewritten each
// frame by the wind; its uv stays.
export function clothGrid(columns, rows) {
  const geometry = new THREE.PlaneGeometry(1, 1, columns, rows);
  geometry.userData.grid = { columns, rows };
  return geometry;
}
// Moves a grid to `at(u, v, out)` (out: a Vector3 to fill), u across, v
// down from the fixed edge, and refreshes its normals.
export function drapeGrid(geometry, at) {
  const { columns, rows } = geometry.userData.grid, position = geometry.attributes.position, point = new THREE.Vector3();
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      at(i / columns, j / rows, point);
      position.setXYZ(j * (columns + 1) + i, point.x, point.y, point.z);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

// The wind on a flag at time t: a triangle (`kind` 'pennant') or a
// rectangle, hoisted `hoist` long down a pole from `top` along `down`, flying
// `fly` long towards `wind`. u runs out from the pole, v down the hoist.
export function flagAt({ top, down, wind, kind, hoist, fly, phase }, t, strength = 1) {
  const along = wind.clone().addScaledVector(down, -wind.dot(down)).normalize();
  const normal = new THREE.Vector3().crossVectors(along, down).normalize();
  return (u, w, out) => {
    const across = kind === 'pennant' ? 0.5 + (w - 0.5) * (1 - u) : w;
    const wave = (Math.sin(u * 7 - t * 7.5 + phase) * 0.07 * u + Math.sin(u * 13 - t * 11 + phase * 2) * 0.02 * u) * Math.min(strength, 1.6);
    const droop = 0.12 * u * u * (0.6 + 0.4 * Math.sin(t * 1.3 + phase)) + 0.5 * u * u * Math.max(0, 1 - strength);
    out.copy(top).addScaledVector(down, across * hoist + droop).addScaledVector(along, u * fly * (1 - 0.08 * Math.abs(Math.sin(t * 3 + phase)))).addScaledVector(normal, wave);
  };
}

// The curtain in the door, hung from a rod across the opening at `rod` (its
// middle) and let down `height` in the plane with normal `out`; the draught
// breathes it out over the threshold and blows its foot aside, showing the
// dark of the room at one side.
export function curtainAt({ rod, width, height, out, across }, t, strength = 1) {
  const gust = (0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1)) * Math.min(strength, 1.8);
  return (u, w, point) => {
    const fall = w ** 1.6, x = (u - 0.5) * width;
    const billow = fall * (0.2 * Math.min(strength, 1) + 0.35 * gust) + 0.02 * w * Math.sin(u * 17 + t * 2.1) + 0.04 * fall * Math.sin(t * 1.6 + u * 3);
    const aside = fall * (0.14 + 0.18 * gust) * (0.7 + 0.3 * Math.sin(t * 0.9 + 0.6)) * (0.3 + u);
    const lift = billow * billow * 0.6, pleat = 0.018 * Math.sin((x / 0.12) * Math.PI * 2);
    point.copy(rod).addScaledVector(across, x + aside).addScaledVector(Y, -w * height + lift).addScaledVector(out, billow + pleat);
  };
}
