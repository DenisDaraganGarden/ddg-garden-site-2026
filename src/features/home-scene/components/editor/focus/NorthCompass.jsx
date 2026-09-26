import React, { useEffect, useRef, useState } from 'react';
import { bearingOf, siteNorth, useView } from '../../../../../planting/north.js';
import { buildHomeSceneLightDirection } from '../../../../../components/effects/sky/skyModel.js';
import { resolveSceneSun } from '../../../../../components/effects/sky/sceneSun.js';

// Стрелка севера над кадром: «С» там, где истинный север, при любом повороте
// камеры. Жёлтая точка на кольце — солнце, пока оно над горизонтом. Щелчок —
// поправка севера, если зелёная ось чертежа смотрит не на север.
const at = (degrees, radius) => [Math.sin((degrees * Math.PI) / 180) * radius, -Math.cos((degrees * Math.PI) / 180) * radius];
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
function sunBearing(settings) {
    const sun = resolveSceneSun(settings);
    if (sun.elevationDeg <= 0) return null;
    const [x, , z] = buildHomeSceneLightDirection(sun.azimuthDeg, sun.elevationDeg);
    return bearingOf(x, z);
}

export function NorthCompass({ settings, applySettings, tr }) {
    const view = useView();
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', close, true);
        return () => document.removeEventListener('pointerdown', close, true);
    }, [open]);
    const north = siteNorth(settings);
    const turn = north - view.bearing;
    const sun = sunBearing(settings);
    const angle = finite(settings.northAngle, 0);
    return <div ref={box} className="focus-compass">
        <button type="button" className="focus-compass__dial focus-glass" onClick={() => setOpen((value) => !value)} aria-expanded={open}
            aria-label={tr('Север', 'North')} data-focus-tip={tr('Север. Щёлкните — поправить, куда он смотрит.', 'North. Click to adjust where it points.')} data-testid="north-compass">
            <svg viewBox="-24 -24 48 48" aria-hidden="true">
                <circle r="21" className="focus-compass__ring" />
                <g transform={`rotate(${turn.toFixed(2)})`} data-north={turn.toFixed(1)}>
                    {[0, 90, 180, 270].map((tick) => <line key={tick} x1="0" y1="-21" x2="0" y2="-18.5" transform={`rotate(${tick})`} className="focus-compass__tick" />)}
                    <path d="M0 -11 L3.4 1 L0 -1 L-3.4 1 Z" className="focus-compass__north" />
                    <path d="M0 11 L3.4 1 L0 -1 L-3.4 1 Z" className="focus-compass__south" />
                </g>
                {/* Буква стоит прямо, у острия стрелки. */}
                <text x={at(turn, 16)[0]} y={at(turn, 16)[1]} className="focus-compass__letter">{tr('С', 'N')}</text>
                {sun !== null ? <circle r="2.4" cx={at(sun - view.bearing, 21)[0]} cy={at(sun - view.bearing, 21)[1]} className="focus-compass__sun" /> : null}
            </svg>
        </button>
        {open ? <div className="focus-compass__panel focus-glass" data-testid="north-compass-panel">
            <strong>{tr('Север', 'North')}</strong>
            <label><input type="range" min={-180} max={180} step={0.5} value={angle} onChange={(event) => applySettings({ northAngle: Number(event.target.value) })} data-testid="north-angle" />
                <input type="number" min={-180} max={180} step={0.5} value={angle} onChange={(event) => applySettings({ northAngle: Number(event.target.value) || 0 })} aria-label={tr('Север, градусы', 'North, degrees')} />°</label>
            <p>{tr('Угол от зелёной оси SketchUp по часовой стрелке. Модель повернули — север повернулся вместе с ней. Жёлтая точка на кольце — солнце.',
                'Degrees clockwise from SketchUp’s green axis. Turn the model and north turns with it. The yellow dot on the ring is the sun.')}</p>
        </div> : null}
    </div>;
}
