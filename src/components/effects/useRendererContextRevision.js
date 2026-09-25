import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';

const contexts = new WeakMap();
function contextState(renderer) {
    let state = contexts.get(renderer);
    if (!state) {
        state = { revision: 0, listeners: new Set() };
        // Track even while consumers are unmounted: cached bake targets still
        // belong to this renderer. The canvas/listener die with the renderer.
        renderer.domElement.addEventListener('webglcontextrestored', () => {
            state.revision += 1;
            state.listeners.forEach((listener) => listener());
        });
        contexts.set(renderer, state);
    }
    return state;
}

export const rendererContextRevision = (renderer) => contextState(renderer).revision;
export function subscribeRendererContext(renderer, listener) {
    const state = contextState(renderer);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

export function useRendererContextRevision(renderer) {
    const invalidate = useThree((state) => state.invalidate);
    const subscribe = useCallback((listener) => subscribeRendererContext(renderer, listener), [renderer]);
    const snapshot = useCallback(() => rendererContextRevision(renderer), [renderer]);
    const revision = useSyncExternalStore(subscribe, snapshot, snapshot);
    // A paused editor must repaint too, after its derived GPU maps are rebuilt.
    useLayoutEffect(() => { invalidate(); }, [invalidate, revision]);
    return revision;
}
