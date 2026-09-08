import React, { useEffect, useRef, useState } from 'react';

const precision = (value) => {
    const source = String(value);
    const exponent = source.match(/e-(\d+)/i);
    return exponent ? Number(exponent[1]) : Math.max(0, (source.split('.')[1] ?? '').length);
};

const isCompleteNumber = (value) => /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());

export function FocusControlNumberInput({ controlId, value, min, max, step = 1, onChange, onGesture, ...props }) {
    const active = useRef(null);
    const inputRef = useRef(null);
    const [draft, setDraft] = useState(() => String(value));
    const minValue = Number(min);
    const maxValue = Number(max);
    const clamp = (next) => Math.min(maxValue, Math.max(minValue, next));
    const emit = (next) => onChange?.({
        target: { value: String(next), type: 'number' },
        currentTarget: { value: String(next), type: 'number' },
    });

    useEffect(() => {
        if (document.activeElement !== inputRef.current && !active.current) setDraft(String(value));
    }, [value]);

    const finish = (cancel = false) => {
        const gesture = active.current;
        if (!gesture) return;
        active.current = null;
        const input = inputRef.current;
        input?.classList.remove('focus-number--scrubbing');
        if (!gesture.moved) return;
        if (cancel) {
            emit(gesture.initial);
            setDraft(String(gesture.initial));
            onGesture?.('Cancel', { id: controlId, value: gesture.initial, initial: gesture.initial });
            return;
        }
        onGesture?.('Commit', { id: controlId, value: gesture.value, initial: gesture.initial });
    };

    useEffect(() => {
        const cancel = () => finish(true);
        window.addEventListener('blur', cancel);
        return () => window.removeEventListener('blur', cancel);
    });

    const update = (next) => {
        const gesture = active.current;
        if (!gesture || next === gesture.value) return;
        gesture.value = next;
        setDraft(String(next));
        emit(next);
    };

    const commitDraft = () => {
        const text = draft.trim();
        if (!isCompleteNumber(text)) {
            setDraft(String(value));
            return;
        }
        const next = Number(text);
        if (!Number.isFinite(next)) {
            setDraft(String(value));
            return;
        }
        const bounded = clamp(next);
        if (bounded !== next) setDraft(String(bounded));
        if (bounded !== Number(value)) emit(bounded);
    };

    return <input {...props} ref={inputRef} type="number" value={draft} min={min} max={max} step={step}
        onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraft(nextDraft);
            if (!isCompleteNumber(nextDraft)) return;
            const next = Number(nextDraft);
            if (Number.isFinite(next) && next >= minValue && next <= maxValue && next !== Number(value)) emit(next);
        }}
        onBlur={commitDraft}
        onDoubleClick={(event) => { event.currentTarget.focus(); event.currentTarget.select?.(); }}
        onPointerDown={(event) => {
            if (event.button !== 0 || event.currentTarget.disabled || event.currentTarget.readOnly) return;
            const initial = clamp(Number(value));
            active.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, initial, value: initial, moved: false, fraction: 0, steps: 0 };
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
            const gesture = active.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const delta = event.clientX - gesture.startX;
            if (!gesture.moved && Math.abs(delta) < 3) return;
            if (!gesture.moved) {
                gesture.moved = true;
                event.currentTarget.classList.add('focus-number--scrubbing');
                onGesture?.('Start', { id: controlId, value: gesture.initial, initial: gesture.initial, event });
            }
            event.preventDefault();
            gesture.fraction += (event.clientX - gesture.lastX) / (event.shiftKey ? 20 : 4);
            gesture.lastX = event.clientX;
            const whole = Math.trunc(gesture.fraction);
            gesture.fraction -= whole;
            if (!whole) return;
            gesture.steps += whole;
            const next = clamp(Number((gesture.initial + gesture.steps * Number(step)).toFixed(Math.max(precision(step), precision(gesture.initial)))));
            update(next);
        }}
        onPointerUp={(event) => { if (active.current?.pointerId === event.pointerId) finish(false); }}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => finish(true)}
        onKeyDown={(event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (active.current) finish(true);
                else setDraft(String(value));
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
                event.currentTarget.blur();
            }
        }}
    />;
}
