import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sourceGeometry, triangleCount, triangleMaterial } from './selection.js';

export default function MaterialSelection({ targets }) {
    return <SelectionOverlay targets={targets} />;
}

// Заливка и рёбра выбранных треугольников поверх модели — для материалов и
// для выбора граней внутри группы (как в SketchUp). Цель — { mesh, triangles,
// materialName? }: с именем материала берутся только его треугольники.
// edges — рисовать рёбра (контур и изломы между плоскостями), edgeColor — их цвет.
export function SelectionOverlay({ targets, color = '#dac489', opacity = 0.16, edges: withEdges = true, edgeColor = color }) {
    const items = useMemo(() => (targets ?? []).flatMap((target) => {
        const mesh = target.mesh;
        if (!mesh?.parent) return [];
        const source = sourceGeometry(mesh), position = source.attributes.position, index = source.index;
        const triangles = target.triangles ?? Array.from({ length: triangleCount(source) }, (_, i) => i);
        const base = mesh.userData.faceSplit?.material ?? mesh.material;
        const chosen = triangles.filter((t) => !target.materialName || !Array.isArray(base) || base[triangleMaterial(source, t)]?.name === target.materialName);
        const vertices = new Float32Array(chosen.length * 9);
        chosen.forEach((t, i) => { for (let k = 0; k < 3; k += 1) {
            const v = index ? index.getX(t * 3 + k) : t * 3 + k;
            vertices.set([position.getX(v), position.getY(v), position.getZ(v)], i * 9 + k * 3);
        } });
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
        const overlay = new THREE.Mesh(geometry, material); overlay.raycast = () => {}; overlay.userData.isolateKeep = true; overlay.renderOrder = 900; overlay.matrixAutoUpdate = false;
        if (!withEdges) return [{ mesh, overlay, geometry, material }];
        const edges = new THREE.EdgesGeometry(geometry, 3), lineMaterial = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.9, depthWrite: false });
        const lines = new THREE.LineSegments(edges, lineMaterial); lines.raycast = () => {}; lines.renderOrder = 901; overlay.add(lines);
        return [{ mesh, overlay, geometry, material, edges, lineMaterial }];
    }), [targets, color, opacity, withEdges, edgeColor]);
    useFrame(() => { for (const { mesh, overlay } of items) { overlay.matrix.copy(mesh.matrixWorld); let visible = true, inScene = false;
        for (let node = mesh; node; node = node.parent) { if (!node.visible) visible = false; if (node.isScene) inScene = true; }
        overlay.visible = visible && inScene; } });
    useEffect(() => () => items.forEach(({ geometry, material, edges, lineMaterial }) => { geometry.dispose(); material.dispose(); edges?.dispose(); lineMaterial?.dispose(); }), [items]);
    return items.map(({ overlay }) => <primitive key={overlay.uuid} object={overlay} />);
}
