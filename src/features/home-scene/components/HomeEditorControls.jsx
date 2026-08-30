import React from 'react';

const formatControlValue = (value, formatter) => {
    if (typeof formatter === 'function') {
        return formatter(value);
    }

    return value;
};

export const RangeControl = ({ label, value, min, max, step = 1, onChange, unit = '', formatValue }) => (
    <div className="home-editor-control-group">
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
        />
    </div>
);

export const ColorControl = ({ label, value, onChange }) => (
    <div className="home-editor-control-group">
        <label>{label}</label>
        <input
            type="color"
            aria-label={label}
            value={value}
            onChange={onChange}
        />
    </div>
);

export const SelectControl = ({ label, value, onChange, options }) => (
    <div className="home-editor-control-group">
        <label>{label}</label>
        <select
            aria-label={label}
            value={value}
            onChange={onChange}
            className="home-editor-select"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </div>
);

// `subtle` marks a block inside a section, as opposed to the heading of a whole
// aspect. Same rule and label, quieter - otherwise two headings in a row read as
// siblings and the nesting disappears.
export const SectionHeading = ({ label, subtle = false }) => (
    <h4 className={`home-editor-section-heading${subtle ? ' home-editor-section-heading--block' : ''}`}>
        {label}
    </h4>
);

export const CheckboxControl = ({ label, checked, onChange }) => (
    <div className="home-editor-control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <label style={{ marginBottom: 0 }}>{label}</label>
        <input
            type="checkbox"
            aria-label={label}
            checked={checked}
            onChange={onChange}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
        />
    </div>
);
