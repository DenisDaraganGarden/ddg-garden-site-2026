import { useCallback, useRef, useState } from 'react';
import { createFence, FENCE_DEFAULT, FENCE_NODE, normalizeFence, normalizeFenceStyle, TYPE_DEFAULTS } from './settings.js';
import { moveFenceNode, smoothFenceSegment, splitFenceSegment } from './path.js';

const keyOf = (fence, segment) => `${fence}/${segment}`;
export function useFenceEditor({ settings, history, setActiveTab, setTool, tool, language }) {
    const [selection, setSelection] = useState([]), [vertex, setVertex] = useState(null);
    const [draftStyle, setDraftStyle] = useState(FENCE_DEFAULT), [snap, setSnap] = useState(true), [axis, setAxis] = useState(false);
    const [distance, setDistance] = useState(0), [planeY, setPlaneY] = useState(0), [status, setStatus] = useState('');
    const [finishVersion, setFinishVersion] = useState(0), [closeVersion, setCloseVersion] = useState(0);
    // Canvas согласует свой React-корень асинхронно. Щелчок сразу после
    // точного ввода должен уже использовать новые привязки и размер.
    const input = useRef(); input.current = { snap, axis, distance, planeY };
    const projector = useRef(null);
    const registerProjector = useCallback(fn => { projector.current = fn; }, []);
    // Удалённые через Undo участки не продолжают считаться выделенными.
    const validSelection = selection.filter(k => settings.fenceObjects?.some(f => f.segments.some(s => keyOf(f.id, s.id) === k)));
    const validVertex = vertex && settings.fenceObjects?.some(f => f.id === vertex.fenceId && f.nodes.some(n => n.id === vertex.nodeId)) ? vertex : null;
    const live = useRef(); live.current = { settings, history, language, selection: validSelection, vertex: validVertex, draftStyle };
    const apply = useCallback(transform => {
        const { settings: now, history: h } = live.current;
        h.applySettings({ fencesEnabled: true, fenceObjects: transform(now.fenceObjects ?? []).map(normalizeFence).filter(Boolean) });
    }, []);
    const deselect = useCallback(() => { setSelection([]); setVertex(null); }, []);
    const select = useCallback((fenceId, segmentId, shift = false) => {
        const fence = live.current.settings.fenceObjects?.find(f => f.id === fenceId);
        if (!fence) return;
        const keys = segmentId ? [keyOf(fenceId, segmentId)] : fence.segments.map(s => keyOf(fenceId, s.id));
        setSelection(old => shift ? keys.reduce((list, key) => list.includes(key) ? list.filter(k => k !== key) : [...list, key], old) : keys);
        setVertex(null); setActiveTab(FENCE_NODE); setTool('fence-edit');
    }, [setActiveTab, setTool]);
    const selectVertex = useCallback((fenceId, nodeId) => { setVertex({ fenceId, nodeId }); setActiveTab(FENCE_NODE); }, [setActiveTab]);
    const selected = useCallback((fence, segment) => live.current.selection.includes(keyOf(fence.id, segment.id)), []);
    const patchStyle = useCallback(patch => {
        if (!live.current.selection.length) { setDraftStyle(s => normalizeFenceStyle({ ...s, ...patch })); return; }
        apply(list => list.map(f => ({ ...f, segments: f.segments.map(s => selected(f, s) ? { ...s, style: normalizeFenceStyle({ ...s.style, ...patch }) } : s) })));
    }, [apply, selected]);
    const setType = useCallback(type => patchStyle({ ...TYPE_DEFAULTS[type], type }), [patchStyle]);
    const onCreate = useCallback((samples, closed) => {
        const { language: lang, draftStyle: style, settings: now } = live.current;
        const fence = createFence(samples, style, `${lang === 'en' ? 'Fence' : 'Ограждение'} ${(now.fenceObjects?.length ?? 0) + 1}`, closed);
        if (!fence) return;
        apply(list => [...list, projector.current?.(fence) ?? fence]);
        setSelection(fence.segments.map(s => keyOf(fence.id, s.id))); setVertex(null); setTool('fence-edit');
    }, [apply, setTool]);
    const begin = useCallback(() => {
        if (live.current.settings.fencesEnabled === false) live.current.history.applySettings({ fencesEnabled: true });
        deselect(); setActiveTab(FENCE_NODE); setTool('fence');
    }, [deselect, setActiveTab, setTool]);
    const moveVertex = useCallback((fenceId, nodeId, sample) => apply(list => list.map(f => {
        if (f.id !== fenceId) return f;
        const moved = moveFenceNode(f, nodeId, sample);
        return projector.current?.(moved, s => s.a === nodeId || s.b === nodeId) ?? moved;
    })), [apply]);
    const split = useCallback((fenceId, segmentId, t = .5) => apply(list => list.map(f => f.id === fenceId ? splitFenceSegment(f, segmentId, t) : f)), [apply]);
    const splitSelected = useCallback(() => apply(list => list.map(f => f.segments.filter(s => selected(f, s)).reduce((next, s) => splitFenceSegment(next, s.id), f))), [apply, selected]);
    const setEnabled = useCallback(enabled => apply(list => list.map(f => ({ ...f, segments: f.segments.map(s => selected(f, s) ? { ...s, enabled } : s) }))), [apply, selected]);
    const setSmooth = useCallback(smooth => apply(list => list.map(f => {
        const next = f.segments.filter(s => selected(f, s)).reduce((value, s) => smoothFenceSegment(value, s.id, smooth), f);
        return projector.current?.(next, s => selected(f, s)) ?? next;
    })), [apply, selected]);
    const removeSelected = useCallback(() => { apply(list => list.map(f => ({ ...f, segments: f.segments.filter(s => !selected(f, s)) }))); deselect(); }, [apply, selected, deselect]);
    const rename = useCallback((id, name) => apply(list => list.map(f => f.id === id ? { ...f, name } : f)), [apply]);
    const reproject = useCallback(() => apply(list => list.map(f => projector.current?.(f, s => selected(f, s)) ?? f)), [apply, selected]);
    const updateNode = useCallback(patch => {
        const { vertex: at, settings: now } = live.current;
        const fence = now.fenceObjects?.find(f => f.id === at?.fenceId), node = fence?.nodes.find(n => n.id === at.nodeId);
        if (node) moveVertex(fence.id, node.id, { point: node.point.map((v, i) => patch[i] ?? v), normal: node.normal });
    }, [moveVertex]);
    return { selection: validSelection, vertex: validVertex, select, selectVertex, deselect, patchStyle, setType, begin, onCreate, moveVertex, split, splitSelected, setEnabled, setSmooth, removeSelected, rename, updateNode,
        draftStyle, snap, setSnap, axis, setAxis, distance, setDistance, planeY, setPlaneY, status, setStatus, input,
        drawing: tool === 'fence', editing: tool === 'fence-edit', finishVersion, closeVersion, registerProjector, reproject,
        finish: () => setFinishVersion(v => v + 1), close: () => setCloseVersion(v => v + 1), stop: () => setTool('select') };
}
