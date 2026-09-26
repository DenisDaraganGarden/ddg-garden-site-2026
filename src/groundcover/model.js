import * as THREE from 'three';
import { coverBounds, coverField, hash } from './field.js';
import { normalizeCover, coverSeason } from './settings.js';
import { acquireCoverAssets, coverWind } from './assets.js';

export const COVER_BUDGET = 24000;
const UP = new THREE.Vector3(0, 1, 0);
// Clip a shared metre-space grid to the triangulated contour and holes. All
// neighbouring triangles meet at the same samples, including on curved ground.
function carpetGeometry(bed, cover, surface, exclusions) {
    const shape = new THREE.Shape(bed.points.map(([x, z]) => new THREE.Vector2(x, z)));
    for (const hole of bed.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
    const flat = new THREE.ShapeGeometry(shape), pos = flat.attributes.position, ix = flat.index;
    const bounds = coverBounds(bed), area = (bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0);
    const step = Math.max(.11, Math.sqrt(area / 14000)), positions = [], normals = [], colors = [], uv = [];
    const tint = new THREE.Color();
    const clip = (poly, axis, edge, sign) => {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[axis] - edge) * sign, db = (b[axis] - edge) * sign;
            if (da >= -1e-9) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        return out;
    };
    const add = (tri) => {
        const samples = tri.map(([x, z]) => surface.sample(x, z));
        if (samples.some((s) => !s)) return;
        const cx = tri.reduce((v, p) => v + p[0] / 3, 0), cz = tri.reduce((v, p) => v + p[1] / 3, 0);
        if (exclusions.some((p) => Math.hypot(cx - p.x, cz - p.z) < p.radius)) return;
        for (const k of [0, 2, 1]) {
            const [x, z] = tri[k], s = samples[k], f = coverField(bed, cover, x, z, exclusions);
            positions.push(x, s.height + .006 + f.height, z); normals.push(...s.normal); uv.push(x * 7, z * 7);
            tint.set(f.kind === 'leaf' ? '#53603a' : f.kind === 'thyme' ? '#606b3e' : '#798345');
            tint.multiplyScalar(.68 + f.vigor * .38); colors.push(tint.r, tint.g, tint.b);
        }
    };
    for (let i = 0; i < ix.count; i += 3) {
        const tri = [0, 1, 2].map((k) => { const j = ix.getX(i + k); return [pos.getX(j), pos.getY(j)]; });
        const xs = tri.map((p) => p[0]), zs = tri.map((p) => p[1]);
        for (let iz = Math.floor(Math.min(...zs) / step); iz <= Math.floor(Math.max(...zs) / step); iz++) for (let ix = Math.floor(Math.min(...xs) / step); ix <= Math.floor(Math.max(...xs) / step); ix++) {
            let poly = clip(tri, 0, ix * step, 1); poly = clip(poly, 0, (ix + 1) * step, -1);
            poly = clip(poly, 1, iz * step, 1); poly = clip(poly, 1, (iz + 1) * step, -1);
            for (let k = 1; k + 1 < poly.length; k++) add([poly[0], poly[k], poly[k + 1]]);
        }
    }
    flat.dispose();
    const g = new THREE.BufferGeometry();
    for (const [key, data, size] of [['position', positions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uv, 2]]) g.setAttribute(key, new THREE.Float32BufferAttribute(data, size));
    return g;
}

export function buildCover(bed, surface, { exclusions = [], budget = COVER_BUDGET } = {}) {
    const cover = normalizeCover(bed.cover), group = new THREE.Group(); group.name = `groundcover-${bed.id}`;
    const lease = acquireCoverAssets(), { assets } = lease;
    const ground = new THREE.MeshStandardMaterial({ vertexColors: true, map: assets.mossMaps[0], normalMap: assets.mossMaps[1], roughness: .95 });
    const leaf = coverWind(new THREE.MeshStandardMaterial({ map: assets.leafMaps[0], normalMap: assets.leafMaps[1], side: THREE.DoubleSide, roughness: .49 }));
    const thyme = coverWind(new THREE.MeshStandardMaterial({ map: assets.leafMaps[0], side: THREE.DoubleSide, roughness: .82 }));
    const moss = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
    const flower = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .85 });
    const depth = coverWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }));
    const distance = coverWind(new THREE.MeshDistanceMaterial({ side: THREE.DoubleSide }));
    const materials = { leaf, thyme, moss, flower };
    const carpet = carpetGeometry(bed, cover, surface, exclusions), mat = new THREE.Matrix4(), orient = new THREE.Quaternion(), yaw = new THREE.Quaternion();
    const n = new THREE.Vector3(), scale = new THREE.Vector3(), point = new THREE.Vector3(), color = new THREE.Color();
    const base = new THREE.Mesh(carpet, ground); base.receiveShadow = true; base.userData.plantingBed = bed.id; group.add(base);
    const b = coverBounds(bed), area = Math.max(.01, (b.x1 - b.x0) * (b.z1 - b.z0));
    const spacing = Math.max(cover.leafSize * .68 / Math.sqrt(cover.density), Math.sqrt(area * 4 / Math.max(1, budget)));
    const cellSize = Math.max(4, Math.sqrt(area / 16));
    const cells = new Map(); let count = 0;
    const add = (kind, x, z, s, width, height, lift, angle, variation) => {
        if (count >= budget) return;
        const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}:${kind}`;
        if (!cells.has(key)) cells.set(key, { kind, items: [] });
        n.fromArray(s.normal); orient.setFromUnitVectors(UP, n); yaw.setFromAxisAngle(UP, angle); orient.multiply(yaw);
        if (kind === 'leaf') orient.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (variation - .5) * .55));
        point.set(x, s.height, z).addScaledVector(n, lift); scale.set(width, height, width); mat.compose(point, orient, scale);
        color.setRGB(.75 + variation * .25, .8 + variation * .2, .7 + variation * .3);
        cells.get(key).items.push({ matrix: mat.toArray(), color: color.clone() }); count++;
    };
    for (let iz = 0; iz < Math.ceil((b.z1 - b.z0) / spacing); iz++) for (let ix = 0; ix < Math.ceil((b.x1 - b.x0) / spacing); ix++) {
        const x = b.x0 + (ix + .15 + hash(ix, iz, bed.seed) * .7) * spacing, z = b.z0 + (iz + .15 + hash(ix, iz, bed.seed + 7) * .7) * spacing;
        const f = coverField(bed, cover, x, z, exclusions), r = hash(ix, iz, bed.seed + 53);
        if (r > f.occupancy) continue;
        const s = surface.sample(x, z); if (!s || s.normal[1] < .45) continue;
        const angle = hash(ix, iz, bed.seed + 11) * Math.PI * 2;
        if (f.kind === 'leaf') {
            for (let j = 0; j < 2; j++) add('leaf', x, z, s, cover.leafSize * (.75 + r * .55), cover.height * (.65 + r * .55) * (1 - j * .24), f.height, angle + j * 2.6, f.vigor);
        } else if (f.kind === 'thyme') {
            add('thyme', x, z, s, .15 + r * .04, .035 + cover.height * .18, f.height, angle, f.vigor);
            for (let j = 0; j < 3; j++) {
                const a = angle + j * 2.4, px = x + Math.sin(a) * .035, pz = z + Math.cos(a) * .035, root = surface.sample(px, pz);
                if (r > .32 && root && coverField(bed, cover, px, pz, exclusions).occupancy > .1) add('flower', px, pz, root, .016, .018, f.height + .025 + cover.height * .14, a, 1);
            }
        } else for (let j = 0; j < 3; j++) {
            const a = angle + j * 2.4, px = x + Math.sin(a) * spacing * .3, pz = z + Math.cos(a) * spacing * .3, root = surface.sample(px, pz);
            if (root && coverField(bed, cover, px, pz, exclusions).occupancy > .1) add('moss', px, pz, root, .016 + r * .013, .008 + r * .011, f.height * .65, a, f.vigor);
        }
    }
    let triangles = carpet.attributes.position.count / 3;
    const blooms = [];
    for (const { kind, items } of cells.values()) {
        const mesh = new THREE.InstancedMesh(assets[kind], materials[kind], items.length);
        items.forEach((item, i) => { mesh.setMatrixAt(i, mat.fromArray(item.matrix)); mesh.setColorAt(i, item.color); });
        mesh.receiveShadow = true; mesh.castShadow = kind === 'leaf' || kind === 'thyme';
        mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = distance;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.boundingSphere.radius += .03;
        mesh.userData.groundcover = kind; mesh.userData.plantingBed = bed.id; group.add(mesh);
        if (kind === 'flower') { mesh.userData.maxCount = items.length; blooms.push(mesh); }
        triangles += (assets[kind].index?.count ?? assets[kind].attributes.position.count) / 3 * items.length;
    }
    group.userData.coverStats = { instances: count, triangles, batches: cells.size + 1, capped: spacing > cover.leafSize * .68 / Math.sqrt(cover.density) + .001 };
    let disposed = false;
    return { group, stats: group.userData.coverStats, update(month = 6, environment = 1) {
        const season = coverSeason(month, cover);
        leaf.color.set('#59713b').lerp(new THREE.Color('#676246'), season.winter * .38 + season.drought * .22);
        thyme.color.set('#788358').lerp(new THREE.Color('#8e8357'), season.winter * .4 + season.drought * .5);
        moss.color.set('#697844').lerp(new THREE.Color('#9a8856'), season.drought * .6);
        ground.color.setRGB(1, 1, 1).lerp(new THREE.Color('#b8a486'), season.winter * .16 + season.drought * .3);
        flower.color.set('#ece9d4'); for (const mesh of blooms) { mesh.count = Math.floor(mesh.userData.maxCount * season.bloom); mesh.visible = mesh.count > 0; }
        leaf.roughness = .62 - cover.moisture * .2; leaf.color.multiplyScalar(.94 + cover.shade * .1);
        for (const material of [ground, ...Object.values(materials)]) material.envMapIntensity = environment;
    }, dispose() {
        if (disposed) return; disposed = true;
        group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); carpet.dispose();
        for (const m of [ground, depth, distance, ...Object.values(materials)]) m.dispose(); lease.release();
    } };
}
