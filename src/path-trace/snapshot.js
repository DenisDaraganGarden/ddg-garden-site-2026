import * as THREE from 'three';
import { physicalCopy, bakeSurface, bakeEnvironment, groundUv } from './bake.js';
import { addTraceLights } from './lights.js';
import { bakeBackground } from './sky.js';

export const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
export const checkAbort = (signal) => { if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError'); };
const helpers = new Set(['sky-dome', 'painterly-sky', 'annotations', 'walk-start', 'lighting-connections', 'cursor-flashlight', 'cursor-flashlight-glint']);
export function renderableMesh(object) {
    if (!object.isMesh || !object.geometry?.attributes.position) return false;
    for (let p = object; p; p = p.parent) {
        if (!p.visible || p.userData.editorOnly || p.isTransformControlsRoot || p.type.startsWith('TransformControls') || helpers.has(p.name)) return false;
    }
    return true;
}

function geometryCopy(mesh) {
    const source = mesh.geometry, out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'uv2', 'color']) {
        const a = source.attributes[name]; if (!a) continue;
        const data = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) data[i * a.itemSize + j] = a.getComponent(i, j);
        out.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize));
    }
    if (source.index) out.setIndex(source.index.clone());
    for (const group of source.groups) out.addGroup(group.start, group.count, group.materialIndex);
    out.setDrawRange(source.drawRange.start, source.drawRange.count);
    if (mesh.isSkinnedMesh || mesh.morphTargetInfluences?.some(Boolean)) {
        const p = new THREE.Vector3(), position = out.attributes.position;
        for (let i = 0; i < position.count; i++) { mesh.getVertexPosition(i, p); position.setXYZ(i, p.x, p.y, p.z); }
        out.computeVertexNormals();
    }
    return out;
}

// The low-level tracer merges one material per mesh. Split draw groups before
// that merge; flattening material arrays shifts every subsequent material ID.
export function splitDrawGroups(geometry, materials) {
    const total = geometry.index?.count ?? geometry.attributes.position.count;
    const start = geometry.drawRange.start, end = Math.min(total, start + geometry.drawRange.count);
    if (!Array.isArray(materials) && start === 0 && end === total && materials.visible && materials.opacity > 0) return [{ geometry, material: materials }];
    const ranges = Array.isArray(materials) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const list = Array.isArray(materials) ? materials : [materials], indices = new Map();
    for (const group of ranges) {
        const material = list[group.materialIndex];
        if (!material?.visible || material.opacity === 0) continue;
        const selected = indices.get(material) ?? []; indices.set(material, selected);
        for (let i = Math.max(start, group.start); i < Math.min(end, group.start + group.count); i++) selected.push(geometry.index ? geometry.index.getX(i) : i);
    }
    return [...indices].filter(([, selected]) => selected.length).map(([material, selected]) => {
        const remap = new Map(), vertices = [], index = selected.map((old) => {
            if (!remap.has(old)) { remap.set(old, vertices.length); vertices.push(old); }
            return remap.get(old);
        });
        const part = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const data = new Float32Array(vertices.length * attribute.itemSize);
            vertices.forEach((old, i) => { for (let j = 0; j < attribute.itemSize; j++) data[i * attribute.itemSize + j] = attribute.getComponent(old, j); });
            part.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
        }
        part.setIndex(index);
        return { geometry: part, material };
    });
}

export function normalizeVertexColors(geometry) {
    const before = geometry.attributes.color, count = geometry.attributes.position.count;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        data[i * 4] = before?.getX(i) ?? 1; data[i * 4 + 1] = before?.getY(i) ?? 1; data[i * 4 + 2] = before?.getZ(i) ?? 1;
        data[i * 4 + 3] = before?.itemSize === 4 ? before.getW(i) : 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 4));
}

export function posedPlantGeometry(geometry, matrix, camera, descriptor, flip = 1, tone = 1) {
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    const root = new THREE.Vector3().setFromMatrixPosition(matrix), eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const yaw = Math.atan2(eye.x - root.x, eye.z - root.z), u = descriptor.uniforms;
    const c = Math.cos(yaw), s = Math.sin(yaw), color = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i) * flip * u.uGrow.value.x;
        position.setXYZ(i, x * c, position.getY(i) * u.uGrow.value.y, -x * s);
        if (normal) normal.setXYZ(i, s, .9, c);
        color.fill(tone, i * 3, i * 3 + 3);
    }
    // Mirroring a card must not invert its face relative to its lighting normal.
    // The raster shader used a negative X scale without updating winding.
    if (flip < 0 && geometry.index) {
        for (let i = 0; i < geometry.index.count; i += 3) {
            const first = geometry.index.getX(i); geometry.index.setX(i, geometry.index.getX(i + 2)); geometry.index.setX(i + 2, first);
        }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    if (normal) for (let i = 0; i < normal.count; i++) { const n = new THREE.Vector3().fromBufferAttribute(normal, i).normalize(); normal.setXYZ(i, n.x, n.y, n.z); }
    return geometry;
}

export async function snapshotScene({ scene: source, camera, gl }, { signal, textureSize = 1024, onProgress = () => {} } = {}) {
    const resources = new Set(), own = (value) => { resources.add(value); return value; };
    const dispose = () => { resources.forEach((item) => item.dispose()); resources.clear(); };
    const scene = new THREE.Scene(), materials = new Map();
    const stats = { meshes: 0, triangles: 0, lights: 0 };
    try {
        source.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const copyCamera = camera.clone(); copyCamera.position.setFromMatrixPosition(camera.matrixWorld); camera.getWorldQuaternion(copyCamera.quaternion); copyCamera.scale.set(1, 1, 1); copyCamera.updateMatrixWorld(true);
        const objects = []; source.traverseVisible((object) => { if (renderableMesh(object)) objects.push(object); });
        for (let m = 0; m < objects.length; m++) {
            checkAbort(signal); const object = objects[m];
            const list = Array.isArray(object.material) ? object.material : [object.material];
            if (list.every((mat) => !mat.visible || mat.opacity === 0)) continue;
            const exported = list.map((mat) => {
                if (materials.has(mat)) return materials.get(mat);
                if (mat.isShaderMaterial) throw new Error(`Материал пока не поддерживает трассировку / Unsupported material: ${object.name || mat.name || 'ShaderMaterial'}`);
                let next;
                if (mat.pathTraceSurface) next = bakeSurface(gl, { ...object, material: mat }, copyCamera, textureSize, own);
                else next = physicalCopy(mat);
                if (mat.userData.glassOn) {
                    next.transmission = 1; next.ior = 1.5; next.thickness = .008; next.transparent = false; next.opacity = 1;
                    next.color.copy(mat.userData.glassBase.color); next.metalness = 0;
                    next.attenuationDistance = .5; next.attenuationColor.copy(next.color);
                }
                // Measured fixture profiles already include their housing cutoff.
                // Match gardenShadows: do not occlude them a second time at the emitter.
                if (object.name.startsWith('luminaires-')) next.castShadow = false;
                if (object.name === 'luminaires-lens') next.emissiveIntensity *= mat.pathTraceLens?.uLensLevel.value ?? 0;
                next.vertexColors = true;
                materials.set(mat, own(next)); return next;
            });
            const count = object.isInstancedMesh ? object.count : 1;
            for (let i = 0; i < count; i++) {
                const matrix = object.matrixWorld.clone();
                if (object.isInstancedMesh) { const local = new THREE.Matrix4(); object.getMatrixAt(i, local); matrix.multiply(local); }
                const geometry = own(geometryCopy(object));
                const descriptor = list[0].pathTraceSurface;
                if (descriptor?.kind === 'plant') {
                    const vary = object.geometry.attributes.aVary;
                    posedPlantGeometry(geometry, matrix, copyCamera, descriptor, vary?.getX(i) ?? 1, vary?.getY(i) ?? 1);
                } else if (descriptor) groundUv(geometry);
                if (object.instanceColor) {
                    const tint = new THREE.Color(); object.getColorAt(i, tint);
                    const before = geometry.attributes.color, position = geometry.attributes.position, color = new Float32Array(position.count * 3);
                    for (let v = 0; v < position.count; v++) { color[v * 3] = tint.r * (before?.getX(v) ?? 1); color[v * 3 + 1] = tint.g * (before?.getY(v) ?? 1); color[v * 3 + 2] = tint.b * (before?.getZ(v) ?? 1); }
                    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
                }
                // All merged colors must have the same stride. The library's
                // missing-color fallback is RGBA, while imported colors are RGB.
                normalizeVertexColors(geometry);
                const parts = splitDrawGroups(geometry, Array.isArray(object.material) ? exported : exported[0]);
                for (const part of parts) {
                    let material = part.material;
                    if (object.name === 'luminaires-lens') {
                        material = own(physicalCopy(material)); material.castShadow = false;
                        material.emissiveIntensity *= object.geometry.attributes.aLum?.getX(i) ?? 1;
                    }
                    const mesh = new THREE.Mesh(own(part.geometry), material);
                    mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); scene.add(mesh);
                    // A whole single-material mesh keeps its own geometry, which may be non-indexed.
                    const vertices = part.geometry.index?.count ?? part.geometry.attributes.position.count;
                    stats.meshes++; stats.triangles += Math.floor(vertices / 3);
                }
                if (!parts.some((part) => part.geometry === geometry)) { geometry.dispose(); resources.delete(geometry); }
                if (stats.triangles > 12_000_000) throw new Error('Сцена превышает бюджет 12 млн треугольников. / Scene exceeds the 12 million triangle budget.');
            }
            if (m % 16 === 0) { onProgress(m / Math.max(1, objects.length)); await nextTask(); }
        }
        if (!stats.meshes) throw new Error('Нет загруженной геометрии. / No geometry is loaded.');
        stats.lights = addTraceLights(source, scene, own);
        scene.environment = bakeEnvironment(gl, source, own);
        scene.environmentIntensity = source.environmentIntensity ?? 1;
        scene.environmentRotation.copy(source.environmentRotation);
        const background = bakeBackground(gl, source, own);
        scene.background = background.texture ?? scene.environment;
        scene.backgroundIntensity = background.intensity;
        scene.backgroundRotation.copy(background.rotation);
        scene.updateMatrixWorld(true);
        return { scene, camera: copyCamera, stats, dispose };
    } catch (error) { dispose(); throw error; }
}
