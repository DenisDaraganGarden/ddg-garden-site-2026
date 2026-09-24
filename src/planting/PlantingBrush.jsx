import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { simplifyContour } from './fillBed.js';
import { regionHighlight, regionOutline, regionTriangles, surfaceRegions } from './surfacePick.js';
import { clipToSurface } from './clipSurface.js';

// Инструменты посадок в сцене, по образцу кисти изгороди (TopiaryBrush):
//   bed   — щелчок по поверхности модели (грунт, мульча, земля в кашпо):
//           цветник занимает её целиком — участок подсвечен под курсором;
//           протяжка, начатая на поверхности модели, — контур от руки,
//           обрезанный по ней (clipSurface.js); начатая на плоскости —
//           просто контур. Отпустил — цветник, одна отмена;
//   plant — клик ставит выбранное растение; протяжка крутит камеру, как обычно.
// Земля — то, во что упирается луч: ровная плоскость проекта или модель
// SketchUp (её 2D-растения, круги крон, стекло и листва — не земля); мимо —
// горизонталь на высоте плоскости. Esc и потеря окна не сохраняют ничего.
const MAX_REACH = 2000;
const CLICK = 6;

const solid = (object) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    return !object.userData.faceNormal && !object.userData.crownPlan && !material?.transparent && !(material?.alphaTest > 0);
};

export default function PlantingBrush({ mode, groundY = 0, orbitRef, onBed, onBedSurface, onPlant }) {
    const { gl, camera, scene, invalidate } = useThree();
    const cursor = useRef();
    const callbacks = useRef({});
    callbacks.current = { onBed, onBedSurface, onPlant };
    const [preview, setPreview] = useState(null);
    const [surface, setSurface] = useState(null);
    const line = useMemo(() => (preview && preview.length > 1 ? new THREE.BufferGeometry().setFromPoints([...preview, preview[0]].map(([x, y, z]) => new THREE.Vector3(x, y + 0.04, z))) : null), [preview]);
    useEffect(() => () => line?.dispose(), [line]);
    const highlight = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), []);
    useEffect(() => () => highlight.dispose(), [highlight]);

    useEffect(() => {
        if (!mode) return undefined;
        const canvas = gl.domElement, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
        const regions = new Map();
        let stroke = null, press = null, frame = 0, hoverFrame = 0, oldOrbit = true, shown = null;
        const cast = (event) => {
            const box = canvas.getBoundingClientRect();
            ray.setFromCamera({ x: (2 * (event.clientX - box.left)) / box.width - 1, y: 1 - (2 * (event.clientY - box.top)) / box.height }, camera);
            const model = scene.getObjectByName('placed');
            const targets = [scene.getObjectByName('ground-plane'), model].filter(Boolean);
            const hit = ray.intersectObjects(targets, true).find((item) => item.distance < MAX_REACH && solid(item.object));
            if (hit) {
                let inModel = false;
                for (let node = hit.object; node; node = node.parent) if (node === model) inModel = true;
                return { point: hit.point.toArray(), hit: inModel && hit.faceIndex !== undefined && hit.object.isMesh ? hit : null };
            }
            const at = new THREE.Vector3();
            return ray.ray.intersectPlane(plane, at) && ray.ray.origin.distanceTo(at) < MAX_REACH ? { point: at.toArray(), hit: null } : null;
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
        const showCursor = (point) => {
            if (!cursor.current) return;
            cursor.current.visible = Boolean(point);
            if (point) cursor.current.position.set(point[0], point[1] + 0.03, point[2]);
        };
        const stop = () => {
            const active = stroke;
            stroke = null;
            if (active && canvas.hasPointerCapture(active.id)) canvas.releasePointerCapture(active.id);
            cancelAnimationFrame(frame); frame = 0;
            if (orbitRef?.current) orbitRef.current.enabled = oldOrbit;
            setPreview(null);
            invalidate();
        };
        const down = (event) => {
            if (event.button !== 0 || stroke) return;
            const found = cast(event);
            if (!found) return;
            press = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: 0, region: mode === 'bed' ? regionAt(found.hit) : null };
            if (mode === 'plant') return;
            event.preventDefault(); event.stopImmediatePropagation();
            oldOrbit = orbitRef?.current?.enabled ?? true;
            if (orbitRef?.current) orbitRef.current.enabled = false;
            stroke = { id: event.pointerId, points: [found.point] };
            canvas.setPointerCapture(event.pointerId);
            setPreview([found.point]);
        };
        const move = (event) => {
            // Щелчок — нажатие без движения: замкнутый контур возвращается к началу.
            if (press && event.pointerId === press.id) press.moved = Math.max(press.moved, Math.hypot(event.clientX - press.x, event.clientY - press.y));
            const found = cast(event);
            showCursor(found?.point);
            if (mode === 'bed' && !stroke && !hoverFrame) {
                const hit = found?.hit;
                hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; showSurface(regionAt(hit)); });
            }
            if (stroke && event.pointerId === stroke.id) {
                event.preventDefault(); event.stopImmediatePropagation();
                const point = found?.point, last = stroke.points.at(-1);
                if (point && Math.hypot(point[0] - last[0], point[2] - last[2]) > 0.12 && stroke.points.length < 4096) stroke.points.push(point);
                if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (stroke) setPreview([...stroke.points]); });
            }
            invalidate();
        };
        const up = (event) => {
            const start = press;
            press = null;
            const clicked = start && start.id === event.pointerId && Math.max(start.moved, Math.hypot(event.clientX - start.x, event.clientY - start.y)) <= CLICK;
            if (mode === 'plant') {
                if (!clicked) return;
                const found = cast(event);
                if (found) callbacks.current.onPlant?.(found.point);
                return;
            }
            if (!stroke || event.pointerId !== stroke.id || event.button !== 0) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const points = stroke.points;
            stop();
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
        <mesh ref={cursor} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => {}}>
            <ringGeometry args={[mode === 'bed' ? 0.16 : 0.3, mode === 'bed' ? 0.2 : 0.36, 40]} />
            <meshBasicMaterial color="#d9ca8c" depthTest={false} transparent opacity={0.85} toneMapped={false} />
        </mesh>
        {surface ? <mesh geometry={surface} material={highlight} raycast={() => {}} renderOrder={6} /> : null}
        {line ? <line geometry={line} raycast={() => {}}><lineBasicMaterial color="#f2c14e" depthTest={false} toneMapped={false} /></line> : null}
    </group>;
}
