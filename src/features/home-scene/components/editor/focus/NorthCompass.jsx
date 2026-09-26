import React, { useEffect, useRef, useState } from 'react';
import { bearingOf, siteNorth, useView } from '../../../../../planting/north.js';
import { buildHomeSceneLightDirection } from '../../../../../components/effects/sky/skyModel.js';
import { resolveSceneSun } from '../../../../../components/effects/sky/sceneSun.js';
import { FocusContextMenu } from './FocusContextMenu.jsx';

// Стрелка севера над кадром: «С» там, где истинный север, при любом повороте
// камеры. Жёлтая точка на кольце — солнце, пока оно над горизонтом. Щелчок —
// поправка севера, если зелёная ось чертежа смотрит не на север.
//
// Где стоит — выбор интерфейса, не сцены (localStorage этого браузера):
// посередине над кадром, где угодно во вьюпорте (перетащить) или в верхней
// строке редактора одной белой стрелкой (правый щелчок).
const at = (degrees, radius) => [Math.sin((degrees * Math.PI) / 180) * radius, -Math.cos((degrees * Math.PI) / 180) * radius];
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
function sunBearing(settings) {
    const sun = resolveSceneSun(settings);
    if (sun.elevationDeg <= 0) return null;
    const [x, , z] = buildHomeSceneLightDirection(sun.azimuthDeg, sun.elevationDeg);
    return bearingOf(x, z);
}

const DRAG_SLOP = 4;
const clampTo = (value, min, max) => Math.max(min, Math.min(max, value));

// variant: 'stage' — над кадром (посередине или где поставили), 'topbar' — в строке.
export function NorthCompass({ settings, applySettings, tr, place = {}, onPlace, variant = 'stage' }) {
    const view = useView();
    const [open, setOpen] = useState(false);
    const [menu, setMenu] = useState(null);
    const [drag, setDrag] = useState(null);
    const box = useRef(null), gesture = useRef(null), dragged = useRef(false);
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
    const topbar = variant === 'topbar';
    const floating = !topbar && (drag || place.mode === 'float');
    const at2 = drag ?? place;
    const style = floating && typeof window !== 'undefined'
        ? { position: 'fixed', left: clampTo(at2.x, 70, window.innerWidth - 30), top: clampTo(at2.y, 70, window.innerHeight - 50), transform: 'translate(-50%, -50%)' }
        : undefined;

    // Протяжка диска переносит компас, короткое нажатие открывает поправку.
    const down = (event) => {
        if (topbar || event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, moved: false };
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        current.moved = true;
        setOpen(false);
        setDrag({ x: current.cx + dx, y: current.cy + dy });
    };
    const up = (event) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        gesture.current = null;
        if (!current.moved) return;
        dragged.current = true;
        onPlace?.({ mode: 'float', x: Math.round(current.cx + event.clientX - current.x), y: Math.round(current.cy + event.clientY - current.y) });
        setDrag(null);
    };
    const click = () => {
        if (dragged.current) { dragged.current = false; return; }
        setOpen((value) => !value);
    };
    const contextMenu = (event) => {
        event.preventDefault();
        setOpen(false);
        setMenu({ x: event.clientX, y: event.clientY });
    };
    const menuItems = topbar
        ? [{ label: tr('Вернуть во вьюпорт', 'Back to the viewport'), icon: 'compass', onSelect: () => onPlace?.({}) }]
        : [{ label: tr('Разместить в верхней строке', 'Place in the top bar'), icon: 'compass', onSelect: () => onPlace?.({ mode: 'topbar' }) },
            place.mode === 'float' ? { label: tr('Вернуть на место над кадром', 'Back above the frame'), onSelect: () => onPlace?.({}) } : null];

    const panel = open ? <div className="focus-compass__panel focus-glass" data-testid="north-compass-panel">
        <strong>{tr('Север', 'North')}</strong>
        <label><input type="range" min={-180} max={180} step={0.5} value={angle} onChange={(event) => applySettings({ northAngle: Number(event.target.value) })} data-testid="north-angle" />
            <input type="number" min={-180} max={180} step={0.5} value={angle} onChange={(event) => applySettings({ northAngle: Number(event.target.value) || 0 })} aria-label={tr('Север, градусы', 'North, degrees')} />°</label>
        <p>{tr('Угол от зелёной оси SketchUp по часовой стрелке. Модель повернули — север повернулся вместе с ней. Жёлтая точка на кольце — солнце.',
            'Degrees clockwise from SketchUp’s green axis. Turn the model and north turns with it. The yellow dot on the ring is the sun.')}{' '}{topbar
            ? tr('Правый щелчок по стрелке — вернуть компас во вьюпорт.', 'Right-click the arrow to put the compass back in the viewport.')
            : tr('Протяните компас — переставить; правый щелчок — в верхнюю строку.', 'Drag the compass to move it; right-click to put it in the top bar.')}</p>
    </div> : null;
    const contextMenuNode = menu ? <FocusContextMenu x={menu.x} y={menu.y} title={tr('Компас', 'Compass')} items={menuItems} onClose={() => setMenu(null)} /> : null;

    if (topbar) {
        return <div ref={box} className="focus-compass focus-compass--topbar">
            <button type="button" className="focus-compass__arrow" onClick={click} onContextMenu={contextMenu} aria-expanded={open}
                aria-label={tr('Север', 'North')} data-focus-tip={tr('Север. Щёлкните — поправить; правый щелчок — вернуть во вьюпорт.', 'North. Click to adjust; right-click to put it back in the viewport.')} data-testid="north-compass">
                <svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -9 L4.5 6 L0 3 L-4.5 6 Z" transform={`rotate(${turn.toFixed(2)})`} data-north={turn.toFixed(1)} /></svg>
            </button>
            {panel}{contextMenuNode}
        </div>;
    }
    return <div ref={box} className={`focus-compass ${floating ? 'focus-compass--floating' : ''}`} style={style}>
        <button type="button" className="focus-compass__dial focus-glass" onClick={click} onContextMenu={contextMenu}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; setDrag(null); }} aria-expanded={open}
            aria-label={tr('Север', 'North')} data-focus-tip={tr('Север. Щёлкните — поправить, куда он смотрит; протяните — переставить.', 'North. Click to adjust where it points; drag to move it.')} data-testid="north-compass">
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
        {panel}{contextMenuNode}
    </div>;
}
