import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { NO_REFLECTION_LAYER } from '../components/effects/water/SceneLightObjects';
import { setGlassProbe } from './glass.js';

// Отражения в стёклах моделей: сцена, снятая в куб с места камеры. Стекло
// отражает то, что вокруг смотрящего, — сад за спиной, деревья, соседей, небо
// и сам дом (крыло в окне другого крыла); изнутри дома — комнату. Модель на
// снимке остаётся, прячутся только стёкла, то, что рисуется для глаза
// редактора (гизмо, кольца, отметки), и то, что рисуется от главной камеры
// (купол неба, облака, диск солнца); небо на снимке — небо освещения сцены.
// Переснимается, когда камера встала на новом месте, когда перестали меняться
// настройки и после загрузки, пока догружаются растения и земля.
const SIZE = 256;
const REACH = 15; // м вокруг моделей: там «стоят» отражённые деревья и соседи
const ABOVE = 25; // м над крышей
const STEP = 0.5; // м: камера ушла дальше — снимок устарел
const STILL = 250; // мс покоя камеры до нового снимка
const SETTLE = 700; // мс тишины после правки настроек
const AFTER_LOAD = [2500, 8000];
const CAMERA_BOUND = new Set(['sky-dome', 'painterly-sky', 'celestial-disc']);

const isGlass = (material) => (Array.isArray(material) ? material.some(isGlass) : Boolean(material?.userData.glassOn));
const keepOut = (object) => object.isSprite || object.isTransformControlsGizmo || object.isTransformControlsPlane
    || CAMERA_BOUND.has(object.name) || object.material?.depthTest === false || isGlass(object.material);

const hidden = [];
const moved = new THREE.Vector3();

function snapshot(gl, scene, camera, placed, probe) {
    const glass = new Set();
    placed.traverse((object) => {
        if (!object.isMesh) return;
        for (const material of [object.material].flat()) if (material?.userData.glassOn) glass.add(material);
    });
    if (!glass.size) return null;
    if (!probe.cube) {
        probe.target = new THREE.WebGLCubeRenderTarget(SIZE, { type: THREE.HalfFloatType });
        probe.cube = new THREE.CubeCamera(0.05, 5000, probe.target);
    }
    camera.getWorldPosition(probe.cube.position);
    for (const face of probe.cube.children) {
        face.layers.mask = camera.layers.mask;
        face.layers.disable(NO_REFLECTION_LAYER);
    }
    // Коробка участка — куда «упирается» отражённый луч: земля моделей снизу,
    // стенки в REACH от них; камера всегда внутри.
    const box = new THREE.Box3().setFromObject(placed);
    box.min.x -= REACH; box.min.z -= REACH;
    box.max.x += REACH; box.max.z += REACH; box.max.y += ABOVE;
    box.expandByPoint(probe.cube.position.clone().addScalar(1)).expandByPoint(probe.cube.position.clone().subScalar(1));

    hidden.length = 0;
    scene.traverseVisible((object) => { if (keepOut(object)) hidden.push(object); });
    const kept = {
        background: scene.background, intensity: scene.backgroundIntensity, blur: scene.backgroundBlurriness, rotation: scene.backgroundRotation.clone(),
        shadows: gl.shadowMap.autoUpdate, clipping: gl.clippingPlanes, clear: gl.autoClear,
    };
    for (const object of hidden) object.visible = false;
    if (scene.environment) {
        scene.background = scene.environment;
        scene.backgroundIntensity = scene.environmentIntensity;
        scene.backgroundBlurriness = 0;
        scene.backgroundRotation.copy(scene.environmentRotation);
    }
    gl.shadowMap.autoUpdate = false;
    gl.clippingPlanes = [];
    gl.autoClear = true;
    try {
        probe.cube.update(gl, scene);
    } finally {
        for (const object of hidden) object.visible = true;
        hidden.length = 0;
        scene.background = kept.background;
        scene.backgroundIntensity = kept.intensity;
        scene.backgroundBlurriness = kept.blur;
        scene.backgroundRotation.copy(kept.rotation);
        gl.shadowMap.autoUpdate = kept.shadows;
        gl.clippingPlanes = kept.clipping;
        gl.autoClear = kept.clear;
    }
    const shot = { texture: probe.target.texture, center: probe.cube.position.clone(), box };
    glass.forEach((material) => setGlassProbe(material, shot));
    return shot;
}

// placed — группа расстановки (PlacedObjects), settings — настройки сцены:
// любая правка — повод переснять, когда она закончится.
export function useGlassReflections(placed, settings) {
    const gl = useThree((state) => state.gl);
    const scene = useThree((state) => state.scene);
    const camera = useThree((state) => state.camera);
    const invalidate = useThree((state) => state.invalidate);
    const probe = useMemo(() => ({ due: [], timers: {}, last: new THREE.Vector3(), seen: new THREE.Vector3(), still: 0, shot: null, shots: 0 }), []);
    useEffect(() => () => {
        Object.values(probe.timers).flat().forEach(clearTimeout);
        probe.target?.dispose();
    }, [probe]);
    // Редактор на паузе рисует по требованию: кадр к сроку будит таймер.
    const at = (name, ms) => {
        [probe.timers[name]].flat().forEach(clearTimeout);
        probe.timers[name] = [ms].flat().map((delay) => setTimeout(invalidate, delay + 20));
        return [ms].flat().map((delay) => performance.now() + delay);
    };
    useEffect(() => { probe.settleAt = at('settle', SETTLE)[0]; }, [probe, settings]); // eslint-disable-line react-hooks/exhaustive-deps -- at только ставит таймер
    useEffect(() => { probe.loadAt = at('load', AFTER_LOAD); }, [probe]); // eslint-disable-line react-hooks/exhaustive-deps -- at только ставит таймер

    useFrame(() => {
        const now = performance.now();
        const position = camera.getWorldPosition(moved);
        // Камера движется — ждём, пока встанет; встала на новом месте — снимаем.
        if (position.distanceToSquared(probe.seen) > 1e-6) {
            probe.seen.copy(position);
            probe.still = at('still', STILL)[0];
        }
        const cameraDue = probe.still && now >= probe.still && position.distanceTo(probe.last) > STEP;
        const settingsDue = probe.settleAt && now >= probe.settleAt;
        const loadDue = probe.loadAt?.length && now >= probe.loadAt[0];
        if (!cameraDue && !settingsDue && !loadDue) return;
        if (settingsDue) probe.settleAt = 0;
        if (loadDue) probe.loadAt = probe.loadAt.filter((time) => time > now);
        if (cameraDue) probe.still = 0;
        if (!placed.current) return;
        const shot = snapshot(gl, scene, camera, placed.current, probe);
        if (!shot) return;
        probe.last.copy(shot.center);
        probe.shot = shot;
        probe.shots += 1;
        if (import.meta.env.DEV) gl.domElement.dataset.ddgGlassProbe = JSON.stringify({ shots: probe.shots, ms: Math.round((performance.now() - now) * 10) / 10 });
        invalidate();
    });
}
