import React from 'react';

export const RangeControl = ({ label, value, min, max, step = 1, onChange, unit = '' }) => (
    <div className="cia-control-group">
        <label>
            {label}
            <span className="cia-value-readout">{value}{unit}</span>
        </label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            className="cia-slider"
        />
    </div>
);

export const ColorControl = ({ label, value, onChange }) => (
    <div className="cia-control-group">
        <label>{label}</label>
        <input
            type="color"
            value={value}
            onChange={onChange}
        />
    </div>
);

export const CheckboxControl = ({ label, checked, onChange }) => (
    <div className="cia-control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <label style={{ marginBottom: 0 }}>{label}</label>
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
        />
    </div>
);
