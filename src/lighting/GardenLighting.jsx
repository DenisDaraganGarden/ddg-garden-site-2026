import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gardenLights, housingOf, typePhotometry } from './fixtures.js';
import { gardenLightUniforms, setGardenLightField } from './gardenLightShader.js';
import { packLightField } from './lightField.js';
import { useLuminaireTypes } from './luminaireLibrary.js';
import { LUX_TO_SCENE } from './photometry.js';

// Освещение сада в сцене (docs/garden-lighting-2026-09-25.md): корпуса
// светильников — по пачке экземпляров на тип (основание, голова, линза), их
// свет — световым полем в шейдерах всех материалов (gardenLightShader.js),
// ореол у линзы — одна пачка точек на все приборы. Свет включает фотореле по
// ночи неба (lightingMode 'auto') или руками ('on' / 'off').
const lens = { uLensLevel: { value: 0 } };
const capacityFor = (count) => 2 ** Math.ceil(Math.log2(Math.max(8, count)));
const none = () => {};

// Линза светится цветом света; яркость — рабочая яркость прибора × фотореле.
function lensMaterial(color) {
    const material = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.3, metalness: 0, emissive: new THREE.Color().setRGB(...color, THREE.LinearSRGBColorSpace), emissiveIntensity: 1 });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, lens);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aLum;\nvarying float vLum;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLum = aLum;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uLensLevel;\nvarying float vLum;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLum * uLensLevel;');
    };
    material.customProgramCacheKey = () => 'garden-lens-v1';
    return material;
}

let haloTexture = null;
function halo() {
    if (haloTexture || typeof document === 'undefined') return haloTexture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(canvas);
    haloTexture.colorSpace = THREE.SRGBColorSpace;
    return haloTexture;
}

function LuminaireBatch({ type, items, poses, color }) {
    const housing = housingOf(type, 0);
    const capacity = capacityFor(items.length);
    const base = useRef(), head = useRef(), glass = useRef();
    const parts = useMemo(() => {
        const lensGeometry = housing.lens.clone();
        lensGeometry.setAttribute('aLum', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
        const { color: finish = '#2b2d2f', metal = 0.4, rough = 0.5 } = type.housing ?? {};
        return {
            lensGeometry,
            body: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: metal, roughness: rough }),
            lens: lensMaterial(color),
            finish: new THREE.Color(finish),
        };
    }, [housing, capacity, type.housing, color]);
    useEffect(() => () => { parts.lensGeometry.dispose(); parts.body.dispose(); parts.lens.dispose(); }, [parts]);

    useLayoutEffect(() => {
        const meshes = [base.current, head.current, glass.current];
        if (meshes.some((mesh) => !mesh)) return;
        const tint = new THREE.Color();
        items.forEach((fixture, index) => {
            const pose = poses.get(fixture.id);
            base.current.setMatrixAt(index, pose.mount);
            head.current.setMatrixAt(index, pose.head);
            glass.current.setMatrixAt(index, pose.head);
            tint.copy(fixture.finish ? tint.set(fixture.finish) : parts.finish);
            base.current.setColorAt(index, tint);
            head.current.setColorAt(index, tint);
            parts.lensGeometry.attributes.aLum.setX(index, fixture.dim ?? 1);
        });
        parts.lensGeometry.attributes.aLum.needsUpdate = true;
        const ids = items.map((fixture) => fixture.id);
        for (const mesh of meshes) {
            mesh.count = items.length;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.userData.lightingFixtures = ids;
            mesh.computeBoundingSphere();
        }
    }, [items, poses, parts]);

    return <>
        <instancedMesh ref={base} name="luminaires-base" args={[housing.base, parts.body, capacity]} castShadow receiveShadow frustumCulled={false} />
        <instancedMesh ref={head} name="luminaires-head" args={[housing.head, parts.body, capacity]} castShadow receiveShadow frustumCulled={false} />
        <instancedMesh ref={glass} name="luminaires-lens" args={[parts.lensGeometry, parts.lens, capacity]} frustumCulled={false} />
    </>;
}

// Выбранный светильник: белое кольцо на поверхности, линия к точке наводки и
// якоря для манипулятора (корпус и цель — две ручки, как у light1/light1target).
function Selection({ fixture, pose }) {
    const line = useMemo(() => (fixture.target ? new THREE.BufferGeometry().setFromPoints([pose.emitter, new THREE.Vector3(...fixture.target)]) : null), [fixture.target, pose]);
    useEffect(() => () => line?.dispose(), [line]);
    const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(fixture.nx, fixture.ny, fixture.nz)), [fixture.nx, fixture.ny, fixture.nz]);
    return <>
        <object3D name={`luminaire-${fixture.id}`} position={[fixture.x, fixture.y, fixture.z]} />
        {fixture.target ? <object3D name={`luminaire-aim-${fixture.id}`} position={fixture.target} /> : null}
        <mesh position={[fixture.x + fixture.nx * 0.02, fixture.y + fixture.ny * 0.02, fixture.z + fixture.nz * 0.02]} quaternion={quaternion} raycast={none} renderOrder={9}>
            <ringGeometry args={[0.2, 0.225, 48]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {line ? <line geometry={line} raycast={none} renderOrder={9}><lineBasicMaterial color="#ffffff" transparent opacity={0.8} depthTest={false} toneMapped={false} /></line> : null}
    </>;
}

export default function GardenLighting({ settings, night = 0, selectedId = null }) {
    const types = useLuminaireTypes();
    const fixtures = settings.lightingFixtures;
    const built = useMemo(() => gardenLights(fixtures ?? [], types), [fixtures, types]);
    // Высоты, где есть что освещать: от земли под приборами до крон и фасадов
    // над ними — отрезает у бьющих вверх светов клетки, до которых они не
    // достают, и списки клеток не переполняются.
    useEffect(() => {
        const heights = built.lights.map((light) => light.y);
        const band = heights.length ? [Math.min(...heights) - 2, Math.max(...heights) + 15] : undefined;
        setGardenLightField(packLightField(built.lights, band ? { band } : {}), built.profiles, built.rows);
    }, [built]);

    const on = settings.lightingMode === 'on' ? 1 : settings.lightingMode === 'off' ? 0 : night;
    const exposure = 2 ** (settings.lightingExposure ?? 0);
    const halos = useRef();
    useFrame(() => {
        gardenLightUniforms.uGardenLevel.value = LUX_TO_SCENE * exposure * on;
        lens.uLensLevel.value = 4 * on;
        if (halos.current) halos.current.material.opacity = 0.75 * on;
    }, -3);
    useEffect(() => () => { gardenLightUniforms.uGardenLevel.value = 0; lens.uLensLevel.value = 0; }, []);

    const batches = useMemo(() => {
        const byType = new Map();
        for (const fixture of fixtures ?? []) {
            if (!built.poses.has(fixture.id)) continue;
            if (!byType.has(fixture.type)) byType.set(fixture.type, []);
            byType.get(fixture.type).push(fixture);
        }
        return [...byType];
    }, [fixtures, built]);

    const glow = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(built.lights.length * 3), colors = new Float32Array(built.lights.length * 3);
        built.lights.forEach((light, index) => {
            positions.set([light.x, light.y, light.z], index * 3);
            const strength = Math.min(1, Math.sqrt(light.peak / 400));
            colors.set(light.color.map((value) => value * strength), index * 3);
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }, [built]);
    useEffect(() => () => glow.dispose(), [glow]);
    const selected = fixtures?.find((fixture) => fixture.id === selectedId);

    return <group name="luminaires">
        {batches.map(([id, items]) => <LuminaireBatch key={id} type={types.get(id)} items={items} poses={built.poses} color={typePhotometry(types.get(id)).color} />)}
        {built.lights.length ? <points ref={halos} geometry={glow} raycast={none} renderOrder={4}>
            <pointsMaterial size={0.55} sizeAttenuation map={halo()} vertexColors transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points> : null}
        {selected && built.poses.has(selected.id) ? <Selection fixture={selected} pose={built.poses.get(selected.id)} /> : null}
    </group>;
}
