import React, { useEffect, useRef, useState } from 'react';

const precision = (value) => {
    const source = String(value);
    const exponent = source.match(/e-(\d+)/i);
    return exponent ? Number(exponent[1]) : Math.max(0, (source.split('.')[1] ?? '').length);
};

const isCompleteNumber = (value) => /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());

// Бесконечное перетаскивание, как в 3ds Max: на первом же движении редактор
// забирает указатель, и края экрана перестают существовать — тянуть можно
// сколько нужно. Пока указатель захвачен, clientX стоит на месте, поэтому шаг
// считается по movementX. Захват просим с unadjustedMovement: без ускорения
// операционной системы одно и то же движение руки всегда даёт один и тот же
// шаг. Если браузер захват не дал (iframe без разрешения, старый Safari),
// gesture.locked остаётся false и всё работает как раньше — по clientX.
//
// ponytail: LOCK_SPEED — множитель под живую руку. Захваченное движение
// приходит в аппаратных точках, а не в CSS-пикселях, поэтому на Retina тот же
// жест может ощущаться быстрее. Единственное место для подкрутки.
const LOCK_SPEED = 1;

const releasePointerLock = (gesture, element) => {
    // releasing поднимается до выхода: запрос захвата асинхронный и может
    // сработать уже после отпускания кнопки — тогда его снимет сам обработчик.
    gesture.releasing = true;
    if (gesture.onLockChange) {
        document.removeEventListener('pointerlockchange', gesture.onLockChange);
        gesture.onLockChange = null;
    }
    if (document.pointerLockElement && document.pointerLockElement === element) document.exitPointerLock?.();
    gesture.locked = false;
    gesture.locking = false;
};

const requestPointerLock = (element, gesture, onLost) => {
    if (typeof element.requestPointerLock !== 'function') return;
    // Перехват событий не отпускаем руками: при блокировке браузер снимает его
    // сам, а если в блокировке откажут (Chrome, например, не даёт её сразу после
    // выхода по Esc), перехват — единственное, что удерживает драг, когда курсор
    // ушёл с поля. Флаг locking нужен, чтобы автоматическая потеря перехвата не
    // была принята за отмену жеста.
    gesture.locking = true;
    gesture.onLockChange = () => {
        gesture.locked = document.pointerLockElement === element;
        // Кнопку успели отпустить, пока запрос летел, — снимаем сразу.
        if (gesture.locked && gesture.releasing) { document.exitPointerLock?.(); return; }
        // Esc снимает захват браузером — для этого контрола Esc всегда отмена.
        if (!gesture.locked && !gesture.releasing) onLost();
    };
    document.addEventListener('pointerlockchange', gesture.onLockChange);
    const plain = () => { try { element.requestPointerLock(); } catch { /* отказ — обычный драг */ } };
    try {
        const request = element.requestPointerLock({ unadjustedMovement: true });
        if (request?.catch) request.catch(plain);
    } catch {
        plain();
    }
};

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
        releasePointerLock(gesture, input);
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
                requestPointerLock(event.currentTarget, gesture, () => finish(true));
                onGesture?.('Start', { id: controlId, value: gesture.initial, initial: gesture.initial, event });
            }
            event.preventDefault();
            const travel = gesture.locked ? event.movementX * LOCK_SPEED : event.clientX - gesture.lastX;
            gesture.fraction += travel / (event.shiftKey ? 20 : 4);
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
        onLostPointerCapture={() => { if (!active.current?.locking) finish(true); }}
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
