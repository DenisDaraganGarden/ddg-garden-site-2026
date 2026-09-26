import * as THREE from 'three';
import { hash } from './field.js';
import { gardenWind, GARDEN_WIND_GLSL } from '../planting/wind.js';

// Opaque, curved silhouettes: no overlapping transparent cards or per-leaf maps.
function leafGeometry(small = false) {
    const p = [], uv = [], indices = [], segments = 16;
    p.push(0, .82, .06); uv.push(.5, .5);
    for (let ring = 1; ring <= 2; ring++) for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2, r = ring / 2;
        const x = Math.sin(a) * .52 * r;
        const notch = small ? 0 : .26 * Math.pow(Math.max(0, -Math.cos(a)), 10);
        const z = (Math.cos(a) * .48 + notch) * r + .06;
        p.push(x, .82 - r * r * .08 + Math.abs(x) * .09 + Math.sin(a * 3) * r * .023, z);
        uv.push(x + .5, z + .45);
    }
    for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        indices.push(0, 1 + i, 1 + j, 1 + i, 17 + i, 17 + j, 1 + i, 17 + j, 1 + j);
    }
    const s = p.length / 3;
    p.push(-.012, 0, 0, .012, 0, 0, .012, .82, .06, -.012, .82, .06);
    uv.push(.5, 0, .51, 0, .51, .5, .5, .5); indices.push(s, s + 2, s + 1, s, s + 3, s + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
    return g;
}
// A thyme instance is a creeping sprig with many millimetre-sized leaves.
// It stays dense at garden scale without turning every tiny leaf into an instance.
function thymeGeometry() {
    const p = [], uv = [], ix = [];
    for (let stem = 0; stem < 5; stem++) {
        const a = stem * 2.39996, dx = Math.sin(a), dz = Math.cos(a);
        for (let pair = 1; pair <= 4; pair++) for (const side of [-1, 1]) {
            const t = pair / 4, x = dx * t * .42 + dz * side * .06, z = dz * t * .42 - dx * side * .06, y = .4 + .3 * Math.sin(t * 2.2 + stem);
            const b = p.length / 3, length = .075, width = .029;
            p.push(x, y + .07, z, x - dx * length, y, z - dz * length, x + dz * width, y + .02, z - dx * width, x + dx * length, y, z + dz * length, x - dz * width, y + .02, z + dx * width);
            uv.push(.5, .5, .5, 0, 1, .5, .5, 1, 0, .5);
            ix.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 3, b + 4, b, b + 4, b + 1);
        }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); return g;
}
function tuftGeometry() {
    const p = [], uv = [];
    for (let i = 0; i < 7; i++) {
        const a = i * 2.39996, x = Math.cos(a), z = Math.sin(a), h = .55 + hash(i, 2) * .45;
        p.push(x * .22, 0, z * .22, x * .5 - z * .13, h, z * .5 + x * .13, x * .5 + z * .13, h * .6, z * .5 - x * .13);
        uv.push(0, 0, .5, 1, 1, 0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function flowerGeometry() {
    const p = [], uv = [];
    for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * .4, b = a + .43, c = a - .43;
        p.push(0, 0, 0, Math.sin(b) * .5, .13, Math.cos(b) * .5, Math.sin(c) * .5, .13, Math.cos(c) * .5);
        uv.push(.5, .5, 1, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function maps(leaf) {
    const size = 256, color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + .5) / size - .5, v = (y + .5) / size;
        const vein = Math.exp(-Math.abs(u) * 250) + .55 * Math.exp(-Math.abs(Math.sin((v - Math.abs(u) * .8) * 30)) * 24);
        const grain = hash(x, y, 29), fine = hash(Math.floor(x / 3), Math.floor(y / 3), 19);
        const h = leaf ? .2 * vein + .02 * grain : .35 * fine + .65 * grain;
        heights[y * size + x] = h;
        const t = leaf ? .70 + .16 * vein + .12 * grain : .36 + .42 * fine + .22 * grain;
        const k = (y * size + x) * 4;
        color.set([255 * t, 255 * t, 255 * t, 255], k);
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const at = (a, b) => heights[((b + size) % size) * size + (a + size) % size];
        const n = new THREE.Vector3((at(x - 1, y) - at(x + 1, y)) * 2, (at(x, y - 1) - at(x, y + 1)) * 2, 1).normalize();
        normal.set([128 + n.x * 127, 128 + n.y * 127, 128 + n.z * 127, 255], (y * size + x) * 4);
    }
    return [color, normal].map((bytes, i) => {
        const tex = new THREE.DataTexture(bytes, size, size); tex.colorSpace = i ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true; return tex;
    });
}
let shared = null, users = 0;
export function acquireCoverAssets() {
    if (!shared) shared = { leaf: leafGeometry(), thyme: thymeGeometry(), moss: tuftGeometry(), flower: flowerGeometry(), leafMaps: maps(true), mossMaps: maps(false) };
    users++;
    let released = false;
    return { assets: shared, release() {
        if (released) return; released = true;
        if (--users === 0) { for (const value of Object.values(shared)) for (const resource of Array.isArray(value) ? value : [value]) resource.dispose(); shared = null; }
    } };
}
export function coverWind(material) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, gardenWind);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GARDEN_WIND_GLSL}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
            vec2 sway = gardenSway((modelMatrix * instanceMatrix[3]).xz, 1.0, 0.045, 1.8);
            transformed.xz += sway * position.y * position.y;
            #endif`);
    };
    material.customProgramCacheKey = () => 'groundcover-wind-1'; return material;
}
