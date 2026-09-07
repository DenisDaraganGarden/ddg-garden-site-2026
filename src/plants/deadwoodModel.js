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
    flare: root ? .32 : kind === 'stump' ? .75 : .2, flareLength: root ? 7 : 17,
    rootButt: root, hollow: kind === 'log' || kind === 'stump',
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
  // A few heavy, unequally broken roots wrap around the basal heel. Their
  // shoulders overlap inside the trunk, then turn twice in three dimensions.
  if (root) {
    for (let i = 0; i < 5; i++) {
      const angle = phase + [0, 1.35, 2.7, 4.05, 5.25][i] + (rand() - .5) * .45;
      const t = .025 + rand() * .105, at = main.curve.getPointAt(t);
      const reach = radius * (i < 2 ? 3 + rand() * .8 : 1.5 + rand() * 1.3);
      const out = v(0, Math.sin(angle), Math.cos(angle));
      const turn = v(0, Math.cos(angle), -Math.sin(angle));
      const r = radius * (.46 + rand() * .19), curl = (rand() < .5 ? -1 : 1) * (.35 + bend * .6);
      const rootPoints = [
        at.clone().addScaledVector(out, -r * .3),
        at.clone().add(v(-reach * .2, 0, 0)).addScaledVector(out, radius * .75),
        at.clone().add(v(-reach * .52, 0, 0)).addScaledVector(out, reach * .53).addScaledVector(turn, reach * curl * .22),
        at.clone().add(v(-reach * .72, 0, 0)).addScaledVector(out, reach * .72).addScaledVector(turn, reach * curl * .46),
        at.clone().add(v(-reach * .93, 0, 0)).addScaledVector(out, reach * .65).addScaledVector(turn, reach * curl * .52),
      ];
      const buttress = addBranch(new THREE.CatmullRomCurve3(rootPoints), r, main.id, t, {
        radiusEnd: r * (.26 + rand() * .16), flatten: .91, flare: .18, flareLength: 6,
        rootRidge: true, breakEnd: true,
      });
      if (i === 0 || i === 2 || i === 4) {
        const forkT = .54 + rand() * .1, forkAt = buttress.curve.getPointAt(forkT);
        const forkDirection = out.clone().multiplyScalar(.3).addScaledVector(turn, -curl).add(v(-.45, .1, 0)).normalize();
        const forkLength = reach * (.34 + rand() * .2);
        const forkEnd = forkAt.clone().addScaledVector(forkDirection, forkLength);
        branch(forkAt.clone().addScaledVector(forkDirection, -r * .22), forkEnd,
          turn.clone().multiplyScalar(forkLength * curl * .22), r * .47, buttress.id, forkT,
          { radiusEnd: r * .14, flatten: .88, flare: .2, rootRidge: true, breakEnd: true });
      }
    }
  } else if (kind === 'stump') {
    for (let i = 0; i < 4; i++) {
      const angle = i * 2.39996 + phase;
      const at = main.curve.getPoint(.02 + rand() * .08);
      const reach = radius * (2 + rand() * 2.8);
      const direction = v(Math.cos(angle), -.07, Math.sin(angle));
      const end = at.clone().addScaledVector(direction, reach);
      const r = radius * (.26 + rand() * .21);
      branch(at, end, v(-reach * .12, reach * .14, Math.sin(angle) * reach * .25), r,
        main.id, .04, { radiusEnd: r * .17, flatten: .66, flare: .5, breakEnd: true });
    }
  }
  // Balance the crown and the far trunk on one support plane. This pose is
  // derived from the skeleton, so changing mesh detail does not change tilt.
  let restAngle = 0;
  if (root) {
    const supports = branches.filter((b) => b.rootRidge).flatMap((b) => Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return { p: b.curve.getPointAt(t), r: THREE.MathUtils.lerp(b.radius, b.radiusEnd, t ** .8) * 1.12 };
    }));
    const tip = main.curve.getPointAt(1);
    let low = -.7, high = .1;
    for (let i = 0; i < 18; i++) {
      const a = (low + high) / 2, s = Math.sin(a), c = Math.cos(a);
      const crownFloor = Math.min(...supports.map(({ p, r }) => p.x * s + p.y * c - r));
      const tipFloor = tip.x * s + tip.y * c - main.radiusEnd;
      if (tipFloor > crownFloor) high = a; else low = a;
    }
    restAngle = (low + high) / 2;
  }
  return { kind, settings: { ...settings, length, diameter: radius * 2, breakage }, branches, main, length, radius, restAngle };
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
  const side = buffer(), ends = buffer(), seams = [];
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
        const lobes = 1 + (b.rootRidge ? .12 : .065) * Math.sin(angle * 3 + b.phase + t * 2) + .045 * Math.sin(angle * 7 - b.phase + t * 3.8);
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
        const heel = b.rootButt ? .72 + .28 * THREE.MathUtils.smoothstep(t, 0, .18) : 1;
        const r = taper * heel * (1 + b.flare * Math.exp(-t * (b.flareLength ?? 17)) + knot) * (lobes - grooves * .028 - cleft);
        const offset = x.clone().multiplyScalar(Math.cos(angle) * r).addScaledVector(z, Math.sin(angle) * r);
        offset.y *= b.flatten;
        // Long splinters are confined to the final centimetres, never teeth
        // repeated down the body. A broken cap stays closed below the chips.
        const chip = (Math.sin(angle * 5 + b.phase) * .32 + Math.sin(angle * 9 - b.phase) * .18 + Math.sin(angle * 2 + b.phase) * .45) * model.settings.breakage;
        const endChip = (j === segments ? b.radiusEnd * .95 : 0) * chip;
        const startChip = j === 0 && b.breakStart && !b.rootButt ? -b.radius * .28 * chip : 0;
        const p = center.clone().add(offset).addScaledVector(tangent, endChip + startChip);
        ring.push(p);
        const tone = .84 + .1 * Math.sin(b.phase + t * 2.8) - grooves * .13 - .1 * Math.exp(-t * 18) * (b.parent >= 0 ? 1 : 0);
        vertex(side, p, k / radial * around, t * b.length / .32, tone);
      }
      ringPoints.push(ring);
      seams.push([base + j * (radial + 1), base + j * (radial + 1) + radial]);
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
      if (!isEnd && b.rootButt) {
        // This is an uprooted heel, not a sawn cross-section. Continue the
        // weathered side surface around a lopsided, solid rounded end.
        const offset = side.positions.length / 3, layers = lod ? 4 : 8;
        for (let layer = 0; layer <= layers; layer++) {
          const a = layer / layers * Math.PI * .5, f = layer === layers ? 0 : Math.cos(a);
          for (let k = 0; k <= radial; k++) {
            const p = center.clone().lerp(ring[k], f).addScaledVector(tangent, -r * .9 * Math.sin(a))
              .addScaledVector(frames.normals[0], r * .18 * Math.sin(a) ** 2);
            const across = p.clone().sub(center);
            vertex(side, p, across.dot(frames.binormals[0]) / .32, across.dot(frames.normals[0]) / .32, .8 - Math.sin(a) * .05);
          }
          seams.push([offset + layer * (radial + 1), offset + layer * (radial + 1) + radial]);
        }
        for (let k = 0; k <= radial; k++) seams.push([base + k, offset + k]);
        for (let layer = 0; layer < layers; layer++) for (let k = 0; k < radial; k++) {
          const a = offset + layer * (radial + 1) + k;
          const c = layer === layers - 1 ? offset + layers * (radial + 1) : a + radial + 1;
          side.indices.push(a, c, a + 1);
          if (layer < layers - 1) side.indices.push(a + 1, c, c + 1);
        }
        continue;
      }
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
  const normal = wood.attributes.normal;
  for (const [a, z] of seams) {
    const n = v().fromBufferAttribute(normal, a).add(v().fromBufferAttribute(normal, z)).normalize();
    normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(z, n.x, n.y, n.z);
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
