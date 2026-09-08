/* eslint-disable react-refresh/only-export-components -- Context consumers are the public Focus-control API. */
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { translations } from '../../../../../i18n/translations';

const ControlsContext = createContext(null);
const ScopeContext = createContext(null);

const normalize = (value) => String(value ?? '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'control';

const translationKeys = (() => {
    const result = new Map();
    for (const language of ['ru', 'en']) {
        for (const [key, label] of Object.entries(translations?.[language]?.homeEditor?.controls ?? {})) {
            if (typeof label === 'string') result.set(label, key);
        }
    }
    return result;
})();

const createStore = () => {
    const entries = new Map();
    const listeners = new Set();
    let version = 0;
    const notify = () => { version += 1; listeners.forEach((listener) => listener()); };
    const equal = (a, b) => a && b && a.signature === b.signature;

    return {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        version: () => version,
        get(id) {
            const owners = entries.get(id);
            if (!owners?.size) return null;
            return [...owners.values()].at(-1);
        },
        all() { return [...entries.keys()].map((id) => this.get(id)).filter(Boolean); },
        upsert(id, owner, descriptor) {
            const owners = entries.get(id) ?? new Map();
            const previous = owners.get(owner);
            owners.set(owner, descriptor);
            entries.set(id, owners);
            if (!equal(previous, descriptor)) notify();
        },
        remove(id, owner) {
            const owners = entries.get(id);
            if (!owners?.has(owner)) return;
            owners.delete(owner);
            if (!owners.size) entries.delete(id);
            notify();
        },
    };
};

export function FocusControlsProvider({
    children,
    pinnedIds = [],
    onPinnedChange,
    onNumericGestureStart,
    onNumericGestureCommit,
    onNumericGestureCancel,
}) {
    const store = useRef(null);
    if (!store.current) store.current = createStore();
    const callbacks = useRef({ onNumericGestureStart, onNumericGestureCommit, onNumericGestureCancel });
    callbacks.current = { onNumericGestureStart, onNumericGestureCommit, onNumericGestureCancel };
    const pins = useMemo(() => new Set(pinnedIds), [pinnedIds]);
    const value = useMemo(() => ({
        store: store.current,
        pinnedIds: pins,
        togglePin(id) {
            const next = new Set(pins);
            next.has(id) ? next.delete(id) : next.add(id);
            onPinnedChange?.([...next]);
        },
        gesture(kind, detail) { return callbacks.current[`onNumericGesture${kind}`]?.(detail); },
    }), [pins, onPinnedChange]);
    return <ControlsContext.Provider value={value}>{children}</ControlsContext.Provider>;
}

export function FocusControlScope({ path, groupLabel = '', nodeLabel = '', catalogOnly = false, children }) {
    const parent = useContext(ScopeContext);
    const value = useMemo(() => ({ path, groupLabel, nodeLabel, catalogOnly, parent }), [path, groupLabel, nodeLabel, catalogOnly, parent]);
    return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export const useFocusControls = () => useContext(ControlsContext);
export const useFocusControlScope = () => useContext(ScopeContext);

export function useFocusControlRegistration({ kind, label, testId, controlId, children: _children, ...control }) {
    const controls = useFocusControls();
    const scope = useFocusControlScope();
    const owner = useRef(Symbol('focus-control'));
    const onChangeRef = useRef(control.onChange);
    onChangeRef.current = control.onChange;
    const stableKey = controlId || testId || translationKeys.get(label) || normalize(label);
    const id = scope ? `${scope.path}:${stableKey}` : null;
    const semantic = { kind, label, testId, controlId, ...control };
    delete semantic.onChange;
    const signature = JSON.stringify(semantic);
    const descriptor = useMemo(() => {
        if (!scope || !id) return null;
        return {
            id,
            path: scope.path,
            groupLabel: scope.groupLabel,
            nodeLabel: scope.nodeLabel,
            kind,
            label,
            testId,
            controlId,
            ...control,
            onChangeRef,
            signature,
        };
    // Functions are intentionally omitted: latest handler lives in onChangeRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, scope, signature]);

    useLayoutEffect(() => {
        if (!controls || !descriptor) return undefined;
        const registrationOwner = owner.current;
        controls.store.upsert(id, registrationOwner, descriptor);
        return () => controls.store.remove(id, registrationOwner);
    }, [controls, descriptor, id]);
    return { controls, scope, id, descriptor, catalogOnly: Boolean(scope?.catalogOnly) };
}

export function useRegisteredFocusControl(id) {
    const controls = useFocusControls();
    const subscribe = controls ? controls.store.subscribe : () => () => {};
    const getSnapshot = () => controls?.store.version() ?? 0;
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return controls?.store.get(id) ?? null;
}
