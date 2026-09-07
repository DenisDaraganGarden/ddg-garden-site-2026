import * as THREE from 'three';
import { createPlantBuilder, randomSequence } from './oleasterModel.js';

// Static shore wood, in metres. The skeleton shares the plant builder; the
// surface has its own closed, broken ends and never receives a wind shader.
export const DEADWOOD_FORMS = Object.freeze({
  branch: { ru: 'Ветка', en: 'Branch', length: 1.65, diameter: .08, limbs: 4 },
  log: { ru: 'Ствол', en: 'Trunk', length: 4.3, diameter: .55, limbs: 6 },
  root: { ru: 'Корневище', en: 'Root crown', length: 2.6, diameter: .68, limbs: 6 },
  stake: { ru: 'Из песка', en: 'Leaning snag', length: 3.1, diameter: .24, limbs: 3 },
  stump: { ru: 'Пень', en: 'Stump', length: 1.15, diameter: .56, limbs: 3 },
});
export const DEADWOOD_DEFAULTS = Object.freeze({ seed: 17, bend: .55, breakage: .7 });
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

export function makeDeadwood(input = {}) {
  const kind = Object.hasOwn(DEADWOOD_FORMS, input.kind) ? input.kind : 'log';
  const settings = { ...DEADWOOD_DEFAULTS, ...DEADWOOD_FORMS[kind], ...input, kind };
  const length = clamp(settings.length, .35, 8), radius = clamp(settings.diameter, .025, 1.2) * .5;
  const bend = clamp(settings.bend, 0, 1), breakage = clamp(settings.breakage, 0, 1);
  const { rand, branches, addBranch, branch } = createPlantBuilder(settings.seed);
  const upright = kind === 'stake' || kind === 'stump', root = kind === 'root';
  const phase = rand() * Math.PI * 2, sway = (rand() - .5) * bend;
  const points = upright ? [
    v(0, 0, 0), v(length * .12, length * .24, sway * .12),
    v(length * (kind === 'stake' ? .34 : .08), length * .5, -bend * length * .035),
    v(length * (kind === 'stake' ? .46 : .1), length * .73, sway * .15),
    v(length * (kind === 'stake' ? .61 : .07), length * .86, bend * length * .06),
  ] : [
    v(-length * .5, 0, 0), v(-length * .29, length * bend * .025, length * sway * .17),
    v(-length * .025, length * bend * .04, -length * sway * .08),
    v(length * .28, length * bend * .018, length * sway * .3),
    v(length * .5, length * .012, length * sway * .18),
  ];
  const main = addBranch(new THREE.CatmullRomCurve3(points), radius, -1, 0, {
    radiusEnd: radius * (upright ? .45 : root ? .42 : kind === 'branch' ? .18 : .68),
    flatten: upright ? .92 : .78, breakStart: !upright, breakEnd: true,
    flare: root || kind === 'stump' ? .75 : .2, hollow: kind === 'log' || kind === 'stump',
  });
  const limbCount = Math.round(clamp(settings.limbs, 0, 12));
  for (let i = 0; i < limbCount; i++) {
    const t = .18 + (i + .15 + rand() * .6) / Math.max(1, limbCount) * .66;
    const at = main.curve.getPoint(t), tangent = main.curve.getTangent(t).normalize();
    const side = i % 2 ? -1 : 1;
    let direction, reach;
    if (upright) {
      const angle = i * 2.39996 + phase;
      direction = v(Math.cos(angle), .4 + rand() * .55, Math.sin(angle)).normalize();
      reach = length * (.11 + rand() * .2);
    } else {
      direction = v(.25 + rand() * .45, kind === 'branch' ? .035 + rand() * .08 : .25 + rand() * .8, side * (.55 + rand() * .8)).normalize();
      reach = length * (kind === 'branch' ? .2 + rand() * .17 : .055 + rand() ** 1.4 * .27);
    }
    const r = radius * (1 - t * .56) * (kind === 'branch' ? .48 : .52 + rand() * .14);
    const end = at.clone().addScaledVector(direction, reach);
    const limb = branch(at.clone().addScaledVector(direction, -r * .42), end,
      tangent.clone().multiplyScalar(reach * .12).add(v(0, reach * bend * .12, side * reach * bend * .12)), r,
      main.id, t, { radiusEnd: r * (.18 + breakage * .35), flatten: .87, flare: .38, breakEnd: true });
    if ((i % 3 === 1 || kind === 'branch') && reach > .25) {
      const forkT = .48 + rand() * .22;
      const forkAt = limb.curve.getPoint(forkT);
      const forkEnd = forkAt.clone().add(v(reach * .28, upright ? reach * .12 : reach * .06, -side * reach * .34));
      branch(forkAt, forkEnd, v(-reach * .06, reach * .035, side * reach * .06), r * .42,
        limb.id, forkT, { radiusEnd: r * .1, flatten: .9, flare: .3, breakEnd: true });
    }
  }
  // Buttress roots are carried by the root crown; they grow out of the basal
  // mass and curl back to ground level, rather than forming a radial star.
  if (root || kind === 'stump') {
    const count = root ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + phase;
      const at = main.curve.getPoint(.02 + rand() * .08);
      const reach = radius * (2 + rand() * 2.8);
      const direction = upright ? v(Math.cos(angle), -.07, Math.sin(angle)) : v(-.48 - rand() * .35, .13 + Math.max(0, Math.sin(angle)) * .7, Math.cos(angle));
      const end = at.clone().addScaledVector(direction, reach);
      const r = radius * (.26 + rand() * .21);
      branch(at, end, v(-reach * .12, reach * .14, Math.sin(angle) * reach * .25), r,
        main.id, .04, { radiusEnd: r * .17, flatten: .66, flare: .5, breakEnd: true });
    }
  }
  return { kind, settings: { ...settings, length, diameter: radius * 2, breakage }, branches, main, length, radius };
}

function buffer() { return { positions: [], uvs: [], colors: [], indices: [] }; }
function vertex(data, p, u, v0, tone) {
  const id = data.positions.length / 3;
  data.positions.push(p.x, p.y, p.z); data.uvs.push(u, v0);
  data.colors.push(tone, tone, tone); return id;
}
function finish(data, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setIndex(data.indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = name;
  return geometry;
}

// Physical arclength samples and parallel-transport frames. Both LODs sample
// the same continuous contour, including the same chips at the ends.
export function makeDeadwoodGeometry(model, lod = 0) {
  const side = buffer(), ends = buffer();
  for (const b of model.branches) {
    const radial = b.radius > .1 ? (lod ? 14 : 32) : (lod ? 7 : 16);
    const segments = Math.max(4, Math.ceil(b.length / (lod ? .19 : .075)));
    const frames = b.curve.computeFrenetFrames(segments, false);
    const base = side.positions.length / 3;
    const ringPoints = [];
    // Integer circumferential repeats make the seam exact, with metric grain.
    const around = Math.max(1, Math.round(Math.PI * 2 * b.radius / .32));
    for (let j = 0; j <= segments; j++) {
      const t = j / segments, center = b.curve.getPointAt(t);
      const tangent = frames.tangents[j], x = frames.normals[j], z = frames.binormals[j];
      const ring = [];
      for (let k = 0; k <= radial; k++) {
        const angle = k / radial * Math.PI * 2;
        const lobes = 1 + .065 * Math.sin(angle * 3 + b.phase + t * 2) + .045 * Math.sin(angle * 7 - b.phase + t * 3.8);
        const grooves = Math.pow(Math.max(0, Math.cos(angle * 11 + Math.sin(t * 4 + b.phase) * .4)), 18);
        const taper = THREE.MathUtils.lerp(b.radius, b.radiusEnd, Math.pow(t, .8));
        const radialDirection = x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(z, Math.sin(angle));
        let knot = 0;
        for (const child of model.branches) {
          if (child.parent !== b.id) continue;
          const along = Math.exp(-(((t - child.parentT) / (.025 + child.radius / b.length)) ** 2));
          const out = child.curve.getPointAt(.3).sub(center).normalize();
          knot += along * Math.max(0, radialDirection.dot(out)) ** 4 * .28;
        }
        // Sparse structural clefts fade into the trunk, rather than forming
        // a regular corrugated tube. Their depth is real geometry.
        const cleftAngle = Math.atan2(Math.sin(angle - b.phase - Math.sin(t * 3) * .08), Math.cos(angle - b.phase - Math.sin(t * 3) * .08));
        const cleft = Math.exp(-((cleftAngle / .095) ** 2)) * (.04 + .17 * Math.pow(1 - t, 3));
        const r = taper * (1 + b.flare * Math.exp(-t * 17) + knot) * (lobes - grooves * .028 - cleft);
        const offset = x.clone().multiplyScalar(Math.cos(angle) * r).addScaledVector(z, Math.sin(angle) * r);
        offset.y *= b.flatten;
        // Long splinters are confined to the final centimetres, never teeth
        // repeated down the body. A broken cap stays closed below the chips.
        const chip = (Math.sin(angle * 5 + b.phase) * .32 + Math.sin(angle * 9 - b.phase) * .18 + Math.sin(angle * 2 + b.phase) * .45) * model.settings.breakage;
        const endChip = (j === segments ? b.radiusEnd * .95 : 0) * chip;
        const startChip = j === 0 && b.breakStart ? -b.radius * .28 * chip : 0;
        const p = center.clone().add(offset).addScaledVector(tangent, endChip + startChip);
        ring.push(p);
        const tone = .84 + .1 * Math.sin(b.phase + t * 2.8) - grooves * .13 - .1 * Math.exp(-t * 18) * (b.parent >= 0 ? 1 : 0);
        vertex(side, p, k / radial * around, t * b.length / .32, tone);
      }
      ringPoints.push(ring);
    }
    for (let j = 0; j < segments; j++) for (let k = 0; k < radial; k++) {
      const a = base + j * (radial + 1) + k, c = a + radial + 1;
      side.indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
    // Weld only the lighting normal at the metric UV seam.
    // Flat end faces have separate vertices, so their normals remain honest.
    for (const isEnd of [false, true]) {
      if (!isEnd && b.parent >= 0) continue;
      const ring = ringPoints[isEnd ? segments : 0];
      const center = b.curve.getPointAt(isEnd ? 1 : 0);
      const tangent = frames.tangents[isEnd ? segments : 0];
      const inward = isEnd ? -1 : 1;
      const r = isEnd ? b.radiusEnd : b.radius;
      const hollow = b.hollow && !isEnd ? .48 : 0;
      const rings = [1, hollow || .68, hollow ? .4 : .28, 0];
      const offset = ends.positions.length / 3;
      for (let layer = 0; layer < rings.length; layer++) {
        for (let k = 0; k <= radial; k++) {
          const angle = k / radial * Math.PI * 2, f = rings[layer];
          const p = center.clone().lerp(ring[k], f);
          const depth = layer === 0 ? 0 : hollow ? (layer === 1 ? .04 : r * 1.2) : r * .12 * (1 - f);
          p.addScaledVector(tangent, inward * depth);
          vertex(ends, p, Math.cos(angle) * f * r, Math.sin(angle) * f * r, hollow && layer >= 2 ? .28 : .87 - layer * .08);
        }
      }
      for (let layer = 0; layer < rings.length - 1; layer++) for (let k = 0; k < radial; k++) {
        const a = offset + layer * (radial + 1) + k, c = a + radial + 1;
        if (isEnd) { ends.indices.push(a, a + 1, c); if (layer < rings.length - 2) ends.indices.push(a + 1, c + 1, c); }
        else { ends.indices.push(a, c, a + 1); if (layer < rings.length - 2) ends.indices.push(a + 1, c, c + 1); }
      }
    }
  }
  const wood = finish(side, 'deadwood-surface'), endGrain = finish(ends, 'deadwood-breaks');
  // Duplicate UV seam vertices share the same point and should share normals.
  let cursor = 0;
  const normal = wood.attributes.normal;
  for (const b of model.branches) {
    const radial = b.radius > .1 ? (lod ? 14 : 32) : (lod ? 7 : 16);
    const segments = Math.max(4, Math.ceil(b.length / (lod ? .19 : .075)));
    for (let j = 0; j <= segments; j++) {
      const a = cursor + j * (radial + 1), z = a + radial;
      const n = v().fromBufferAttribute(normal, a).add(v().fromBufferAttribute(normal, z)).normalize();
      normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(z, n.x, n.y, n.z);
    }
    cursor += (segments + 1) * (radial + 1);
  }
  const bounds = wood.boundingBox.clone().union(endGrain.boundingBox);
  return { wood, endGrain, bounds, triangles: (wood.index.count + endGrain.index.count) / 3,
    dispose() { wood.dispose(); endGrain.dispose(); } };
}

// A deterministic little strand-line for studio review. No terrain or scene
// settings are read here: the product's shore query will own placement later.
export function scatterDeadwood({ seed = 17, count = 24, extent = 16, size = 1 } = {}) {
  const rand = randomSequence(seed), items = [];
  const types = ['branch', 'branch', 'branch', 'log', 'root', 'stake', 'stump'];
  for (let attempt = 0; attempt < count * 40 && items.length < count; attempt++) {
    const kind = types[Math.floor(rand() * types.length)];
    const scale = (.65 + rand() * .5) * size;
    const x = (rand() - .5) * extent;
    const strand = rand() < .72 ? -.8 : 2.1;
    const z = strand + Math.sin(x * .36) * .5 + (rand() - .5) * 1.8;
    const clearance = (kind === 'log' ? 2.5 : kind === 'root' ? 2.1 : kind === 'stake' ? 2.1 : kind === 'stump' ? 1.35 : 1.1) * scale;
    if (items.some((p) => Math.hypot(x - p.x, z - p.z) < clearance + p.clearance)) continue;
    items.push({ kind, x, z, scale, clearance, variant: Math.floor(rand() * 3), yaw: (rand() - .5) * .6 + (rand() < .5 ? 0 : Math.PI) });
  }
  return items;
}
