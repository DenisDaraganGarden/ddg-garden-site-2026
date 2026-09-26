import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { segmentCurve, surfaceSample } from './path.js';
import { closestScreenSegment, constrainFencePoint, createFencePicker, screenPoint } from './snapping.js';

const NO_RAYCAST = () => {};
const label = { surface: ['Поверхность', 'Surface'], vertex: ['Вершина', 'Vertex'], edge: ['Ребро', 'Edge'], plane: ['Плоскость', 'Plane'], length: ['Длина', 'Length'], axis: ['Ось', 'Axis'] };

export default function FenceTool({ editor, objects, orbitRef, terrainQuery, language = 'ru' }) {
    const { gl, scene, camera, invalidate } = useThree();
    const live = useRef(); live.current = { editor, objects, language };
    const [draft, setDraft] = useState([]), [hover, setHover] = useState(null), [dragSample, setDragSample] = useState(null);
    const draftRef = useRef([]), finishRef = useRef(null);
    const active = Boolean(editor?.drawing || editor?.editing);
    const drawing = Boolean(editor?.drawing);
    useEffect(() => {
        if (!active) return undefined;
        const canvas = gl.domElement, picker = createFencePicker(scene, camera, canvas, terrainQuery);
        live.current.editor.registerProjector((fence, include = () => true) => ({ ...fence, segments: fence.segments.map(edge => {
            if (!include(edge)) return edge;
            const curve = segmentCurve(fence, edge), a = fence.nodes.find(n => n.id === edge.a), b = fence.nodes.find(n => n.id === edge.b);
            const length = curve.getLength(), count = Math.min(2048, Math.max(1, Math.ceil(length / .25))), surface = [];
            for (let i = 0; i <= count; i++) {
                const t = i / count, point = curve.getPoint(t).toArray(), normal = new THREE.Vector3(...a.normal).lerp(new THREE.Vector3(...b.normal), t).normalize().toArray();
                const sample = i === 0 ? a : i === count ? b : picker.project(point, normal, Math.max(2, length / 4));
                surface.push([t, ...sample.point, ...sample.normal]);
            }
            return { ...edge, surface };
        }) }));
        let press = null, drag = null, oldOrbit = true, held = false;
        const freeze = () => { if (!held) oldOrbit = orbitRef.current?.enabled ?? true; held = true; if (orbitRef.current) orbitRef.current.enabled = false; };
        const release = () => { if (held && orbitRef.current) orbitRef.current.enabled = oldOrbit; held = false; press = null; drag = null; setDragSample(null); };
        const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
        const renderDraft = samples => { draftRef.current = samples; setDraft([...samples]); invalidate(); };
        const finish = closed => {
            const samples = draftRef.current;
            if (samples.length < (closed ? 3 : 2)) return;
            live.current.editor.onCreate(samples, closed); renderDraft([]); setHover(null);
        };
        finishRef.current = finish;
        const cast = event => {
            const { editor: e, objects: list } = live.current;
            const input = e.input.current;
            return picker.cast(event, { snap: input.snap && !event.altKey, planeY: input.planeY, nodes: list.flatMap(f => f.nodes).filter(n => n.id !== drag?.node.id) });
        };
        const candidate = event => {
            const rect = canvas.getBoundingClientRect(), mouse = { x: event.clientX, y: event.clientY };
            let best = 12, found = null;
            for (const fence of live.current.objects) {
                const shown = live.current.editor.selection.some(key => key.startsWith(`${fence.id}/`));
                if (shown) for (const node of fence.nodes) {
                    const p = screenPoint(new THREE.Vector3(...node.point), camera, rect), d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
                    if (p.visible && d < best) { best = d; found = { fence, node }; }
                }
            }
            if (found) return found;
            for (const fence of live.current.objects) for (const segment of fence.segments) {
                const count = segment.surface ? Math.min(512, segment.surface.length) : segment.controls ? 48 : 1;
                for (let i = 0; i < count; i++) {
                    const a = screenPoint(surfaceSample(fence, segment, i / count).point, camera, rect), b = screenPoint(surfaceSample(fence, segment, (i + 1) / count).point, camera, rect);
                    if (!a.visible || !b.visible) continue;
                    const nearest = closestScreenSegment(mouse, a, b);
                    if (nearest.distance < best) { best = nearest.distance; found = { fence, segment, t: (i + nearest.t) / count }; }
                }
            }
            // Можно щёлкнуть по заполнению, а не только по осевой линии.
            if (!found) {
                const ray = new THREE.Raycaster(); ray.setFromCamera({ x: (mouse.x - rect.left) / rect.width * 2 - 1, y: 1 - (mouse.y - rect.top) / rect.height * 2 }, camera);
                const root = scene.getObjectByName('fences');
                const hit = root && ray.intersectObject(root, true)[0];
                const info = hit && (hit.object.userData.fenceParts?.[hit.instanceId] ?? hit.object.userData.fenceFaces?.[hit.faceIndex]);
                if (info) { const fence = live.current.objects.find(f => f.id === info.fenceId); if (fence) found = { fence, segment: fence.segments.find(s => s.id === info.fenceSegment), t: .5 }; }
            }
            return found;
        };
        const down = event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
            const found = drawing ? null : candidate(event);
            if (!drawing && !found) return;
            consume(event); freeze();
            press = { x: event.clientX, y: event.clientY, id: event.pointerId, found };
            canvas.setPointerCapture?.(event.pointerId);
            if (found?.node) { drag = found; live.current.editor.selectVertex(found.fence.id, found.node.id); }
        };
        const move = event => {
            if (drawing || drag) {
                const sample = constrainFencePoint(cast(event), drawing ? draftRef.current.at(-1) : null, live.current.editor.input.current);
                setHover(sample);
                if (drag) setDragSample(sample ? { ...drag, sample } : null);
                if (sample) {
                    const ru = live.current.language !== 'en', previous = draftRef.current.at(-1);
                    const distance = previous ? Math.hypot(...sample.point.map((p, i) => p - previous.point[i])) : 0;
                    live.current.editor.setStatus(`${label[sample.kind]?.[ru ? 0 : 1] ?? ''}${distance ? ` · ${distance.toFixed(3)} ${ru ? 'м' : 'm'}` : ''}`);
                }
                invalidate();
            }
        };
        const up = event => {
            if (!press || event.pointerId !== press.id) return;
            consume(event);
            const clicked = Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5, found = press.found;
            if (drag && !clicked) { const sample = cast(event); if (sample) live.current.editor.moveVertex(drag.fence.id, drag.node.id, sample); }
            else if (clicked && drawing) {
                const sample = constrainFencePoint(cast(event), draftRef.current.at(-1), live.current.editor.input.current);
                if (sample) {
                    const previous = draftRef.current.at(-1);
                    if (!previous || Math.hypot(...sample.point.map((p, i) => p - previous.point[i])) > .001) renderDraft([...draftRef.current, sample]);
                }
            } else if (clicked && found?.segment) live.current.editor.select(found.fence.id, found.segment.id, event.shiftKey);
            release();
        };
        const double = event => {
            if (drawing) { consume(event); finish(false); }
            else { const at = candidate(event); if (at?.segment) { consume(event); live.current.editor.split(at.fence.id, at.segment.id, at.t); } }
        };
        const key = event => {
            if (event.target?.closest?.('input,textarea,select,[contenteditable=true],dialog') || event.metaKey || event.ctrlKey) return;
            if (event.key === 'Escape') { consume(event); renderDraft([]); release(); live.current.editor.stop(); }
            if (drawing && event.key === 'Enter') { consume(event); finish(event.shiftKey); }
            if (drawing && (event.key === 'Backspace' || event.key === 'Delete')) { consume(event); renderDraft(draftRef.current.slice(0, -1)); }
            if (!drawing && (event.key === 'Backspace' || event.key === 'Delete')) { consume(event); if (live.current.editor.selection.length) live.current.editor.removeSelected(); }
        };
        const cancel = () => { release(); setHover(null); };
        canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true); canvas.addEventListener('pointerup', up, true);
        canvas.addEventListener('dblclick', double, true); canvas.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key, true);
        return () => {
            canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true); canvas.removeEventListener('pointerup', up, true);
            canvas.removeEventListener('dblclick', double, true); canvas.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true);
            release(); draftRef.current = []; setDraft([]); setHover(null); finishRef.current = null;
            live.current.editor.registerProjector(null);
        };
    }, [active, drawing, gl, scene, camera, orbitRef, terrainQuery, invalidate]);
    useEffect(() => { if (editor?.finishVersion) finishRef.current?.(false); }, [editor?.finishVersion]);
    useEffect(() => { if (editor?.closeVersion) finishRef.current?.(true); }, [editor?.closeVersion]);

    const lines = useMemo(() => {
        if (!active) return [];
        const items = [];
        for (const fence of objects) for (const edge of fence.segments) {
            const selected = editor.selection.includes(`${fence.id}/${edge.id}`);
            const count = edge.surface ? Math.min(512, edge.surface.length) : edge.controls ? 48 : 1;
            const vertices = Array.from({ length: count + 1 }, (_, i) => surfaceSample(fence, edge, i / count).point);
            items.push({ id: edge.id, geometry: new THREE.BufferGeometry().setFromPoints(vertices), color: selected ? '#f2c14e' : edge.enabled ? '#a2aaa8' : '#e28873' });
        }
        const points = [...draft.map(p => new THREE.Vector3(...p.point)), ...(hover && drawing ? [new THREE.Vector3(...hover.point)] : [])];
        if (points.length > 1) items.push({ id: 'draft', geometry: new THREE.BufferGeometry().setFromPoints(points), color: '#f2c14e' });
        return items;
    }, [active, objects, editor?.selection, draft, hover, drawing]);
    useEffect(() => () => lines.forEach(line => line.geometry.dispose()), [lines]);
    if (!active) return null;
    const nodes = objects.filter(f => editor.selection.some(k => k.startsWith(`${f.id}/`))).flatMap(f => f.nodes.map(n => ({ ...n, fenceId: f.id })));
    const radius = point => Math.max(.025, Math.min(.25, camera.position.distanceTo(new THREE.Vector3(...point)) * .003));
    return <group name="fence-handles" renderOrder={1000}>
        {lines.map(line => <line key={line.id} geometry={line.geometry} raycast={NO_RAYCAST} renderOrder={1000}><lineBasicMaterial color={line.color} depthTest={false} toneMapped={false} /></line>)}
        {[...nodes, ...draft.map((p, i) => ({ ...p, id: `draft-${i}` }))].map(node => {
            const point = dragSample?.node.id === node.id ? dragSample.sample.point : node.point;
            return <mesh key={node.id} position={point} raycast={NO_RAYCAST} renderOrder={1001}><sphereGeometry args={[radius(point), 10, 8]} /><meshBasicMaterial color={editor.vertex?.nodeId === node.id ? '#ffffff' : '#f2c14e'} depthTest={false} toneMapped={false} /></mesh>;
        })}
        {hover ? <mesh position={hover.point} raycast={NO_RAYCAST} renderOrder={1002}><sphereGeometry args={[radius(hover.point), 10, 8]} /><meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} /></mesh> : null}
    </group>;
}
