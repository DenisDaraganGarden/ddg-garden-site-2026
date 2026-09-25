import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cellOf } from './electric.js';
import { encodeGrid } from './gridCodec.js';
import { activeProjectId, projectStore } from '../features/engine/projectApi.js';
import { useLuminaireTypes } from './luminaireLibrary.js';
import { setLightingState } from './lightingStore.js';
import { lightingNetwork } from './network.js';
import { buildSiteGrid, sceneTrees } from './siteGrid.js';

// Слой «Подключения» (docs/garden-lighting-2026-09-25.md): сетка участка
// строится из модели, когда она пришла (и ещё раз позже — модели грузятся не
// сразу), электрика считается из данных проекта при каждой правке и уходит
// в панель редактора. Показ — по выключателю: траншеи — серая полоса по
// земле, кабели — тонкие линии цвета цепи, щитки — тёмные шкафы.
const COLORS = ['#e8b04a', '#5fb3d9', '#d46a6a', '#8cc46b', '#b58ad6', '#e08a3c', '#4fc1a6', '#d9d36a'];
const none = () => {};

function bounds(scene, settings) {
    const box = new THREE.Box3();
    const model = scene.getObjectByName('placed');
    if (model) box.expandByObject(model);
    for (const item of [...(settings.lightingFixtures ?? []), ...(settings.lightingPanels ?? [])]) box.expandByPoint(new THREE.Vector3(item.x, item.y, item.z));
    if (box.isEmpty()) return null;
    return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
}

function ribbon(grid, trenches) {
    const positions = [], lift = 0.035, half = 0.14;
    const y = (x, z) => { const i = cellOf(grid, x, z); return (i >= 0 ? grid.ground[i] : 0) + lift; };
    for (const trench of trenches) {
        for (let k = 1; k < trench.points.length; k += 1) {
            const [ax, az] = trench.points[k - 1], [bx, bz] = trench.points[k];
            const length = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / length) * half, nz = ((bx - ax) / length) * half;
            const ya = y(ax, az), yb = y(bx, bz);
            positions.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx - nx, yb, bz - nz);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

function cables(grid, circuits) {
    const positions = [], colors = [], color = new THREE.Color();
    const y = (x, z) => { const i = cellOf(grid, x, z); return (i >= 0 ? grid.ground[i] : 0) + 0.07; };
    circuits.forEach((circuit, index) => {
        color.set(COLORS[index % COLORS.length]);
        // Цепи в одной траншее — рядом, а не друг на друге.
        const shift = ((index % 5) - 2) * 0.04;
        for (const segment of circuit.segments ?? []) {
            for (let k = 1; k < segment.points.length; k += 1) {
                const [ax, az] = segment.points[k - 1], [bx, bz] = segment.points[k];
                positions.push(ax + shift, y(ax, az), az + shift, bx + shift, y(bx, bz), bz + shift);
                colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
            }
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}

export default function ConnectionsLayer({ settings, geometryKey, show }) {
    const { scene } = useThree();
    const types = useLuminaireTypes();
    const [grid, setGrid] = useState(null);
    const beds = settings.plantingBeds, surfaces = settings.lightingSurfaces, planeY = settings.planeEnabled ? settings.planeHeight ?? 0 : null;
    // Модели приходят не сразу: сетка — через полторы и через восемь секунд.
    useEffect(() => {
        let cancelled = false;
        const build = () => {
            if (cancelled) return;
            const box = bounds(scene, { lightingFixtures: settings.lightingFixtures, lightingPanels: settings.lightingPanels });
            if (!box) return;
            const model = scene.getObjectByName('placed');
            const next = buildSiteGrid({ roots: [model], bounds: box, planeY, beds, trees: sceneTrees(model), surfaces });
            setGrid(next);
            // В папку проекта — для агента и отчёта; просмотр (?preview=1) не пишет.
            const project = activeProjectId();
            if (project && new URLSearchParams(window.location.search).get('preview') !== '1') projectStore.saveSiteGrid(project, encodeGrid(next)).catch(() => {});
        };
        const timers = [1500, 8000].map((delay) => setTimeout(build, delay));
        return () => { cancelled = true; timers.forEach(clearTimeout); };
    // Расстановка светильников не перестраивает сетку, пока они внутри неё.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene, geometryKey, beds, surfaces, planeY]);

    // Пересчёт — только от данных освещения и через четверть секунды после
    // последней правки: протяжка светильника манипулятором не ждёт трасс.
    const { lightingFixtures, lightingPanels, lightingCircuits, lightingRuns, lightingSite } = settings;
    const [network, setNetwork] = useState(null);
    useEffect(() => {
        const timer = setTimeout(() => setNetwork(lightingNetwork({ lightingFixtures, lightingPanels, lightingCircuits, lightingRuns, lightingSite }, types, grid)), 250);
        return () => clearTimeout(timer);
    }, [lightingFixtures, lightingPanels, lightingCircuits, lightingRuns, lightingSite, types, grid]);
    useEffect(() => { setLightingState({ grid, network, status: grid ? 'ready' : 'building' }); }, [grid, network]);
    useEffect(() => () => setLightingState({ grid: null, network: null, status: 'idle' }), []);

    const drawn = useMemo(() => (show && grid && network ? { trenches: ribbon(grid, network.trenches), cables: cables(grid, network.circuits) } : null), [show, grid, network]);
    useEffect(() => () => { drawn?.trenches.dispose(); drawn?.cables.dispose(); }, [drawn]);
    if (!show) return null;
    return <group name="lighting-connections">
        {drawn ? <>
            <mesh geometry={drawn.trenches} raycast={none} renderOrder={5}>
                <meshBasicMaterial color="#b3afa3" transparent opacity={0.42} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <lineSegments geometry={drawn.cables} raycast={none} renderOrder={6}>
                <lineBasicMaterial vertexColors transparent opacity={0.95} depthTest={false} toneMapped={false} />
            </lineSegments>
        </> : null}
        {(settings.lightingPanels ?? []).map((panel) => <group key={panel.id} name={`lighting-panel-${panel.id}`} position={[panel.x, panel.y, panel.z]} rotation={[0, (panel.yaw * Math.PI) / 180, 0]}>
            <mesh position={[0, 0.55, 0]} userData={{ lightingPanel: panel.id }} castShadow>
                <boxGeometry args={[0.6, 1.1, 0.28]} />
                <meshStandardMaterial color="#3a3d3f" metalness={0.5} roughness={0.55} />
            </mesh>
        </group>)}
    </group>;
}
