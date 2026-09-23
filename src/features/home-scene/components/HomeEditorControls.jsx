import React from 'react';
import {
    FocusCheckboxControl,
    FocusColorControl,
    FocusRangeControl,
    FocusSelectControl,
} from './editor/focus/FocusControlComponents';
import { useFocusControlScope } from './editor/focus/FocusControlsContext';
import { useSectionFold } from './editor/focus/sectionFolds';

const formatControlValue = (value, formatter) => {
    if (typeof formatter === 'function') {
        return formatter(value);
    }

    return value;
};

export const RangeControl = ({ label, value, min, max, step = 1, onChange, unit = '', formatValue, testId, controlId }) => {
    const legacy = <div className="home-editor-control-group">
        <label>
            {label}
            <span className="home-editor-value-readout">{formatControlValue(value, formatValue)}{unit}</span>
        </label>
        <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            className="home-editor-slider"
            data-testid={testId}
        />
    </div>;
    return <FocusRangeControl label={label} value={value} min={min} max={max} step={step} onChange={onChange} unit={unit} formatValue={formatValue} testId={testId} controlId={controlId}>{legacy}</FocusRangeControl>;
};

export const ColorControl = ({ label, value, onChange, testId, controlId }) => {
    const legacy = <div className="home-editor-control-group">
        <label>{label}</label>
        <input
            type="color"
            aria-label={label}
            value={value}
            onChange={onChange}
            data-testid={testId}
        />
    </div>;
    return <FocusColorControl label={label} value={value} onChange={onChange} testId={testId} controlId={controlId}>{legacy}</FocusColorControl>;
};

export const SelectControl = ({ label, value, onChange, options, testId, controlId }) => {
    const legacy = <div className="home-editor-control-group">
        <label>{label}</label>
        <select
            aria-label={label}
            value={value}
            onChange={onChange}
            className="home-editor-select"
            data-testid={testId}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </div>;
    return <FocusSelectControl label={label} value={value} onChange={onChange} options={options} testId={testId} controlId={controlId}>{legacy}</FocusSelectControl>;
};

// `subtle` marks a block inside a section, as opposed to the heading of a whole
// aspect. Same rule and label, quieter - otherwise two headings in a row read as
// siblings and the nesting disappears. In the inspector a heading folds what
// is under it (sectionFolds.js writes its key and state onto it).
export const SectionHeading = ({ label, subtle = false }) => {
    const scope = useFocusControlScope();
    const fold = useSectionFold();
    if (scope?.catalogOnly) return null;
    const className = `home-editor-section-heading${subtle ? ' home-editor-section-heading--block' : ''}`;
    if (!fold) return <h4 className={className}>{label}</h4>;
    const toggle = (event) => fold.toggle(event.currentTarget.dataset.foldKey);
    return <h4 className={`${className} is-foldable`} role="button" tabIndex={0} onClick={toggle}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(event); } }}>{label}</h4>;
};

export const CheckboxControl = ({ label, checked, onChange, testId, controlId }) => {
    const legacy = <div className="home-editor-control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <label style={{ marginBottom: 0 }}>{label}</label>
        <input
            type="checkbox"
            aria-label={label}
            checked={checked}
            onChange={onChange}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            data-testid={testId}
        />
    </div>;
    return <FocusCheckboxControl label={label} checked={checked} onChange={onChange} testId={testId} controlId={controlId}>{legacy}</FocusCheckboxControl>;
};
