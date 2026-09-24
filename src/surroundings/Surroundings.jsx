import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { activeProjectId } from '../features/engine/projectApi.js';
import { useSurroundingsData } from './data.js';
import { barriersGeometry, buildingsGeometry, groundSampler, surroundingsAnchor, terrainDisc, treeInstances } from './geometry.js';
import { drawSurroundingsMap, surroundingsPalette } from './raster.js';

// Окружение участка в сцене: земля кругом с рельефом и картой дорог, дома
// коробками, заборы, деревья — макет вокруг модели SketchUp. Всё одним
// материалом на слой и одним вызовом отрисовки на слой. Имя группы —
// `surroundings` (реестр sceneObjects.js): щелчок по ней открывает панель.
const MAP_SIZE = 2048;
const UP = new THREE.Vector3(0, 1, 0);

function toGeometry({ position, normal, uv, index }) {
    if (!position.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (index) geometry.setIndex(new THREE.BufferAttribute(index, 1));
    if (normal) geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
}

// Дерево макета: ствол и шар кроны высотой 1, растягивается под высоту дерева.
function unitTree() {
    const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6).translate(0, 0.21, 0).toNonIndexed();
    const crown = new THREE.IcosahedronGeometry(0.3, 1).translate(0, 0.66, 0);
    const merged = mergeGeometries([trunk, crown]);
    trunk.dispose();
    crown.dispose();
    return merged;
}

// Сделанное в useMemo освобождается, когда его заменили или слой убрали.
const useDispose = (value) => useEffect(() => () => value?.dispose?.(), [value]);

function SurroundingsModel({ data, settings, reflection }) {
    const gl = useThree((state) => state.gl);
    const radius = Math.min(settings.surroundingsRadius, data.half);
    const { surroundingsClear: clear, surroundingsRelief: relief } = settings;
    const ground = useMemo(() => groundSampler(data.terrain, { relief, clear }), [data, relief, clear]);

    const land = useMemo(() => toGeometry(terrainDisc(ground, radius, data.half)), [ground, radius, data]);
    const houses = useMemo(() => (settings.surroundingsBuildings ? toGeometry(buildingsGeometry(data.buildings, ground, { radius, clear })) : null),
        [settings.surroundingsBuildings, data, ground, radius, clear]);
    const fences = useMemo(() => (settings.surroundingsFences ? toGeometry(barriersGeometry(data.lines, ground, { radius, clear })) : null),
        [settings.surroundingsFences, data, ground, radius, clear]);
    const hedges = useMemo(() => (settings.surroundingsFences ? toGeometry(barriersGeometry(data.lines, ground, { radius, clear, hedges: true })) : null),
        [settings.surroundingsFences, data, ground, radius, clear]);
    useDispose(land);
    useDispose(houses);
    useDispose(fences);
    useDispose(hedges);

    const { surroundingsGroundColor: groundColor, surroundingsRoadColor: roadColor, surroundingsGreenColor: greenColor, surroundingsWaterColor: waterColor } = settings;
    const palette = useMemo(() => surroundingsPalette(groundColor, roadColor, greenColor, waterColor), [groundColor, roadColor, greenColor, waterColor]);
    const map = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = MAP_SIZE;
        canvas.height = MAP_SIZE;
        drawSurroundingsMap(canvas, data, palette);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        return texture;
    }, [data, palette, gl]);
    useDispose(map);

    const materials = useMemo(() => ({
        land: new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
        house: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
        tree: new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }),
    }), []);
    useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
    useEffect(() => {
        materials.land.map = map;
        materials.land.needsUpdate = true;
    }, [materials, map]);
    useEffect(() => {
        materials.house.color.set(settings.surroundingsBuildingColor);
        materials.tree.color.set(palette.areas.forest);
        for (const material of Object.values(materials)) material.envMapIntensity = reflection;
    }, [materials, settings.surroundingsBuildingColor, palette, reflection]);

    const tree = useMemo(unitTree, []);
    useDispose(tree);
    const forest = useMemo(() => {
        if (!settings.surroundingsTrees) return null;
        const points = treeInstances(data, ground, { radius, clear });
        const count = points.length / 4;
        if (!count) return null;
        const mesh = new THREE.InstancedMesh(tree, materials.tree, count);
        const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), at = new THREE.Vector3(), scale = new THREE.Vector3();
        for (let i = 0; i < count; i += 1) {
            const [x, y, z, height] = points.subarray(i * 4, i * 4 + 4);
            turn.setFromAxisAngle(UP, (x * 12.9898 + z * 78.233) % (2 * Math.PI));
            matrix.compose(at.set(x, y - 0.1, z), turn, scale.set(height, height, height));
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }, [settings.surroundingsTrees, data, ground, radius, clear, tree, materials]);
    useDispose(forest);

    const anchor = surroundingsAnchor(settings);
    return <group name="surroundings" position={[anchor.x, anchor.y, anchor.z]} rotation={[0, anchor.yaw, 0]}>
        {land ? <mesh geometry={land} material={materials.land} receiveShadow /> : null}
        {houses ? <mesh geometry={houses} material={materials.house} castShadow receiveShadow /> : null}
        {fences ? <mesh geometry={fences} material={materials.house} castShadow receiveShadow /> : null}
        {hedges ? <mesh geometry={hedges} material={materials.tree} castShadow receiveShadow /> : null}
        {forest ? <primitive object={forest} /> : null}
    </group>;
}

export default function Surroundings({ settings, lighting }) {
    const data = useSurroundingsData(activeProjectId(), settings.surroundingsStamp);
    return data?.half ? <SurroundingsModel data={data} settings={settings} reflection={lighting?.environment?.reflection ?? 1} /> : null;
}
