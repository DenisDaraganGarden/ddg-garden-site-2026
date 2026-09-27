import React, { useRef } from 'react';
import { useFocusControls } from '../../features/home-scene/components/editor/focus/FocusControlsContext';

// Ползунок карточки: одна протяжка — один шаг отмены (как у ползунков
// редактора: жест истории от нажатия до отпускания). В каталог параметров
// не входит — он про выбранный светильник, а не про сцену.
export function LightingRange({ label, value, min, max, step, unit = '', format = (v) => Number(v.toFixed(2)), onChange, testId }) {
    const controls = useFocusControls(), start = useRef(null);
    const end = (kind, event) => {
        if (start.current === null) return;
        controls?.gesture(kind, { id: 'lighting', value: event?.currentTarget?.value ?? start.current, initial: start.current });
        start.current = null;
    };
    return <label className="lighting-range"><span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId}
            onPointerDown={(event) => { if (event.button) return; start.current = value; controls?.gesture('Start', { id: 'lighting', value, initial: value }); }}
            onPointerUp={(event) => end('Commit', event)} onLostPointerCapture={(event) => end('Commit', event)} />
        <b>{format(value)}{unit}</b></label>;
}

