import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSequence } from '../plants/oleasterModel.js';
import { makeStoneRing } from '../terrain/stoneRingModel.js';

const TAU = Math.PI * 2;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const countTriangles = (g) => (g.index?.count ?? g.attributes.position.count) / 3;
const curve = (points) => new THREE.CatmullRomCurve3(points.map((p) => v(...p)));

function finish(parts, name) {
  if (!parts.length) return null;
  const prepared = parts.map((g) => {
    const result = g.index ? g.toNonIndexed() : g.clone();
    for (const key of Object.keys(result.attributes)) if (!['position', 'normal', 'uv'].includes(key)) result.deleteAttribute(key);
    if (!result.attributes.uv) result.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(result.attributes.position.count * 2), 2));
    g.dispose(); return result;
  });
  const geometry = mergeGeometries(prepared); prepared.forEach((g) => g.dispose());
  geometry.name = name; geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

// A capped sweep. Texture coordinates retain circumference/length in metres.
function rod(points, radius, lod, phase = 0, tip = .85) {
  const path = curve(points), length = path.getLength(), n = lod ? 8 : 18, rows = Math.max(6, Math.ceil(length * (lod ? 8 : 28)));
  const g = new THREE.TubeGeometry(path, rows, radius, n, false), pos = g.attributes.position, uv = g.attributes.uv;
  const p = v(), c = v();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows; path.getPointAt(t, c);
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i, a = i / n * TAU;
      const wear = 1 + .055 * Math.sin(a * 5 + phase) * Math.sin(t * 11 + phase) + .025 * Math.cos(a * 9 - t * 17);
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(THREE.MathUtils.lerp(1, tip, t) * wear).add(c);
      pos.setXYZ(k, p.x, p.y, p.z); uv.setXY(k, i / n * TAU * radius, t * length);
    }
  }
  const index = Array.from(g.index.array), positions = Array.from(pos.array), uvs = Array.from(uv.array);
  for (const end of [0, rows]) {
    path.getPointAt(end / rows, c); const centre = positions.length / 3;
    positions.push(c.x, c.y, c.z); uvs.push(0, end / rows * length);
    for (let i = 0; i < n; i++) {
      const a = end * (n + 1) + i;
      if (!end) index.push(centre, a + 1, a); else index.push(centre, a, a + 1);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}

function anchor(settings, lod, rand) {
  const parts = [], h = 2.15, width = 1.75, phase = rand() * TAU;
  // Bent forged shank, curved arms, a transverse stock and two broad palms.
  parts.push(rod([[0, .05, 0], [.06, .55, .025], [-.035, 1.35, -.02], [.055, h, 0]], .082, lod, phase, .78));
  for (const side of [-1, 1]) {
    parts.push(rod([[0, .10, 0], [side * .37, .13, 0], [side * .7, .37, .015], [side * width * .5, .78, 0]], .078, lod, phase + side, .63));
    const shape = new THREE.Shape();
    shape.moveTo(side * .59, .41); shape.lineTo(side * .89, .97); shape.lineTo(side * 1.055, .42); shape.lineTo(side * .77, .30); shape.closePath();
    const fluke = new THREE.ExtrudeGeometry(shape, { depth: .075, bevelEnabled: true, bevelSize: .024, bevelThickness: .017, bevelSegments: lod ? 1 : 3, steps: 1, curveSegments: 1 });
    fluke.translate(0, 0, -.0375); parts.push(fluke);
  }
  parts.push(rod([[.05, 1.72, -.96], [.01, 1.78, -.45], [0, 1.77, .4], [-.04, 1.66, .98]], .06, lod, phase, .86));
  const collar = new THREE.BoxGeometry(.22, .18, .2, 2, 2, 2); collar.translate(0, 1.77, 0); parts.push(collar);
  const eye = new THREE.TorusGeometry(.14, .043, lod ? 6 : 12, lod ? 16 : 40); eye.translate(.055, h + .12, 0); parts.push(eye);
  // Short rusted links remain attached to the eye; no arbitrary long chain.
  for (let i = 0; i < 3; i++) {
    const link = new THREE.TorusGeometry(.085, .018, lod ? 5 : 8, lod ? 12 : 24);
    link.scale(.67, 1, 1); link.rotateY(i % 2 * Math.PI / 2); link.translate(.055 + i * .025, h + .31 + i * .12, .02); parts.push(link);
  }
  const metal = finish(parts, 'rusted-anchor');
  metal.rotateX(.38 * Math.PI); metal.rotateY(-.22);
  metal.computeBoundingBox(); metal.translate(0, -metal.boundingBox.min.y - settings.burial * .18, -1.1);
  return { metal, focus: v(.05, .38, -.65) };
}

// A hollow, eroded pile: irregular outside, split upper rim, recessed rotten
// heart and closed bottom. The low mesh samples the same continuous profile.
function pile(height, radius, seed, decay, lod) {
  const rand = randomSequence(seed), phase = rand() * TAU, n = lod ? 16 : 64, rows = lod ? 8 : 28;
  const leanX = (rand() - .5) * .17, leanZ = (rand() - .5) * .16;
  const cracks = Array.from({ length: 4 }, () => [rand() * TAU, .025 + rand() * .1, .18 + rand() * .45]);
  const angularDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const rim = (a) => {
    let top = .91 + .045 * Math.sin(a * 3 + phase) + .065 * Math.sin(a * 9 - phase);
    for (const [angle, width, depth] of cracks) top -= depth * decay * Math.exp(-((angularDistance(a, angle) / width) ** 2));
    return height * top;
  };
  const surface = (a, t) => {
    const square = 1 / (Math.abs(Math.cos(a)) ** 3 + Math.abs(Math.sin(a)) ** 3) ** (1 / 3);
    let r = radius * square * (1 - .10 * t + .08 * Math.sin(a * 5 + phase) + .055 * Math.sin(a * 11 + t * .8));
    r *= 1 - decay * .12 * Math.sin(a * 17 + Math.sin(t * 2 + phase) * .12) ** 8;
    for (const [angle, width, depth] of cracks) r *= 1 - decay * depth * .8 * t ** 3 * Math.exp(-((angularDistance(a, angle) / (width * 1.4)) ** 2));
    return r;
  };
  const positions = [], uvs = [], indices = [];
  const push = (a, y, r, u, vv) => { positions.push(Math.cos(a) * r + leanX * y, y, Math.sin(a) * r + leanZ * y); uvs.push(u, vv); };
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= n; i++) {
    const t = j / rows, a = i / n * TAU, y = rim(a) * t;
    push(a, y, surface(a, t), i / n * TAU * radius + seed * .713, y);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Join the edge to a darker, recessed inner wall, ending in a rotten bowl.
  const innerStart = positions.length / 3;
  for (let j = 0; j < 4; j++) for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, r = surface(a, 1), t = j / 3;
    const y = rim(a) * (1 - t) + height * (.48 - decay * .18) * t;
    push(a, y, r * (j === 0 ? 1 : .58 * (1 - t) + .1), i / n * TAU * radius + seed * .713, y);
  }
  for (let j = 0; j < 3; j++) for (let i = 0; i < n; i++) {
    const a = innerStart + j * (n + 1) + i, b = a + n + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const [offset, y, bottom] of [[0, 0, true], [innerStart + 3 * (n + 1), height * (.48 - decay * .18), false]]) {
    const c = positions.length / 3; push(0, y, 0, seed * .713, y);
    for (let i = 0; i < n; i++) if (bottom) indices.push(c, offset + i, offset + i + 1); else indices.push(c, offset + i + 1, offset + i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices);
  g.computeVertexNormals(); return g;
}

function piles(settings, lod, rand) {
  const parts = [], count = settings.posts, length = settings.length, positions = [];
  // Layout randomness is independent of tessellation.
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1), missing = i > 2 && rand() < .14 * settings.decay;
    const x = (t - .5) * length, z = Math.sin(t * 3.5) * .28 + (rand() - .5) * .15;
    const h = (.56 + rand() * .95) * (1 - t * .4), radius = .105 + rand() * .075;
    if (missing) continue;
    const g = pile(h, radius, settings.seed * 97 + i * 13, settings.decay, lod);
    g.translate(x, -.08 - settings.burial * .24, z); parts.push(g); positions.push([x, h, z]);
  }
  for (let i = 0; i < 4; i++) {
    const h = .65 + rand() * 1.15, g = pile(h, .065 + rand() * .035, settings.seed + 170 + i, settings.decay, lod);
    g.rotateZ(Math.PI * .5); g.rotateY(rand() * 2.4); g.translate((rand() - .5) * length, .015 - settings.burial * .05, .45 + (rand() - .5) * 1.5); parts.push(g);
  }
  const wood = finish(parts, 'decayed-groyne-timber');
  const stones = makeStoneRing({ seed: settings.seed + 504, stones: 14, diameter: 2, lod });
  const stone = stones.geometry, pos = stone.attributes.position, verticesPerStone = pos.count / stones.layout.length;
  for (let i = 0; i < stones.layout.length; i++) {
    const old = stones.layout[i].position, x = (rand() - .5) * (length + .7), z = (rand() - .5) * 1.8, scale = .7 + rand() * .55;
    for (let j = i * verticesPerStone; j < (i + 1) * verticesPerStone; j++) pos.setXYZ(j, (pos.getX(j) - old[0]) * scale + x, pos.getY(j) * scale - settings.burial * .06, (pos.getZ(j) - old[2]) * scale + z);
  }
  stone.computeBoundingBox(); stone.computeBoundingSphere();
  return { wood, stone, focus: v(...[positions[1]?.[0] ?? 0, .65, positions[1]?.[2] ?? 0]) };
}

function pipe(settings, lod, rand) {
  const length = settings.length, radius = .29, n = lod ? 24 : 80, rows = lod ? 8 : 32, phase = rand() * TAU;
  const positions = [], uvs = [], indices = [], parts = [];
  const edge = (a, end) => (end ? length / 2 : -length / 2) + (end ? 1 : -1) * settings.decay * (.015 + .07 * Math.sin(a * 5 + phase) + .028 * Math.sin(a * 13));
  for (const inside of [false, true]) for (let j = 0; j <= rows; j++) for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, t = j / rows, r = (radius - (inside ? .027 : 0)) * (1 + .035 * Math.sin(a * 3 + phase) + .012 * Math.sin(t * 13 + a * 7));
    positions.push(THREE.MathUtils.lerp(edge(a, false), edge(a, true), t), Math.cos(a) * r, Math.sin(a) * r);
    uvs.push(t * length, a * radius);
  }
  const sideCount = (rows + 1) * (n + 1);
  for (let side = 0; side < 2; side++) for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    const a = side * sideCount + j * (n + 1) + i, b = a + n + 1;
    if (!side) indices.push(a, a + 1, b, b, a + 1, b + 1); else indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const end of [0, rows]) for (let i = 0; i < n; i++) {
    const a = end * (n + 1) + i, b = a + sideCount;
    if (!end) indices.push(a, b, a + 1, b, b + 1, a + 1); else indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); shell.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); shell.setIndex(indices); shell.computeVertexNormals(); parts.push(shell);
  for (const x of [-length / 2 + .05, length * .21]) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, radius * 1.29, 0, TAU, false);
    const centre = new THREE.Path(); centre.absarc(0, 0, radius - .018, 0, TAU, true); shape.holes.push(centre);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, hole = new THREE.Path(); hole.absarc(Math.cos(a) * radius * 1.12, Math.sin(a) * radius * 1.12, .022, 0, TAU, true); shape.holes.push(hole); }
    const flange = new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelSize: .005, bevelThickness: .005, bevelSegments: 1, curveSegments: lod ? 5 : 12 });
    flange.rotateY(Math.PI / 2); flange.translate(x, 0, 0); parts.push(flange);
    for (let i = 0; i < 8; i++) if (i % 3 !== 1) {
      const a = i / 8 * TAU, bolt = new THREE.CylinderGeometry(.032, .03, .07, 6);
      bolt.rotateZ(Math.PI / 2); bolt.translate(x + .045, Math.cos(a) * radius * 1.12, Math.sin(a) * radius * 1.12); parts.push(bolt);
    }
  }
  const metal = finish(parts, 'corroded-hollow-pipe'); metal.translate(0, radius * (1 - settings.burial * 1.2), 0);
  return { metal, focus: v(-length / 2 + .02, radius * (1 - settings.burial * 1.2), 0) };
}

export const REMAINS_DEFAULTS = Object.freeze({ seed: 17, length: 5.8, posts: 18, decay: .78, corrosion: .86, algae: .78, waterline: .38, wetness: .3, burial: .2 });
export function makeShoreRemains(kind, input = {}, lod = 0) {
  const s = { ...REMAINS_DEFAULTS, ...input };
  s.seed = THREE.MathUtils.clamp(Math.round(Number(s.seed) || 17), 1, 999);
  s.posts = THREE.MathUtils.clamp(Math.round(Number(s.posts) || 18), 4, 32);
  s.length = THREE.MathUtils.clamp(Number(s.length) || 5.8, 1.8, 10);
  s.decay = THREE.MathUtils.clamp(Number(s.decay) || 0, 0, 1); s.burial = THREE.MathUtils.clamp(Number(s.burial) || 0, 0, .5);
  const rand = randomSequence(s.seed), result = ({ anchor, piles, pipe })[kind](s, lod, rand);
  const geometries = [result.metal, result.wood, result.stone].filter(Boolean), bounds = new THREE.Box3();
  for (const geometry of geometries) { geometry.computeBoundingBox(); geometry.computeBoundingSphere(); bounds.union(geometry.boundingBox); }
  return { kind, ...result, settings: s, bounds, triangles: geometries.reduce((sum, g) => sum + countTriangles(g), 0), dispose() { geometries.forEach((g) => g.dispose()); } };
}
