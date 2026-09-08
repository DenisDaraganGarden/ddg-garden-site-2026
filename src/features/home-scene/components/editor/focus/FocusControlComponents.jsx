import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { useFocusControlRegistration, useFocusControls, useRegisteredFocusControl } from './FocusControlsContext';
import { FocusControlNumberInput } from './FocusControlNumberInput';
import './focus-controls.css';

const displayValue = (value, formatter) => typeof formatter === 'function' ? formatter(value) : value;

function PinButton({ id, controls }) {
    const { language } = useLanguage();
    if (!id) return null;
    const pinned = controls?.pinnedIds.has(id);
    const text = language === 'en'
        ? (pinned ? 'Remove from favourites' : 'Add to favourites')
        : (pinned ? 'Убрать из избранного' : 'Добавить в избранное');
    return <button type="button" className={`focus-control-pin${pinned ? ' is-pinned' : ''}`} onClick={() => controls?.togglePin(id)} aria-label={text} title={text}>★</button>;
}

function FocusControlBody({ descriptor, controls, allowPin = true }) {
    const { kind, label, value, checked, min, max, step, unit = '', formatValue, options = [], testId, onChangeRef, id } = descriptor;
    const { language } = useLanguage();
    const change = (event) => onChangeRef?.current?.(event);
    const gesture = (kindName, detail) => controls?.gesture(kindName, detail);
    const rangeGesture = useRef(null);
    const cancelRangeGesture = () => {
        const current = rangeGesture.current;
        if (!current) return;
        change({ target: { value: current.initial, type: 'range' }, currentTarget: { value: current.initial, type: 'range' } });
        gesture('Cancel', { id, value: current.initial, initial: current.initial });
        rangeGesture.current = null;
    };
    useEffect(() => {
        const cancel = () => cancelRangeGesture();
        window.addEventListener('blur', cancel);
        return () => window.removeEventListener('blur', cancel);
    });
    const rangeHandlers = kind === 'range' ? {
        onPointerDown: (event) => {
            if (event.button !== 0) return;
            rangeGesture.current = { initial: value, pointerId: event.pointerId };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            gesture('Start', { id, value, initial: value, event });
        },
        onPointerUp: (event) => {
            if (rangeGesture.current?.pointerId !== event.pointerId) return;
            gesture('Commit', { id, value: event.currentTarget.value, initial: rangeGesture.current.initial });
            rangeGesture.current = null;
            try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
        },
        onPointerCancel: cancelRangeGesture,
        onLostPointerCapture: cancelRangeGesture,
        onKeyDown: (event) => {
            if (event.key !== 'Escape' || !rangeGesture.current) return;
            event.preventDefault();
            event.stopPropagation();
            cancelRangeGesture();
        },
    } : {};
    const rowProps = { 'data-focus-control-id': id };

    if (kind === 'toggle') return <div className="focus-control-row focus-control-row--toggle" {...rowProps}><PinButton id={allowPin ? id : null} controls={controls} /><label data-focus-tip={label}>{label}</label><input type="checkbox" checked={Boolean(checked)} onChange={change} data-testid={testId} aria-label={label} /></div>;
    if (kind === 'color') return <div className="focus-control-row focus-control-row--color" {...rowProps}><PinButton id={allowPin ? id : null} controls={controls} /><label data-focus-tip={label}>{label}</label><input type="color" value={value} onChange={change} data-testid={testId} aria-label={label} /></div>;
    if (kind === 'select') return <div className="focus-control-row focus-control-row--select" {...rowProps}><PinButton id={allowPin ? id : null} controls={controls} /><label data-focus-tip={label}>{label}</label><select value={value} onChange={change} data-testid={testId} aria-label={label}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
    const formatted = displayValue(value, formatValue);
    const numberTip = String(formatted) !== String(value) ? `${formatted}${unit}` : undefined;
    const numericLabel = language === 'en' ? `${label} — exact value` : `${label} — точное значение`;
    const numericTip = language === 'en'
        ? `${label}. Drag with left mouse to change; Shift for precision; double-click for exact input.`
        : `${label}. ЛКМ и движение — изменить; Shift — точнее; двойной клик — точный ввод.`;
    return <div className="focus-control-row focus-control-row--range" {...rowProps}><PinButton id={allowPin ? id : null} controls={controls} /><label title={label} data-focus-tip={label}>{label}</label><input type="range" value={value} min={min} max={max} step={step} onChange={change} data-testid={testId} aria-label={label} {...rangeHandlers} /><FocusControlNumberInput controlId={id} value={value} min={min} max={max} step={step} onChange={change} onGesture={gesture} aria-label={numericLabel} title={numberTip} data-focus-tip={numericTip} /><span className="focus-control-unit">{unit}</span></div>;
}

function Registered({ id }) {
    const descriptor = useRegisteredFocusControl(id);
    const controls = useFocusControls();
    return descriptor ? <FocusControlBody descriptor={descriptor} controls={controls} allowPin /> : null;
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
