import React, { useRef } from 'react';
import { useFocusControlRegistration, useFocusControls, useRegisteredFocusControl } from './FocusControlsContext';
import { FocusControlNumberInput } from './FocusControlNumberInput';
import './focus-controls.css';

const displayValue = (value, formatter) => typeof formatter === 'function' ? formatter(value) : value;

function PinButton({ id, controls }) {
    if (!id) return null;
    const pinned = controls?.pinnedIds.has(id);
    return <button type="button" className={`focus-control-pin${pinned ? ' is-pinned' : ''}`} onClick={() => controls?.togglePin(id)} aria-label={pinned ? 'Убрать из избранного' : 'Добавить в избранное'} title={pinned ? 'Убрать из избранного' : 'В избранное'}>★</button>;
}

function FocusControlBody({ descriptor, controls, allowPin = true }) {
    const { kind, label, value, checked, min, max, step, unit = '', formatValue, options = [], testId, onChangeRef, id } = descriptor;
    const change = (event) => onChangeRef?.current?.(event);
    const gesture = (kindName, detail) => controls?.gesture(kindName, detail);
    const rangeGesture = useRef(null);
    const rangeHandlers = kind === 'range' ? {
        onPointerDown: (event) => {
            if (event.button !== 0) return;
            rangeGesture.current = { initial: value, pointerId: event.pointerId };
            gesture('Start', { id, value, initial: value, event });
        },
        onPointerUp: (event) => {
            if (rangeGesture.current?.pointerId !== event.pointerId) return;
            gesture('Commit', { id, value: event.currentTarget.value, initial: rangeGesture.current.initial });
            rangeGesture.current = null;
        },
        onPointerCancel: () => {
            const current = rangeGesture.current;
            if (!current) return;
            change({ target: { value: current.initial, type: 'range' }, currentTarget: { value: current.initial, type: 'range' } });
            gesture('Cancel', { id, value: current.initial, initial: current.initial });
            rangeGesture.current = null;
        },
    } : {};

    if (kind === 'toggle') return <div className="focus-control-row focus-control-row--toggle"><PinButton id={allowPin ? id : null} controls={controls} /><label>{label}</label><input type="checkbox" checked={Boolean(checked)} onChange={change} data-testid={testId} aria-label={label} /></div>;
    if (kind === 'color') return <div className="focus-control-row focus-control-row--color"><PinButton id={allowPin ? id : null} controls={controls} /><label>{label}</label><input type="color" value={value} onChange={change} data-testid={testId} aria-label={label} /></div>;
    if (kind === 'select') return <div className="focus-control-row focus-control-row--select"><PinButton id={allowPin ? id : null} controls={controls} /><label>{label}</label><select value={value} onChange={change} data-testid={testId} aria-label={label}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
    return <div className="focus-control-row focus-control-row--range"><PinButton id={allowPin ? id : null} controls={controls} /><label>{label}</label><input type="range" value={value} min={min} max={max} step={step} onChange={change} data-testid={testId} aria-label={label} {...rangeHandlers} /><FocusControlNumberInput controlId={id} value={value} min={min} max={max} step={step} onChange={change} onGesture={gesture} aria-label={`${label} — точное значение`} /><span className="focus-control-unit">{unit || displayValue(value, formatValue)}</span></div>;
}

function Registered({ id }) {
    const descriptor = useRegisteredFocusControl(id);
    const controls = useFocusControls();
    return descriptor ? <FocusControlBody descriptor={descriptor} controls={controls} allowPin={false} /> : null;
}

function FocusPrimitive({ kind, children, ...props }) {
    const registration = useFocusControlRegistration({ kind, ...props });
    if (!registration.controls || !registration.scope) return children;
    if (registration.catalogOnly) return null;
    return <FocusControlBody descriptor={registration.descriptor} controls={registration.controls} />;
}

export function FocusRangeControl(props) { return <FocusPrimitive kind="range" {...props} />; }
export function FocusColorControl(props) { return <FocusPrimitive kind="color" {...props} />; }
export function FocusSelectControl(props) { return <FocusPrimitive kind="select" {...props} />; }
export function FocusCheckboxControl(props) { return <FocusPrimitive kind="toggle" {...props} />; }
export function RegisteredFocusControl({ id }) { return <Registered id={id} />; }

