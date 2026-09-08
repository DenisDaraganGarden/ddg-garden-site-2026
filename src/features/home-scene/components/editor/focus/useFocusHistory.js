import { useCallback, useEffect, useRef, useState } from 'react';

const copy = (value) => structuredClone(value);
const ownerKey = (settings) => `${settings.activeWorkCameraId || settings.activeCameraId}:${settings.editorLayoutKey}`;
const readPath = (settings, path) => path.split('.').reduce((value, key) => value?.[key], settings);
const pick = (settings, paths) => Object.fromEntries([...paths].map((path) => [path, copy(readPath(settings, path))]));
const restore = (settings, values) => {
    const next = { ...settings };
    for (const [path, value] of Object.entries(values)) {
        const keys = path.split('.');
        let cursor = next;
        for (const key of keys.slice(0, -1)) {
            cursor[key] = { ...cursor[key] };
            cursor = cursor[key];
        }
        cursor[keys.at(-1)] = copy(value);
    }
    return next;
};

// History restores only the edited parameters through the existing scene setter.
// Camera catalogues, names and captures made afterwards must survive parameter undo.
export function useFocusHistory(settings, setSettings, changeSetting, applySettings) {
    const live = useRef(settings);
    live.current = settings;
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const gesture = useRef(null);
    const typing = useRef(null);
    const [revision, setRevision] = useState(0);
    const refresh = () => setRevision((value) => value + 1);
    const push = useCallback((values) => {
        if (!Object.keys(values).length) return;
        undoStack.current.push(values);
        if (undoStack.current.length > 24) undoStack.current.shift();
        redoStack.current = [];
        refresh();
    }, []);
    const owner = ownerKey(settings);
    useEffect(() => {
        undoStack.current = []; redoStack.current = []; gesture.current = null; typing.current = null;
        refresh();
    }, [owner]);
    const onGestureStart = useCallback(({ id }) => {
        const paths = new Set();
        // FOV uses the camera layout command instead of the generic field setter.
        if (id === 'cameras/camera:cameraFov') paths.add(`layouts.${live.current.editorLayoutKey}.cameraFov`);
        gesture.current = { before: copy(live.current), owner: ownerKey(live.current), paths };
        typing.current = null;
    }, []);
    const onGestureCommit = useCallback(({ value, initial }) => {
        const current = gesture.current; gesture.current = null;
        if (current && String(value) !== String(initial) && current.owner === ownerKey(live.current)) push(pick(current.before, current.paths));
    }, [push]);
    const onGestureCancel = useCallback(() => {
        const current = gesture.current; gesture.current = null;
        if (current && current.owner === ownerKey(live.current)) {
            const values = pick(current.before, current.paths);
            setSettings((previous) => restore(previous, values));
        }
        return false;
    }, [setSettings]);
    const handleSettingChange = useCallback((event, key, type) => {
        if (gesture.current) gesture.current.paths.add(key);
        else {
            const last = typing.current;
            if (!last || last.key !== key || performance.now() - last.time > 700) push(pick(live.current, [key]));
            typing.current = { key, time: performance.now() };
        }
        changeSetting(event, key, type);
    }, [changeSetting, push]);
    const apply = useCallback((patch) => {
        if (gesture.current) Object.keys(patch).forEach((key) => gesture.current.paths.add(key));
        else push(pick(live.current, Object.keys(patch)));
        typing.current = null;
        applySettings(patch);
    }, [applySettings, push]);
    const recordChange = useCallback((paths, action) => {
        if (gesture.current) paths.forEach((path) => gesture.current.paths.add(path));
        else {
            const key = paths.join('|');
            const last = typing.current;
            if (!last || last.key !== key || performance.now() - last.time > 700) push(pick(live.current, paths));
            typing.current = { key, time: performance.now() };
        }
        action();
    }, [push]);
    const travel = useCallback((redo = false) => {
        if (gesture.current) return;
        const source = redo ? redoStack.current : undoStack.current;
        const target = redo ? undoStack.current : redoStack.current;
        const values = source.pop(); if (!values) return;
        target.push(pick(live.current, Object.keys(values)));
        typing.current = null;
        setSettings((previous) => restore(previous, values));
        refresh();
    }, [setSettings]);
    return { revision, recordChange, handleSettingChange, applySettings: apply, onGestureStart, onGestureCommit, onGestureCancel,
        undo: () => travel(false), redo: () => travel(true), canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 };
}
