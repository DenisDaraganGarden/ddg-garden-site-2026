import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fenceLayout, FENCE_PRISM_FACES as FACES } from './layout.js';
import { loadLibraryMaps } from '../materials/modelMaterials.js';

const COLORS = { metal: '#454b4c', timber: '#a18561', concrete: '#acaaa2', brick: '#927567' };

function buildMeshes(layout) {
    const groups = new Map(), meshes = [], resources = [];
    for (const part of layout.parts) {
        const tile = layout.fence.segments.find(s => s.id === part.owner)?.style.tile ?? 1;
        const key = `${part.kind}:${part.material}:${tile}:${part.round ? 'round' : 'box'}:${part.vertices ? 'wall' : [part.width, part.length, part.depth].map(v => v.toFixed(5)).join(':')}`;
        if (!groups.has(key)) groups.set(key, { parts: [], part, tile });
        groups.get(key).parts.push(part);
    }
    for (const { parts, part, tile } of groups.values()) {
        const material = new THREE.MeshStandardMaterial({ color: COLORS[part.kind], roughness: part.kind === 'metal' ? .4 : .85, metalness: part.kind === 'metal' ? .7 : 0 });
        resources.push(material);
        const metadata = parts.map(p => ({ fenceId: layout.fence.id, fenceSegment: p.owner }));
        if (part.vertices) {
            const positions = [], uv = [], owners = [];
            for (const p of parts) {
                for (let face = 0; face < FACES.length; face += 3) {
                    const points = FACES.slice(face, face + 3).map(i => p.vertices[i]);
                    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
                    const horizontal = Math.abs(normal.y) > Math.max(Math.abs(normal.x), Math.abs(normal.z));
                    const alongZ = Math.abs(normal.x) > Math.abs(normal.z);
                    for (const at of points) { positions.push(...at); uv.push((horizontal || !alongZ ? at.x : at.z) / tile, (horizontal ? at.z : at.y) / tile); }
                    owners.push({ fenceId: layout.fence.id, fenceSegment: p.owner });
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, material); mesh.userData.fenceFaces = owners;
            resources.push(geometry); meshes.push(mesh);
        } else {
            // Геометрия с метрическими UV на каждое сечение, инстансы — только
            // положение и поворот. Текстура не растягивается на высоком столбе.
            const geometry = part.round ? new THREE.CylinderGeometry(part.width / 2, part.width / 2, part.length, 8) : new THREE.BoxGeometry(part.width, part.length, part.depth);
            const uv = geometry.attributes.uv;
            const faceSizes = [[part.depth, part.length], [part.depth, part.length], [part.width, part.depth], [part.width, part.depth], [part.width, part.length], [part.width, part.length]];
            for (let i = 0; i < uv.count; i++) { const [w, h] = part.round ? [Math.PI * part.width, part.length] : faceSizes[Math.floor(i / 4)]; uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); }
            const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
            const inverse = new THREE.Matrix4().makeScale(1 / part.width, 1 / part.length, 1 / part.depth);
            parts.forEach((p, i) => mesh.setMatrixAt(i, p.matrix.clone().multiply(inverse)));
            mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
            mesh.userData.fenceParts = metadata;
            resources.push(geometry); meshes.push(mesh);
        }
        const mesh = meshes.at(-1);
        mesh.name = `fence-${layout.fence.id}-${meshes.length}`;
        mesh.castShadow = true; mesh.receiveShadow = true;
        material.userData.fenceLibrary = part.material;
    }
    return { meshes, resources };
}

function Fence({ fence }) {
    const key = JSON.stringify(fence);
    const built = useMemo(() => buildMeshes(fenceLayout(JSON.parse(key))), [key]);
    useEffect(() => {
        let alive = true;
        const maps = [];
        for (const resource of built.resources) {
            const id = resource.userData?.fenceLibrary;
            if (!id) continue;
            loadLibraryMaps(id).then(loaded => {
                if (!alive) { loaded.forEach(([, texture]) => texture.dispose()); return; }
                for (const [key, texture] of loaded) {
                    maps.push(texture);
                    if (key !== 'heightMap') resource[key] = texture;
                }
                resource.color.set('#ffffff'); resource.needsUpdate = true;
            }).catch(() => { /* Library may be unavailable in a portable preview; keep the base material. */ });
        }
        return () => { alive = false; maps.forEach(map => map.dispose()); built.meshes.forEach(mesh => mesh.dispose?.()); built.resources.forEach(resource => resource.dispose()); };
    }, [built]);
    return <group name={`fence-${fence.id}`} userData={{ fenceId: fence.id }}>{built.meshes.map(mesh => <primitive key={mesh.uuid} object={mesh} />)}</group>;
}
export default function Fences({ objects }) {
    return <group name="fences">{objects.map(fence => <Fence key={fence.id} fence={fence} />)}</group>;
}
