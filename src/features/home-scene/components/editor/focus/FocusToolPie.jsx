import React, { useEffect, useRef, useState } from 'react';
import { FocusIcon } from './FocusIcons';

// Круговое меню инструментов на пробеле, как в Blender: зажал пробел —
// вокруг курсора кольцо инструментов, повёл мышь в сторону нужного и
// отпустил — он выбран. Короткое нажатие остаётся паузой анимации. Клик по
// пункту тоже выбирает; Esc или отпустить в середине — ничего.
const HOLD_MS = 170;
const RADIUS = 96;
const DEAD_ZONE = 26;
// Пробел не трогает только набор текста и открытые окна. Кнопка в фокусе
// (после любого клика по панели) пробелом не нажимается — иначе круг не
// открывался бы через раз; кнопки жмутся мышью и Enter.
const TEXT = (target) => target?.closest?.('textarea,select,[contenteditable=true],dialog')
    || (target?.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(target.type));

export default function FocusToolPie({ tools, current, enabled, onChoose, onTap, language }) {
    const [pie, setPie] = useState(null);
    const [hover, setHover] = useState(-1);
    const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const live = useRef();
    live.current = { tools, onChoose, onTap, pie, hover };

    useEffect(() => {
        if (!enabled) return undefined;
        let timer = 0, held = false;
        const pick = (x, y, center) => {
            const dx = x - center.x, dy = y - center.y;
            if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;
            const count = live.current.tools.length;
            const index = Math.round(((Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)) / ((2 * Math.PI) / count)) % count;
            return live.current.tools[index]?.disabled ? -1 : index;
        };
        const move = (event) => {
            pointer.current = { x: event.clientX, y: event.clientY };
            const open = live.current.pie;
            if (open) setHover(pick(event.clientX, event.clientY, open));
        };
        const close = (choose) => {
            const { pie: open, hover: index, tools: list, onChoose: choosePick } = live.current;
            if (choose && open && index >= 0) choosePick(list[index].id);
            setPie(null); setHover(-1);
        };
        const down = (event) => {
            if (event.code === 'Escape' && live.current.pie) { event.preventDefault(); event.stopPropagation(); close(false); return; }
            if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey || TEXT(event.target)) return;
            event.preventDefault();
            if (event.repeat || held) return;
            held = true;
            timer = window.setTimeout(() => {
                timer = 0;
                const { x, y } = pointer.current;
                setPie({ x: Math.min(window.innerWidth - RADIUS - 44, Math.max(RADIUS + 44, x)), y: Math.min(window.innerHeight - RADIUS - 44, Math.max(RADIUS + 44, y)) });
                setHover(-1);
            }, HOLD_MS);
        };
        const up = (event) => {
            if (event.code !== 'Space' || !held) return;
            held = false;
            event.preventDefault();
            if (timer) { window.clearTimeout(timer); timer = 0; live.current.onTap(); return; }
            close(true);
        };
        const blur = () => { held = false; if (timer) { window.clearTimeout(timer); timer = 0; } close(false); };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('keydown', down, true);
        window.addEventListener('keyup', up, true);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('keydown', down, true);
            window.removeEventListener('keyup', up, true);
            window.removeEventListener('blur', blur);
            if (timer) window.clearTimeout(timer);
        };
    }, [enabled]);

    if (!pie) return null;
    const ru = language === 'ru';
    const shown = hover >= 0 ? tools[hover] : tools.find((tool) => tool.id === current);
    return <div className="focus-pie" role="menu" aria-label={ru ? 'Инструменты' : 'Tools'} style={{ left: pie.x, top: pie.y }}>
        <svg className="focus-pie__pointer" viewBox="-120 -120 240 240" aria-hidden="true">
            <circle r={DEAD_ZONE} />
            {hover >= 0 ? <path d={`M0 0 L${Math.sin((hover / tools.length) * 2 * Math.PI) * 70} ${-Math.cos((hover / tools.length) * 2 * Math.PI) * 70}`} /> : null}
        </svg>
        <div className="focus-pie__center">{shown ? <><b>{ru ? shown.ru : shown.en}</b><small>{shown.key}</small></> : null}</div>
        {tools.map((tool, index) => {
            const angle = (index / tools.length) * 2 * Math.PI;
            return <button key={tool.id} type="button" role="menuitemradio" aria-checked={tool.id === current} disabled={tool.disabled}
                className={`${index === hover ? 'is-hover' : ''} ${tool.id === current ? 'is-current' : ''} ${tool.group ? `is-${tool.group}` : ''}`}
                style={{ transform: `translate(${Math.sin(angle) * RADIUS}px, ${-Math.cos(angle) * RADIUS}px)` }}
                onPointerEnter={() => !tool.disabled && setHover(index)} onClick={() => { onChoose(tool.id); setPie(null); setHover(-1); }}>
                <FocusIcon name={tool.icon} /><span>{ru ? tool.ru : tool.en}</span>
            </button>;
        })}
    </div>;
}
