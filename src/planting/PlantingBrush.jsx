import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { simplifyContour } from './fillBed.js';
import { regionHighlight, regionOutline, regionTriangles, surfaceRegions } from './surfacePick.js';
import { clipToSurface } from './clipSurface.js';
import WalkStartMarker from '../walk/WalkStartMarker.jsx';

// Инструменты посадок в сцене, по образцу кисти изгороди (TopiaryBrush):
//   bed   — щелчок по поверхности модели (грунт, мульча, земля в кашпо):
//           цветник занимает её целиком — участок подсвечен под курсором;
//           протяжка, начатая на поверхности модели, — контур от руки,
//           обрезанный по ней (clipSurface.js); начатая на плоскости —
//           просто контур. Отпустил — цветник, одна отмена;
//   plant — клик ставит выбранное растение; протяжка крутит камеру, как обычно;
//   vine  — мазок по любой поверхности (стена, кашпо, сетка, земля): лиана
//           растёт от первой точки по мазку (vines.js). Точки — с нормалью
//           поверхности; мимо модели мазок не пишется;
//   mark  — клик ставит отметку уровня (src/annotations), как «Посадить»;
//   start — старт прогулки (src/walk): нажатие ставит белый значок, протяжка
//           от него — куда он будет смотреть; щелчок — лицом от камеры.
//   light — светильник (src/lighting): нажатие ставит его на поверхность (на
//           стену — настенный; стоящий на земле — у подножия стены), протяжка
//           от него наводит луч на то, что под курсором: дерево, фасад;
//   aim   — навести выбранный светильник: щелчок — на что он светит.
// Земля — то, во что упирается луч: ровная плоскость проекта или модель
// SketchUp (её 2D-растения, круги крон, стекло и листва — не земля; сетка с
// вырезами — опора для лианы); мимо — горизонталь на высоте плоскости. Esc и
// потеря окна не сохраняют ничего.
const MAX_REACH = 2000;
const CLICK = 6;

const VINE_STEP = 0.04;
const solid = (object, cutout = false) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    return !object.userData.faceNormal && !object.userData.crownPlan && !material?.transparent && (cutout || !(material?.alphaTest > 0));
};
// Цель луча светильника — то, что видно: 2D-дерево модели, листва-вырезка,
// посадки; мимо — только стекло и круги крон на плане.
const visible = (object) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    return !object.userData.crownPlan && !material?.transparent;
};
const UP = new THREE.Vector3(0, 1, 0), FACING = new THREE.Vector3(0, 0, 1);

export default function PlantingBrush({ mode, groundY = 0, orbitRef, onBed, onBedSurface, onPlant, onVine, onMark, onStart, onLight, onAim, lightMount = 'ground' }) {
    const { gl, camera, scene, invalidate } = useThree();
    const cursor = useRef();
    const callbacks = useRef({});
    callbacks.current = { onBed, onBedSurface, onPlant, onVine, onMark, onStart, onLight, onAim, lightMount };
    const [preview, setPreview] = useState(null);
    const [aim, setAim] = useState(null);
    const [surface, setSurface] = useState(null);
    // Контур цветника замкнут и приподнят над землёй; мазок лианы — открытый,
    // его точки уже отнесены от поверхности по нормали.
    const line = useMemo(() => (preview && preview.length > 1
        ? new THREE.BufferGeometry().setFromPoints((mode === 'vine' || mode === 'light' ? preview : [...preview, preview[0]]).map(([x, y, z]) => new THREE.Vector3(x, y + (mode === 'vine' || mode === 'light' ? 0 : 0.04), z)))
        : null), [preview, mode]);
    useEffect(() => () => line?.dispose(), [line]);
    const highlight = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), []);
    useEffect(() => () => highlight.dispose(), [highlight]);

    useEffect(() => {
        if (!mode) return undefined;
        const canvas = gl.domElement, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
        const regions = new Map();
        let stroke = null, press = null, frame = 0, hoverFrame = 0, oldOrbit = true, shown = null;
        const cast = (event, aimTarget = false) => {
            const box = canvas.getBoundingClientRect();
            ray.setFromCamera({ x: (2 * (event.clientX - box.left)) / box.width - 1, y: 1 - (2 * (event.clientY - box.top)) / box.height }, camera);
            const model = scene.getObjectByName('placed');
            const targets = [scene.getObjectByName('ground-plane'), model, aimTarget ? scene.getObjectByName('planting') : null].filter(Boolean);
            const hit = ray.intersectObjects(targets, true).find((item) => item.distance < MAX_REACH && (aimTarget ? visible(item.object) : solid(item.object, mode === 'vine')));
            if (hit) {
                let inModel = false;
                for (let node = hit.object; node; node = node.parent) if (node === model) inModel = true;
                // Нормаль — к камере: у двусторонней грани лицо может смотреть от нас.
                const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
                if (normal.dot(ray.ray.direction) > 0) normal.negate();
                return { point: hit.point.toArray(), normal: normal.toArray(), hit: inModel && hit.faceIndex !== undefined && hit.object.isMesh ? hit : null };
            }
            const at = new THREE.Vector3();
            return ray.ray.intersectPlane(plane, at) && ray.ray.origin.distanceTo(at) < MAX_REACH ? { point: at.toArray(), normal: [0, 1, 0], hit: null } : null;
        };
        // Участок модели под курсором — один раз на участок и положение модели.
        const regionAt = (hit) => {
            if (!hit) return null;
            const id = surfaceRegions(hit.object.geometry).regionOf[hit.faceIndex];
            if (id === undefined || id < 0) return null;
            const m = hit.object.matrixWorld.elements;
            const key = `${hit.object.uuid}:${id}:${m.map((v) => v.toFixed(4)).join(',')}`;
            if (!regions.has(key)) regions.set(key, regionTriangles(hit.object, hit.faceIndex));
            return regions.get(key);
        };
        const showSurface = (region) => {
            const next = region?.ground ? region : null;
            if (next === shown) return;
            shown = next;
            if (next && !next.geometry) next.geometry = regionHighlight(next.triangles);
            setSurface(next ? next.geometry : null);
            invalidate();
        };
        // Кольцо лежит на поверхности под курсором — на земле и на стене.
        const turn = new THREE.Vector3();
        const showCursor = (found) => {
            if (!cursor.current) return;
            cursor.current.visible = Boolean(found);
            if (!found) return;
            turn.fromArray(found.normal ?? [0, 1, 0]);
            cursor.current.quaternion.setFromUnitVectors(FACING, turn);
            cursor.current.position.fromArray(found.point).addScaledVector(turn, 0.03);
        };
        const stop = () => {
            const active = stroke;
            stroke = null;
            if (active && canvas.hasPointerCapture(active.id)) canvas.releasePointerCapture(active.id);
            cancelAnimationFrame(frame); frame = 0;
            if (orbitRef?.current) orbitRef.current.enabled = oldOrbit;
            setPreview(null);
            setAim(null);
            invalidate();
        };
        // Куда лицом — по горизонтали через точку старта; щелчок — от камеры.
        const level = new THREE.Plane(new THREE.Vector3(0, 1, 0)), at = new THREE.Vector3(), look = new THREE.Vector3();
        // Нажали на стену или бок изгороди — старт на полу у её подножия, со
        // стороны камеры.
        const probe = new THREE.Raycaster(), from = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
        const footOf = (found) => {
            if ((found.normal?.[1] ?? 1) >= 0.6) return found.point;
            const d = ray.ray.direction, flat = Math.hypot(d.x, d.z) || 1;
            probe.set(from.set(found.point[0] - (d.x / flat) * 0.45, found.point[1] + 0.2, found.point[2] - (d.z / flat) * 0.45), DOWN);
            const hit = probe.intersectObjects([scene.getObjectByName('ground-plane'), scene.getObjectByName('placed')].filter(Boolean), true).find((item) => solid(item.object));
            return hit ? hit.point.toArray() : found.point;
        };
        const aimAt = (event) => {
            const { point: [x, y, z] } = stroke.aim;
            level.constant = -y;
            if (ray.ray.intersectPlane(level, at) && Math.hypot(at.x - x, at.z - z) > 0.25) stroke.aim.yaw = Math.atan2(at.x - x, at.z - z);
            if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (stroke) setAim({ ...stroke.aim }); });
            event.preventDefault(); event.stopImmediatePropagation();
        };
        const down = (event) => {
            if (event.button !== 0 || stroke) return;
            const found = cast(event);
            if (!found) return;
            press = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: 0, region: mode === 'bed' ? regionAt(found.hit) : null };
            if (mode === 'plant' || mode === 'mark' || mode === 'aim') return;
            event.preventDefault(); event.stopImmediatePropagation();
            oldOrbit = orbitRef?.current?.enabled ?? true;
            if (orbitRef?.current) orbitRef.current.enabled = false;
            stroke = { id: event.pointerId, points: [found.point], samples: [[...found.point, ...found.normal]] };
            canvas.setPointerCapture(event.pointerId);
            if (mode === 'start') {
                camera.getWorldDirection(look);
                stroke.aim = { point: footOf(found), yaw: Math.atan2(look.x, look.z) };
                setAim({ ...stroke.aim });
                return;
            }
            if (mode === 'light') {
                // Стоящий на земле, нажатый на стену, — у её подножия; настенный — на ней.
                const ground = callbacks.current.lightMount !== 'wall' && (found.normal?.[1] ?? 1) < 0.6;
                camera.getWorldDirection(look);
                stroke.light = { point: ground ? footOf(found) : found.point, normal: ground ? [0, 1, 0] : found.normal, target: null, yaw: Math.atan2(look.x, look.z) };
                return;
            }
            setPreview([mode === 'vine' ? lifted(found) : found.point]);
        };
        const move = (event) => {
            // Щелчок — нажатие без движения: замкнутый контур возвращается к началу.
            if (press && event.pointerId === press.id) press.moved = Math.max(press.moved, Math.hypot(event.clientX - press.x, event.clientY - press.y));
            const found = cast(event, Boolean(stroke?.light) || mode === 'aim');
            showCursor(stroke?.aim ? null : found);
            if (mode === 'bed' && !stroke && !hoverFrame) {
                const hit = found?.hit;
                hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; showSurface(regionAt(hit)); });
            }
            if (stroke?.light && event.pointerId === stroke.id) {
                const { point } = stroke.light;
                // Наводка — точка под курсором, дальше полуметра от места.
                if (found && Math.hypot(found.point[0] - point[0], found.point[1] - point[1], found.point[2] - point[2]) > 0.5) stroke.light.target = found.point;
                if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (stroke?.light) setPreview(stroke.light.target ? [stroke.light.point, stroke.light.target] : null); });
                event.preventDefault(); event.stopImmediatePropagation();
            } else if (stroke?.aim && event.pointerId === stroke.id) aimAt(event);
            else if (stroke && event.pointerId === stroke.id) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (mode === 'vine') {
                    // Мазок лианы — по самой поверхности, в 3D, с нормалью; мимо модели — пропуск.
                    const last = stroke.samples.at(-1);
                    if (found && Math.hypot(found.point[0] - last[0], found.point[1] - last[1], found.point[2] - last[2]) > VINE_STEP && stroke.samples.length < 400) {
                        stroke.samples.push([...found.point, ...found.normal]);
                        stroke.points.push(lifted(found));
                    }
                } else {
                    const point = found?.point, last = stroke.points.at(-1);
                    if (point && Math.hypot(point[0] - last[0], point[2] - last[2]) > 0.12 && stroke.points.length < 4096) stroke.points.push(point);
                }
                if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (stroke) setPreview([...stroke.points]); });
            }
            invalidate();
        };
        const up = (event) => {
            const start = press;
            press = null;
            const clicked = start && start.id === event.pointerId && Math.max(start.moved, Math.hypot(event.clientX - start.x, event.clientY - start.y)) <= CLICK;
            if (mode === 'plant' || mode === 'mark' || mode === 'aim') {
                if (!clicked) return;
                const found = cast(event, mode === 'aim');
                if (found) callbacks.current[mode === 'mark' ? 'onMark' : mode === 'aim' ? 'onAim' : 'onPlant']?.(found.point, { onModel: Boolean(found.hit) });
                return;
            }
            if (!stroke || event.pointerId !== stroke.id || event.button !== 0) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const points = stroke.points, samples = stroke.samples, placed = stroke.aim, light = stroke.light;
            stop();
            if (light) {
                callbacks.current.onLight?.(light);
                return;
            }
            if (placed) {
                const [x, y, z] = placed.point;
                callbacks.current.onStart?.({ x, y, z, yaw: placed.yaw });
                return;
            }
            if (mode === 'vine') {
                let length = 0;
                for (let i = 1; i < samples.length; i += 1) length += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1], samples[i][2] - samples[i - 1][2]);
                if (samples.length >= 3 && length >= 0.15) callbacks.current.onVine?.(samples);
                return;
            }
            // Щелчок по поверхности модели — цветник на всю поверхность;
            // протяжка по ней — только её часть внутри контура.
            if (start?.region?.ground && (clicked || points.length >= 3)) {
                const outline = regionOutline(start.region.triangles);
                if (!outline) return;
                if (clicked) { callbacks.current.onBedSurface?.(outline); return; }
                const pieces = clipToSurface(simplifyContour(points.map(([x, , z]) => [x, z])), outline);
                for (const piece of pieces.slice(0, 8)) callbacks.current.onBedSurface?.({ outer: piece.outer, holes: piece.holes, y: outline.y, ground: outline.ground });
                return;
            }
            if (points.length < 3) return;
            const heights = points.map((p) => p[1]).sort((a, b) => a - b);
            callbacks.current.onBed?.(simplifyContour(points.map(([x, , z]) => [x, z])), heights[heights.length >> 1]);
        };
        const cancel = () => { press = null; if (stroke) stop(); };
        function lifted(found) { return found.point.map((value, i) => value + (found.normal?.[i] ?? (i === 1 ? 1 : 0)) * 0.03); }
        const key = (event) => { if (event.key === 'Escape') cancel(); };
        const leave = () => { if (!stroke) { showCursor(null); showSurface(null); } invalidate(); };
        canvas.addEventListener('pointerdown', down, true);
        canvas.addEventListener('pointermove', move, true);
        canvas.addEventListener('pointerup', up, true);
        canvas.addEventListener('pointercancel', cancel);
        canvas.addEventListener('lostpointercapture', cancel);
        canvas.addEventListener('pointerleave', leave);
        window.addEventListener('blur', cancel);
        window.addEventListener('keydown', key, true);
        return () => {
            canvas.removeEventListener('pointerdown', down, true);
            canvas.removeEventListener('pointermove', move, true);
            canvas.removeEventListener('pointerup', up, true);
            canvas.removeEventListener('pointercancel', cancel);
            canvas.removeEventListener('lostpointercapture', cancel);
            canvas.removeEventListener('pointerleave', leave);
            window.removeEventListener('blur', cancel);
            window.removeEventListener('keydown', key, true);
            cancelAnimationFrame(hoverFrame);
            for (const region of regions.values()) region?.geometry?.dispose();
            setSurface(null);
            stop();
        };
    }, [mode, gl, camera, scene, groundY, orbitRef, invalidate]);

    if (!mode) return null;
    return <group>
        <mesh ref={cursor} visible={false} raycast={() => {}}>
            <ringGeometry args={[mode === 'plant' || mode === 'start' ? 0.3 : mode === 'vine' || mode === 'mark' || mode === 'light' || mode === 'aim' ? 0.1 : 0.16, mode === 'plant' ? 0.36 : mode === 'start' ? 0.335 : mode === 'vine' || mode === 'mark' || mode === 'light' || mode === 'aim' ? 0.13 : 0.2, 40]} />
            <meshBasicMaterial color="#d9ca8c" depthTest={false} transparent opacity={0.85} toneMapped={false} />
        </mesh>
        {surface ? <mesh geometry={surface} material={highlight} raycast={() => {}} renderOrder={6} /> : null}
        {line ? <line geometry={line} raycast={() => {}}><lineBasicMaterial color="#f2c14e" depthTest={false} toneMapped={false} /></line> : null}
        {aim ? <WalkStartMarker start={{ x: aim.point[0], y: aim.point[1], z: aim.point[2], yaw: aim.yaw }} /> : null}
    </group>;
}
