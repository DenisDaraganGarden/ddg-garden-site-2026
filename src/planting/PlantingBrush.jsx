import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { simplifyContour } from './fillBed.js';

// Инструменты посадок в сцене, по образцу кисти изгороди (TopiaryBrush):
//   bed   — провести контур цветника по земле; отпустил — один цветник, одна отмена;
//   plant — клик ставит выбранное растение; протяжка крутит камеру, как обычно.
// Земля — то, во что упирается луч: ровная плоскость проекта или модель
// SketchUp (её 2D-растения, круги крон, стекло и листва — не земля); мимо —
// горизонталь на высоте плоскости. Esc и потеря окна не сохраняют ничего.
const MAX_REACH = 2000;

const solid = (object) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    return !object.userData.faceNormal && !object.userData.crownPlan && !material?.transparent && !(material?.alphaTest > 0);
};

export default function PlantingBrush({ mode, groundY = 0, orbitRef, onBed, onPlant }) {
    const { gl, camera, scene, invalidate } = useThree();
    const cursor = useRef();
    const callbacks = useRef({});
    callbacks.current = { onBed, onPlant };
    const [preview, setPreview] = useState(null);
    const line = useMemo(() => (preview && preview.length > 1 ? new THREE.BufferGeometry().setFromPoints([...preview, preview[0]].map(([x, y, z]) => new THREE.Vector3(x, y + 0.04, z))) : null), [preview]);
    useEffect(() => () => line?.dispose(), [line]);

    useEffect(() => {
        if (!mode) return undefined;
        const canvas = gl.domElement, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
        let stroke = null, press = null, frame = 0, oldOrbit = true;
        const ground = (event) => {
            const box = canvas.getBoundingClientRect();
            ray.setFromCamera({ x: (2 * (event.clientX - box.left)) / box.width - 1, y: 1 - (2 * (event.clientY - box.top)) / box.height }, camera);
            const targets = ['ground-plane', 'placed'].map((name) => scene.getObjectByName(name)).filter(Boolean);
            const hit = ray.intersectObjects(targets, true).find((item) => item.distance < MAX_REACH && solid(item.object));
            if (hit) return hit.point.toArray();
            const at = new THREE.Vector3();
            return ray.ray.intersectPlane(plane, at) && ray.ray.origin.distanceTo(at) < MAX_REACH ? at.toArray() : null;
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
            const point = ground(event);
            if (!point) return;
            if (mode === 'plant') { press = { x: event.clientX, y: event.clientY, id: event.pointerId }; return; }
            event.preventDefault(); event.stopImmediatePropagation();
            oldOrbit = orbitRef?.current?.enabled ?? true;
            if (orbitRef?.current) orbitRef.current.enabled = false;
            stroke = { id: event.pointerId, points: [point] };
            canvas.setPointerCapture(event.pointerId);
            setPreview([point]);
        };
        const move = (event) => {
            const point = ground(event);
            showCursor(point);
            if (stroke && event.pointerId === stroke.id) {
                event.preventDefault(); event.stopImmediatePropagation();
                const last = stroke.points.at(-1);
                if (point && Math.hypot(point[0] - last[0], point[2] - last[2]) > 0.12 && stroke.points.length < 4096) stroke.points.push(point);
                if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (stroke) setPreview([...stroke.points]); });
            }
            invalidate();
        };
        const up = (event) => {
            if (mode === 'plant') {
                const start = press;
                press = null;
                if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
                const point = ground(event);
                if (point) callbacks.current.onPlant?.(point);
                return;
            }
            if (!stroke || event.pointerId !== stroke.id || event.button !== 0) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const points = stroke.points;
            stop();
            if (points.length < 3) return;
            const heights = points.map((p) => p[1]).sort((a, b) => a - b);
            callbacks.current.onBed?.(simplifyContour(points.map(([x, , z]) => [x, z])), heights[heights.length >> 1]);
        };
        const cancel = () => { press = null; if (stroke) stop(); };
        const key = (event) => { if (event.key === 'Escape') cancel(); };
        const leave = () => { if (!stroke) showCursor(null); invalidate(); };
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
            stop();
        };
    }, [mode, gl, camera, scene, groundY, orbitRef, invalidate]);

    if (!mode) return null;
    return <group>
        <mesh ref={cursor} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => {}}>
            <ringGeometry args={[mode === 'bed' ? 0.16 : 0.3, mode === 'bed' ? 0.2 : 0.36, 40]} />
            <meshBasicMaterial color="#d9ca8c" depthTest={false} transparent opacity={0.85} toneMapped={false} />
        </mesh>
        {line ? <line geometry={line} raycast={() => {}}><lineBasicMaterial color="#f2c14e" depthTest={false} toneMapped={false} /></line> : null}
    </group>;
}
