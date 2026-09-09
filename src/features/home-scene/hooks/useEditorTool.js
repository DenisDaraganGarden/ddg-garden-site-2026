import { useEffect, useState } from 'react';

export const GIZMO_MODES = ['translate', 'rotate', 'scale'];

// Blender's G/R/S, because that is the gizmo this is modelled on. W/E are
// accepted as the Unity/Unreal aliases for move and rotate; their R (scale) is
// deliberately not bound, since R already means rotate here and a key that means
// two different things depending on the app is worse than one that means one.
const MODE_KEYS = {
    g: 'translate',
    w: 'translate',
    r: 'rotate',
    e: 'rotate',
    s: 'scale',
};

const isTypingTarget = (target) => {
    if (!target) {
        return false;
    }

    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

// The selection itself comes from the editor tree - picking an object under
// "Objects" is the same act as picking it in an engine's hierarchy, so there is
// no second source of truth. This owns the tool, and Escape to get the handles
// out of the way without losing the selection.
export function useEditorTool(enabled = true) {
    const [mode, setMode] = useState('translate');
    const [suppressed, setSuppressed] = useState(false);
    // Режим выбора объекта прямо в сцене. Клавиша — V: WASD заняты полётом
    // камеры (W вперёд, S назад, A/D вбок), Q и E — её высотой, а G/R/S —
    // гизмо, так что все привычные буквы уже что-то значат.
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return undefined;
        }

        const handleKeyDown = (event) => {
            // A slider holds focus for most of an editing session, and G/R/S are
            // also ordinary characters - never take them from a field.
            if (event.defaultPrevented || event.target?.closest?.('dialog') || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }

            if (event.key === 'Escape') {
                setSuppressed(true);
                return;
            }

            if (event.key.toLowerCase() === 'v') {
                event.preventDefault();
                setPicking((value) => !value);
                return;
            }

            const nextMode = MODE_KEYS[event.key.toLowerCase()];
            if (nextMode) {
                event.preventDefault();
                setMode(nextMode);
                setSuppressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled]);

    return { mode, setMode, suppressed, setSuppressed, picking, setPicking };
}

export default useEditorTool;
